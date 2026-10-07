# Release refresh verification

Each production build emits a unique `version.json` and embeds the same version
in JavaScript. Publish the entire dist directory atomically. The version endpoint
and worker files use no-store headers; hashed assets remain immutable. Version
checks run on launch, foreground, online recovery, and every five visible minutes.
Capacitor bundles use their native release channel and do not check this endpoint.

New workers wait until a user requests refresh. Existing workers from before this
change may still activate automatically during the first rollout. Existing app
sessions without this feature need one ordinary close/reopen or reload first.

Application reflection editors flush to the API before refreshing. Other edited
controls block refresh conservatively until reverted or the editor is left after saving.
The profile editor uses its existing dirty/saving state, so saving it allows refresh
without leaving the page. Edits made while drafts are saving cancel that refresh
attempt. Missing metadata, offline checks, failed worker installs and rollback
never trigger an automatic reload.
New rich editors should register an async saver with registerReleaseDraftSaver
and mark managed controls with data-release-draft-managed only when save failures
reject. Long operations outside fetch/XHR should expose data-release-busy=true.
No arbitrary form values or credentials are copied to browser storage.

## Hosted acceptance check

1. Publish build A to a staging HTTPS origin and install/open it as a PWA.
2. Keep that session open. Publish build B to the same origin.
3. Background and resume A. Confirm “Top100 has been updated” and “Refresh now”.
4. Edit a form and start a delayed upload. Click refresh; confirm it stays open.
5. Edit an application reflection. Confirm refresh waits for the API save; failed
   saves keep the session open and show the error. Check the saved value after reload.
6. Finish other work and leave its editor. Refresh. Confirm B loads with no notice,
   without uninstalling, and an additional open A tab does not automatically reload.
7. Repeat offline/online; offline checks must not break the page or lose edits.
8. Check response headers for version.json, sw.js and sw-custom.js (no-store),
   and assets/*.js (immutable). Repeat on iOS standalone and Android Chrome.

Unit tests simulate an A session observing B. The hosted/device steps require two
actual deployments and are not replaced by those tests.

## Local verification performed

A real Chromium session on localhost was controlled by build A's service worker.
The server was switched to build B without closing the session. The session showed
the update notice, and Refresh now activated B and loaded B's hashed entry script;
the notice disappeared. This verifies the worker/cache transition in a browser,
but is not an installed iOS/Android or hosted CDN acceptance test.
