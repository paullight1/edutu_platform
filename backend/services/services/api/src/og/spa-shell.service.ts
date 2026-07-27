import { Injectable, Logger } from "@nestjs/common";

/**
 * Fetches and caches the deployed web app's HTML shell so OG routes can inject
 * per-item metadata into the REAL page.
 *
 * This exists because the platform's services router drops `has` conditions —
 * the crawler-user-agent gate never reaches production, so a rewrite to an OG
 * endpoint is unconditional and serves REAL USERS too. Returning a stub page
 * would replace the app with a stripped placeholder for anyone opening a shared
 * blog post or event. Injecting into the shell keeps the SPA fully functional
 * while still giving crawlers correct tags.
 *
 * Failure mode matters more than freshness here: once a shell has been fetched
 * successfully it is kept forever as a fallback, so a backend that briefly
 * can't reach the CDN degrades to slightly stale HTML rather than to no app.
 */
@Injectable()
export class SpaShellService {
  private readonly logger = new Logger(SpaShellService.name);
  private readonly ttlMs = 5 * 60 * 1000;

  private cached: string | null = null;
  private cachedAt = 0;
  private inFlight: Promise<string | null> | null = null;

  /**
   * @param baseUrl Public site origin, e.g. https://www.edutu.org
   * @returns the shell HTML, or null if it has never been fetched successfully.
   */
  async get(baseUrl: string): Promise<string | null> {
    const fresh = this.cached && Date.now() - this.cachedAt < this.ttlMs;
    if (fresh) return this.cached;

    // Collapse concurrent misses onto one fetch — a viral link can arrive as a
    // burst and each request would otherwise pull the shell independently.
    this.inFlight ??= this.fetchShell(baseUrl).finally(() => {
      this.inFlight = null;
    });

    const fetched = await this.inFlight;
    return fetched ?? this.cached;
  }

  private async fetchShell(baseUrl: string): Promise<string | null> {
    // `/index.html` is a plain static file: it is NOT one of the root
    // vercel.json dynamic rewrites, so fetching it cannot loop back into this
    // controller the way fetching `/blog/<slug>` would.
    const candidates = [`${baseUrl}/index.html`, `${baseUrl}/`];

    for (const url of candidates) {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "EdutuOgShellFetcher/1.0" },
          signal: AbortSignal.timeout(6000),
        });

        if (!response.ok) continue;

        const html = await response.text();
        // A shell without a <head> is an error page or a redirect body, not the
        // app — caching it would break every shared link until the TTL expires.
        if (!/<head[\s>]/i.test(html) || !/<\/head>/i.test(html)) continue;

        this.cached = html;
        this.cachedAt = Date.now();
        return html;
      } catch (error) {
        this.logger.warn(
          `SPA shell fetch failed for ${url}: ${(error as Error).message}`,
        );
      }
    }

    return null;
  }
}
