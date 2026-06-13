import { z } from "zod";

export interface AdminUserRecord {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  country: string | null;
  skills: string[];
  creditsBalance: number;
  creatorStatus: string;
  creatorRejectionReason: string | null;
  creatorMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUsersStats {
  total: number;
  roleCounts: Record<string, number>;
  creatorStatusCounts: Record<string, number>;
  newThisWeek: number;
  countryCount: number;
  topCountry: string;
  totalCredits: number;
  averageCredits: number;
  profilesWithCountry: number;
  profilesWithSkills: number;
}

export interface AdminUsersResponse {
  success: boolean;
  source: "database" | "fallback";
  users: AdminUserRecord[];
  stats: AdminUsersStats;
  generatedAt: string;
  error?: string;
}

export interface AdminDashboardActivity {
  id: string;
  type: "user" | "opportunity" | "application" | "creator";
  action: string;
  detail: string;
  timestamp: string;
}

export interface AdminDashboardStats {
  totalUsers: number;
  activeOpportunities: number;
  applications: number;
  approvedCreators: number;
  pendingCreators: number;
  newUsersThisWeek: number;
  newOpportunitiesThisWeek: number;
}

export interface AdminDashboardResponse {
  success: boolean;
  source: "database" | "fallback";
  stats: AdminDashboardStats;
  recentActivity: AdminDashboardActivity[];
  generatedAt: string;
  error?: string;
}

export interface AdminInvitation {
  id: string;
  emailAddress: string;
  status: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminInviteResponse {
  success: boolean;
  invitation: AdminInvitation | null;
  error?: string;
}

export const AdminInviteUserSchema = z
  .object({
    email: z.string().trim().email(),
    redirectUrl: z.string().trim().url().optional(),
    notify: z.boolean().optional(),
  })
  .strict();

export type AdminInviteUserDto = z.infer<typeof AdminInviteUserSchema>;
