#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

function firstExisting(root, candidates) {
  return candidates.map((name) => join(root, name)).find((path) => existsSync(path)) ?? null;
}

export function validatePwaBuild(rootDirectory) {
  const root = resolve(rootDirectory);
  const errors = [];

  if (!existsSync(root)) return [`build directory does not exist: ${root}`];

  const manifestPath = firstExisting(root, ["manifest.webmanifest", "manifest.json"]);
  const serviceWorkerPath = firstExisting(root, ["sw.js", "service-worker.js"]);
  const customWorkerPath = join(root, "sw-custom.js");

  if (!manifestPath) errors.push("generated web app manifest is missing");
  if (!serviceWorkerPath) errors.push("generated service worker is missing");
  if (!existsSync(customWorkerPath)) errors.push("sw-custom.js is missing from the production build");

  if (manifestPath) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (!manifest.name || !manifest.short_name) errors.push("manifest requires name and short_name");
      if (manifest.display !== "standalone") errors.push('manifest display must be "standalone"');
      if (manifest.start_url !== "/dashboard") errors.push('manifest start_url must be "/dashboard"');
      if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) {
        errors.push("manifest must declare install icons");
      } else {
        for (const icon of manifest.icons) {
          if (!icon?.src || !icon?.sizes || !icon?.type) errors.push("every manifest icon requires src, sizes and type");
          if (icon?.src && !existsSync(join(root, icon.src.replace(/^\//, "")))) {
            errors.push(`manifest icon is missing from build: ${icon.src}`);
          }
        }
      }
    } catch (error) {
      errors.push(`unable to parse generated manifest: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (serviceWorkerPath) {
    const source = readFileSync(serviceWorkerPath, "utf8");
    if (!source.includes("sw-custom.js")) {
      errors.push("generated service worker does not import sw-custom.js");
    }
  }

  return errors;
}

const target = process.argv[2] || "edutu-web-app/dist";
const errors = validatePwaBuild(target);
if (errors.length > 0) {
  console.error("✗ PWA production build validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log(`✓ PWA build at ${resolve(target)} contains a valid manifest, install assets and service worker.`);
}
