#!/bin/bash
cd /home/pi/mh_prog/SoundQuizServer
/usr/bin/sudo /usr/bin/node ./server.js > /home/pi/mh_prog/output-soundquiz-server.txt &
/bin/sleep 5
cd /home/pi/mh_prog/SoundQuizGPIO
/usr/bin/sudo /usr/bin/node ./led.js > /home/pi/mh_prog/output-soundquiz-led.txt &
/usr/bin/sudo /usr/bin/node ./rfid.js > /home/pi/mh_prog/output-soundquiz-rfid.txt &