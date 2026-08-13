import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "crypto";
import {
  BACHS_CHECKOUT_CONFIG,
  BACHS_PORTAL_ORIGIN,
  BACHS_PORTAL_PROVIDER,
  BACHS_PORTAL_REPOSITORY,
  type BillingPortalProviderPort,
  type BillingPortalRepositoryPort,
  type CheckoutServiceConfig,
} from "./types/billing-checkout.types";

type ProviderFailure = { retryable?: unknown };

@Injectable()
export class BillingPortalService {
  constructor(
    @Inject(BACHS_PORTAL_REPOSITORY)
    private readonly repository: BillingPortalRepositoryPort,
    @Inject(BACHS_PORTAL_PROVIDER)
    private readonly provider: BillingPortalProviderPort,
    @Inject(BACHS_CHECKOUT_CONFIG)
    private readonly config: CheckoutServiceConfig,
  ) {}

  async createPortalSession(
    rawAuthSubject: string,
    operationKey: string,
  ): Promise<{ url: string }> {
    if (!rawAuthSubject?.trim()) {
      throw new BadRequestException("Missing authenticated billing user.");
    }
    if (!operationKey?.trim()) {
      throw new BadRequestException("Portal operation key is required.");
    }
    if (!this.config.checkoutEnabled) {
      throw new ServiceUnavailableException("Bachs billing is unavailable.");
    }

    const customerId = await this.repository.findProviderCustomerId(
      rawAuthSubject,
      this.config.environment,
    );
    if (!customerId) {
      throw new NotFoundException(
        "No Bachs customer is available for this account.",
      );
    }

    try {
      const session = await this.provider.createPortalSession({
        customerId,
        idempotencyKey: this.providerIdempotencyKey(operationKey),
      });
      this.assertHostedUrl(session.url);
      return { url: session.url };
    } catch (error) {
      if ((error as ProviderFailure | undefined)?.retryable) {
        throw new ServiceUnavailableException(
          "Bachs portal is temporarily unavailable. Please retry.",
        );
      }
      throw new BadGatewayException(
        "Bachs returned an invalid portal session.",
      );
    }
  }

  private providerIdempotencyKey(operationKey: string): string {
    return `bachs_portal_${createHash("sha256").update(operationKey).digest("hex")}`;
  }

  private assertHostedUrl(value: string): void {
    try {
      if (new URL(value).origin !== BACHS_PORTAL_ORIGIN) {
        throw new Error("invalid origin");
      }
    } catch {
      throw new Error("Bachs returned an untrusted portal URL.");
    }
  }
}
