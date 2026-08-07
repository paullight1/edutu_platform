import axios from "axios";
import * as cheerio from "cheerio";
import {
  BROWSER_HEADERS,
  HAS_SCRAPER_PROXY,
  MAX_BACKOFF_ATTEMPTS,
  PROXY_AXIOS_CONFIG,
  RELAY_HEADERS,
  RELAY_MIN_INTERVAL_MS,
  RELAY_TIMEOUT_MS,
  SCRAPER_FETCH_RELAY_URL,
  type FetchRoute,
} from "./scraper.config";

type WarnLogger = {
  warn(message: string): unknown;
};

/**
 * Stateful HTTP transport for one scraper process. It owns retry policy,
 * proxy/relay escalation, and the per-run blocked-host memory; extraction and
 * persistence remain outside this adapter.
 */
export class ScraperHttpClient {
  private readonly blockedHosts = new Set<string>();
  private relayGate: Promise<void> = Promise.resolve();

  constructor(private readonly logger: WarnLogger) {}

  resetRun(): void {
    this.blockedHosts.clear();
  }

  isRelayConfigured(): boolean {
    return this.relayConfigured();
  }

  async fetchHtml(url: string, timeoutMs = 30_000): Promise<string> {
    return this.fetchWithBackoff(url, timeoutMs);
  }

  async fetchDeepHtml(url: string): Promise<string> {
    return this.fetchWithBackoff(url, 15_000);
  }

  /** Fetch JSON-like endpoints with the same relay/block escalation as HTML. */
  async fetchRestResponse(
    url: string,
    timeoutMs: number,
    route: FetchRoute = this.initialFetchRoute(url),
  ): Promise<{ status: number; data: unknown }> {
    const response = await this.fetchViaRoute(url, timeoutMs, route);
    const data =
      route === "relay" ? this.unwrapRelayJson(response.data) : response.data;
    const blocked =
      response.status === 403 ||
      (typeof data === "string" && this.looksLikeBotChallenge(data));

    if (blocked) {
      const next = this.nextFetchRoute(route);
      if (next) {
        this.blockedHosts.add(this.hostOf(url));
        this.logger.warn(`  ↳ Blocked on ${url} — retrying via ${next}`);
        return this.fetchRestResponse(url, timeoutMs, next);
      }
      throw new Error(`Bot challenge (Cloudflare) or 403 for ${url}`);
    }

    return { status: response.status, data };
  }

  private relayConfigured(): boolean {
    return Boolean(SCRAPER_FETCH_RELAY_URL);
  }

  private hostOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  private buildRelayUrl(url: string): string {
    const encoded = encodeURIComponent(url);
    return SCRAPER_FETCH_RELAY_URL.includes("{url}")
      ? SCRAPER_FETCH_RELAY_URL.replace("{url}", encoded)
      : `${SCRAPER_FETCH_RELAY_URL}${encoded}`;
  }

  private initialFetchRoute(url: string): FetchRoute {
    if (!this.blockedHosts.has(this.hostOf(url))) return "direct";
    if (HAS_SCRAPER_PROXY) return "proxy";
    return this.relayConfigured() ? "relay" : "direct";
  }

  private nextFetchRoute(current: FetchRoute): FetchRoute | null {
    if (current === "direct" && HAS_SCRAPER_PROXY) return "proxy";
    if (current !== "relay" && this.relayConfigured()) return "relay";
    return null;
  }

  private async throttleRelay(): Promise<void> {
    const previous = this.relayGate;
    let release!: () => void;
    this.relayGate = new Promise<void>((resolve) => (release = resolve));
    await previous;
    setTimeout(release, RELAY_MIN_INTERVAL_MS);
  }

  private async fetchViaRoute(
    url: string,
    timeoutMs: number,
    route: FetchRoute,
  ) {
    if (route === "relay") await this.throttleRelay();
    return axios.get(route === "relay" ? this.buildRelayUrl(url) : url, {
      timeout:
        route === "relay" ? Math.max(timeoutMs, RELAY_TIMEOUT_MS) : timeoutMs,
      headers: route === "relay" ? RELAY_HEADERS : BROWSER_HEADERS,
      validateStatus: (status) => status < 500,
      ...(route === "proxy" ? PROXY_AXIOS_CONFIG : {}),
    });
  }

