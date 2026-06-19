const DEFAULT_LOCAL_ADMIN_EMAIL = 'admin@edutu.org';
const LOCAL_ADMIN_BYPASS_DISABLED_KEY = 'edutu:local-admin-bypass-disabled';

export function isLocalAdminBypassEnabled(): boolean {
  if (
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem(LOCAL_ADMIN_BYPASS_DISABLED_KEY) === 'true'
  ) {
    return false;
  }

  return import.meta.env.VITE_LOCAL_ADMIN_BYPASS === 'true';
}

export function disableLocalAdminBypassForSession(): void {
  if (typeof window === 'undefined') return;

  window.sessionStorage.setItem(LOCAL_ADMIN_BYPASS_DISABLED_KEY, 'true');
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
