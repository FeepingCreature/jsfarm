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
# cp lib/*.css $TEMP_FDR/css/
cp css/*.css $TEMP_FDR/css/

# cp -R addon/ $TEMP_FDR/
# still needed (because source map)
# cp lib/*.js $TEMP_FDR/js/
cp *.js $TEMP_FDR/js/

FILES="js.cookie-2.1.0.js dom-q.js hashwords.min.js"
FILES="$FILES renderlisp.js"
FILES="$FILES imgur_canvas.js"
FILES="$FILES peer.js compile.js files.js time.js log.js rgbe.js networking.js progress.js edit.js themes.js"
FILES="$FILES main.js"

echo "minifying $FILES"
java -jar compiler.jar -W QUIET \
  --create_source_map "$TEMP_FDR/js/all.min.map" \
  --compilation_level SIMPLE \
  --js_output_file="$TEMP_FDR/js/all.min.js" \
  $FILES

echo "minifying pool"
java -jar compiler.jar \
  --create_source_map "$TEMP_FDR/js/pool.min.map" \
  --compilation_level SIMPLE \
  --js_output_file="$TEMP_FDR/js/pool.min.js" \
  'compile.js' 'files.js' 'pool.js'

echo "replacing existing folder"
mv $TARGET_FDR/ $OLD_FDR/
mv $TEMP_FDR/ $TARGET_FDR/
rm -rf $OLD_FDR/
