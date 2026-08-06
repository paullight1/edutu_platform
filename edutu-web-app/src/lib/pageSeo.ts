import { PAGE_SEO, type PageSeoEntry } from "./pageSeo.generated";

export type { PageSeoEntry };

/**
 * Look up the prerendered SEO entry for a route path.
 *
 * The build writes one hero Open Graph image per public page (see
 * `scripts/generate-og-images.mjs`), and this resolves the entry so the runtime
 * <Seo> component serves the same image the prerendered HTML carries. Query
 * strings and trailing slashes are stripped — `/blog?tag=x` is still `/blog`.
 */
export function findPageSeo(path: string | undefined): PageSeoEntry | null {
  if (!path) return null;

  const withoutQuery = path.split(/[?#]/)[0];
  const normalised =
    withoutQuery !== "/" && withoutQuery.endsWith("/")
      ? withoutQuery.slice(0, -1)
      : withoutQuery;

  return PAGE_SEO[normalised] ?? null;
}

/** Absolute URL of a page's hero OG image, or null if the page has no capture. */
export function getPageOgImage(path: string | undefined): string | null {
  return findPageSeo(path)?.image ?? null;
}

/** og:image:alt for a page's hero capture, or null. */
export function getPageOgImageAlt(path: string | undefined): string | null {
  return findPageSeo(path)?.imageAlt ?? null;
}
