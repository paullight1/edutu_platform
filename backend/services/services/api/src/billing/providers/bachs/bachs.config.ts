import {
  API_CREDIT_PRODUCT_QUANTITIES,
  type BillingProductCatalogEntry,
} from "../../types/billing-checkout.types";

export type BachsEnvironment = "sandbox" | "live";

export const BACHS_SANDBOX_API_ORIGIN = "https://sandbox-api.bachs.io";
export const BACHS_LIVE_API_ORIGIN = "https://api.bachs.io";
export const BACHS_CHECKOUT_ORIGIN = "https://checkout.bachs.io";
export const BACHS_PORTAL_ORIGIN = "https://portal.bachs.io";

export interface BachsDisabledConfig {
  checkoutEnabled: false;
  environment: BachsEnvironment;
}

export interface BachsEnabledConfig {
  checkoutEnabled: true;
  environment: BachsEnvironment;
  apiBaseUrl: string;
  apiKey: string;
  webhookSecret: string;
  expectedOrganizationId: string;
  productMappings: Readonly<Record<string, string>>;
  productCatalog?: Readonly<Record<string, BillingProductCatalogEntry>>;
}

export type BachsConfig = BachsDisabledConfig | BachsEnabledConfig;

export class BachsConfigError extends Error {
  readonly code = "bachs_configuration_invalid";

  constructor(message: string) {
    super(message);
    this.name = BachsConfigError.name;
  }
}

type Environment = Record<string, string | undefined>;

function required(environment: Environment, key: string): string {
  const value = environment[key]?.trim();
  if (!value) {
    throw new BachsConfigError(`${key} is required when Bachs is enabled.`);
  }
  return value;
}

function parseProductMappings(value: string): Readonly<Record<string, string>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new BachsConfigError("BACHS_PRODUCT_MAPPINGS must be valid JSON.");
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new BachsConfigError(
      "BACHS_PRODUCT_MAPPINGS must be a non-empty product-key map.",
    );
  }

  const mappings = Object.entries(parsed);
  if (
    mappings.length === 0 ||
    mappings.some(
      ([productKey, productId]) =>
        !productKey.trim() ||
        typeof productId !== "string" ||
        !productId.trim(),
    )
  ) {
    throw new BachsConfigError(
      "BACHS_PRODUCT_MAPPINGS must contain non-empty product keys and product IDs.",
    );
  }

  return Object.freeze(Object.fromEntries(mappings));
}

function parseProductCatalog(
  value: string | undefined,
  productMappings: Readonly<Record<string, string>>,
  environmentName: BachsEnvironment,
): Readonly<Record<string, BillingProductCatalogEntry>> {
  const apiProductKeys = Object.keys(API_CREDIT_PRODUCT_QUANTITIES);
  const mappedApiProductKeys = apiProductKeys.filter((key) =>
    Object.prototype.hasOwnProperty.call(productMappings, key),
  );

  if (mappedApiProductKeys.length === 0) {
    if (value?.trim()) {
      throw new BachsConfigError(
        "BACHS_PRODUCT_CATALOG may only contain mapped API credit products.",
      );
    }
    return Object.freeze({});
  }

  if (mappedApiProductKeys.length !== apiProductKeys.length || !value?.trim()) {
    throw new BachsConfigError(
      "BACHS_PRODUCT_CATALOG and BACHS_PRODUCT_MAPPINGS must configure all API credit products.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new BachsConfigError("BACHS_PRODUCT_CATALOG must be valid JSON.");
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new BachsConfigError(
      "BACHS_PRODUCT_CATALOG must be an API credit product map.",
    );
  }

  const entries = Object.entries(parsed);
  if (
    entries.length !== apiProductKeys.length ||
    entries.some(([key]) => !apiProductKeys.includes(key))
  ) {
    throw new BachsConfigError(
      "BACHS_PRODUCT_CATALOG must contain exactly the API credit products.",
    );
  }

  const providerIds = new Set<string>();
  const catalog: Record<string, BillingProductCatalogEntry> = {};
  for (const [productKey, rawEntry] of entries) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      throw new BachsConfigError(
        `BACHS_PRODUCT_CATALOG entry is invalid: ${productKey}.`,
      );
    }
    const entry = rawEntry as Record<string, unknown>;
    const providerProductId = entry.providerProductId;
    const expectedAmountMinor = entry.expectedAmountMinor;
    const currency = entry.currency;
    const entryEnvironment = entry.environment;
    if (
      typeof providerProductId !== "string" ||
      !providerProductId.trim() ||
      productMappings[productKey] !== providerProductId ||
      providerIds.has(providerProductId) ||
      typeof expectedAmountMinor !== "number" ||
      !Number.isSafeInteger(expectedAmountMinor) ||
      expectedAmountMinor <= 0 ||
      typeof currency !== "string" ||
      !/^[A-Z]{3}$/.test(currency) ||
      !Intl.supportedValuesOf("currency").includes(currency) ||
      entryEnvironment !== environmentName
    ) {
      throw new BachsConfigError(
        `BACHS_PRODUCT_CATALOG entry is inconsistent: ${productKey}.`,
      );
    }
    providerIds.add(providerProductId);
    catalog[productKey] = {
      providerProductId,
      expectedAmountMinor,
      currency,
      environment: environmentName,
    };
  }

  return Object.freeze(catalog);
}

/**
 * Reads only Bachs configuration. Calling this during application bootstrap is
 * the readiness gate; no Bachs request can occur while the feature is disabled.
 */
export function loadBachsConfig(
  environment: Environment = process.env,
): BachsConfig {
  const enabledValue = environment.BACHS_CHECKOUT_ENABLED?.trim();
  if (!enabledValue || enabledValue === "false") {
    return {
      checkoutEnabled: false,
      environment:
        environment.BACHS_ENVIRONMENT === "live" ? "live" : "sandbox",
    };
  }
  if (enabledValue !== "true") {
    throw new BachsConfigError(
      "BACHS_CHECKOUT_ENABLED must be exactly true or false.",
    );
  }

  const environmentName = required(environment, "BACHS_ENVIRONMENT");
  if (environmentName !== "sandbox" && environmentName !== "live") {
    throw new BachsConfigError("BACHS_ENVIRONMENT must be sandbox or live.");
  }

  const apiBaseUrl = required(environment, "BACHS_API_BASE_URL");
  const expectedApiBaseUrl =
    environmentName === "sandbox"
      ? BACHS_SANDBOX_API_ORIGIN
      : BACHS_LIVE_API_ORIGIN;
  if (apiBaseUrl !== expectedApiBaseUrl) {
    throw new BachsConfigError(
      "BACHS_API_BASE_URL does not match BACHS_ENVIRONMENT.",
    );
  }

  const productMappings = parseProductMappings(
    required(environment, "BACHS_PRODUCT_MAPPINGS"),
  );

  return {
    checkoutEnabled: true,
    environment: environmentName,
    apiBaseUrl,
    apiKey: required(environment, "BACHS_API_KEY"),
    webhookSecret: required(environment, "BACHS_WEBHOOK_SECRET"),
    expectedOrganizationId: required(
      environment,
      "BACHS_EXPECTED_ORGANIZATION_ID",
    ),
    productMappings,
    productCatalog: parseProductCatalog(
      environment.BACHS_PRODUCT_CATALOG,
      productMappings,
      environmentName,
    ),
  };
}

export function assertBachsReadiness(config: BachsConfig): BachsEnabledConfig {
  if (!config.checkoutEnabled) {
    throw new BachsConfigError("Bachs checkout is disabled.");
  }
  return config;
}
