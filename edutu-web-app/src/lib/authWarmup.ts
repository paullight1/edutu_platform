interface AuthOrigins {
  clerkPublishableKey: string;
  supabaseUrl?: string;
}

interface IdleScheduler {
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (id: number) => void;
  setTimeout?: (callback: () => void, delay: number) => number;
  clearTimeout?: (id: number) => void;
}

export function clerkFrontendApiOrigin(publishableKey: string): string | null {
  if (!/^pk_(?:test|live)_/.test(publishableKey)) return null;

  try {
    const encoded = publishableKey.replace(/^pk_(?:test|live)_/, "");
    const host = atob(encoded).replace(/\$+$/, "");
    if (!host || host.includes("/") || host.includes(":")) return null;
    return new URL(`https://${host}`).origin;
  } catch {
    return null;
  }
}

function preconnect(origin: string | null | undefined) {
  if (!origin) return;

  try {
    const safeOrigin = new URL(origin).origin;
    const exists = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]'),
    ).some((link) => new URL(link.href).origin === safeOrigin);
    if (exists) return;

    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = safeOrigin;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  } catch {
    // Invalid optional environment URLs should not prevent the app from booting.
  }
}

export function preconnectAuthOrigins({
  clerkPublishableKey,
  supabaseUrl,
}: AuthOrigins) {
  preconnect(clerkFrontendApiOrigin(clerkPublishableKey));
  preconnect(supabaseUrl);
  preconnect("https://challenges.cloudflare.com");
}

export function scheduleAuthChunkPrefetch(
  prefetch: () => void,
  scheduler: IdleScheduler = window,
): () => void {
  if (typeof scheduler.requestIdleCallback === "function") {
    const id = scheduler.requestIdleCallback(prefetch);
    return () => scheduler.cancelIdleCallback?.(id);
  }

  const setTimer = scheduler.setTimeout ?? window.setTimeout.bind(window);
  const clearTimer = scheduler.clearTimeout ?? window.clearTimeout.bind(window);
  const id = setTimer(prefetch, 800);
  return () => clearTimer(id);
}
