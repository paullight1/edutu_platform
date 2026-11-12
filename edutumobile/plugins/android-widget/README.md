# Edutu Android widgets

The active config plugin registers all ten providers, copies the complete widget suite from `templates/`, and starts `WidgetRefreshObserver` in `MainApplication.onCreate`. It supports the checked-in native project and clean Expo prebuild. It does not need a new Gradle dependency.

Native runtime behavior:

- Cache-only initial render; bounded background HTTP refresh via `goAsync`.
- JSON files in the app documents/files directory trigger debounced updates to placed widgets.
- Android 12+ responsive size maps, with resize callbacks for older launchers.
- Light/dark resources and picker artwork.
- Public fallback requests use the NestJS API at `https://backend.edutu.org`.

## Editing

1. Edit native widget sources/resources under `android/app/src/main/`.
2. If changing picker artwork, run `python3 scripts/generate-widget-previews.py` (Pillow required).
3. Run `node scripts/sync-widget-templates.cjs` to update the committed prebuild templates.
4. Run:

   ```sh
   node --test scripts/widget-resources.test.cjs scripts/widget-plugin.test.cjs
   bash scripts/test-widget-sizing.sh
   bash scripts/check-widget-native.sh
   ```

The shell checks use the Android SDK and Android Studio's bundled JDK/Kotlin compiler by default. `JAVA_HOME`, `ANDROID_SDK_ROOT`, and `KOTLIN_BIN` can override their paths. These checks compile widget code/resources in temporary directories without building React Native or downloading Gradle dependencies; real launcher/device verification and a full app build remain necessary.

Rebuild and reinstall the native app after changing widgets. OTA updates cannot update these native resources.


The actionable suite adds Today’s Next Step (three sizes), a bundled mascot in Ask Edutu (small/medium), and app-opening authenticated Save links in medium/large Top Matches. Widget files contain no authentication tokens. Sample artwork is generated with the script above. `scripts/render-widget-native-previews.sh` builds a separate off-screen instrumentation APK to render actual production RemoteViews without opening or stopping Edutu; `--compile-only` validates that harness without installing it. It defaults to Android build-tools 37 (`ANDROID_BUILD_TOOLS_VERSION` overrides), which supports the bundled Kotlin compiler metadata.
