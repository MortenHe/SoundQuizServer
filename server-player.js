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

//Game-Config-JSON-Objekt aus Datei holen, um daraus passende Datenstruktur zu bauen
const fs = require('fs-extra');
console.log("read game config".green);

//Wo wird das Skript betrieben win vs. pi
const runMode = process.argv[2] ? process.argv[2] : "pi";

//Verzeichnis wo die Fragenfiles liegen
const soundDir = runMode === "win" ? "C:/Apache24/htdocs/SoundQuizServer/sounds" : "/media/soundquiz";
console.log("using sound dir " + soundDir.green);

//Liste der Jingles laden
var jingles = fs.readdirSync(soundDir + "/jingles");
console.log("available jingles: " + JSON.stringify(jingles).green);

//Jingles random
shuffle(jingles);
console.log("jingle order: " + JSON.stringify(jingles).green);

//Schritt fuer Schritt durch das Jingle-Array gehen
var jingleCounter = 0;

//Liste der Spiele
const games = ["people", "sounds"];

//Wenn sich ein WebSocket mit dem WebSocketServer verbindet
wss.on('connection', function connection(ws) {
    console.log("new client connected");

    //Wenn WSS eine Nachricht von WS empfaengt
    ws.on('message', function incoming(message) {

        //Nachricht kommt als String -> in JSON Objekt konvertieren
        var obj = JSON.parse(message);

        //Werte auslesen
        let value = obj.value;

        //Kartenwerte auslesen
        let cardData = JSON.parse(value);
        let cardDataType = cardData.type;
        let cardDataValue = cardData.value;

        //Welcher Typ von Karte ist es (game-select, answer, shutdown)
        switch (cardDataType) {

            //Spiel beenden
            case "shutdown":
                console.log("user send stop game and shutdown event".green);

                //Verabschiedungssound
                playSound("shutdown", true);

                //Pi herunterfahren
                execSync("sleep 5 && shutdown -h now");
                break;

            //Einen Kartensound abspielen
            case "answer":
                console.log("user sends ANSWER event".green);

                //Sound abspielen (nur Wert "dog" steht zur Verfuegung, Pfad people vs. sounds muss ermittelt werden)
                playSound(cardDataValue, true);
                break;

            //Bei Joker ein Jingle abspielen
            case "joker":
                console.log("user sends JOKER event".green);

                //Jingle-Sound ermitteln
                let jingleSound = jingles[jingleCounter];
                console.log("play jingle " + jingleSound);

                //Jingle-Sound abspielen
                playSound(soundDir + "/jingles/" + jingleSound);

                //zum naechsten Jingle-Sound gehen
                jingleCounter = (jingleCounter + 1) % jingles.length;
                break;
        }
    });
});

//Sound abspielen
function playSound(path, detectPath = false) {

    //Wenn Pfad ermittelt werden muss
    if (detectPath) {

        //Ueber Liste der Spiele gehen
        for (game of games) {

            //potentiellen Pfad erstellen
            let testPath = soundDir + "/" + game + "/" + path + "-question.mp3";
            console.log("check if exists: " + testPath);

            //Wenn diese Datei existiert
            if (fs.existsSync(testPath)) {

                //Pfad merken
                path = testPath;

                //Iteration abbrechen
                break;
            }
        }
    }

    //Sound soll direkt wiedergegeben werden
    player.play(path);
}