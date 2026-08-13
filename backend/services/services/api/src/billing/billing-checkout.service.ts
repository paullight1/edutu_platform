import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { CacheService } from "../common/cache/cache.service";
import { db } from "../db";
import {
  BACHS_CHECKOUT_CANCEL_URL,
  BACHS_CHECKOUT_CONFIG,
  BACHS_CHECKOUT_ORIGIN,
  BACHS_CHECKOUT_PROVIDER,
  BACHS_CHECKOUT_REPOSITORY,
  BACHS_CHECKOUT_SUCCESS_URL,
  BILLING_CLOCK,
  BILLING_CUSTOMER_IDENTITY_RESOLVER,
  BILLING_RATE_LIMITER,
  type BillingCheckoutIntentRecord,
  type BillingCheckoutProduct,
  type BillingCheckoutProviderPort,
  type BillingCheckoutRepositoryPort,
  type BillingCheckoutResult,
  type BillingCustomerIdentityResolution,
  type BillingCustomerIdentityResolver,
  type BillingProductSnapshot,
  type BillingRateLimiterPort,
  type CheckoutRateLimitDecision,
  type CheckoutServiceConfig,
  type ClockPort,
  type CreateCheckoutRequest,
  assertApiCreditProductContract,
  isApiCreditProductKey,
} from "./types/billing-checkout.types";

const COOLDOWN_SECONDS = 3;

type VerifiedCustomer = Extract<
  BillingCustomerIdentityResolution,
  { status: "resolved" }
>;

type ProviderFailure = {
  code?: unknown;
  retryable?: unknown;
};

/**
 * Resolves a billing email from the canonical, server-owned auth subject. The
 * controller normally supplies the identity populated by the verified auth
 * guard; this provider is a safe fallback for internal callers.
 */
@Injectable()
export class ProfileBillingCustomerIdentityResolver implements BillingCustomerIdentityResolver {
  async resolveCustomer(
    rawAuthSubject: string,
  ): Promise<BillingCustomerIdentityResolution> {
    const result = await db.execute(sql`
      select email, full_name
      from profiles
      where user_id::text = ${rawAuthSubject}
      limit 2
    `);
    const rows =
      (
        result as {
          rows?: Array<{ email?: unknown; full_name?: unknown }>;
        }
      ).rows ?? [];

    if (rows.length !== 1 || typeof rows[0].email !== "string") {
      return { status: rows.length > 1 ? "ambiguous" : "missing" };
    }

    const email = rows[0].email.trim();
    if (!email) return { status: "missing" };
    const name =
      typeof rows[0].full_name === "string" && rows[0].full_name.trim()
        ? rows[0].full_name.trim()
        : undefined;
    return { status: "resolved", email, ...(name ? { name } : {}) };
  }
}

/** Uses the shared cache when Redis is configured and falls back locally. */
@Injectable()
export class CachedBillingCheckoutRateLimiter implements BillingRateLimiterPort {
  constructor(private readonly cache: CacheService) {}

  async reserve(
    rawAuthSubject: string,
    input: { idempotencyKey: string; now: Date },
  ): Promise<CheckoutRateLimitDecision> {
    const subjectHash = createHash("sha256")
      .update(rawAuthSubject)
      .digest("hex");
    const cacheKey = `billing:checkout:cooldown:${subjectHash}`;
    const previous = await this.cache.get<{ reservedAt: number }>(cacheKey);
    const elapsed = previous
      ? input.now.getTime() - previous.reservedAt
      : Infinity;

    if (elapsed < COOLDOWN_SECONDS * 1_000) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((COOLDOWN_SECONDS * 1_000 - elapsed) / 1_000),
        ),
      };
    }

    await this.cache.set(
      cacheKey,
      { reservedAt: input.now.getTime() },
      COOLDOWN_SECONDS,
    );
    return { allowed: true };
  }
}

@Injectable()
export class BillingCheckoutService {
  private readonly blockedIntentIds = new Map<string, number>();

