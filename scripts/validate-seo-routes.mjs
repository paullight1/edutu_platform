#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEO_API_ORIGIN = "https://edutu-platform.onrender.com";

export const SEO_ROUTE_CONTRACT = [
  ["/sitemap.xml", "/seo/sitemap.xml"],
  ["/sitemaps/:name.xml", "/seo/sitemaps/:name.xml"],
  ["/robots.txt", "/seo/robots.txt"],
  ["/blog", "/seo/blog"],
  ["/blog/:slug", "/seo/blog/:slug"],
  ["/opportunities", "/seo/opportunities"],
  [
    "/opportunities/:category",
    "/seo-hydration/opportunities/:category",
  ],
  ["/opportunity/:id", "/seo/opportunity/:id"],
  ["/share/opportunity/:id", "/seo/share/opportunity/:id"],
  ["/events/:slugOrId", "/seo/event/:slugOrId"],
].map(([source, path]) => ({
  source,
  destination: `${SEO_API_ORIGIN}${path}`,
}));

function catchAllIndex(rewrites) {
  return rewrites.findIndex(({ source }) =>
    typeof source === "string" &&
    (source === "/:path*" ||
      source === "/(.*)" ||
      source.includes(":path*") ||
      (source.startsWith("/(") && source.includes(".*"))),
  );
}

function validateConfig(config, label) {
  if (!Array.isArray(config?.rewrites)) {
    return [`${label} vercel.json must declare a rewrites array`];
  }

  const errors = [];
  const catchAll = catchAllIndex(config.rewrites);

  for (const route of SEO_ROUTE_CONTRACT) {
    const matches = config.rewrites
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
      errors.push(`${label} SEO rewrite ${route.source} must precede the catch-all`);
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
    console.error("Invalid Edutu SEO route contract:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      "Root and app Vercel configs share the required public SEO routes.",
    );
  }
}
