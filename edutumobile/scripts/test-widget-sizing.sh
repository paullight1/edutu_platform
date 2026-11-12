#!/bin/bash
set -eu
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
KOTLIN_BIN="${KOTLIN_BIN:-/Applications/Android Studio.app/Contents/plugins/Kotlin/kotlinc/bin}"
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_TMP="$(mktemp -d)"
trap 'rm -rf "$TASK_TMP"' EXIT
"$KOTLIN_BIN/kotlinc" "$TASK_ROOT/android/app/src/main/java/com/edutu/com/widgets/WidgetSizing.kt" "$TASK_ROOT/scripts/widget-tests/WidgetSizingTest.kt" -d "$TASK_TMP/tests.jar"
"$KOTLIN_BIN/kotlin" -classpath "$TASK_TMP/tests.jar" com.edutu.com.widgets.WidgetSizingTestKt