  constructor(
    @Inject(BACHS_CHECKOUT_REPOSITORY)
    private readonly repository: BillingCheckoutRepositoryPort,
    @Inject(BACHS_CHECKOUT_PROVIDER)
    private readonly provider: BillingCheckoutProviderPort,
    @Inject(BILLING_CUSTOMER_IDENTITY_RESOLVER)
    private readonly identityResolver: BillingCustomerIdentityResolver,
    @Inject(BILLING_CLOCK) private readonly clock: ClockPort,
    @Inject(BILLING_RATE_LIMITER)
    private readonly rateLimiter: BillingRateLimiterPort,
    @Inject(BACHS_CHECKOUT_CONFIG)
    private readonly config: CheckoutServiceConfig,
  ) {}

  async getPublicApiCreditCatalog(): Promise<
    Array<{
      productKey: string;
      creditQuantity: number;
      amountMinor: number;
      currency: string;
      catalogVersion: number;
    }>
  > {
    const products =
      (await this.repository.listEnabledApiCreditProducts?.(
        this.config.environment,
      )) ?? [];
    return products
      .filter((product) => isApiCreditProductKey(product.productKey))
      .map((product) => ({
        productKey: product.productKey,
        creditQuantity: product.creditQuantity!,
        amountMinor: product.expectedAmountMinor,
        currency: product.currency,
        catalogVersion: product.catalogVersion,
      }));
  }

