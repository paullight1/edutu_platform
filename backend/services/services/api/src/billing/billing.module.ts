import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { db } from "../db";
import {
  BillingCheckoutService,
  CachedBillingCheckoutRateLimiter,
  ProfileBillingCustomerIdentityResolver,
} from "./billing-checkout.service";
import { BillingController } from "./billing.controller";
import { BillingPortalService } from "./billing-portal.service";
import { BillingRepository } from "./billing.repository";
import { BachsClient } from "./providers/bachs/bachs.client";
import { loadBachsConfig } from "./providers/bachs/bachs.config";
import { BillingService } from "./billing.service";
import { BachsWebhookService } from "./bachs-webhook.service";
import {
  CREDIT_PURCHASE_DATABASE,
  CreditPurchaseService,
} from "./credit-purchase.service";
import {
  BACHS_CHECKOUT_CONFIG,
  BACHS_CHECKOUT_PROVIDER,
  BACHS_CHECKOUT_REPOSITORY,
  BACHS_PORTAL_PROVIDER,
  BACHS_PORTAL_REPOSITORY,
  BILLING_CLOCK,
  BILLING_CUSTOMER_IDENTITY_RESOLVER,
  BILLING_RATE_LIMITER,
  BACHS_WEBHOOK_SERVICE,
} from "./types/billing-checkout.types";

@Module({
  imports: [SettingsModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    CreditPurchaseService,
    {
      provide: CREDIT_PURCHASE_DATABASE,
      useValue: db,
    },
    BillingRepository,
    BillingCheckoutService,
    BillingPortalService,
    ProfileBillingCustomerIdentityResolver,
    CachedBillingCheckoutRateLimiter,
    {
      provide: BACHS_CHECKOUT_CONFIG,
      useFactory: () => loadBachsConfig(),
    },
    {
      provide: BACHS_CHECKOUT_PROVIDER,
      useFactory: (config) => new BachsClient(config),
      inject: [BACHS_CHECKOUT_CONFIG],
    },
    {
      provide: BACHS_WEBHOOK_SERVICE,
      useFactory: (config, creditPurchaseService) =>
        config.checkoutEnabled
          ? new BachsWebhookService(config, { creditPurchaseService })
          : null,
      inject: [BACHS_CHECKOUT_CONFIG, CreditPurchaseService],
    },
    {
      provide: BACHS_PORTAL_PROVIDER,
      useExisting: BACHS_CHECKOUT_PROVIDER,
    },
    {
      provide: BACHS_CHECKOUT_REPOSITORY,
      useExisting: BillingRepository,
    },
    {
      provide: BACHS_PORTAL_REPOSITORY,
      useExisting: BillingRepository,
    },
    {
      provide: BILLING_CUSTOMER_IDENTITY_RESOLVER,
      useExisting: ProfileBillingCustomerIdentityResolver,
    },
    {
      provide: BILLING_CLOCK,
      useValue: { now: () => new Date() },
    },
    {
      provide: BILLING_RATE_LIMITER,
      useExisting: CachedBillingCheckoutRateLimiter,
    },
  ],
  exports: [BillingService],
})
export class BillingModule {}
