// Must come before the router entry: expo-task-manager loads the JS bundle
// headlessly to run a notification-action tap, and on that launch path the
// router never mounts — a task defined behind app/_layout.tsx wouldn't exist
// yet. Importing here defines it at module scope on every launch.
import "./lib/notificationActionTask";
import "expo-router/entry";
