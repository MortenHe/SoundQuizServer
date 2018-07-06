//WebSocketServer anlegen und starten
console.log("create websocket server");
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080, clientTracking: true });

//Mplayer + Wrapper anlegen
const createPlayer = require('mplayer-wrapper');
const player = createPlayer();

//Wenn Playlist fertig ist
player.on('playlist-finish', () => {
    console.log("playlist finished");
});

//Wenn bei Track change der Filename geliefert wird
player.on('filename', (filename) => {
    console.log(filename);

    if (filename.endsWith("-question.mp3")) {

        //Frage wurde gestellt, nun warten wir auf die Antwort
        waitingForAnswer = true;
        console.log("waiting for answer");
    }
});

//Wenn sich ein Titel aendert (durch Nutzer oder durch den Player)
player.on('track-change', () => {
    console.log("track-change");

    //Neuen Dateinamen liefern
    player.getProps(['filename']);
});

//Befehle auf Kommandzeile ausfuehren
const { execSync } = require('child_process');

//Game-Config-JSON-Objekt aus Datei holen
console.log("read game config");
const fs = require('fs-extra');
const gameConfig = fs.readJsonSync('./game-config.json');

//Verzeichnis wo die Videos liegen
const soundDir = "/media/soundquiz";

//Zu Beginn ist kein Spiel ausgewaehlt
var currentGame = null;

//Liste der Fragen und aktuelle Frage
var currentQuestions = [];
var currentQuestion = "";

//Werden gerade Antworten ausgewertet?
var waitingForAnswer = false;

//"Welches Spiel moechtest du spielen?"
playSound("which-game");

//Wenn sich ein WebSocket mit dem WebSocketServer verbindet
wss.on('connection', function connection(ws) {
    console.log("new client connected");

    //Wenn WSS eine Nachricht von WS empfaengt
    ws.on('message', function incoming(message) {

        //Nachricht kommt als String -> in JSON Objekt konvertieren
        var obj = JSON.parse(message);
        console.log(obj)

        //Werte auslesen
        let type = obj.type;
        let value = obj.value;

        //Array von MessageObjekte erstellen, die an WS gesendet werden
        let messageObjArr = [];

        //Pro Typ gewisse Aktionen durchfuehren
        switch (type) {

            //Infos kommen per RFID-Karten
            case "send-card-data":
                console.log(value);

                //Kartenwerte auslesen
                let cardData = JSON.parse(value);
                let cardDataType = cardData.type;
                let cardDataValue = cardData.value;

                //Welcher Typ von Karte ist es (game-select vs. answer)
                switch (cardDataType) {

                    //Spielauswahl
                    case "game-select":
                        console.log("user sends game select event");

                        //Spiel starten
                        startGame(cardDataValue);
                        break;

                    //Bei einer Antwort
                    case "answer":
                        console.log("user sends answer event");

                        //Wenn noch kein Spiel ausgewaehlt wurde
                        if (currentGame === null) {
                            console.log("waiting for game select");

                            //Aufforderung ein Spiel auszuwaehlen
                            playSound("select-game-first");
                        }

                        //Es laeuft schon ein Spiel
                        else {

                            //Wenn gerade Antworten ausgewertet werden
                            if (waitingForAnswer) {

                                //Wenn die Antwort korrekt ist
                                if (cardDataValue === currentQuestion) {
                                    console.log("correct answer. Stop waiting for answer");

                                    //Weitere Kartenaufrufe verhindern
                                    waitingForAnswer = false;

                                    //Info an WS-Clients, dass Antwort korrekt war
                                    messageObjArr.push({
                                        type: "answer-state",
                                        value: true
                                    });

                                    //Infos an Clients schicken
                                    sendClientInfo(messageObjArr);

                                    //allgemein: "Richtige Antwort"
                                    playSound("answer-correct");

                                    //Speziell: "So bellt ein Hund", "So sieht der Buchstabe L aus"
                                    playSound(currentGame + "/" + currentQuestion + "-name");

                                    //Naechste Frage laden
                                    askQuestion();
                                }

                                //Antwort war falsch
                                else {
                                    console.log("wrong answer");

                                    //Info an WS-Clients, dass Antwort falsch war
                                    messageObjArr.push({
                                        type: "answer-state",
                                        value: false
                                    });

                                    //Infos an Clients schicken
                                    sendClientInfo(messageObjArr);

                                    //"Leider falsch, probier es noch einmal"
                                    playSound("answer-wrong");

                                    //Frage wiederholen?
                                }
                            }
                        }
                        break;
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
        //console.log(messageObj)

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
function playSound(path) {

    player.queue(soundDir + "/" + path + ".mp3");


    //let soundCommand = "mplayer " + soundDir + "/" + path + ".mp3";
    //console.log(soundCommand);
    //execSync(soundCommand);


    //let sound = "mplayer C:/apache24/htdocs/SoundQuizServer/sounds/" + path + ".mp3";
    //console.log(sound);
    //execSync(sound);
}

//Spiel starten
function startGame(game) {
    console.log("try to start game " + game);

    //Wenn das bereits gestartete Spiel gestartet werden soll, Hinweis ausgeben
    if (currentGame === game) {
        console.log("already playing game " + game);
        playSound("already-playing-game");
    }

    //dieses Spiel starten
    else {
        console.log("play game " + game);

        //Allgemein: "Los geht's. Wir spielen jetzt das Spiel..."
        playSound("lets-go");

        //Speziell: "Geraeusche erkennen"
        playSound("game-" + game);

        //Aktuelles Spiel merken
        currentGame = game;

        //Fragen dieses Spiels aus Config laden
        currentQuestions = gameConfig[game];

        //Frage stellen
        askQuestion();
    }
}

//Eine Frage stellen
function askQuestion() {
    console.log("pick next random question");

    //neue Frage erstellen
    let question;

    //Zufaelligen Wert ausaehlen und sicherstellen, dass nicht 2 Mal die gleiche Frage kommt
    do {
        question = currentQuestions[Math.floor(Math.random() * currentQuestions.length)];
    }
    while (question === currentQuestion)

    //neue Frage merken
    currentQuestion = question;
    console.log("next question is " + currentQuestion);

    //"Wer macht dieses Geraeusch", "Zeige mir den Buchstaben", "Wer spricht so?"
    playSound("question-prefix-" + currentGame);

    //Eigentlicher Sound (Katze, Mensch, Buchstabe)
    playSound(currentGame + "/" + currentQuestion + "-question");
}