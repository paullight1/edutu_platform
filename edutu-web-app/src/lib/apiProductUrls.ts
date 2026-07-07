import { getApiBaseUrl } from './apiBaseUrl';

/**
 * Canonical URLs for the Scholarship Engine API product (docs, OpenAPI,
 * public base URL). Every marketing/dashboard surface should read from here
 * so the whole app re-points with one env change.
 */

const FALLBACK_PUBLIC_API_BASE = 'https://edutu-platform.onrender.com/v1';

/** Base URL third parties call, e.g. shown in curl snippets. */
export function getPublicApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  try {
    return `${getApiBaseUrl('Edutu public API')}/v1`;
  } catch {
    return FALLBACK_PUBLIC_API_BASE;
  }
}

export function getOpenApiUrl(): string {
  const configured = import.meta.env.VITE_API_OPENAPI_URL?.trim();
  if (configured) return configured;
  return `${getPublicApiBaseUrl()}/openapi.json`;
}

/**
 * Developer docs. Uses the hosted docs site when VITE_DOCS_URL is set,
 * otherwise falls back to the in-app docs page so the link always resolves.
 */
export function getDocsUrl(): string {
  const configured = import.meta.env.VITE_DOCS_URL?.trim();
  return configured || '/developers/docs';
}

export function isExternalDocsUrl(): boolean {
  return /^https?:\/\//i.test(getDocsUrl());
}
