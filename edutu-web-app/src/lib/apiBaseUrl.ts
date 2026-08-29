const PUBLIC_API_FALLBACK = "https://edutu-platform.onrender.com";

export function getApiBaseUrl(_serviceName: string): string {
  const configuredUrl =
    import.meta.env.VITE_BACKEND_URL?.trim() ||
    import.meta.env.VITE_API_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (import.meta.env.DEV) {
    return "http://localhost:3000";
  }

  return PUBLIC_API_FALLBACK;
}
