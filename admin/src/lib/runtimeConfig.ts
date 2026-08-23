export type AdminRuntimeMode = "development" | "test" | "production";

export type ApiOriginSource =
  | "VITE_BACKEND_URL"
  | "VITE_API_URL"
  | "development-proxy";

export interface AdminRuntimeConfig {
  apiOrigin: string;
  source: ApiOriginSource;
  explicit: boolean;
  legacyAlias?: boolean;
  mode: AdminRuntimeMode;
}

export class AdminRuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminRuntimeConfigError";
  }
}

function readString(
  env: Record<string, string | boolean | undefined>,
  key: string,
): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeExplicitOrigin(value: string, mode: AdminRuntimeMode): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new AdminRuntimeConfigError(
      "The admin API origin must be a valid absolute URL",
    );
  }

  if (mode === "production" && url.protocol !== "https:") {
    throw new AdminRuntimeConfigError(
      "The production admin API origin must use HTTPS",
    );
  }

  if (url.username || url.password) {
    throw new AdminRuntimeConfigError(
      "The admin API origin must not contain embedded credentials",
    );
  }

  return value.replace(/\/+$/u, "");
}

export function resolveAdminRuntimeConfig(
  env: Record<string, string | boolean | undefined>,
  mode: AdminRuntimeMode,
): AdminRuntimeConfig {
  const canonical = readString(env, "VITE_BACKEND_URL");
  const legacy = readString(env, "VITE_API_URL");
  const selected = canonical || legacy;

  if (!selected) {
    if (mode === "production") {
      throw new AdminRuntimeConfigError(
        "VITE_BACKEND_URL is required for production admin builds",
      );
    }

    return {
      apiOrigin: "",
      source: "development-proxy",
      explicit: false,
      mode,
    };
  }

  const apiOrigin = normalizeExplicitOrigin(selected, mode);

  if (canonical) {
    return {
      apiOrigin,
      source: "VITE_BACKEND_URL",
      explicit: true,
      mode,
    };
  }

  return {
    apiOrigin,
    source: "VITE_API_URL",
    explicit: true,
    legacyAlias: true,
    mode,
  };
}

export function getAdminRuntimeConfig(): AdminRuntimeConfig {
  const meta = import.meta as ImportMeta & {
    env?: Record<string, string | boolean | undefined>;
  };
  const env: Record<string, string | boolean | undefined> = meta.env ?? {};
  const mode: AdminRuntimeMode = env["PROD"]
    ? "production"
    : env["MODE"] === "test"
      ? "test"
      : "development";

  return resolveAdminRuntimeConfig(env, mode);
}
