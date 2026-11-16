#!/bin/bash
# Compile widget resources and Kotlin without building React Native or downloading Gradle dependencies.
set -eu
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
TASK_SDK="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
TASK_KOTLIN="${KOTLIN_BIN:-/Applications/Android Studio.app/Contents/plugins/Kotlin/kotlinc/bin}"
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_TMP="$(mktemp -d)"
trap 'rm -rf "$TASK_TMP"' EXIT
python3 - "$TASK_ROOT" "$TASK_TMP" <<'PY'
import sys,shutil
from pathlib import Path
root,tmp=map(Path,sys.argv[1:])
res=root/'android/app/src/main/res'
for p in res.glob('*/*widget*'):
 if p.is_file():
  target=tmp/'res'/p.parent.name/p.name
  target.parent.mkdir(parents=True,exist_ok=True)
  shutil.copyfile(p,target)
(tmp/'AndroidManifest.xml').write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.edutu.com"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="35"/><application/></manifest>')
PY
TASK_AAPT="$TASK_SDK/build-tools/35.0.0/aapt2"
"$TASK_AAPT" compile --dir "$TASK_TMP/res" -o "$TASK_TMP/resources.zip"
"$TASK_AAPT" link -o "$TASK_TMP/widgets.apk" --manifest "$TASK_TMP/AndroidManifest.xml" -I "$TASK_SDK/platforms/android-35/android.jar" --java "$TASK_TMP/java" "$TASK_TMP/resources.zip"
"$JAVA_HOME/bin/javac" -d "$TASK_TMP/classes" "$TASK_TMP/java/com/edutu/com/R.java"
"$TASK_KOTLIN/kotlinc" "$TASK_ROOT"/android/app/src/main/java/com/edutu/com/widgets/*.kt -classpath "$TASK_SDK/platforms/android-35/android.jar:$TASK_TMP/classes" -d "$TASK_TMP/widgets.jar"
echo 'Widget Android resources and Kotlin compiled successfully (API 35).'
