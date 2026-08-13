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
import { BillingReconciliationScheduler } from "./billing-reconciliation.scheduler";
import { BillingReconciliationService } from "./billing-reconciliation.service";
import {
  BachsReconciliationAdapter,
  BillingReconciliationRepair,
  BillingReconciliationStoreService,
  PaystackReconciliationAdapter,
} from "./billing-reconciliation.providers";
import { BILLING_RECONCILIATION_OPTIONS } from "./reconciliation/reconciliation.types";
import {
  API_CREDIT_PRODUCT_QUANTITIES,
  type BillingProductCatalogEntry,
} from "./types/billing-checkout.types";
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
    BillingReconciliationScheduler,
    BachsReconciliationAdapter,
    PaystackReconciliationAdapter,
    BillingReconciliationStoreService,
    BillingReconciliationRepair,
    {
      provide: BILLING_RECONCILIATION_OPTIONS,
      useFactory: (bachsAdapter, paystackAdapter, store, repair, config) => ({
        adapters: [bachsAdapter, paystackAdapter],
        store,
        repair: (input) => repair.repair(input),
        checkoutEnabled: config.checkoutEnabled,
        expectedOrganizationId: config.expectedOrganizationId,
        expectedProducts: config.productCatalog
          ? Object.fromEntries(
              Object.entries(config.productCatalog).map(
                ([productKey, rawEntry]) => {
                  const entry = rawEntry as BillingProductCatalogEntry;
                  return [
                    productKey,
                    {
                      amountMinor: BigInt(entry.expectedAmountMinor),
                      currency: entry.currency,
                      creditQuantity:
                        API_CREDIT_PRODUCT_QUANTITIES[
                          productKey as keyof typeof API_CREDIT_PRODUCT_QUANTITIES
                        ],
                    },
                  ];
                },
              ),
            )
          : undefined,
      }),
      inject: [
        BachsReconciliationAdapter,
        PaystackReconciliationAdapter,
        BillingReconciliationStoreService,
        BillingReconciliationRepair,
        BACHS_CHECKOUT_CONFIG,
      ],
    },
    BillingReconciliationService,
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
        config.webhookEnabled
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
