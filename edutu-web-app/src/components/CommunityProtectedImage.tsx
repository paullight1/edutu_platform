import { useEffect, useState } from "react";
import { useClerk } from "../hooks/useAuth";
import { resolveCommunityAttachmentUrl } from "../services/community";

type CommunityProtectedImageProps = {
  resourceUrl: string | null | undefined;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
};

type CachedImage = {
  url: string;
  expiresAt: number;
};

const MIN_REFRESH_MS = 15_000;
const REFRESH_SAFETY_SECONDS = 30;
const hydratedImageCache = new Map<string, CachedImage>();

function isCommunityResourceUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.origin);
    return (
      /\/communities\/groups\/[^/]+\/attachments\/download-url$/.test(
        url.pathname,
      ) &&
      Boolean(url.searchParams.get("path")) &&
      Boolean(url.searchParams.get("signature"))
    );
  } catch {
    return false;
  }
}

async function resolveCached(
  resourceUrl: string,
  getToken: ReturnType<typeof useClerk>["getToken"],
): Promise<string> {
  const cached = hydratedImageCache.get(resourceUrl);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 5_000) return cached.url;

  const resolved = await resolveCommunityAttachmentUrl(resourceUrl, getToken);
  const usableForSeconds = Math.max(
    1,
    resolved.expiresIn - REFRESH_SAFETY_SECONDS,
  );
  hydratedImageCache.set(resourceUrl, {
    url: resolved.url,
    expiresAt: now + Math.max(MIN_REFRESH_MS, usableForSeconds * 1000),
  });
  return resolved.url;
}

export function CommunityProtectedImageHydrator() {
  const { getToken } = useClerk();

  useEffect(() => {
    let disposed = false;

    const hydrate = async (image: HTMLImageElement) => {
      const currentSrc = image.getAttribute("src") || "";
      const remembered = image.dataset.communityResourceSrc || "";
      const stableUrl = remembered || (isCommunityResourceUrl(currentSrc) ? currentSrc : "");
      if (!stableUrl) return;

      image.dataset.communityResourceSrc = stableUrl;
      image.referrerPolicy = "no-referrer";

      // A signed URL already replaced the stable API resource. Only re-resolve
      // when React puts the stable resource back on the element.
      if (remembered && currentSrc && currentSrc !== stableUrl) return;

      try {
        const signedUrl = await resolveCached(stableUrl, getToken);
        if (disposed || !image.isConnected) return;
        image.src = signedUrl;
      } catch {
        if (!disposed && image.isConnected && image.getAttribute("src") === stableUrl) {
          image.removeAttribute("src");
        }
      }
    };

    const scan = (root: ParentNode) => {
      if (root instanceof HTMLImageElement) {
        void hydrate(root);
        return;
      }
      root.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
        void hydrate(image);
      });
    };

    scan(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target instanceof HTMLImageElement) {
          void hydrate(mutation.target);
          continue;
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) scan(node);
        });
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [getToken]);

  return null;
}

export default function CommunityProtectedImage({
  resourceUrl,
  alt,
  className,
  loading = "lazy",
}: CommunityProtectedImageProps) {
  const { getToken } = useClerk();
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: number | undefined;

    const resolve = async () => {
      if (!resourceUrl) {
        setResolvedUrl(null);
        return;
      }

      try {
        const resolved = await resolveCommunityAttachmentUrl(resourceUrl, getToken);
        if (cancelled) return;
        setResolvedUrl(resolved.url);
        const refreshMs = Math.max(
          MIN_REFRESH_MS,
          Math.max(1, resolved.expiresIn - REFRESH_SAFETY_SECONDS) * 1000,
        );
        refreshTimer = window.setTimeout(() => {
          void resolve();
        }, refreshMs);
      } catch {
        if (!cancelled) setResolvedUrl(null);
      }
    };

    void resolve();
    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [getToken, resourceUrl]);

  if (!resolvedUrl) return null;

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      className={className}
      loading={loading}
      referrerPolicy="no-referrer"
    />
  );
}
