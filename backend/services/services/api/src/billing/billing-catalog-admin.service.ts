import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { BillingPayShellPersistence } from "./billing-pay-shell.persistence";
import { BachsClient } from "./providers/bachs/bachs.client";
import { decimalToMinorUnits } from "./providers/bachs/bachs-money";
import { matchesBachsCadence } from "./providers/bachs/bachs-cadence";
import { BACHS_CHECKOUT_PROVIDER } from "./types/billing-checkout.types";

const PLAN_PRODUCT_KEYS = [
  "lite_weekly_pass",
  "lite_monthly_pass",
  "lite_yearly_pass",
  "pro_weekly_pass",
  "pro_monthly_pass",
  "pro_yearly_pass",
  "scholar_weekly_pass",
  "scholar_monthly_pass",
  "scholar_yearly_pass",
] as const;

type PlanProductKey = (typeof PLAN_PRODUCT_KEYS)[number];
export interface BillingCatalogEdit {
  productKey: PlanProductKey;
  providerProductId: string | null;
  amountMinor: number;
  currency: string;
  enabled: boolean;
  catalogVersion: number;
}
export interface BillingCatalogOperator {
  authId?: string;
  id?: string;
  email?: string;
  role?: string;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CatalogReadiness = {
  providerApiConfigured: boolean;
  webhookConfigured: boolean;
  paymentShellConfigured: boolean;
  paymentShellSchemaReady: boolean;
  mappedPlanCount: number;
  enabledPlanCount: number;
  mappedEnabledPlanCount: number;
  purchasesReady: boolean;
};

@Injectable()
export class BillingCatalogAdminService {
  constructor(
    @Optional()
    private readonly payShellPersistence?: BillingPayShellPersistence,
    @Optional()
    @Inject(BACHS_CHECKOUT_PROVIDER)
    private readonly bachsClient?: BachsClient,
  ) {}

  private getEnvironment(): "sandbox" {
    if (process.env.BACHS_ENVIRONMENT === "live") {
      throw new ServiceUnavailableException(
        "Live billing catalog changes are disabled. Configure the sandbox catalog first.",
      );
    }
    return "sandbox";
  }

  async list() {
    const environment = this.getEnvironment();
    const result = await db.execute(sql`
      select product.product_key, product.fulfillment_kind,
             product.renewal_mode, product.expected_amount_minor::text as amount_minor,
             product.currency, product.cadence,
             product.entitlement_duration::text as entitlement_duration,
             product.enabled, product.catalog_version,
             mapping.provider_product_id
      from public.billing_products product
      left join public.billing_product_provider_mappings mapping
        on mapping.product_key = product.product_key
       and mapping.provider = 'bachs'
       and mapping.environment = ${environment}
      where product.product_key = any(${[...PLAN_PRODUCT_KEYS]}::text[])
      order by product.product_key
    `);
    const rows = (result as { rows?: Record<string, unknown>[] }).rows ?? [];
    const paymentShellSchemaReady =
      (await this.payShellPersistence?.ready().catch(() => false)) ?? false;
    return {
      environment,
      liveEditingEnabled: false,
      readiness: this.readiness(rows, paymentShellSchemaReady),
      products: rows.map((row) => ({
        productKey: String(row.product_key),
        fulfillmentKind: String(row.fulfillment_kind),
        renewalMode: String(row.renewal_mode),
        amountMinor: Number(row.amount_minor),
        currency: String(row.currency ?? "USD")
          .trim()
          .toUpperCase(),
        cadence: String(row.cadence),
        validityDays:
          row.entitlement_duration == null
            ? null
            : this.durationDays(String(row.entitlement_duration)),
        enabled: Boolean(row.enabled),
        catalogVersion: Number(row.catalog_version),
        providerProductId: row.provider_product_id
          ? String(row.provider_product_id)
          : "",
      })),
    };
  }

