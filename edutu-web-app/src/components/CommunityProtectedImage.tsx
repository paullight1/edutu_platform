import { useEffect, useState } from "react";
import { useClerk } from "../hooks/useAuth";
import { resolveCommunityAttachmentUrl } from "../services/community";

type CommunityProtectedImageProps = {
  resourceUrl: string | null | undefined;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
};

const MIN_REFRESH_MS = 15_000;
const REFRESH_SAFETY_SECONDS = 30;

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