  async createCheckout(
    rawAuthSubject: string,
    idempotencyKey: string,
    request: CreateCheckoutRequest,
    verifiedCustomer?: VerifiedCustomer,
  ): Promise<BillingCheckoutResult> {
    this.assertRequest(rawAuthSubject, idempotencyKey, request);
    if (!this.config.checkoutEnabled) {
      throw new ServiceUnavailableException("Bachs checkout is unavailable.");
    }

    const product = await this.repository.findEnabledProduct(
      request.productKey,
      this.config.environment,
    );
    this.assertProduct(product, request.productKey);

    const customer =
      verifiedCustomer ??
      (await this.identityResolver.resolveCustomer(rawAuthSubject));
    if (customer.status !== "resolved" || !this.isEmail(customer.email)) {
      throw new BadRequestException("A verified billing email is required.");
    }

    let createdIntent: {
      intent: BillingCheckoutIntentRecord;
      created: boolean;
    };
    try {
      createdIntent = await this.repository.createOrReuseIntent({
        userId: rawAuthSubject,
        environment: this.config.environment,
        product,
        idempotencyKey,
        returnSurface: request.returnSurface,
      });
    } catch (error) {
      throw new ConflictException(
        "The idempotency key cannot be reused for this product.",
      );
    }

    const { intent, created } = createdIntent;
    this.assertIntentOwner(intent, rawAuthSubject);
    this.assertNotCooldownBlocked(intent.id);

    if (!created && intent.status === "open") {
      return this.replayOpenIntent(intent, product);
    }
    if (!created && intent.status !== "creating") {
      throw new ConflictException(
        "The existing checkout intent cannot be resumed.",
      );
    }

    if (created) {
      const decision = await this.rateLimiter.reserve(rawAuthSubject, {
        idempotencyKey,
        now: this.clock.now(),
      });
      if (!decision.allowed) {
        const retryAfterSeconds =
          decision.retryAfterSeconds ?? COOLDOWN_SECONDS;
        this.blockedIntentIds.set(
          intent.id,
          this.clock.now().getTime() + retryAfterSeconds * 1_000,
        );
        throw new HttpException(
          `Checkout cooldown active; try again in ${retryAfterSeconds} seconds.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    try {
      const session = await this.provider.createCheckoutSession({
        productId: product.providerProductId!,
        customer: {
          email: customer.email,
          ...(customer.name ? { name: customer.name } : {}),
          ...(customer.phoneNumber
            ? { phoneNumber: customer.phoneNumber }
            : {}),
        },
        billingCurrency: product.currency,
        allowedPaymentMethodTypes: product.allowedPaymentMethods,
        successUrl: BACHS_CHECKOUT_SUCCESS_URL,
        cancelUrl: BACHS_CHECKOUT_CANCEL_URL,
        reference: intent.id,
        metadata: { edutu_intent_id: intent.id },
        idempotencyKey: this.providerCheckoutIdempotencyKey(intent.id),
      });
      this.assertHostedUrl(session.checkoutUrl, BACHS_CHECKOUT_ORIGIN);
      if (session.status !== "open") {
        throw new Error("Bachs did not create an open checkout session.");
      }
      await this.repository.attachProviderCheckout({
        intentId: intent.id,
        checkoutId: session.checkoutId,
        checkoutUrl: session.checkoutUrl,
        expiresAt: session.expiresAt,
      });
      return this.result(
        intent,
        product,
        session.checkoutUrl,
        session.expiresAt,
      );
    } catch (error) {
      if (this.isRetryable(error)) {
        throw new ServiceUnavailableException(
          "Bachs checkout is temporarily unavailable. Retry with the same idempotency key.",
        );
      }
      await this.repository.markIntentFailed(intent.id, this.errorCode(error));
      throw new ConflictException(
        "Bachs could not create this checkout session.",
      );
    }
  }

  private async replayOpenIntent(
    intent: BillingCheckoutIntentRecord,
    product: BillingCheckoutProduct,
  ): Promise<BillingCheckoutResult> {
    if (intent.providerCheckoutUrl && intent.expiresAt) {
      this.assertHostedUrl(intent.providerCheckoutUrl, BACHS_CHECKOUT_ORIGIN);
      return this.result(
        intent,
        product,
        intent.providerCheckoutUrl,
        intent.expiresAt,
      );
    }
    if (!intent.providerCheckoutId) {
      throw new ConflictException(
        "The checkout intent is missing its provider session.",
      );
    }

    try {
      const session = await this.provider.getCheckoutSession(
        intent.providerCheckoutId,
      );
      this.assertHostedUrl(session.checkoutUrl, BACHS_CHECKOUT_ORIGIN);
      if (session.status !== "open") {
        throw new Error("Bachs checkout session is no longer open.");
      }
      return this.result(
        intent,
        product,
        session.checkoutUrl,
        session.expiresAt,
      );
    } catch (error) {
      if (this.isRetryable(error)) {
        throw new ServiceUnavailableException(
          "Bachs checkout is temporarily unavailable. Retry with the same idempotency key.",
        );
      }
      throw new ConflictException(
        "The existing Bachs checkout session is unavailable.",
      );
    }
  }

  private assertRequest(
    rawAuthSubject: string,
    idempotencyKey: string,
    request: CreateCheckoutRequest,
  ): void {
    if (!rawAuthSubject?.trim()) {
      throw new BadRequestException("Missing authenticated billing user.");
    }
    if (!idempotencyKey?.trim() || idempotencyKey.length > 255) {
      throw new BadRequestException("Idempotency-Key is required.");
    }
    if (!request || !request.productKey?.trim()) {
      throw new BadRequestException("productKey is required.");
    }
    if (request.returnSurface !== "web" && request.returnSurface !== "pwa") {
      throw new BadRequestException("Unsupported checkout return surface.");
    }
  }

  private assertProduct(
    product: BillingCheckoutProduct | null,
    productKey: string,
  ): asserts product is BillingCheckoutProduct {
    if (!product || product.productKey !== productKey) {
      throw new BadRequestException("This billing product is unavailable.");
    }
    if (product.provider && product.provider !== "bachs") {
      throw new BadRequestException(
        "This billing product is not available through Bachs.",
      );
    }
    if (
      product.environment &&
      product.environment !== this.config.environment
    ) {
      throw new BadRequestException(
        "This billing product is configured for another environment.",
      );
    }
    if (
      !product.providerProductId ||
      this.config.productMappings[product.productKey] !==
        product.providerProductId
    ) {
      throw new BadRequestException(
        "This billing product is not correctly configured.",
      );
    }
    if (
      !Number.isSafeInteger(product.expectedAmountMinor) ||
      product.expectedAmountMinor < 0 ||
      (product.expectedAmountMinor === 0 && !product.isFree)
    ) {
      throw new BadRequestException(
        "This billing product has an invalid amount.",
      );
    }
    if (
      !/^[A-Z]{3}$/.test(product.currency) ||
      !product.allowedPaymentMethods.length
    ) {
      throw new BadRequestException(
        "This billing product has invalid payment settings.",
      );
    }

    if (isApiCreditProductKey(product.productKey)) {
      try {
        assertApiCreditProductContract(product);
      } catch {
        throw new BadRequestException(
          "This API credit product is not correctly configured.",
        );
      }

      const configured = this.config.productCatalog?.[product.productKey];
      if (
        !configured ||
        configured.environment !== this.config.environment ||
        configured.providerProductId !== product.providerProductId ||
        configured.expectedAmountMinor !== product.expectedAmountMinor ||
        configured.currency !== product.currency
      ) {
        throw new BadRequestException(
          "This API credit product is not correctly configured.",
        );
      }
    }
  }

  private assertIntentOwner(
    intent: BillingCheckoutIntentRecord,
    rawAuthSubject: string,
  ): void {
    if (intent.userId !== rawAuthSubject) {
      throw new ConflictException(
        "The checkout intent belongs to another user.",
      );
    }
  }

  private assertNotCooldownBlocked(intentId: string): void {
    const blockedUntil = this.blockedIntentIds.get(intentId);
    if (!blockedUntil) return;
    if (blockedUntil <= this.clock.now().getTime()) {
      this.blockedIntentIds.delete(intentId);
      return;
    }
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((blockedUntil - this.clock.now().getTime()) / 1_000),
    );
    throw new HttpException(
      `Checkout cooldown active; try again in ${retryAfterSeconds} seconds.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private result(
    intent: BillingCheckoutIntentRecord,
    product: BillingCheckoutProduct,
    checkoutUrl: string,
    expiresAt: string,
  ): BillingCheckoutResult {
    return {
      intentId: intent.id,
      checkoutUrl,
      expiresAt,
      status: "open",
      renewalMode: product.renewalMode,
      productSnapshot: this.snapshot(product),
    };
  }

  private snapshot(product: BillingCheckoutProduct): BillingProductSnapshot {
    return {
      productKey: product.productKey,
      providerProductId: product.providerProductId!,
      fulfillmentKind: product.fulfillmentKind,
      renewalMode: product.renewalMode,
      expectedAmountMinor: product.expectedAmountMinor,
      currency: product.currency,
      cadence: product.cadence,
      creditQuantity: product.creditQuantity,
      validityDays: product.validityDays,
      allowedPaymentMethods: product.allowedPaymentMethods,
      catalogVersion: product.catalogVersion,
    };
  }

  private providerCheckoutIdempotencyKey(intentId: string): string {
    return `bachs_checkout_${intentId}`;
  }

  private assertHostedUrl(value: string, expectedOrigin: string): void {
    try {
      if (new URL(value).origin !== expectedOrigin)
        throw new Error("invalid origin");
    } catch {
      throw new Error("Bachs returned an untrusted hosted URL.");
    }
  }

  private isEmail(value: string): boolean {
    return /^\S+@\S+\.\S+$/.test(value);
  }

  private isRetryable(error: unknown): boolean {
    return Boolean((error as ProviderFailure | undefined)?.retryable);
  }

  private errorCode(error: unknown): string {
    const code = (error as ProviderFailure | undefined)?.code;
    return typeof code === "string" && /^[a-z0-9_:-]{1,80}$/i.test(code)
      ? code
      : "provider_error";
  }
}
