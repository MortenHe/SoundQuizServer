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
const glob = require('glob');
const exec = require('child_process').exec;
const shuffle = require('shuffle-array')

//Config laden
const configFile = fs.readJsonSync(__dirname + '/config.json');
console.log("using sound dir " + configFile.audioDir.green);

//Lautstaerke zu Beginn auf x% setzen
if (configFile["audioOutput"]) {
    const initialVolumeCommand = "sudo amixer sset " + configFile["audioOutput"] + " " + + configFile.volume + "% -M";
    console.log(initialVolumeCommand)
    exec(initialVolumeCommand);
}
else {
    console.log("no audioOutput configured");
}

//Liste der Audio files (ohne Jingles) fuer random
const audioFiles = glob.sync(configFile.audioDir + "/*/*.mp3", {
    ignore: ["**/jingles/*.mp3"]
});

//Countdown starten
startCountdown();

//Liste der Jingles laden
var jingles = fs.readdirSync(configFile.audioDir + "/jingles");
console.log("available jingles: " + JSON.stringify(jingles).green);

//Jingles random
shuffle(jingles);
console.log("jingle order: " + JSON.stringify(jingles).green);

//Schritt fuer Schritt durch das Jingle-Array gehen
var jingleCounter = 0;

//Zu Beginn einen zufaelligen Sound abspielen
playSound(configFile.audioDir + "/server-player-start.mp3");

//Wenn sich ein WebSocket mit dem WebSocketServer verbindet
wss.on('connection', function connection(ws) {
    console.log("new client connected");

    //Wenn WSS eine Nachricht von WS empfaengt
    ws.on('message', function incoming(message) {

        //Countdown zuruecksetzen
        resetCountdown();

        //Nachricht kommt als String -> in JSON Objekt konvertieren
        var obj = JSON.parse(message);

        //Werte auslesen
        let type = obj.type;
        let value = obj.value;

        //Welcher Typ von Karte ist es (game-select, answer, shutdown)
        switch (type) {

            //Infos kommen per RFID-Karte oder Button
            case "send-card-data":

                //Kartenwerte auslesen
                let cardDataType = value.type;
                let cardDataValue = value.value;
                console.log("user sends " + cardDataType + " event".green);
                switch (cardDataType) {

                    //Server herunterfahren
                    case "shutdown":
                        shutdown();
                        break;

                    //Einen Kartensound abspielen, //Sound abspielen (nur Wert "dog" steht zur Verfuegung, Pfad people vs. sounds muss ermittelt werden)
                    case "answer":
                        let soundFile;
                        let suffix;

                        //Bei Antwortarray (z.B. Numbers) -> ersten Array-Wert nehmen und Antwort vorlesen
                        if (Array.isArray(cardDataValue)) {
                            soundFile = cardDataValue[0];
                            suffix = "name";
                        }

                        //Einzelantwort (z.B. people) -> diesen Wert zum Abspielen nehmen und Frage vorlesen
                        else {
                            soundFile = cardDataValue;
                            suffix = "question";
                        }
                        playSound(soundFile, true, suffix);
                        break;

                    //Jingle abspielen
                    case "jingle": case "repeat":
                        playJingle();
                        break;

                    //Joker -> random sound
                    case "joker":
                        playRandomSound();
                        break;
                }
                break;
        }
    });
});

//Sound abspielen
function playSound(path, detectPath = false, suffix = "question") {

    //Wenn Pfad ermittelt werden muss
    if (detectPath) {
        path = glob.sync(configFile.audioDir + "/*/" + path + "-" + suffix + ".mp3")[0];
    }

    //Sound abspielen
    console.log("play sound " + path);
    player.play(path);
}

//Zufaelligen Sound ermitteln und abspielen
function playRandomSound() {
    const randomFile = audioFiles[Math.floor(Math.random() * audioFiles.length)];
    console.log("play random sound " + randomFile);
    player.play(randomFile);
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
    playSound(configFile.audioDir + "/shutdown.mp3");

    //Pi herunterfahren
    exec("sleep 5 && shutdown -h now");
}

//Jingle abspielen
function playJingle() {

    //Jingle-Sound ermitteln
    let jingleSound = jingles[jingleCounter];
    console.log("play jingle " + jingleSound);

    //Jingle-Sound abspielen
    playSound(configFile.audioDir + "/jingles/" + jingleSound);

    //zum naechsten Jingle-Sound gehen
    jingleCounter = (jingleCounter + 1) % jingles.length;
}