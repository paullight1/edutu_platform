export const ADMIN_ROLES = [
  "super_admin",
  "admin",
  "moderator",
  "support_agent",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

const DEFAULT_ADMIN_EMAILS = [
  "admin@edutu.ai",
  "founder@edutu.ai",
  "nwosupaul3@gmail.com",
  "nwouspaul3@gmail.com",
];

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return ADMIN_ROLES.includes(role as AdminRole);
}

export function getConfiguredAdminEmails(): string[] {
  const envEmails = String(import.meta.env.VITE_ADMIN_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);

  return Array.from(
    new Set([...DEFAULT_ADMIN_EMAILS.map(normalizeEmail), ...envEmails]),
  );
}

export function isConfiguredAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getConfiguredAdminEmails().includes(normalizeEmail(email));
}
