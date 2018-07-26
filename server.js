//WebSocketServer anlegen und starten
console.log("create websocket server");
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080, clientTracking: true });

//Mplayer + Wrapper anlegen
const createPlayer = require('mplayer-wrapper');
const player = createPlayer();

//Farbiges Logging
const colors = require('colors');

//Befehle auf Kommandzeile ausfuehren
const { execSync } = require('child_process');

//Array random
const shuffle = require('shuffle-array')

//Lautstaerke zu Beginn auf 100% setzen
let initialVolumeCommand = "sudo amixer sset PCM 100% -M";
console.log(initialVolumeCommand)
execSync(initialVolumeCommand);

//Wenn bei Track change der Filename geliefert wird
player.on('filename', (filename) => {

    //Ab dem Zeitpunkt wenn die Frage gestellt wird (z.B. Tiergeraeusch abgespielt), werden antworten akzeptiert
    if (filename.endsWith("-question.mp3")) {
        console.log("start accepting cards".green);

        //Frage wurde gestellt, nun warten wir auf die Antwort
        acceptingCard = true;
    }
});

//Wenn sich ein Titel aendert (durch Nutzer oder durch den Player)
player.on('track-change', () => {

    //Neuen Dateinamen liefern
    player.getProps(['filename']);
});

//Game-Config-JSON-Objekt aus Datei holen, um daraus passende Datenstruktur zu bauen
const fs = require('fs-extra');
console.log("read game config".green);
const gameConfigJSON = fs.readJsonSync('../SoundQuizGPIO/config.json');

//Datenstruktur fuer Server (zufaellige Fragen laden)
var gameConfig = {};

//Ueber Karten gehen
for (let card in gameConfigJSON) {

    //Karteninfo laden
    let cardInfo = gameConfigJSON[card];

    //Wenn es eine Antwortkarte ist
    if (cardInfo["type"] === "answer") {

        //Ueber die Spiele gehen, denen diese Karte zugeordnet ist
        for (let game of cardInfo["games"]) {

            //Wenn es bei diesem Spiel noch keine Eintraege gibt ein Array anlagen, ansonsten weiteren Wert hinzufuegen
            !gameConfig[game] ? gameConfig[game] = [cardInfo["value"]] : gameConfig[game].push(cardInfo["value"])
        }
    }
}
console.log("available games and questions: " + JSON.stringify(gameConfig).green);

//Wo wird das Skript betrieben win vs. pi
const runMode = process.argv[2] ? process.argv[2] : "pi";

//Verzeichnis wo die Fragenfiles liegen
const soundDir = runMode === "win" ? "C:/Apache24/htdocs/SoundQuizServer/sounds" : "/media/soundquiz";
console.log("using sound dir " + soundDir.green);

//Zu Beginn ist kein Spiel ausgewaehlt
var currentGame = null;

//Liste der Fragen und aktuelle Frage
var currentQuestions = [];
var currentQuestion = null;

//Werden gerade Karten ausgewertet?
var acceptingCard = false;

//"Welches Spiel moechtest du spielen?"
playSound("which-game");
console.log("waiting for game select".green);

//Wenn sich ein WebSocket mit dem WebSocketServer verbindet
wss.on('connection', function connection(ws) {
    console.log("new client connected");

    //Wenn WSS eine Nachricht von WS empfaengt
    ws.on('message', function incoming(message) {

        //Nachricht kommt als String -> in JSON Objekt konvertieren
        var obj = JSON.parse(message);

        //Werte auslesen
        let type = obj.type;
        let value = obj.value;

        //Array von MessageObjekten erstellen, die an WS gesendet werden
        let messageObjArr = [];

        //Pro Typ gewisse Aktionen durchfuehren
        switch (type) {

            //Infos kommen per RFID-Karten
            case "send-card-data":

                //Wenn gerade Karten akzeptiert werden oder noch kein Spiel geladen wurde
                if (acceptingCard || currentGame === null) {
                    console.log(value.blue);

                    //Kartenwerte auslesen
                    let cardData = JSON.parse(value);
                    let cardDataType = cardData.type;
                    let cardDataValue = cardData.value;

                    //Welcher Typ von Karte ist es (game-select, answer, shutdown)
                    switch (cardDataType) {

                        //Spiel beenden
                        case "shutdown":
                            console.log("user send stop game and shutdown event".green);
                            console.log("stop accepting cards".red);
                            acceptingCard = false;

                            //Verabschiedungssound
                            playSound("shutdown", true);

                            //Pi herunterfahren
                            execSync("sleep 5 && shutdown -h now");
                            break;

                        //Spielauswahl
                        case "game-select":
                            console.log("user sends game select event".green);

                            //Spiel starten
                            startGame(cardDataValue);
                            break;

                        //Bei einer Antwort, der Joker-Karte oder der Repeat-Karte
                        case "answer": case "joker": case "repeat":
                            console.log("user sends answer event".green);

                            //Wenn noch kein Spiel ausgewaehlt wurde
                            if (currentGame === null) {
                                console.log("waiting for game select".yellow);

                                //Aufforderung ein Spiel auszuwaehlen
                                playSound("select-game-first", true);
                            }

                            //Es laeuft schon ein Spiel
                            else {

                                //Wenn die Antwort korrekt ist oder der Joker gespielt wurde
                                if (cardDataValue === currentQuestion || cardDataType === "joker") {
                                    console.log("correct answer".green);

                                    //Weitere Kartenaufrufe verhindern
                                    console.log("stop accepting cards".red);
                                    acceptingCard = false;

                                    //Info an WS-Clients, dass Antwort korrekt war
                                    messageObjArr.push({
                                        type: "answer-state",
                                        value: true
                                    });

                                    //Infos an Clients schicken
                                    sendClientInfo(messageObjArr);

                                    //allgemein: "Richtige Antwort"
                                    playSound("answer-correct", true);

                                    //Speziell: "So bellt ein Hund", "So sieht der Buchstabe L aus"
                                    playSound(currentGame + "/" + currentQuestion + "-name");

                                    //Naechste Frage laden
                                    askQuestion();
                                }

                                //Frage soll wiederholt werden
                                else if (cardDataType === "repeat") {
                                    console.log("repeat question".yellow);

                                    //Weitere Kartenaufrufe verhindern
                                    console.log("stop accepting cards".red);
                                    acceptingCard = false;

                                    //"Hoer es dir noch einmal an"
                                    playSound("repeat-question");

                                    //gleiche Frage noch einmal abspielen
                                    askQuestion(true);
                                }

                                //Antwort war falsch
                                else {
                                    console.log("wrong answer".red);

                                    //Weitere Kartenaufrufe verhindern
                                    console.log("stop accepting cards".red);
                                    acceptingCard = false;

                                    //Info an WS-Clients, dass Antwort falsch war
                                    messageObjArr.push({
                                        type: "answer-state",
                                        value: false
                                    });

                                    //Infos an Clients schicken
                                    sendClientInfo(messageObjArr);

                                    //"Leider falsch, probier es noch einmal"
                                    playSound("answer-wrong");

                                    //gleiche Frage noch einmal abspielen
                                    askQuestion(true);
                                }
                            }
                    }
                    break;
                }
                //Antworten noch nicht freigeschaltet
                else {
                    console.log("not accepting card yet".red);
                }
                break;
        }
    });

    /*
    //WS einmalig bei der Verbindung ueber div. Wert informieren
    let WSConnectObjectArr = [{
        type: "set-volume",
        value: currentVolume
    }];

    //Ueber Objekte gehen, die an WS geschickt werden
    WSConnectObjectArr.forEach(messageObj => {

        //Info an WS schicken
        ws.send(JSON.stringify(messageObj));
    });
    */
});

