// Must be the FIRST import: it initialises crash reporting as a side effect, so
// anything thrown by the modules below — including notificationActionTask's
// module-scope work — is reported rather than lost.
import "./lib/crashReportingInit";
// Must come before the router entry: expo-task-manager loads the JS bundle
// headlessly to run a notification-action tap, and on that launch path the
// router never mounts — a task defined behind app/_layout.tsx wouldn't exist
// yet. Importing here defines it at module scope on every launch.
import "./lib/notificationActionTask";
import "expo-router/entry";
