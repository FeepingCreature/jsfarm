#!/bin/sh
HOST="http://feep.life/~feep/jsfarm"
set -e
rm -rf web/ out/ || true
mkdir out/
mkdir web/
cd web/
wget -m -np -nH --cut-dirs=2 $HOST/ $HOST/css/site.css
cd ..
npm start
