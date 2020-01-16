//Soll bereits ein Spiel zu Beginn geladen werden?
let gameSelect = process.argv[2];

//WebSocketServer anlegen und starten
console.log("create websocket server");
const WebSocket = require('ws');
const port = 7070;
const wss = new WebSocket.Server({ port: port, clientTracking: true });
const { spawn } = require('child_process');

//GPIO Buttons starten
console.log("Use GPIO Buttons");
const buttons_gpio = spawn("node", [__dirname + "/../WSGpioButtons/button.js", port]);
buttons_gpio.stdout.on("data", (data) => {
    console.log("button event: " + data);
});

//USB RFID-Reader starten
console.log("Use USB RFID Reader");
const rfid_usb = spawn("node", [__dirname + "/../WSRFID/rfid.js", port]);
rfid_usb.stdout.on('data', (data) => {
    console.log("rfid event: " + data);
});

//Mplayer + Wrapper anlegen
const createPlayer = require('mplayer-wrapper');
const player = createPlayer();

//Utils
const colors = require('colors');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const shuffle = require('shuffle-array');

//Config laden
const configFile = fs.readJsonSync(__dirname + '/config.json');
console.log("using sound dir " + configFile.audioDir.green);

//Lautstaerke zu Beginn auf 100% setzen
const initialVolumeCommand = "sudo amixer sset " + configFile["audioOutput"] + " 30% -M";
console.log(initialVolumeCommand)
execSync(initialVolumeCommand);

//Countdown starten
startCountdown();

//Wenn bei Track change der Filename geliefert wird
player.on('filename', (filename) => {

    //Ab dem Zeitpunkt wenn die Frage gestellt wird (z.B. Tiergeraeusch abgespielt), werden antworten akzeptiert
    if (filename.endsWith("-question.mp3")) {
        console.log("start accepting cards".green);
        acceptingCard = true;
    }
});

//Wenn sich ein Titel aendert (durch Nutzer oder durch den Player), neuen Dateinamen liefern, muss bleiben damit Trigger gestartet wird?
player.on('track-change', () => {
    player.getProps(['filename']);
});

//Game-Config-JSON-Objekt aus Datei holen, um daraus passende Datenstruktur zu bauen
console.log("read game config".green);
const gameConfigJSON = fs.readJsonSync(__dirname + '/../WSRFID/config_cards_7070.json');

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

//Liste der Jingles laden
var jingles = fs.readdirSync(configFile.audioDir + "/jingles");
console.log("available jingles: " + JSON.stringify(jingles).green);

//Jingles random
shuffle(jingles);
console.log("jingle order: " + JSON.stringify(jingles).green);

//Anzahl der richtigen Antworten zaehlen
var correctAnswerCounter = 0;

//Schritt fuer Schritt durch das Jingle-Array gehen
var jingleCounter = 0;

//Zu Beginn ist kein Spiel ausgewaehlt
var currentGame = null;

//Liste der Fragen und aktuelle Frage
var currentQuestions = [];
var currentQuestion = null;

//Werden gerade Karten ausgewertet?
var acceptingCard = false;

//Wenn bereits ein Spielmodus uebergeben wurde, dieses Spiel starten
if (gameSelect) {
    startGame(gameSelect);
}

//Ansonsten fragen: "Welches Spiel moechtest du spielen?"
else {
    playSound("which-game");
    console.log("waiting for game select".green);
}

