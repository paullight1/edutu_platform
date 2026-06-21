const DEFAULT_PUBLIC_SITE_URL = "https://www.edutu.org";

function normaliseSiteUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function getPublicSiteUrl(): string {
  const configuredUrl =
    import.meta.env.VITE_PUBLIC_SITE_URL?.trim() ||
    import.meta.env.VITE_WEB_APP_URL?.trim();

  if (configuredUrl) {
    return normaliseSiteUrl(configuredUrl);
  }

  return DEFAULT_PUBLIC_SITE_URL;
}

export function toAbsoluteUrl(value: string | null | undefined): string {
  const siteUrl = getPublicSiteUrl();

  if (!value) {
    return siteUrl;
  }

  try {
    return new URL(value, siteUrl).toString();
  } catch {
    return siteUrl;
  }
}

export function getDefaultSeoImage(): string {
  return toAbsoluteUrl("/icons/icon-512x512.png");
}
