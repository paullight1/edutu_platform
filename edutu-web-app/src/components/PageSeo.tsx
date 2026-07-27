import Seo from "./Seo";
import { findPageSeo } from "../lib/pageSeo";

interface PageSeoProps {
  /** Route path — must match an entry in `scripts/page-seo.mjs`. */
  path: string;
  /** Override the registry title (rare — prefer editing the registry). */
  title?: string;
  description?: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

/**
 * <Seo> for a static marketing route, sourced from the shared page registry.
 *
 * The same registry drives the prerendered HTML the build bakes into
 * `dist/<path>/index.html`, so the tags a crawler reads and the tags React
 * writes after hydration can't drift apart. Pages with per-item metadata (blog
 * posts, opportunities, events) keep using <Seo> directly.
 */
export default function PageSeo({
  path,
  title,
  description,
  jsonLd,
}: PageSeoProps) {
  const entry = findPageSeo(path);

  if (!entry) {
    // A path with no registry entry gets no prerendered hero image, so failing
    // loudly in dev beats silently shipping the generic logo.
    if (import.meta.env.DEV) {
      console.warn(
        `[PageSeo] no entry for "${path}" — add it to scripts/page-seo.mjs`,
      );
    }
    if (!title || !description) return null;
  }

  return (
    <Seo
      title={title ?? entry!.title}
      description={description ?? entry!.description}
      path={path}
      jsonLd={jsonLd}
    />
  );
}