  async save(
    operator: BillingCatalogOperator,
    reason: string,
    products: BillingCatalogEdit[],
  ) {
    const environment = this.getEnvironment();
    const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const isBillingAdmin =
      operator.role === "admin" ||
      operator.role === "super_admin" ||
      (Boolean(operator.email) &&
        allowedEmails.includes(operator.email!.trim().toLowerCase()));
    if (!isBillingAdmin)
      throw new ForbiddenException(
        "Only a billing administrator can change plan prices.",
      );
    const operatorUserId = operator.authId ?? operator.id ?? "";
    if (!operatorUserId?.trim())
      throw new BadRequestException("An authenticated operator is required.");
    if (
      typeof reason !== "string" ||
      !reason.trim() ||
      reason.trim().length > 500
    )
      throw new BadRequestException(
        "Enter a change reason (up to 500 characters).",
      );
    if (
      !Array.isArray(products) ||
      products.length !== PLAN_PRODUCT_KEYS.length
    )
      throw new BadRequestException("Submit the complete plan catalog.");

    const keys = new Set<string>();
    const providerIds = new Set<string>();
    for (const product of products) {
      if (!product || typeof product !== "object")
        throw new BadRequestException("A billing plan product is invalid.");
      if (!PLAN_PRODUCT_KEYS.includes(product.productKey))
        throw new BadRequestException("Unknown billing plan product.");
      if (keys.has(product.productKey))
        throw new BadRequestException(
          "Each billing plan product must appear once.",
        );
      keys.add(product.productKey);
      if (
        !Number.isSafeInteger(product.amountMinor) ||
        product.amountMinor <= 0
      )
        throw new BadRequestException(
          "Plan amounts must be positive minor units.",
        );
      if (
        !Number.isSafeInteger(product.catalogVersion) ||
        product.catalogVersion <= 0
      )
        throw new BadRequestException(
          "Each plan needs its current catalog version.",
        );
      if (typeof product.enabled !== "boolean")
        throw new BadRequestException("Plan enabled state must be boolean.");
      const currency =
        typeof product.currency === "string"
          ? product.currency.trim().toUpperCase()
          : "";
      if (
        !currency ||
        !/^[A-Z]{3}$/.test(currency) ||
        !Intl.supportedValuesOf("currency").includes(currency)
      )
        throw new BadRequestException("Use a supported ISO currency code.");
      if (
        product.providerProductId !== null &&
        typeof product.providerProductId !== "string"
      )
        throw new BadRequestException("The Bachs product ID must be text.");
      const providerProductId = product.providerProductId?.trim() ?? "";
      if (
        providerProductId &&
        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(providerProductId)
      )
        throw new BadRequestException(
          "The Bachs product ID has an invalid format.",
        );
      if (providerProductId && providerIds.has(providerProductId))
        throw new BadRequestException(
          "A Bachs product ID can only map to one plan.",
        );
      if (providerProductId) providerIds.add(providerProductId);
      if (product.enabled && !providerProductId)
        throw new BadRequestException(
          "Add a Bachs product ID before enabling a plan.",
        );
      if (product.enabled && !providerProductId.startsWith("prod_"))
        throw new BadRequestException(
          "Use the Bachs product ID that starts with prod_.",
        );
    }

    const enabledProducts = products.filter((product) => product.enabled);
    if (enabledProducts.length && !this.bachsClient)
      throw new ServiceUnavailableException(
        "Bachs sandbox product verification is unavailable. No catalog changes were saved.",
      );
    for (const product of enabledProducts) {
      const providerProductId = product.providerProductId!.trim();
      let providerProduct;
      try {
        providerProduct = await this.bachsClient!.getProduct(providerProductId);
      } catch {
        throw new ServiceUnavailableException(
          `Bachs could not verify ${product.productKey}. No catalog changes were saved.`,
        );
      }
      let amountMinor: bigint;
      try {
        amountMinor = decimalToMinorUnits(
          providerProduct.price.amount,
          providerProduct.price.currency,
        );
      } catch {
        throw new BadRequestException(
          `Bachs price for ${product.productKey} is invalid.`,
        );
      }
      if (
        providerProduct.id !== providerProductId ||
        providerProduct.status.toLowerCase() !== "active" ||
        providerProduct.price.priceType.toLowerCase() !== "fixed" ||
        !matchesBachsCadence(
          providerProduct.billingCycle,
          product.productKey.split("_")[1],
        ) ||
        providerProduct.price.currency.toUpperCase() !==
          product.currency.trim().toUpperCase() ||
        amountMinor !== BigInt(product.amountMinor)
      )
        throw new BadRequestException(
          `Bachs product for ${product.productKey} must be active, recurring, and match the plan period, currency and price exactly.`,
        );
    }

    return db.transaction(async (tx) => {
      for (const product of [...products].sort((a, b) =>
        a.productKey.localeCompare(b.productKey),
      )) {
        const beforeResult = await tx.execute(sql`
          select product.expected_amount_minor::text as amount_minor,
                 product.currency, product.enabled, product.catalog_version,
                 mapping.provider_product_id
          from public.billing_products product
          left join public.billing_product_provider_mappings mapping
            on mapping.product_key = product.product_key
           and mapping.provider = 'bachs'
           and mapping.environment = ${environment}
          where product.product_key = ${product.productKey}
          for update of product
        `);
        const before = (beforeResult as { rows?: Record<string, unknown>[] })
          .rows?.[0];
        if (!before)
          throw new BadRequestException(
            `Plan product ${product.productKey} is missing from the billing catalog.`,
          );
        if (Number(before.catalog_version) !== product.catalogVersion)
          throw new ConflictException(
            `Plan product ${product.productKey} changed since this page loaded. Refresh and try again.`,
          );

        const currency = product.currency.trim().toUpperCase();
        await tx.execute(sql`
          update public.billing_products
          set expected_amount_minor = ${product.amountMinor},
              currency = ${currency}::char(3),
              enabled = ${product.enabled},
              catalog_version = catalog_version + 1,
              updated_at = now()
          where product_key = ${product.productKey}
        `);

        const providerProductId = product.providerProductId?.trim() ?? "";
        if (providerProductId) {
          await tx.execute(sql`
            insert into public.billing_product_provider_mappings (
              product_key, provider, environment, provider_product_id, updated_at
            ) values (
              ${product.productKey}, 'bachs', ${environment},
              ${providerProductId}, now()
            )
            on conflict (product_key, provider, environment) do update
            set provider_product_id = excluded.provider_product_id,
                updated_at = now()
          `);
        } else {
          await tx.execute(sql`
            delete from public.billing_product_provider_mappings
            where product_key = ${product.productKey}
              and provider = 'bachs' and environment = ${environment}
          `);
        }

        await tx.execute(sql`
          insert into public.billing_admin_audit (
            operator_user_id, action, reason, target_type, target_id, details
          ) values (
            ${operatorUserId}, 'billing.catalog.updated', ${reason.trim()},
            'billing_product', ${product.productKey},
            ${JSON.stringify({
              environment,
              before: {
                amountMinor: before.amount_minor,
                currency: String(before.currency ?? "").trim(),
                enabled: before.enabled,
                providerProductId: before.provider_product_id ?? null,
                catalogVersion: Number(before.catalog_version),
              },
              after: {
                amountMinor: product.amountMinor,
                currency,
                enabled: product.enabled,
                providerProductId: providerProductId || null,
                catalogVersion: product.catalogVersion + 1,
              },
            })}::jsonb
          )
        `);
      }
      return this.listWithin(tx, environment);
    });
  }

