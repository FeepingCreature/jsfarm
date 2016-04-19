#!/bin/sh
set -e
TARGET_FDR=web
TEMP_FDR=web_wip
OLD_FDR=web_old

rm -rf $TEMP_FDR/ || true
mkdir $TEMP_FDR/
mkdir $TEMP_FDR/js/
mkdir $TEMP_FDR/css/
find -name \*.pp |while read FILE
do
  TARGET="${FILE%.pp}"
  cpp -w -ffreestanding "$FILE" |grep -v ^# > "$TEMP_FDR/$TARGET"
done

cp .htaccess $TEMP_FDR/
cp -R fonts/ $TEMP_FDR/
cp lib/*.css css/*.css $TEMP_FDR/css/

cp -R addon/ $TEMP_FDR/
# still needed (because source map)
cp *.js lib/*.js $TEMP_FDR/js/

FILES="jquery.min.js bootstrap.min.js"
FILES="$FILES jquery.color-2.1.0.min.js js.cookie-2.1.0.min.js dom-q.js hashwords.min.js"
FILES="$FILES lib/codemirror.js renderlisp.js"
FILES="$FILES addon/edit/matchbrackets.js addon/edit/closebrackets.js addon/selection/mark-selection.js"
FILES="$FILES imgur_canvas.js"
FILES="$FILES peer.js compile.js files.js time.js log.js rgbe.js networking.js progress.js edit.js themes.js"

#echo "pre-minifying"
#java -jar compiler.jar -W QUIET -O WHITESPACE_ONLY --js_output_file='$TEMP_FDR/js/all.min.js' $FILES
#java -jar compiler.jar -W QUIET -O WHITESPACE_ONLY --js_output_file='$TEMP_FDR/js/main.min.js' 'main.js'

echo "minifying $FILES"
java -jar compiler.jar -W QUIET --create_source_map "$TEMP_FDR/js/all.min.map"  --js_output_file="$TEMP_FDR/js/all.min.js"  $FILES
java -jar compiler.jar -W QUIET --create_source_map "$TEMP_FDR/js/main.min.map" --js_output_file="$TEMP_FDR/js/main.min.js" "main.js"

echo "replacing existing folder"
mv $TARGET_FDR/ $OLD_FDR/
mv $TEMP_FDR/ $TARGET_FDR/
rm -rf $OLD_FDR/
