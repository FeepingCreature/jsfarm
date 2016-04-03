#!/bin/sh
rm -rf web/
mkdir web/
mkdir web/js/
mkdir web/css/
find -name \*.pp |while read FILE
do
  TARGET="${FILE%.pp}"
  cpp -w -ffreestanding "$FILE" |grep -v ^# > "web/$TARGET"
done
cp -R addon/ web/
cp -R fonts/ web/
cp *.js lib/*.js web/js/
cp *.css lib/*.css css/*.css web/css/
