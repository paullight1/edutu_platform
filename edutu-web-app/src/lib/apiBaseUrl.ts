export function getApiBaseUrl(serviceName: string): string {
  const configuredUrl =
    import.meta.env.VITE_BACKEND_URL?.trim() ||
    import.meta.env.VITE_API_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  if (import.meta.env.DEV) {
    return 'https://edutu-api.onrender.com';
  }

  throw new Error(`${serviceName} is not configured. Set VITE_BACKEND_URL or VITE_API_URL in Vercel environment variables.`);
}