  private async listWithin(tx: Transaction, environment: "sandbox") {
    const result = await tx.execute(sql`
      select product.product_key, product.fulfillment_kind,
             product.renewal_mode, product.expected_amount_minor::text as amount_minor,
             product.currency, product.cadence,
             product.entitlement_duration::text as entitlement_duration,
             product.enabled, product.catalog_version,
             mapping.provider_product_id
      from public.billing_products product
      left join public.billing_product_provider_mappings mapping
        on mapping.product_key = product.product_key
       and mapping.provider = 'bachs'
       and mapping.environment = ${environment}
      where product.product_key = any(${[...PLAN_PRODUCT_KEYS]}::text[])
      order by product.product_key
    `);
    const rows = (result as { rows?: Record<string, unknown>[] }).rows ?? [];
    const paymentShellSchemaReady =
      (await this.payShellPersistence?.ready().catch(() => false)) ?? false;
    return {
      environment,
      liveEditingEnabled: false,
      readiness: this.readiness(rows, paymentShellSchemaReady),
      products: rows.map((row) => ({
        productKey: String(row.product_key),
        fulfillmentKind: String(row.fulfillment_kind),
        renewalMode: String(row.renewal_mode),
        amountMinor: Number(row.amount_minor),
        currency: String(row.currency ?? "USD")
          .trim()
          .toUpperCase(),
        cadence: String(row.cadence),
        validityDays:
          row.entitlement_duration == null
            ? null
            : this.durationDays(String(row.entitlement_duration)),
        enabled: Boolean(row.enabled),
        catalogVersion: Number(row.catalog_version),
        providerProductId: row.provider_product_id
          ? String(row.provider_product_id)
          : "",
      })),
    };
  }

