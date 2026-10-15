/** New Google accounts must complete feed personalization before continuing. */
export function googleSignupWelcomeRedirect(destination = "/dashboard") {
  const params = new URLSearchParams({ welcome: "google" });
  if (isInternalDestination(destination) && destination !== "/dashboard") {
    params.set("returnTo", destination);
  }
  return `/app/personalization?${params.toString()}`;
}

export function isInternalDestination(value: string | null): value is string {
  return Boolean(
    value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"),
  );
}
