import { useEffect, useMemo } from "react";
import { getDefaultSeoImage, toAbsoluteUrl } from "../lib/publicSite";
import { OG_METADATA } from "../lib/pageSeo.generated";
import { getPageOgImage, getPageOgImageAlt } from "../lib/pageSeo";

interface SeoProps {
  title: string;
  description: string;
  path?: string;
  image?: string | null;
  imageAlt?: string;
  type?: "website" | "article";
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

function upsertMeta(
  attribute: "name" | "property",
  key: string,
  content: string,
) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );

  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }

  element.href = href;
}

function upsertJsonLd(content: string) {
  let element = document.head.querySelector<HTMLScriptElement>(
    'script[data-route-json-ld="true"]',
  );

  if (!element) {
    element = document.createElement("script");
    element.type = "application/ld+json";
    element.dataset.routeJsonLd = "true";
    document.head.appendChild(element);
  }

  element.textContent = content;
}

function upsertGoogleSiteVerification() {
  const verificationToken =
    import.meta.env.VITE_GOOGLE_SITE_VERIFICATION?.trim();

  if (!verificationToken) {
    return;
  }

  upsertMeta("name", "google-site-verification", verificationToken);
}

export default function Seo({
  title,
  description,
  path = "/opportunities",
  image,
  imageAlt,
  type = "website",
  noindex = false,
  jsonLd,
}: SeoProps) {
  const canonicalUrl = toAbsoluteUrl(path);
  // Precedence: an explicit per-item image (a blog cover, an opportunity
  // flyer) → the route's prerendered hero capture → the bare logo. Without the
  // middle tier every marketing page unfurled with the same generic icon.
  const imageUrl = toAbsoluteUrl(
    image || getPageOgImage(path) || getDefaultSeoImage(),
  );
  const resolvedImageAlt =
    imageAlt ??
    (image ? "Edutu opportunity preview" : getPageOgImageAlt(path)) ??
    "Edutu";
  const jsonLdString = useMemo(() => {
    if (!jsonLd) {
      return "";
    }

    return JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  }, [jsonLd]);

  useEffect(() => {
    document.title = title;

    upsertMeta("name", "description", description);
    upsertMeta(
      "name",
      "robots",
      noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large",
    );
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:image", imageUrl);
    upsertMeta("property", "og:image:secure_url", imageUrl);
    upsertMeta("property", "og:image:type", OG_METADATA.mimeType);
    upsertMeta("property", "og:image:width", String(OG_METADATA.width));
    upsertMeta("property", "og:image:height", String(OG_METADATA.height));
    upsertMeta("property", "og:image:alt", resolvedImageAlt);
    upsertMeta("property", "og:site_name", "Edutu");
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", imageUrl);
    upsertMeta("name", "twitter:image:alt", resolvedImageAlt);
    upsertCanonical(canonicalUrl);
    upsertGoogleSiteVerification();

    if (jsonLdString) {
      upsertJsonLd(jsonLdString);
    }
  }, [
    canonicalUrl,
    description,
    imageUrl,
    resolvedImageAlt,
    jsonLdString,
    noindex,
    title,
    type,
  ]);

  return null;
}