  private async fetchWithBackoff(
    url: string,
    timeoutMs: number,
    attempt = 1,
    route: FetchRoute = this.initialFetchRoute(url),
  ): Promise<string> {
    try {
      const response = await this.fetchViaRoute(url, timeoutMs, route);

      if (response.status === 429) {
        if (attempt >= MAX_BACKOFF_ATTEMPTS) {
          throw new Error(
            `Rate-limited after ${MAX_BACKOFF_ATTEMPTS} attempts on ${url}`,
          );
        }
        const backoff =
          this.retryAfterMs(response.headers) ?? Math.pow(2, attempt) * 1_000;
        this.logger.warn(
          `  ⏳ 429 on ${url} — backing off ${backoff / 1000}s (attempt ${attempt}/${MAX_BACKOFF_ATTEMPTS})`,
        );
        await this.delay(backoff);
        return this.fetchWithBackoff(url, timeoutMs, attempt + 1, route);
      }

      if (response.status >= 400)
        throw new Error(`HTTP ${response.status} for ${url}`);
      if (
        typeof response.data === "string" &&
        this.looksLikeBotChallenge(response.data)
      ) {
        throw new Error(`Bot challenge (Cloudflare) for ${url}`);
      }
      return response.data as string;
    } catch (error: any) {
      if (this.isBlockedFetchError(error)) {
        const next = this.nextFetchRoute(route);
        if (next) {
          this.blockedHosts.add(this.hostOf(url));
          this.logger.warn(`  ↳ Blocked on ${url} — retrying via ${next}`);
          return this.fetchWithBackoff(url, timeoutMs, attempt, next);
        }
      }
      if (this.isRetryableFetchError(error) && attempt < MAX_BACKOFF_ATTEMPTS) {
        const backoff =
          this.retryAfterMs(error?.response?.headers) ??
          Math.pow(2, attempt) * 1_000;
        const reason = error?.response?.status
          ? `HTTP ${error.response.status}`
          : (error?.code ?? "network error");
        this.logger.warn(
          `  ⏳ ${reason} on ${url} — backing off ${backoff / 1000}s (attempt ${attempt}/${MAX_BACKOFF_ATTEMPTS})`,
        );
        await this.delay(backoff);
        return this.fetchWithBackoff(url, timeoutMs, attempt + 1, route);
      }
      throw error;
    }
  }

  private looksLikeBotChallenge(html: string): boolean {
    if (!html || html.length > 60_000) return false;
    return /just a moment|checking your browser|cf-browser-verification|challenge-platform|__cf_chl_|attention required!?\s*[|·]\s*cloudflare|verify you are human/i.test(
      html,
    );
  }

  private isBlockedFetchError(error: any): boolean {
    if (error?.response?.status === 403) return true;
    const message = String(error?.message ?? "");
    return /^HTTP 403 /.test(message) || /bot challenge/i.test(message);
  }

  private isRetryableFetchError(error: any): boolean {
    const status = error?.response?.status;
    if (status === 429 || (typeof status === "number" && status >= 500)) {
      return true;
    }
    return ["ETIMEDOUT", "ECONNABORTED", "ECONNRESET", "EAI_AGAIN"].includes(
      error?.code,
    );
  }

  private retryAfterMs(headers: any): number | null {
    const raw = headers?.["retry-after"] ?? headers?.["Retry-After"];
    if (raw == null) return null;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, 60_000);
    }
    const at = Date.parse(String(raw));
    return Number.isNaN(at)
      ? null
      : Math.min(Math.max(at - Date.now(), 0), 60_000);
  }

  private unwrapRelayJson(data: unknown): unknown {
    if (typeof data !== "string") return data;
    const text = data.trim().startsWith("<")
      ? cheerio.load(data)("pre").first().text()
      : data;
    if (!text) return data;
    try {
      return JSON.parse(text);
    } catch {
      return data;
    }
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
