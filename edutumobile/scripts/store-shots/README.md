# Store screenshots

Builds the App Store and Play Store listing images from real screens of the app.

```bash
./scripts/store-shots/capture.sh     # 6 raw screens off a Release simulator build
node scripts/store-shots/compose.mjs # -> store-assets/appstore + store-assets/play
```

## Output

| Directory | Size | For |
|---|---|---|
| `store-assets/raw/` | 1320×2868 | Unframed captures. Recapture these when the UI changes. |
| `store-assets/appstore/` | 1320×2868 | Apple's 6.9" slot — the one size App Store Connect enforces for new listings. |
| `store-assets/play/` | 1080×1920 | Google Play phone screenshots. |

## Why Play is a re-render, not a resize

Google requires phone screenshots at **16:9 or 9:16**. The raw capture is 9:19.5,
so scaling the finished App Store image down to Play's size would either distort
it or get the listing rejected. `compose.mjs` instead renders the same raw
captures onto a second, shorter canvas. The phone is narrower there (`deviceW`
in `PRESETS`) because the 9:16 canvas has proportionally less vertical room —
expect the bottom of each screen, including the tab bar, to be cropped.

## Editing

- **Captions** live in `captions.json`. Headlines are authored as explicit lines
  so the break point is a design decision rather than a wrapping accident. Keep
  each line under ~24 characters or it wraps a third time and pushes the device
  off-canvas.
- **Layout** lives in `template.html`. Every length is in `vw`, and the viewport
  *is* the canvas, so one stylesheet serves both sizes proportionally.

## Requirements

- A **Release** build, not the dev client — the dev client adds a purple splash
  and a floating dev-menu button that would end up in the listing.
- `playwright`, resolved from `backend/node_modules` where it is declared.
- Fonts (Outfit, Instrument Sans) load from Google Fonts at render time, so
  compositing needs network access.

`capture.sh` cannot tap through the app. It stops before each shot and waits for
you to navigate to the screen described in `captions.json`.
