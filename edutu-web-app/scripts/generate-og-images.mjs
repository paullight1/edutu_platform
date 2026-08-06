/**
 * Capture each public page's hero as its Open Graph image.
 *
 * Renders every entry in `scripts/page-seo.mjs` in a 1200x630 viewport at 2x
 * device scale, forced into LIGHT mode, and writes the above-the-fold frame —
 * i.e. the page's own hero — to `public/og/<slug>.jpg`.
 *
 *   npm run seo:og                       # capture against production
 *   OG_BASE_URL=http://localhost:4173 npm run seo:og   # against a local preview
 *   npm run seo:og -- home blog          # only these slugs
 *
 * Defaults to production because the heroes pull live content (opportunity
 * counts, latest posts, impact stats) that a local build without backend
 * access renders as empty skeletons.
 *
 * Requires a Chrome/Chromium on the machine. Tried in order:
 *   1. $OG_CHROME_PATH
 *   2. A system install (/Applications/Google Chrome.app, /usr/bin/…)
 *   3. Puppeteer's cached download under ~/.cache/puppeteer
 * These images are committed — regenerate and commit whenever a hero changes.
 */

import { chromium } from "playwright-core";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OG_EXTENSION,
  OG_FORMAT,
  OG_HEIGHT,
  OG_QUALITY,
  OG_WIDTH,
  PAGE_SEO,
  SITE_URL,
} from "./page-seo.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, "..", "public", "og");

const baseUrl = (process.env.OG_BASE_URL || SITE_URL).replace(/\/+$/, "");
const only = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));

/**
 * Every Chrome binary on this machine, best first.
 *
 * The system Chrome is preferred over Puppeteer's cached download because the
 * cached copy is quarantined by macOS on some setups and fails to spawn with a
 * bare "Unknown system error -88"; the caller launches down the list.
 */
async function resolveChromeCandidates() {
  const candidates = [];

  if (process.env.OG_CHROME_PATH) {
    candidates.push(process.env.OG_CHROME_PATH);
  }

  for (const systemChrome of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ]) {
    if (existsSync(systemChrome)) candidates.push(systemChrome);
  }

  // Puppeteer's cache: ~/.cache/puppeteer/chrome/<build>/chrome-*/Google Chrome for Testing.app/...
  const puppeteerCache = path.join(homedir(), ".cache", "puppeteer", "chrome");
  if (existsSync(puppeteerCache)) {
    for (const build of (await readdir(puppeteerCache)).sort().reverse()) {
      const cached = [
        path.join(
          puppeteerCache,
          build,
          "chrome-mac-arm64",
          "Google Chrome for Testing.app",
          "Contents",
          "MacOS",
          "Google Chrome for Testing",
        ),
        path.join(
          puppeteerCache,
          build,
          "chrome-mac-x64",
          "Google Chrome for Testing.app",
          "Contents",
          "MacOS",
          "Google Chrome for Testing",
        ),
        path.join(puppeteerCache, build, "chrome-linux64", "chrome"),
      ];
      const found = cached.find((candidate) => existsSync(candidate));
      if (found) candidates.push(found);
    }
  }

  if (!candidates.length) {
    throw new Error(
      "No Chrome binary found. Set OG_CHROME_PATH=/path/to/chrome and re-run.",
    );
  }

  return candidates;
}

/** Launch the first candidate that actually spawns. */
async function launchBrowser(candidates) {
  let lastError;

  for (const executablePath of candidates) {
    try {
      const browser = await chromium.launch({
        executablePath,
        args: ["--hide-scrollbars", "--force-color-profile=srgb"],
      });
      console.log(`[og] chrome    ${executablePath}`);
      return browser;
    } catch (error) {
      lastError = error;
      console.warn(`[og] could not launch ${executablePath}: ${error.message}`);
    }
  }

  throw lastError;
}

/**
 * Runs before any page script. Pins the SPA to light mode via the same
 * localStorage keys `index.html` reads pre-paint, so the capture never flashes
 * or settles dark regardless of the host machine's OS theme.
 */
