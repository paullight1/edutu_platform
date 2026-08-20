#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function validateVercelConfig(config) {
  const errors = [];

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return ["vercel.json must contain a JSON object"];
  }

  if (Object.hasOwn(config, "experimentalServices")) {
    errors.push('removed property "experimentalServices" is not allowed; use "services"');
  }

  if (!config.services || typeof config.services !== "object" || Array.isArray(config.services)) {
    errors.push('top-level "services" object is required');
    return errors;
  }

  const serviceNames = Object.keys(config.services);
  if (serviceNames.length === 0) errors.push('"services" must declare at least one service');

  for (const [name, service] of Object.entries(config.services)) {
    if (!service || typeof service !== "object" || Array.isArray(service)) {
      errors.push(`service ${name} must be an object`);
      continue;
    }
    if (typeof service.root !== "string" || !service.root.trim()) {
      errors.push(`service ${name} must declare a non-empty "root"`);
    }
    if (typeof service.framework !== "string" || !service.framework.trim()) {
      errors.push(`service ${name} must declare a non-empty "framework"`);
    }
    for (const removed of ["entrypoint", "routePrefix"]) {
      if (Object.hasOwn(service, removed)) {
        errors.push(`service ${name} uses removed/legacy property "${removed}"`);
      }
    }
  }

  const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
  for (const [index, rewrite] of rewrites.entries()) {
    const destination = rewrite?.destination;
    if (destination && typeof destination === "object" && !Array.isArray(destination)) {
      const service = destination.service;
      if (typeof service !== "string" || !config.services[service]) {
        errors.push(`rewrite ${index} references unknown service ${String(service)}`);
      }
      if (typeof destination.path !== "string" || !destination.path.startsWith("/")) {
        errors.push(`rewrite ${index} service destination must use an absolute "path"`);
      }
    }
  }

  return errors;
}

export function validateVercelConfigFile(path = "vercel.json") {
  const absolute = resolve(path);
  let config;
  try {
    config = JSON.parse(readFileSync(absolute, "utf8"));
  } catch (error) {
    return [`unable to parse ${path}: ${error instanceof Error ? error.message : String(error)}`];
  }
  return validateVercelConfig(config);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const errors = validateVercelConfigFile(process.argv[2] || "vercel.json");
  if (errors.length > 0) {
    console.error("✗ Invalid Vercel production configuration:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else {
    console.log("✓ Vercel multi-service configuration uses supported properties and valid service rewrites.");
  }
}
