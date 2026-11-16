// Side-effect-only module: importing it initialises crash reporting.
//
// It exists because `import` declarations are hoisted — a bare
// `initCrashReporting()` call in index.js would run only AFTER every module in
// that file had already been evaluated, which is exactly the window we most
// want covered (module-scope work in notificationActionTask, expo-router's
// entry). Import order between side-effecting modules IS preserved, so putting
// the call inside a module and importing it first genuinely gets us there.
import { initCrashReporting } from './crashReporting';

initCrashReporting();
