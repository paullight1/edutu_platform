/**
 * Proxy Manager for Scraper IP Rotation
 *
 * Manages a pool of proxy servers with round-robin rotation,
 * failure detection, and automatic cooldown for failed proxies.
 */

export interface ProxyConfig {
  url: string;
  healthy: boolean;
  failCount: number;
  lastFailedAt: string | null;
  cooldownUntil: string | null;
  addedAt: string;
}

export interface ProxyStatus {
  total: number;
  healthy: number;
  unhealthy: number;
  proxies: ProxyConfig[];
}

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAILURES_BEFORE_COOLDOWN = 3;

export class ProxyManager {
  private proxies: ProxyConfig[] = [];
  private currentIndex = 0;

  constructor(initialProxies: string[] = []) {
    const now = new Date().toISOString();
    this.proxies = initialProxies.map((url) => ({
      url,
      healthy: true,
      failCount: 0,
      lastFailedAt: null,
      cooldownUntil: null,
      addedAt: now,
    }));
  }

  /**
   * Add a new proxy server to the pool.
   */
  addProxy(url: string): ProxyConfig {
    const existing = this.proxies.find((p) => p.url === url);
    if (existing) return existing;

    const proxy: ProxyConfig = {
      url,
      healthy: true,
      failCount: 0,
      lastFailedAt: null,
      cooldownUntil: null,
      addedAt: new Date().toISOString(),
    };

    this.proxies.push(proxy);
    return proxy;
  }

  /**
   * Remove a proxy from the pool by URL.
   */
  removeProxy(url: string): boolean {
    const index = this.proxies.findIndex((p) => p.url === url);
    if (index === -1) return false;

    this.proxies.splice(index, 1);
    if (this.currentIndex >= this.proxies.length) {
      this.currentIndex = 0;
    }
    return true;
  }

  /**
   * Get the next available healthy proxy using round-robin.
   * Returns null if no healthy proxies are available.
   */
  getNextProxy(): ProxyConfig | null {
    const now = Date.now();

    // Release proxies whose cooldown has expired
    for (const proxy of this.proxies) {
      if (!proxy.healthy && proxy.cooldownUntil) {
        const cooldownEnd = new Date(proxy.cooldownUntil).getTime();
        if (now >= cooldownEnd) {
          proxy.healthy = true;
          proxy.failCount = 0;
          proxy.cooldownUntil = null;
        }
      }
    }

    const healthy = this.proxies.filter((p) => p.healthy);
    if (healthy.length === 0) return null;

    // Round-robin
    this.currentIndex = this.currentIndex % healthy.length;
    const proxy = healthy[this.currentIndex];
    this.currentIndex++;

    return proxy;
  }

  /**
   * Mark a proxy as failed. After MAX_FAILURES_BEFORE_COOLDOWN failures,
   * the proxy is temporarily disabled for COOLDOWN_MS.
   */
  markProxyFailed(url: string): void {
    const proxy = this.proxies.find((p) => p.url === url);
    if (!proxy) return;

    proxy.failCount++;
    proxy.lastFailedAt = new Date().toISOString();

    if (proxy.failCount >= MAX_FAILURES_BEFORE_COOLDOWN) {
      proxy.healthy = false;
      proxy.cooldownUntil = new Date(Date.now() + COOLDOWN_MS).toISOString();
    }
  }

  /**
   * Manually mark a proxy as healthy (e.g., after verifying it works).
   */
  markProxyHealthy(url: string): void {
    const proxy = this.proxies.find((p) => p.url === url);
    if (!proxy) return;

    proxy.healthy = true;
    proxy.failCount = 0;
    proxy.lastFailedAt = null;
    proxy.cooldownUntil = null;
  }

  /**
   * Get the current status of all proxies.
   */
  getStatus(): ProxyStatus {
    const healthy = this.proxies.filter((p) => p.healthy).length;
    return {
      total: this.proxies.length,
      healthy,
      unhealthy: this.proxies.length - healthy,
      proxies: [...this.proxies],
    };
  }

  /**
   * Export proxy configurations for persistence.
   */
  toJSON(): ProxyConfig[] {
    return [...this.proxies];
  }

  /**
   * Import proxy configurations from persisted data.
   */
  fromJSON(configs: ProxyConfig[]): void {
    this.proxies = configs.map((c) => ({ ...c }));
    this.currentIndex = 0;
  }
}
