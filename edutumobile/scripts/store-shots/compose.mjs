#!/usr/bin/env node
/**
 * compose.mjs — turns raw simulator captures into store-ready marketing images.
 *
 * Reads store-assets/raw/<id>.png (one per entry in captions.json) and renders
 * each onto two canvases:
 *
 *   appstore/  1320x2868  — Apple's 6.9" slot, the one size App Store Connect
 *                           enforces for new listings.
 *   play/      1080x1920  — Google requires phone screenshots at 16:9 or 9:16.
 *                           The raw capture is 9:19.5, so this is a re-render
 *                           onto a shorter canvas, NOT a downscale of the
 *                           App Store image — resizing 9:19.5 art to 9:16 would
 *                           either distort it or get the listing rejected.
 *
 * Playwright resolves from backend/node_modules (it is declared there).
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, '../..');
const REPO = path.resolve(MOBILE, '..');
const ASSETS = path.join(MOBILE, 'store-assets');
const RAW = path.join(ASSETS, 'raw');

const require = createRequire(path.join(REPO, 'backend/'));
const { chromium } = require('playwright');

const PRESETS = [
  // deviceW is the phone's width as a percentage of canvas width. The Play
  // canvas is proportionally much shorter, so its phone has to be narrower or
  // the crop eats the whole screen below the header.
  { name: 'appstore', width: 1320, height: 2868, deviceW: '82vw' },
  { name: 'play', width: 1080, height: 1920, deviceW: '70vw' },
];

async function main() {
  const { shots } = JSON.parse(
    await readFile(path.join(HERE, 'captions.json'), 'utf8'),
  );
  const template = await readFile(path.join(HERE, 'template.html'), 'utf8');

  let rawFiles = [];
  try {
    rawFiles = await readdir(RAW);
  } catch {
    console.error(`No raw captures at ${RAW}\nRun capture.sh first.`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const results = [];

  for (const preset of PRESETS) {
    const outDir = path.join(ASSETS, preset.name);
    await mkdir(outDir, { recursive: true });

    const page = await browser.newPage({
      viewport: { width: preset.width, height: preset.height },
      deviceScaleFactor: 1,
    });

    for (const shot of shots) {
      const rawName = `${shot.id}.png`;
      if (!rawFiles.includes(rawName)) {
        console.warn(`  skip ${shot.id} — no raw/${rawName}`);
        continue;
      }
      const png = await readFile(path.join(RAW, rawName));
      const html = template
        .replace('__HEADLINE__', shot.headline.join('<br>'))
        .replace('__SUB__', shot.sub)
        .replace('__SCREENSHOT__', `data:image/png;base64,${png.toString('base64')}`)
        .replace('</style>', `.device { --device-w: ${preset.deviceW}; }\n</style>`);

      await page.setContent(html, { waitUntil: 'load' });
      // Without this the first render can land before Outfit arrives and the
      // headline composites in the fallback face.
      await page.evaluate(() => document.fonts.ready);

      const out = path.join(outDir, rawName);
      await writeFile(out, await page.screenshot({ type: 'png' }));
      results.push({ preset: preset.name, id: shot.id, out });
      console.log(`  ${preset.name}/${rawName}`);
    }

    await page.close();
  }

  await browser.close();

  // Verify rather than assume: assert every output is exactly the size the
  // store expects, by reading the dimensions back out of the PNG header.
  let bad = 0;
  for (const r of results) {
    const buf = await readFile(r.out);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const p = PRESETS.find((x) => x.name === r.preset);
    if (w !== p.width || h !== p.height) {
      console.error(`  WRONG SIZE ${r.preset}/${r.id}: ${w}x${h}`);
      bad++;
    }
  }

  const expected = PRESETS.length * shots.length;
  console.log(`\n${results.length}/${expected} images written to ${ASSETS}`);
  if (bad) {
    console.error(`${bad} image(s) at the wrong size.`);
    process.exit(1);
  }
  if (results.length < expected) {
    console.warn('Some shots are missing raw captures — rerun capture.sh.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
