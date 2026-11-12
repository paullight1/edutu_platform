#!/bin/bash
# Build a small isolated preview APK using production widget resources/Kotlin, without Gradle/RN.
set -eu
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
TASK_SDK="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
TASK_KOTLIN="${KOTLIN_BIN:-/Applications/Android Studio.app/Contents/plugins/Kotlin/kotlinc/bin}"
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_SAVED_APK="${WIDGET_PREVIEW_APK:-/tmp/edutu-widget-preview.apk}"
if [ "${1:-}" = "--render-only" ]; then
  "$TASK_SDK/platform-tools/adb" install -r "$TASK_SAVED_APK"
  TASK_RESULT="$("$TASK_SDK/platform-tools/adb" shell am instrument -w com.edutu.widgetpreview/.PreviewInstrumentation)"
  printf '%s\n' "$TASK_RESULT"
  [[ "$TASK_RESULT" == *"INSTRUMENTATION_CODE: -1"* && "$TASK_RESULT" == *"result=PASS:"* ]]
  exit 0
fi
TASK_TMP="$(mktemp -d)"
trap 'rm -rf "$TASK_TMP"' EXIT
python3 - "$TASK_ROOT" "$TASK_TMP" <<'PY'
import sys,shutil
from pathlib import Path
root,tmp=map(Path,sys.argv[1:])
for p in (root/'android/app/src/main/res').glob('*/*widget*'):
 if p.is_file():
  target=tmp/'res'/p.parent.name/p.name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
(tmp/'AndroidManifest.xml').write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.edutu.widgetpreview"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="35"/><application android:theme="@android:style/Theme.Material.Light.NoActionBar" android:label="Edutu Widget Preview"><activity android:name=".PreviewActivity" android:exported="true"/></application><instrumentation android:name=".PreviewInstrumentation" android:targetPackage="com.edutu.widgetpreview"/></manifest>')
PY
TASK_TOOLS="$TASK_SDK/build-tools/${ANDROID_BUILD_TOOLS_VERSION:-37.0.0}"
TASK_ANDROID="$TASK_SDK/platforms/android-35/android.jar"
"$TASK_TOOLS/aapt2" compile --dir "$TASK_TMP/res" -o "$TASK_TMP/resources.zip"
"$TASK_TOOLS/aapt2" link -o "$TASK_TMP/preview.apk" --manifest "$TASK_TMP/AndroidManifest.xml" -I "$TASK_ANDROID" --custom-package com.edutu.com --java "$TASK_TMP/java" "$TASK_TMP/resources.zip"
"$JAVA_HOME/bin/javac" -d "$TASK_TMP/classes" "$TASK_TMP/java/com/edutu/com/R.java"
"$TASK_KOTLIN/kotlinc" "$TASK_ROOT"/android/app/src/main/java/com/edutu/com/widgets/*.kt -classpath "$TASK_ANDROID:$TASK_TMP/classes" -d "$TASK_TMP/widgets.jar"
"$JAVA_HOME/bin/javac" -source 17 -target 17 -Xlint:-options -classpath "$TASK_ANDROID:$TASK_TMP/classes:$TASK_TMP/widgets.jar" -d "$TASK_TMP/classes" "$TASK_ROOT"/scripts/widget-preview/*.java
"$JAVA_HOME/bin/jar" cf "$TASK_TMP/java.jar" -C "$TASK_TMP/classes" .
mkdir "$TASK_TMP/dex"
"$TASK_TOOLS/d8" --lib "$TASK_ANDROID" --min-api 26 --output "$TASK_TMP/dex" "$TASK_TMP/java.jar" "$TASK_TMP/widgets.jar" "${TASK_KOTLIN%/bin}/lib/kotlin-stdlib.jar"
(cd "$TASK_TMP/dex" && zip -q -j "$TASK_TMP/preview.apk" classes*.dex)
"$TASK_TOOLS/apksigner" sign --ks "$TASK_ROOT/android/app/debug.keystore" --ks-pass pass:android "$TASK_TMP/preview.apk"
cp "$TASK_TMP/preview.apk" "$TASK_SAVED_APK"
if [ "${1:-}" = "--compile-only" ]; then
  echo 'Production widget resources, Kotlin, and native preview renderer compiled and signed successfully.'
  exit 0
fi
"$TASK_SDK/platform-tools/adb" install -r "$TASK_TMP/preview.apk"
TASK_RESULT="$("$TASK_SDK/platform-tools/adb" shell am instrument -w com.edutu.widgetpreview/.PreviewInstrumentation)"
printf '%s\n' "$TASK_RESULT"
[[ "$TASK_RESULT" == *"INSTRUMENTATION_CODE: -1"* && "$TASK_RESULT" == *"result=PASS:"* ]]
printf 'Isolated native render completed. Pull /sdcard/Android/data/com.edutu.widgetpreview/files/previews.\n'
