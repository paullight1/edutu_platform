/**
 * Dev-gated console wrappers.
 *
 * All calls compile away to no-ops in production (`import.meta.env.PROD` is
 * statically replaced by Vite, so the branches are stripped at build time).
 * Import the named functions or the default `logger` object.
 */

const isEnabled = !import.meta.env.PROD;

export function log(...args: unknown[]): void {
  if (isEnabled) console.log(...args);
}

export function warn(...args: unknown[]): void {
  if (isEnabled) console.warn(...args);
}

export function error(...args: unknown[]): void {
  if (isEnabled) console.error(...args);
}

export function debug(...args: unknown[]): void {
  if (isEnabled) console.debug(...args);
}

const logger = { log, warn, error, debug };

export default logger;
