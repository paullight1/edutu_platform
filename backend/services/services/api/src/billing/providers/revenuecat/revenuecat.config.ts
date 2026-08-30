import type { RevenueCatEnvironment } from "./revenuecat-webhook.types";

export type RevenueCatRouteEnvironment = "sandbox" | "production";
export type RevenueCatAllowedStore = "APP_STORE" | "PLAY_STORE" | "TEST_STORE";

export type RevenueCatDeliveryConfig =
  | {
      enabled: false;
      environment: RevenueCatRouteEnvironment;
      expectedEnvironment: RevenueCatEnvironment;
    }
  | {
      enabled: true;
      environment: RevenueCatRouteEnvironment;
      expectedEnvironment: RevenueCatEnvironment;
      authorizationSecret: string;
      hmacSecret: string;
      allowedAppIds: readonly string[];
      allowedStores: readonly RevenueCatAllowedStore[];
    };

type Environment = Record<string, string | undefined>;

export class RevenueCatConfigError extends Error {
  readonly code = "revenuecat_configuration_invalid";

  constructor(message: string) {
    super(message);
    this.name = RevenueCatConfigError.name;
  }
}

function variablePrefix(environment: RevenueCatRouteEnvironment): string {
  return `REVENUECAT_${environment.toUpperCase()}`;
}

function booleanFlag(environment: Environment, key: string): boolean {
  const value = environment[key]?.trim();
  if (!value) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new RevenueCatConfigError(`${key} must be exactly true or false.`);
}

function required(environment: Environment, key: string): string {
  const value = environment[key]?.trim();
  if (!value) {
    throw new RevenueCatConfigError(
      `${key} is required when RevenueCat delivery is enabled.`,
    );
  }
  return value;
}

function secret(environment: Environment, key: string): string {
  const value = required(environment, key);
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new RevenueCatConfigError(`${key} must be at least 32 bytes.`);
  }
  return value;
}

function list(environment: Environment, key: string): readonly string[] {
  const raw = required(environment, key);
  const values = raw.split(",").map((value) => value.trim());
  if (
    values.length === 0 ||
    values.some((value) => !/^[A-Za-z0-9._:-]+$/.test(value)) ||
    new Set(values).size !== values.length
  ) {
    throw new RevenueCatConfigError(
      `${key} must be a unique comma-separated identifier list.`,
    );
  }
  return Object.freeze(values);
}

function stores(
  environment: Environment,
  key: string,
  routeEnvironment: RevenueCatRouteEnvironment,
): readonly RevenueCatAllowedStore[] {
  const values = list(environment, key);
  const allowed = new Set<RevenueCatAllowedStore>([
    "APP_STORE",
    "PLAY_STORE",
    "TEST_STORE",
  ]);
  if (values.some((value) => !allowed.has(value as RevenueCatAllowedStore))) {
    throw new RevenueCatConfigError(
      `${key} may contain only APP_STORE, PLAY_STORE, or TEST_STORE.`,
    );
  }
  if (routeEnvironment === "production" && values.includes("TEST_STORE")) {
    throw new RevenueCatConfigError(
      `${key} cannot include TEST_STORE in production.`,
    );
  }
  return values as readonly RevenueCatAllowedStore[];
}

export function loadRevenueCatDeliveryConfig(
  routeEnvironment: RevenueCatRouteEnvironment,
  environment: Environment = process.env,
): RevenueCatDeliveryConfig {
  const prefix = variablePrefix(routeEnvironment);
  const expectedEnvironment: RevenueCatEnvironment =
    routeEnvironment === "sandbox" ? "SANDBOX" : "PRODUCTION";
  const enabled = booleanFlag(environment, `${prefix}_WEBHOOK_ENABLED`);
  if (!enabled) {
    return {
      enabled: false,
      environment: routeEnvironment,
      expectedEnvironment,
    };
  }

  return {
    enabled: true,
    environment: routeEnvironment,
    expectedEnvironment,
    authorizationSecret: secret(environment, `${prefix}_AUTHORIZATION_SECRET`),
    hmacSecret: secret(environment, `${prefix}_HMAC_SECRET`),
    allowedAppIds: list(environment, `${prefix}_ALLOWED_APP_IDS`),
    allowedStores: stores(
      environment,
      `${prefix}_ALLOWED_STORES`,
      routeEnvironment,
    ),
  };
}

export function loadRevenueCatDeliveryConfigs(
  environment: Environment = process.env,
): Readonly<{
  sandbox: RevenueCatDeliveryConfig;
  production: RevenueCatDeliveryConfig;
}> {
  const sandbox = loadRevenueCatDeliveryConfig("sandbox", environment);
  const production = loadRevenueCatDeliveryConfig("production", environment);

  if (sandbox.enabled && production.enabled) {
    if (sandbox.authorizationSecret === production.authorizationSecret) {
      throw new RevenueCatConfigError(
        "RevenueCat sandbox and production authorization secrets must be different.",
      );
    }
    if (sandbox.hmacSecret === production.hmacSecret) {
      throw new RevenueCatConfigError(
        "RevenueCat sandbox and production HMAC secrets must be different.",
      );
    }
  }

  return Object.freeze({ sandbox, production });
}
