import { Injectable, Logger } from "@nestjs/common";

/**
 * Lightweight robots.txt checker used by the scraper before crawling a source.
 *
 * For a product that RESELLS scraped data, respecting robots.txt is a legal/ToS
 * necessity. This implements the common subset of RFC 9309:
 *   - groups rules by User-agent (matches "*" and token-substring of the UA),
 *   - longest-match-wins between Allow/Disallow, ties resolved in favor of Allow,
 *   - supports "*" and "$" wildcards.
 *
 * Rules are cached per origin (6h) to avoid refetching robots.txt every page.
 * Failures to fetch robots.txt fail OPEN (treated as allow), mirroring crawler
 * norms; set SCRAPER_RESPECT_ROBOTS_TXT=false to disable entirely.
 */

interface RuleGroup {
  agents: string[];
  allow: string[];
  disallow: string[];
}

const DEFAULT_UA =
  process.env.SCRAPER_USER_AGENT || "EdutuBot/1.0 (+https://www.edutu.org)";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class RobotsChecker {
  private readonly logger = new Logger(RobotsChecker.name);
  private readonly cache = new Map<
    string,
    { rules: RuleGroup[]; fetchedAt: number }
  >();

  async isAllowed(targetUrl: string, userAgent = DEFAULT_UA): Promise<boolean> {
    if (process.env.SCRAPER_RESPECT_ROBOTS_TXT === "false") return true;

    let origin: string;
    let path: string;
    try {
      const parsed = new URL(targetUrl);
      origin = `${parsed.protocol}//${parsed.host}`;
      path = `${parsed.pathname}${parsed.search}`;
    } catch {
      return true;
    }

    const groups = await this.getRules(origin);
    return RobotsChecker.isPathAllowed(groups, userAgent, path);
  }

  private async getRules(origin: string): Promise<RuleGroup[]> {
    const cached = this.cache.get(origin);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.rules;
    }
    const rules = await this.fetchRules(origin);
    this.cache.set(origin, { rules, fetchedAt: Date.now() });
    return rules;
  }

  private async fetchRules(origin: string): Promise<RuleGroup[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${origin}/robots.txt`, {
        signal: controller.signal,
        headers: { "user-agent": DEFAULT_UA },
      });
      clearTimeout(timeout);
      if (!res.ok) return []; // no robots.txt (404/5xx) => allow all
      const text = await res.text();
      return RobotsChecker.parse(text);
    } catch (error) {
      this.logger.warn(
        `robots.txt unreachable for ${origin} (${RobotsChecker.errMsg(
          error,
        )}); treating as allow`,
      );
      return [];
    }
  }

  static parse(text: string): RuleGroup[] {
    const groups: RuleGroup[] = [];
    let current: RuleGroup | null = null;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.split("#")[0].trim();
      if (!line) continue;
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      const field = line.slice(0, sep).trim().toLowerCase();
      const value = line.slice(sep + 1).trim();

      if (field === "user-agent") {
        if (
          current &&
          current.allow.length === 0 &&
          current.disallow.length === 0
        ) {
          // Extend the current group with another agent (consecutive UA lines).
          current.agents.push(value.toLowerCase());
        } else {
          current = { agents: [value.toLowerCase()], allow: [], disallow: [] };
          groups.push(current);
        }
      } else if (field === "allow") {
        if (current) current.allow.push(value);
      } else if (field === "disallow") {
        if (current) current.disallow.push(value);
      }
    }
    return groups;
  }

  private static isPathAllowed(
    groups: RuleGroup[],
    userAgent: string,
    path: string,
  ): boolean {
    const ua = userAgent.toLowerCase();
    const applicable = groups.filter((g) =>
      g.agents.some((agent) => agent === "*" || ua.includes(agent)),
    );
    if (applicable.length === 0) return true;

    let bestMatch = "";
    let bestIsAllow = true;

    for (const group of applicable) {
      for (const pattern of group.disallow) {
        if (pattern === "") continue; // empty Disallow = allow everything
        if (
          RobotsChecker.matches(pattern, path) &&
          pattern.length >= bestMatch.length
        ) {
          if (pattern.length > bestMatch.length || bestIsAllow === false) {
            bestMatch = pattern;
            bestIsAllow = false;
          }
        }
      }
      for (const pattern of group.allow) {
        if (
          RobotsChecker.matches(pattern, path) &&
          pattern.length >= bestMatch.length
        ) {
          if (pattern.length > bestMatch.length || bestIsAllow === true) {
            bestMatch = pattern;
            bestIsAllow = true;
          }
        }
      }
    }

    return bestIsAllow;
  }

  /** Convert a robots pattern (with "*" and "$") into a match test for a path. */
  private static matches(pattern: string, path: string): boolean {
    const ends = pattern.endsWith("$");
    const src = ends ? pattern.slice(0, -1) : pattern;
    const escaped = src
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    const regex = new RegExp(`^${escaped}${ends ? "$" : ""}`, "i");
    return regex.test(path);
  }

  private static errMsg(error: unknown): string {
    return error instanceof Error ? error.message : "unknown error";
  }
}
