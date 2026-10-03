import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { BillingCheckoutService } from "./billing-checkout.service";
import { BillingRepository } from "./billing.repository";
import { BillingPayShellPersistence } from "./billing-pay-shell.persistence";
import {
  BACHS_CHECKOUT_CONFIG,
  BACHS_CHECKOUT_ORIGIN,
  BILLING_CLOCK,
  type CheckoutServiceConfig,
  type ClockPort,
} from "./types/billing-checkout.types";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const SHELL_ORIGIN = "https://pay.edutu.org";

@Injectable()
export class BillingPayShellService {
  constructor(
    private readonly persistence: BillingPayShellPersistence,
    private readonly checkout: BillingCheckoutService,
    @Inject(BILLING_CLOCK) private readonly clock: ClockPort,
    @Inject(BACHS_CHECKOUT_CONFIG)
    private readonly config: CheckoutServiceConfig,
  ) {}

  async assertReady(): Promise<void> {
    if (
      !this.config.checkoutEnabled ||
      !this.config.hostedCompletionEnabled ||
      !(await this.persistence.ready())
    ) {
      throw new ServiceUnavailableException(
        "Hosted payment completion is not ready yet",
      );
    }
  }

  async isReady(): Promise<boolean> {
    try {
      await this.assertReady();
      return true;
    } catch {
      return false;
    }
  }

  assertServerKey(key: string | undefined): void {
    const expected = process.env.BILLING_PAY_SHELL_API_KEY?.trim();
    if (
      !expected ||
      expected.length < 32 ||
      !key ||
      !timingSafeEqual(Buffer.from(hash(expected)), Buffer.from(hash(key)))
    ) {
      throw new UnauthorizedException("Invalid payment shell authentication");
    }
  }

  bearer(authorization?: string): string {
    const value = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!value)
      throw new UnauthorizedException("Invalid payment shell authentication");
    return value;
  }

  async issueHandoff(
    userId: string,
    input: {
      destination: "checkout" | "result" | "account";
      intentId?: string;
      checkoutUrl?: string;
    },
  ) {
    await this.assertReady();
    if (
      !userId?.trim() ||
      !input ||
      !["checkout", "result", "account"].includes(input.destination)
    )
      throw new BadRequestException("Invalid payment handoff");
    if (input.destination !== "account" && !input.intentId)
      throw new BadRequestException("Checkout id is required");
    if (input.intentId)
      await this.checkout.getOwnedCheckoutStatus(userId, input.intentId);
    if (input.destination === "checkout") {
      try {
        const url = new URL(input.checkoutUrl!);
        if (
          url.origin !== BACHS_CHECKOUT_ORIGIN ||
          url.username ||
          url.password
        )
          throw new Error();
      } catch {
        throw new BadRequestException("Invalid hosted checkout URL");
      }
    }
    const code = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.clock.now().getTime() + 120_000);
    await this.persistence.issue({
      codeHash: hash(code),
      userId,
      environment: this.config.environment,
      intentId: input.intentId ?? null,
      destination: input.destination,
      checkoutUrl: input.destination === "checkout" ? input.checkoutUrl! : null,
      expiresAt,
    });
    return {
      url: `${SHELL_ORIGIN}/start#code=${code}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async exchange(code: string) {
    // An outstanding code must not bypass a release-gate change between issue
    // and redemption. Check before consuming it so readiness outages are safe.
    await this.assertReady();
    if (!TOKEN.test(code))
      throw new UnauthorizedException("Invalid payment handoff");
    const session = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.clock.now().getTime() + 900_000);
    const record = await this.persistence.exchange(
      hash(code),
      hash(session),
      expiresAt,
      this.clock.now(),
      this.config.environment,
    );
    if (!record)
      throw new UnauthorizedException("Invalid or expired payment handoff");
    return {
      session,
      expiresAt: expiresAt.toISOString(),
      destination: record.destination,
      ...(record.checkoutUrl ? { checkoutUrl: record.checkoutUrl } : {}),
    };
  }

  async authenticate(session: string) {
    if (!TOKEN.test(session))
      throw new UnauthorizedException("Invalid payment session");
    const record = await this.persistence.session(
      hash(session),
      this.clock.now(),
    );
    if (!record || record.environment !== this.config.environment)
      throw new UnauthorizedException("Invalid or expired payment session");
    return record;
  }

  async intentStatus(session: string) {
    const record = await this.authenticate(session);
    if (!record.intentId)
      throw new BadRequestException("No checkout is bound to this session");
    const intent = await this.checkout.getOwnedCheckoutStatus(
      record.userId,
      record.intentId,
    );
    return {
      status: intent.fulfilled
        ? "active"
        : BillingRepository.toPublicStatus(intent.status),
      supportReference: record.intentId,
    };
  }

  async account(session: string) {
    const record = await this.authenticate(session);
    return {
      items: await this.persistence.account(
        record.userId,
        this.config.environment,
      ),
    };
  }
}