//Wenn sich ein WebSocket mit dem WebSocketServer verbindet
wss.on('connection', function connection(ws) {
    console.log("new client connected");

    //Wenn WSS eine Nachricht von WS empfaengt
    ws.on('message', function incoming(message) {

        //Countdown zuruecksetzen
        resetCountdown();

        //Nachricht kommt als String -> in JSON Objekt konvertieren
        var obj = JSON.parse(message);
        console.log(obj)
        let type = obj.type;
        let value = obj.value;

        //Array von MessageObjekten erstellen, die an WS gesendet werden
        let messageObjArr = [];

        //Pro Typ gewisse Aktionen durchfuehren
        switch (type) {

            //Infos kommen per RFID-Karten oder Button
            case "send-card-data":

                //Wenn gerade Karten akzeptiert werden oder noch kein Spiel geladen wurde
                if (acceptingCard || currentGame === null) {
                    console.log(value.blue);
                    console.log("value is " + value);

                    //Kartenwerte auslesen
                    let cardDataType = value.type;
                    let cardDataValue = value.value;

                    //Welcher Typ von Karte ist es (game-select, answer, shutdown)
                    switch (cardDataType) {

                        //Server herunterfahren
                        case "shutdown":
                            console.log("user send stop game and shutdown event".green);
                            console.log("stop accepting cards".red);
                            acceptingCard = false;

                            //Verabschiedungssound und Pi runterfahren
                            shutdown();
                            break;

                        //Spielauswahl
                        case "game-select":
                            console.log("user sends game select event".green);
                            startGame(cardDataValue);
                            break;

                        //Jingle abspielen
                        case "jingle":
                            playJingle(true);
                            break;

                        //Bei einer Antwort, der Joker-Karte oder der Repeat-Karte
                        case "answer": case "joker": case "repeat":
                            console.log("user sends answer event".green);

                            //Wenn noch kein Spiel ausgewaehlt wurde, Aufforderung ein Spiel auszuwaehlen
                            if (currentGame === null) {
                                console.log("waiting for game select".yellow);
                                playSound("select-game-first", true);
                            }

                            //Es laeuft schon ein Spiel
                            else {

                                //Wenn die Antwort korrekt ist oder der Joker gespielt wurde
                                if (cardDataValue === currentQuestion || cardDataType === "joker") {
                                    console.log("correct answer".green);

                                    //Anzahl der richtigen Antworten erhoehen
                                    correctAnswerCounter++;
                                    console.log(correctAnswerCounter + " correct answers");

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

                                    //Speziell: "Das war ein Hund", "So sieht der Buchstabe L aus"
                                    playSound(currentGame + "/" + currentQuestion + "-name");

                                    //Bei jeder 2. richtigen Antwort Jingle abspielen
                                    if (correctAnswerCounter % 2 === 0) {
                                        playJingle();
                                    }

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
                                    playSound("repeat", true);

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
                                    playSound("answer-wrong", true);

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
    let filePath = configFile.audioDir + "/" + path + ".mp3";

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

//Jingle abspielen
function playJingle(interrupt = false) {

    //Jingle-Sound ermitteln
    let jingleSound = jingles[jingleCounter];
    console.log("play jingle " + jingleSound);

    //Jingle-Sound abspielen
    playSound("jingles/" + path.basename(jingleSound, '.mp3'), interrupt);

    //zum naechsten Jingle-Sound gehen
    jingleCounter = (jingleCounter + 1) % jingles.length;
}

//Countdown starten
function startCountdown() {
    countdownTime = configFile.countdownTime;
    setInterval(countdown, 1000);
}

//Bei Inaktivitaet Countdown runterzaehlen und Shutdown ausfuehren
function countdown() {

    //Wenn der Countdown noch nicht abgelaufen ist, um 1 runterzaehln
    if (countdownTime >= 0) {
        console.log(countdownTime + " seconds");
        countdownTime--;
    }

    //Countdown ist abgelaufen, Shutdown durchfuehren
    else {
        shutdown();
    }
}

//Countdown wieder auf Startwert setzen
function resetCountdown() {
    countdownTime = configFile.countdownTime;
}

//Pi herunterfahren
function shutdown() {
    console.log("shutdown");

    //Shutdown-Sound
    playSound("shutdown", true);

    //Pi herunterfahren
    execSync("sleep 5 && shutdown -h now");
}