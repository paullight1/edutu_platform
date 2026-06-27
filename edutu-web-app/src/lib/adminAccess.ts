import { productApiRequest } from '../services/productApi';

export const ADMIN_ROLES = ['super_admin', 'admin', 'moderator', 'support_agent'] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

const DEFAULT_ADMIN_EMAILS = [
  'admin@edutu.org',
  'founder@edutu.org',
];

type AdminAccessInput = {
  email?: string | null;
  publicRole?: string | null;
  profileRole?: string | null;
  allowedEmails?: string[];
};

export interface AdminAccessVerification {
  allowed: boolean;
  userId: string | null;
  email: string | null;
  role: string | null;
}

const normalize = (value: string) => value.trim().toLowerCase();

export function getConfiguredAdminEmails(): string[] {
  const envEmails = String(import.meta.env.VITE_ADMIN_EMAILS ?? '')
    .split(',')
    .map(normalize)
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ADMIN_EMAILS.map(normalize), ...envEmails]));
}

export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return ADMIN_ROLES.includes(role as AdminRole);
}

export function isAdminAccessAllowed({
  email,
  publicRole,
  profileRole,
  allowedEmails = getConfiguredAdminEmails(),
}: AdminAccessInput): boolean {
  if (isAdminRole(profileRole) || isAdminRole(publicRole)) {
    return true;
  }

  if (!email) {
    return false;
  }

  const normalizedEmail = normalize(email);
  return allowedEmails.map(normalize).includes(normalizedEmail);
}

export async function verifyAdminAccess(token: string): Promise<AdminAccessVerification> {
  return productApiRequest<AdminAccessVerification>('/auth/admin-access', token);
}