const forceLightMode = () => {
  try {
    localStorage.setItem("edutu-theme-mode", "light");
    localStorage.setItem("edutu-theme", "light");
    localStorage.setItem("edutu-theme-pack", "indigo");
    // Suppress first-run interstitials that would otherwise sit on the hero.
    // Key must match CookieConsent.tsx's CONSENT_KEY exactly (underscores, not
    // hyphens — the rest of the app uses hyphens, this one does not).
    localStorage.setItem("edutu_cookie_consent", "accepted");
    localStorage.setItem("edutu-install-prompt-dismissed", "1");
  } catch {
    /* storage unavailable — the CSS override below still applies */
  }
  document.documentElement.classList.remove("dark");
};

/**
 * Chrome renders scrollbars over the right edge of the frame, and Google One
 * Tap / PWA install prompts can float above the hero. Both would be baked into
 * a permanent marketing asset, so hide them for the capture only.
 */
const CAPTURE_CSS = `
  html { color-scheme: light !important; }
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
  #credential_picker_container,
  iframe[src*="accounts.google.com"],
  [role="dialog"][aria-label="Cookie consent"],
  [data-og-hide="true"] { display: none !important; }
`;

async function capture(page, entry) {
  const target = `${baseUrl}${entry.capturePath || entry.path}`;

  await page.goto(target, { waitUntil: "networkidle", timeout: 60_000 });
  await page.addStyleTag({ content: CAPTURE_CSS });

  // Framer Motion drives most hero entrances off an intersection observer, so
  // nudge the scroll to trigger them, then come back to the true top.
  await page.evaluate(() => window.scrollTo(0, 1));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.waitForTimeout(entry.settleMs ?? 900);
  await page.evaluate(async () => {
    // Web fonts swap late; a capture taken before they land shows fallback
    // metrics, which is the single most obvious "this is a screenshot bot" tell.
    if (document.fonts?.ready) await document.fonts.ready;
  });

  const outputPath = path.join(outputDir, `${entry.slug}.${OG_EXTENSION}`);
  await page.screenshot({
    path: outputPath,
    type: OG_FORMAT,
    quality: OG_QUALITY,
  });
  return outputPath;
}

async function main() {
  const entries = only.length
    ? PAGE_SEO.filter((entry) => only.includes(entry.slug))
    : PAGE_SEO;

  if (!entries.length) {
    throw new Error(
      `No pages matched: ${only.join(", ")}. Known slugs: ${PAGE_SEO.map((entry) => entry.slug).join(", ")}`,
    );
  }

  await mkdir(outputDir, { recursive: true });

  console.log(`[og] base url  ${baseUrl}`);
  console.log(
    `[og] capturing ${entries.length} page(s) at ${OG_WIDTH}x${OG_HEIGHT}@2x`,
  );

  const browser = await launchBrowser(await resolveChromeCandidates());
  console.log("");

  const context = await browser.newContext({
    viewport: { width: OG_WIDTH, height: OG_HEIGHT },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
  });
  await context.addInitScript(forceLightMode);

  const page = await context.newPage();
  const failures = [];

  for (const entry of entries) {
    try {
      const outputPath = await capture(page, entry);
      console.log(`  ✓ ${entry.path.padEnd(22)} → og/${path.basename(outputPath)}`);
    } catch (error) {
      failures.push({ entry, error });
      console.error(`  ✗ ${entry.path.padEnd(22)} ${error.message}`);
    }
  }

  await browser.close();

  // A manifest makes it obvious in review which images are stale relative to
  // the registry, without diffing binary PNGs.
  await writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(
      {
        generatedFrom: baseUrl,
        width: OG_WIDTH,
        height: OG_HEIGHT,
        deviceScaleFactor: 2,
        format: OG_FORMAT,
        quality: OG_QUALITY,
        images: PAGE_SEO.map((entry) => ({
          path: entry.path,
          slug: entry.slug,
          file: `/og/${entry.slug}.${OG_EXTENSION}`,
        })),
      },
      null,
      2,
    )}\n`,
  );

  if (failures.length) {
    console.error(`\n[og] ${failures.length} page(s) failed.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n[og] wrote ${entries.length} image(s) to public/og/`);
}

await main();
