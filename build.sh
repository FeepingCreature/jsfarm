#!/bin/sh
set -e
rm -rf web/
mkdir web/
mkdir web/js/
mkdir web/css/
find -name \*.pp |while read FILE
do
  TARGET="${FILE%.pp}"
  cpp -w -ffreestanding "$FILE" |grep -v ^# > "web/$TARGET"
done

cp .htaccess web
cp -R fonts/ web/
cp lib/*.css css/*.css web/css/

cp -R addon/ web/
# still needed (because source map)
cp *.js lib/*.js web/js/

FILES="jquery.min.js bootstrap.min.js"
FILES="$FILES jquery.color-2.1.0.min.js js.cookie-2.1.0.min.js dom-q.js hashwords.min.js"
FILES="$FILES lib/codemirror.js renderlisp.js"
FILES="$FILES addon/edit/matchbrackets.js addon/edit/closebrackets.js addon/selection/mark-selection.js"
FILES="$FILES imgur_canvas.js"
FILES="$FILES peer.js compile.js files.js time.js log.js rgbe.js networking.js progress.js edit.js themes.js"

echo "minifying $FILES"
java -jar compiler.jar -W QUIET --create_source_map 'web/js/all.min.map' --js_output_file='web/js/all.min.js' $FILES
java -jar compiler.jar -W QUIET --create_source_map 'web/js/main.min.map' --js_output_file='web/js/main.min.js' 'main.js'
