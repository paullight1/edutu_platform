type PublicAppEnvironment = Record<string, string | undefined>;

export function getPublicAppBaseUrl(
  env: PublicAppEnvironment = process.env,
): string {
  const configured = (
    env.EDUTU_PUBLIC_APP_URL ||
    env.PUBLIC_WEB_APP_URL ||
    env.WEB_APP_URL ||
    env.FRONTEND_URL ||
    env.APP_URL ||
    "https://www.edutu.org"
  ).replace(/\/$/, "");

  // Keep public SEO/share URLs on the canonical host. Preserve explicit
  // subdomains such as app.edutu.org for staging or app-specific flows.
  return configured.replace(
    /^https?:\/\/edutu\.org(?=\/|$)/i,
    "https://www.edutu.org",
  );
}