//Infos ans WS-Clients schicken
function sendClientInfo(messageObjArr) {

    //Ueber Liste der MessageObjekte gehen
    messageObjArr.forEach(messageObj => {

        //Ueber Liste der WS gehen und Nachricht schicken
        for (ws of wss.clients) {
            try {
                ws.send(JSON.stringify(messageObj));
            }
            catch (e) { }
        }
    });
}

//Sound abspielen
function playSound(path, interrupt = false) {

    //Pfad zu Datei
    let filePath = soundDir + "/" + path + ".mp3";

    //Wenn Sound eingereiht werden soll
    if (!interrupt) {
        player.queue(filePath);
    }

    //Sound soll direkt wiedergegeben werden (z.B. Spielwechsel oder Shutdown)
    else {
        player.play(filePath);
    }
}

//Spiel starten
function startGame(game) {
    console.log("try to start game " + game.green);

    //Wenn das bereits gestartete Spiel gestartet werden soll, Hinweis ausgeben
    if (currentGame === game) {
        console.log("already playing game " + game.yellow);
        playSound("already-playing-game", true);
    }

    //dieses Spiel starten
    else {

        //Aktuelles Spiel merken
        currentGame = game;
        console.log("play game " + currentGame.green);

        //Karten erst wieder akzeptieren nachdem Frage gestellt wurde
        console.log("stop accepting cards".red);
        acceptingCard = false;

        //Liste der Fragen und aktuelle Frage wieder zuruecksetzen
        currentQuestions = [];
        currentQuestion = null;

        //Allgemein: "Los geht's. Wir spielen jetzt das Spiel..."
        playSound("lets-go", true);

        //Speziell: "Geraeusche erkennen"
        playSound("game-" + currentGame);

        //Frage stellen
        askQuestion();
    }
}

//Eine Frage stellen
function askQuestion(repeat = false) {

    //Wenn eine neue Frage gestellt werden soll
    if (!repeat) {
        console.log("pick next random question".yellow);

        //Wenn keine Fragen (mehr) zu spielen sind
        if (currentQuestions.length === 0) {

            //alle Fragen dieses Spiels aus Config laden -> slice damit Kopie statt Referenz erstellt wird
            currentQuestions = gameConfig[currentGame].slice();
            console.log("available questions in game " + currentGame + ": " + JSON.stringify(currentQuestions).yellow);

            //Zufaellige Reihenfolge erzeugen
            shuffle(currentQuestions);
            console.log("questions will be played in this order: " + JSON.stringify(currentQuestions).yellow);
        }

        //1. Frage aus Array holen und aus Array entfernen
        currentQuestion = currentQuestions.shift();
        console.log("next question is " + currentQuestion.green);
        console.log("remaining questions " + JSON.stringify(currentQuestions).yellow);

        //"Wer macht dieses Geraeusch", "Zeige mir den Buchstaben", "Wer spricht so?"
        playSound("question-prefix-" + currentGame);
    }

    //gleiche Frage wird wiederholt
    else {
        console.log("repeat question " + currentQuestion.green)
    }

    //Eigentlicher Sound (Katze, Mensch, Buchstabe)
    playSound(currentGame + "/" + currentQuestion + "-question");
}