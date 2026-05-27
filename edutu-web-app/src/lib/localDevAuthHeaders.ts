export function getLocalDevAuthHeaders(): Record<string, string> {
  if (import.meta.env.PROD) return {};

  const backendUrl =
    import.meta.env.VITE_BACKEND_URL?.trim() ||
    import.meta.env.VITE_API_URL?.trim() ||
    '';

  if (backendUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(backendUrl)) {
    return {};
  }

  const clerkUser = window.Clerk?.user;
  const email = clerkUser?.primaryEmailAddress?.emailAddress;

  return email ? { 'X-Edutu-Admin-Email': email } : {};
}
