import { HttpException, HttpStatus, Logger } from "@nestjs/common";
import { BillingEventsRepository } from "./billing-events.repository";
import { redactProviderPayload } from "./provider-payload-redaction";
import type { RevenueCatDeliveryConfig } from "./providers/revenuecat/revenuecat.config";
import {
  RevenueCatWebhookError,
  RevenueCatWebhookVerifier,
} from "./providers/revenuecat/revenuecat-webhook.verifier";

export type RevenueCatWebhookAcceptance = {
  accepted: true;
  eventId: string;
  duplicate: boolean;
};

export const REVENUECAT_WEBHOOK_SERVICES = Symbol(
  "REVENUECAT_WEBHOOK_SERVICES",
);

export type RevenueCatWebhookServices = Readonly<{
  sandbox: RevenueCatWebhookService;
  production: RevenueCatWebhookService;
}>;

export class RevenueCatWebhookService {
  private readonly logger = new Logger(RevenueCatWebhookService.name);
  private readonly verifier: RevenueCatWebhookVerifier | null;

  constructor(
    private readonly config: RevenueCatDeliveryConfig,
    private readonly events: BillingEventsRepository,
    options: { clock?: () => number } = {},
  ) {
    this.verifier = config.enabled
      ? new RevenueCatWebhookVerifier({
          authorizationSecret: config.authorizationSecret,
          hmacSecret: config.hmacSecret,
          allowedAppIds: config.allowedAppIds,
          allowedStores: config.allowedStores,
          expectedEnvironment: config.expectedEnvironment,
          clock: options.clock,
        })
      : null;
  }

  async handle(
    rawBody: Buffer,
    authorization: string | undefined,
    signature: string | undefined,
  ): Promise<RevenueCatWebhookAcceptance> {
    if (!this.config.enabled || !this.verifier) {
      throw new HttpException(
        "RevenueCat webhook is unavailable.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let verified;
    try {
      verified = this.verifier.verify({ rawBody, authorization, signature });
    } catch (error) {
      if (error instanceof RevenueCatWebhookError) {
        this.logger.warn(
          JSON.stringify({
            event: "revenuecat_webhook_rejected",
            environment: this.config.environment,
            category: error.code,
          }),
        );
        throw new HttpException(error.message, error.statusCode);
      }
      throw error;
    }

    const accepted = await this.events.accept({
      provider: "revenuecat",
      environment:
        this.config.environment === "production" ? "live" : "sandbox",
      eventId: verified.event.id,
      eventType: verified.event.type,
      providerReference: verified.resourceKey,
      providerAccountId: verified.event.app_id ?? undefined,
      payload: redactProviderPayload(verified),
      rawPayload: rawBody,
    });

    if (accepted.kind === "conflict") {
      this.logger.error(
        JSON.stringify({
          event: "revenuecat_webhook_event_conflict",
          environment: this.config.environment,
          eventId: verified.event.id,
        }),
      );
      throw new HttpException(
        "RevenueCat event identity conflict.",
        HttpStatus.CONFLICT,
      );
    }

    return {
      accepted: true,
      eventId: verified.event.id,
      duplicate: accepted.kind === "duplicate",
    };
  }
}
