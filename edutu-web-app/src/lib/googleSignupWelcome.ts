/** Clerk uses this destination only when Google creates a new account. */
export function googleSignupWelcomeRedirect(destination = "/dashboard") {
  const params = new URLSearchParams({ welcome: "google" });
  if (isInternalDestination(destination) && destination !== "/dashboard") {
    params.set("returnTo", destination);
  }
  return `/dashboard?${params.toString()}`;
}

export function isInternalDestination(value: string | null): value is string {
  return Boolean(
    value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"),
  );
}
