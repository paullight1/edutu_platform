#!/bin/bash
# Minimal test-only host for the real installed Edutu APK. No app data or credentials.
set -eu
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
TASK_SDK="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_TMP="$(mktemp -d)"
trap 'rm -rf "$TASK_TMP"' EXIT
TASK_TOOLS="$TASK_SDK/build-tools/37.0.0"
TASK_ANDROID="$TASK_SDK/platforms/android-35/android.jar"
cat > "$TASK_TMP/AndroidManifest.xml" <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.edutu.widgetpreview"><uses-sdk android:minSdkVersion="31" android:targetSdkVersion="35"/><uses-permission android:name="android.permission.BIND_APPWIDGET"/><queries><package android:name="com.edutu.com"/></queries><application android:theme="@android:style/Theme.Material.DayNight.NoActionBar" android:label="Edutu Installed Widget Test"><activity android:name=".InstalledWidgetActivity" android:exported="true"/></application></manifest>
XML
# Platform DayNight is not provided on older resource tables; DeviceDefault follows uiMode.
sed -i '' 's/Theme.Material.DayNight.NoActionBar/Theme.DeviceDefault.NoActionBar/' "$TASK_TMP/AndroidManifest.xml"
"$TASK_TOOLS/aapt2" link -o "$TASK_TMP/host.apk" --manifest "$TASK_TMP/AndroidManifest.xml" -I "$TASK_ANDROID"
mkdir "$TASK_TMP/classes" "$TASK_TMP/dex"
"$JAVA_HOME/bin/javac" -source 17 -target 17 -Xlint:-options -classpath "$TASK_ANDROID" -d "$TASK_TMP/classes" "$TASK_ROOT/scripts/widget-preview/InstalledWidgetActivity.java"
"$JAVA_HOME/bin/jar" cf "$TASK_TMP/java.jar" -C "$TASK_TMP/classes" .
"$TASK_TOOLS/d8" --lib "$TASK_ANDROID" --min-api 31 --output "$TASK_TMP/dex" "$TASK_TMP/java.jar"
(cd "$TASK_TMP/dex" && zip -q -j "$TASK_TMP/host.apk" classes*.dex)
"$TASK_TOOLS/apksigner" sign --ks "$TASK_ROOT/android/app/debug.keystore" --ks-pass pass:android "$TASK_TMP/host.apk"
cp "$TASK_TMP/host.apk" /tmp/edutu-installed-widget-host.apk
echo /tmp/edutu-installed-widget-host.apk
