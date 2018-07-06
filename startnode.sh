#!/bin/bash
cd /home/pi/mh_prog/SoundGameServer
/usr/bin/sudo /usr/bin/node ./server.js > /home/pi/mh_prog/output-soundgame-server.txt &
/bin/sleep 5
cd /home/pi/mh_prog/SoundGameGPIO
/usr/bin/sudo /usr/bin/node ./led.js > /home/pi/mh_prog/output-soundgame-led.txt &
/usr/bin/sudo /usr/bin/node ./rfid.js > /home/pi/mh_prog/output-soundgame-rfid.txt &