  private readiness(
    rows: Record<string, unknown>[],
    paymentShellSchemaReady: boolean,
  ): CatalogReadiness {
    const checkoutFlag = process.env.BACHS_CHECKOUT_ENABLED === "true";
    const webhookFlag =
      process.env.BACHS_WEBHOOK_ENABLED?.trim() ??
      (process.env.BACHS_WEBHOOK_SECRET?.trim() ||
      process.env.BACHS_EXPECTED_ORGANIZATION_ID?.trim()
        ? "true"
        : "false");
    const providerApiConfigured =
      process.env.BACHS_API_BASE_URL?.trim() ===
        "https://sandbox-api.bachs.io" &&
      Boolean(process.env.BACHS_API_KEY?.trim());
    const webhookConfigured =
      webhookFlag === "true" &&
      Boolean(process.env.BACHS_WEBHOOK_SECRET?.trim()) &&
      Boolean(process.env.BACHS_EXPECTED_ORGANIZATION_ID?.trim());
    const paymentShellConfigured =
      process.env.BILLING_PAY_SHELL_ENABLED === "true" &&
      (process.env.BILLING_PAY_SHELL_API_KEY?.trim().length ?? 0) >= 32;
    const mappedPlanCount = rows.filter(
      (row) =>
        typeof row.provider_product_id === "string" && row.provider_product_id,
    ).length;
    const enabledPlanCount = rows.filter((row) => Boolean(row.enabled)).length;
    const mappedEnabledPlanCount = rows.filter(
      (row) =>
        Boolean(row.enabled) &&
        typeof row.provider_product_id === "string" &&
        row.provider_product_id,
    ).length;
    return {
      providerApiConfigured,
      webhookConfigured,
      paymentShellConfigured,
      paymentShellSchemaReady,
      mappedPlanCount,
      enabledPlanCount,
      mappedEnabledPlanCount,
      purchasesReady:
        process.env.BACHS_ENVIRONMENT !== "live" &&
        checkoutFlag &&
        providerApiConfigured &&
        webhookConfigured &&
        paymentShellConfigured &&
        paymentShellSchemaReady &&
        enabledPlanCount > 0 &&
        mappedEnabledPlanCount === enabledPlanCount,
    };
  }

  private durationDays(value: string): number | null {
    const match = value.match(/(-?\d+(?:\.\d+)?)\s+days?/i);
    return match ? Math.round(Number(match[1])) : null;
  }
}
