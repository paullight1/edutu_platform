# Deep-link verification files

Both files ship with placeholders and MUST be filled in before mobile deep links verify:

- `assetlinks.json` — replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT` with the
  SHA-256 certificate fingerprint from **Play Console → Setup → App signing → App signing
  key certificate** (NOT the upload key). Until then, Android App Links for edutu.org fall
  back to opening the browser (the app still installs and runs fine).
- `apple-app-site-association` — replace `REPLACE_WITH_APPLE_TEAM_ID` with the Apple
  Developer Team ID. Only needed once the mobile app is built with
  `EXPO_ENABLE_ASSOCIATED_DOMAINS=1` (universal links are off by default).
