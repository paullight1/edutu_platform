# Android Widget Implementation Plan

## Current Assessment

- The active mobile app is `edutumobile`, an Expo SDK 55 app using CNG-friendly `app.config.js`.
- `@expo/config-plugins` is already installed.
- No checked-in `android/` or `ios/` native folders are required for this scaffold.
- The safest Phase 2 path is a local config plugin that writes Android widget files only during prebuild/EAS Build.
- iOS widgets are out of scope and are not included.

## Recommended Implementation

Use `plugins/android-widget` as the Android-only CNG scaffold. It generates a classic `AppWidgetProvider` plus `RemoteViews` resources because this requires no new Gradle dependencies. The initial widget is static and can be enabled later by adding the plugin entry to `app.config.js`.

Generated pieces:

- Manifest receiver for `android.appwidget.action.APPWIDGET_UPDATE`
- `EdutuWidgetProvider.kt`
- `res/xml/edutu_widget_info.xml`
- `res/layout/edutu_widget.xml`
- widget strings and background drawable

## Why RemoteViews First

RemoteViews is the lower-risk Expo CNG option for Phase 2:

- No AndroidX Glance dependency or Compose compiler setup.
- No app runtime code changes.
- Works with a generated Android project created by Expo prebuild or EAS Build.
- Keeps widget presentation native and isolated.

Glance remains a valid later option if the team wants Compose-based widget UI. That would require extending the plugin to add Gradle dependencies and verifying compatibility with the generated Expo Android project.

## Activation Steps

1. Add `./plugins/android-widget` to `app.config.js` under `expo.plugins`.
2. Run `npx expo prebuild --platform android --clean` locally or let EAS Build run prebuild.
3. Build Android and install on a device or emulator.
4. Add the Edutu widget from the Android launcher widget picker.

## Later Data Refresh Plan

The scaffold currently renders static text. For dynamic opportunity data:

1. Define a compact backend endpoint, for example `GET /api/mobile/widget-summary`.
2. Add a native Android refresh mechanism using `WorkManager` or `AppWidgetProvider.onUpdate`.
3. Store the last successful payload in Android `SharedPreferences`.
4. Update `RemoteViews` from cached data first, then refresh in the background.
5. Add a `PendingIntent` deep link to open the relevant Expo route.

The widget native code should call the NestJS backend API, not Supabase directly.

## Risks and Blockers

- The plugin is not active until added to `app.config.js`.
- Android widget behavior must be verified in a generated native project; this scaffold intentionally does not generate one.
- Dynamic data refresh requires native networking/background scheduling work and authentication design.
- Glance would require Gradle dependency injection and Compose compatibility checks.
