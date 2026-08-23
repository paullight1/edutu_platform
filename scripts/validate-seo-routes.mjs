#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEO_API_ORIGIN = "https://edutu-platform.onrender.com";

export const SEO_ROUTE_CONTRACT = [
  { source: "/sitemap.xml", path: "/seo/sitemap.xml" },
  { source: "/robots.txt", path: "/seo/robots.txt" },
  { source: "/blog", path: "/seo/blog" },
  { source: "/blog/:slug", path: "/seo/blog/:slug" },
  { source: "/opportunities", path: "/seo/opportunities" },
  {
    source: "/opportunities/:category",
    path: "/seo/opportunities/:category",
  },
  { source: "/opportunity/:id", path: "/seo/opportunity/:id" },
  {
    source: "/share/opportunity/:id",
    path: "/seo/share/opportunity/:id",
  },
].map((route) => ({
  ...route,
  destination: `${SEO_API_ORIGIN}${route.path}`,
}));

function rewrites(config) {
  return Array.isArray(config?.rewrites) ? config.rewrites : [];
}

function catchAllIndex(items) {
  return items.findIndex((rewrite) => {
    const source = rewrite?.source;
    const destination = rewrite?.destination;
    const isFrontendFallback =
      destination === "/index.html" ||
      (destination &&
        typeof destination === "object" &&
        destination.service === "frontend");

    return (
      source === "/:path*" ||
      source === "/(.*)" ||
      (typeof source === "string" && source.includes(":path*")) ||
      (isFrontendFallback &&
        typeof source === "string" &&
        source.includes(".*"))
    );
  });
}

function validateConfig(config, label) {
  const errors = [];
  const items = rewrites(config);
  if (!Array.isArray(config?.rewrites)) {
    return [`${label} vercel.json must declare a rewrites array`];
  }

  const catchAll = catchAllIndex(items);
  for (const route of SEO_ROUTE_CONTRACT) {
    const matches = items
      .map((rewrite, index) => ({ rewrite, index }))
      .filter(({ rewrite }) => rewrite?.source === route.source);

    if (matches.length === 0) {
      errors.push(`${label} is missing SEO rewrite ${route.source}`);
      continue;
    }
    if (matches.length > 1) {
      errors.push(
        `${label} declares SEO rewrite ${route.source} ${matches.length} times`,
      );
    }

    const { rewrite, index } = matches[0];
    if (rewrite.destination !== route.destination) {
      errors.push(
        `${label} SEO rewrite ${route.source} must target ${route.destination}; found ${String(rewrite.destination)}`,
      );
    }
    if (Object.hasOwn(rewrite, "has") || Object.hasOwn(rewrite, "missing")) {
      errors.push(`${label} SEO rewrite ${route.source} must be unconditional`);
    }
    if (catchAll >= 0 && index > catchAll) {
      errors.push(
        `${label} SEO rewrite ${route.source} must precede the catch-all`,
      );
    }
  }

  return errors;
}

export function validateSeoRoutes(rootConfig, appConfig) {
  return [
    ...validateConfig(rootConfig, "root"),
    ...validateConfig(appConfig, "app"),
  ];
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  let errors;
  try {
    errors = validateSeoRoutes(
      readJson(process.argv[2] || "vercel.json"),
      readJson(process.argv[3] || "edutu-web-app/vercel.json"),
    );
  } catch (error) {
    errors = [
      `unable to read SEO route configuration: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ];
  }

  if (errors.length > 0) {
    console.error("✗ Invalid Edutu SEO route contract:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      "✓ Root and app Vercel configs share the required public SEO routes.",
    );
  }
}
