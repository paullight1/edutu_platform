export interface RevenueCatSubscriberSnapshot {
  appUserId: string;
  activeEntitlements: Array<{
    id: string;
    productId: string;
    expiresAt: Date | null;
  }>;
}

export class RevenueCatClientError extends Error {
  constructor(
    public readonly code: "provider_unavailable" | "invalid_response",
    public readonly retryable: boolean,
  ) {
    super(`RevenueCat subscriber request failed: ${code}`);
    this.name = RevenueCatClientError.name;
  }
}

type Fetch = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

type RevenueCatClientOptions = {
  secretApiKey: string;
  timeoutMs?: number;
  fetch?: Fetch;
  clock?: () => Date;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export class RevenueCatClient {
  private readonly request: Fetch;
  private readonly timeoutMs: number;
  private readonly clock: () => Date;

  constructor(private readonly options: RevenueCatClientOptions) {
    if (
      !/^sk_[A-Za-z0-9_-]{24,}$/.test(options.secretApiKey) ||
      /^(?:appl|goog|test)_/.test(options.secretApiKey)
    ) {
      throw new Error("RevenueCat secret API key is required.");
    }
    this.request = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.clock = options.clock ?? (() => new Date());
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 100) {
      throw new Error("RevenueCat timeout must be at least 100ms.");
    }
  }

  async getSubscriber(
    appUserId: string,
    environment?: "sandbox" | "live",
  ): Promise<RevenueCatSubscriberSnapshot> {
    let response: Response;
    try {
      response = await this.request(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.options.secretApiKey}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch {
      throw new RevenueCatClientError("provider_unavailable", true);
    }

    if (response.status === 404) {
      return { appUserId, activeEntitlements: [] };
    }
    if (!response.ok) {
      throw new RevenueCatClientError("provider_unavailable", true);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new RevenueCatClientError("invalid_response", false);
    }
    const subscriber = record(record(body)?.subscriber);
    const entitlements = record(subscriber?.entitlements);
    const subscriptions = record(subscriber?.subscriptions);
    if (!subscriber || !entitlements) {
      throw new RevenueCatClientError("invalid_response", false);
    }

    const now = this.clock().getTime();
    const activeEntitlements = Object.entries(entitlements).flatMap(
      ([id, rawEntitlement]) => {
        const entitlement = record(rawEntitlement);
        const productId = entitlement?.product_identifier;
        const rawExpiration = entitlement?.expires_date;
        if (typeof productId !== "string" || !productId) return [];
        if (environment) {
          const subscription = record(subscriptions?.[productId]);
          const isSandbox = subscription?.is_sandbox;
          if (
            typeof isSandbox !== "boolean" ||
            isSandbox !== (environment === "sandbox")
          ) {
            return [];
          }
        }
        let expiresAt: Date | null = null;
        if (rawExpiration != null) {
          if (typeof rawExpiration !== "string") return [];
          expiresAt = new Date(rawExpiration);
          if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now) {
            return [];
          }
        }
        return [{ id, productId, expiresAt }];
      },
    );
    return { appUserId, activeEntitlements };
  }
}
