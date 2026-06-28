# Edutu Android Widget Config Plugin

This is a scaffold for an Expo CNG-compatible Android home-screen widget. It does not check in an `android/` or `ios/` native project. When enabled and run during `expo prebuild` or EAS Build prebuild, the plugin writes the Android widget native files into the generated Android project.

## Enable

Add the plugin to `app.config.js` when Phase 2 is ready to generate native Android files:

```js
plugins: [
  "expo-router",
  [
    "./plugins/android-widget",
    {
      widgetName: "Edutu",
      title: "Edutu",
      subtitle: "Track scholarships and next steps",
      minWidth: "250dp",
      minHeight: "110dp",
      targetCellWidth: "4",
      targetCellHeight: "2",
      updatePeriodMillis: 0
    }
  ]
]
```

The plugin intentionally does not modify `app.config.js` in this scaffold so it has no effect until explicitly enabled.

## Generated Android Files

During prebuild, the plugin adds:

- `AndroidManifest.xml` receiver entry for `.widgets.EdutuWidgetProvider`
- `app/src/main/java/<android-package>/widgets/EdutuWidgetProvider.kt`
- `app/src/main/res/xml/edutu_widget_info.xml`
- `app/src/main/res/layout/edutu_widget.xml`
- `app/src/main/res/drawable/edutu_widget_background.xml`
- `app/src/main/res/values/edutu_widget_strings.xml`

The generated provider uses Android `AppWidgetProvider` and `RemoteViews`, which avoids extra AndroidX Glance dependencies in this first scaffold.

## Data Integration Boundary

This scaffold is static by design and does not touch React Native runtime code. A later phase can add one of these data paths:

- A native `WorkManager` job that fetches a backend widget summary and refreshes `RemoteViews`.
- A small Expo module that writes selected widget state into Android `SharedPreferences`.
- A deep link `PendingIntent` from widget rows into the Expo app.

Use the backend API as the data boundary. Do not query Supabase directly from widget native code.
