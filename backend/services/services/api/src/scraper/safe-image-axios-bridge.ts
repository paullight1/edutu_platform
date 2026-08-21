import axios, { type AxiosRequestConfig, type AxiosStatic } from "axios";
import {
  fetchSafeImage,
  type SafeImageFetchResult,
} from "./safe-image-fetcher";

type SafeFetcher = (
  rawUrl: string,
  options?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number },
) => Promise<SafeImageFetchResult>;

type BridgeState = {
  originalGet: AxiosStatic["get"];
  references: number;
};

const states = new WeakMap<object, BridgeState>();

/**
 * Compatibility bridge for the legacy ScraperService image proxy.
 *
 * That service historically performs `axios.get(url, { responseType:
 * "arraybuffer" })` directly against scraped image URLs. Replacing the entire
 * 140KB service just to close that egress hole is unnecessarily risky, so the
 * scraper module installs this bridge during bootstrap. Binary downloads then
 * use the DNS-pinned, redirect-revalidated, byte-capped safe image fetcher.
 * Ordinary axios traffic is untouched.
 *
 * Multiple module initializations share a reference-counted installation so a
 * test/application teardown cannot accidentally unwrap another active module.
 */
export function installSafeImageAxiosBridge(
  axiosClient: AxiosStatic = axios,
  safeFetcher: SafeFetcher = fetchSafeImage,
): () => void {
  const existing = states.get(axiosClient);
  if (existing) {
    existing.references += 1;
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      existing.references -= 1;
    };
  }

  const originalGet = axiosClient.get;
  const state: BridgeState = { originalGet, references: 1 };
  states.set(axiosClient, state);

  axiosClient.get = (async <T = any, R = any, D = any>(
    url: string,
    config?: AxiosRequestConfig<D>,
  ): Promise<R> => {
    if (config?.responseType !== "arraybuffer") {
      return originalGet.call(axiosClient, url, config) as Promise<R>;
    }

    const safeImage = await safeFetcher(url, {
      ...(typeof config.timeout === "number" && config.timeout > 0
        ? { timeoutMs: config.timeout }
        : {}),
    });

    return {
      data: safeImage.buffer as T,
      status: 200,
      statusText: "OK",
      headers: { "content-type": safeImage.contentType },
      config: config ?? {},
      request: undefined,
    } as R;
  }) as AxiosStatic["get"];

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    state.references -= 1;
    if (state.references <= 0) {
      axiosClient.get = originalGet;
      states.delete(axiosClient);
    }
  };
}
