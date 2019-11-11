#!/bin/bash
/usr/bin/sudo /usr/bin/node /home/pi/mh_prog/SoundQuizServer/server.js ${1:-''} > /home/pi/mh_prog/output-server.txt &