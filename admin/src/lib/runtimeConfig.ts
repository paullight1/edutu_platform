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

// Deliberately incomplete RED-phase scaffold. The tests define the required
// production behavior; the next commit implements it.
export function resolveAdminRuntimeConfig(
  _env: Record<string, string | boolean | undefined>,
  mode: AdminRuntimeMode,
): AdminRuntimeConfig {
  return {
    apiOrigin: "",
    source: "development-proxy",
    explicit: false,
    mode,
  };
}

export function getAdminRuntimeConfig(): AdminRuntimeConfig {
  const mode: AdminRuntimeMode = import.meta.env.PROD
    ? "production"
    : import.meta.env.MODE === "test"
      ? "test"
      : "development";

  return resolveAdminRuntimeConfig(import.meta.env, mode);
}
