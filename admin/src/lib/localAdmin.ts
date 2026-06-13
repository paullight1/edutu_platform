const DEFAULT_LOCAL_ADMIN_EMAIL = 'admin@edutu.org';

export function isLocalAdminBypassEnabled(): boolean {
  if (import.meta.env.VITE_LOCAL_ADMIN_BYPASS === 'true') {
    return true;
  }

  return (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  );
}

export function getLocalAdminEmail(): string {
  return (
    (import.meta.env.VITE_LOCAL_ADMIN_EMAIL || DEFAULT_LOCAL_ADMIN_EMAIL)
      .trim()
      .toLowerCase()
  );
}

export function getLocalAdminUserId(): string {
  return `local-admin:${getLocalAdminEmail()}`;
}
