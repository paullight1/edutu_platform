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

export interface AdminCurrentUser {
  userId: string | null;
  email: string | null;
  role: string;
  canManageUsers: boolean;
}

export interface AdminUsersResponse {
  success: boolean;
  source: "database" | "fallback";
  users: AdminUserRecord[];
  stats: AdminUsersStats;
  generatedAt: string;
  currentAdmin?: AdminCurrentUser;
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
  assignedRole?: AdminAssignableRole;
  updatedUser?: AdminUserRecord | null;
  error?: string;
}

export const AdminAssignableRoleSchema = z.enum([
  "user",
  "moderator",
  "support_agent",
  "admin",
]);

export type AdminAssignableRole = z.infer<typeof AdminAssignableRoleSchema>;

export const AdminInviteUserSchema = z
  .object({
    email: z.string().trim().email(),
    role: AdminAssignableRoleSchema.default("user"),
    redirectUrl: z.string().trim().url().optional(),
    notify: z.boolean().optional(),
  })
  .strict();

export type AdminInviteUserDto = z.infer<typeof AdminInviteUserSchema>;

export const AdminUpdateUserRoleSchema = z
  .object({
    role: AdminAssignableRoleSchema,
  })
  .strict();

export type AdminUpdateUserRoleDto = z.infer<typeof AdminUpdateUserRoleSchema>;

export interface AdminUpdateUserRoleResponse {
  success: boolean;
  user: AdminUserRecord | null;
  error?: string;
}

export interface AdminAiUsageDayPoint {
  day: string; // YYYY-MM-DD (UTC)
  totalTokens: number;
  estimatedCostUsd: number;
  calls: number;
}

export interface AdminAiUsageRouteBreakdown {
  route: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  errorCount: number;
  avgLatencyMs: number | null;
}

export interface AdminVoiceUsageResponse {
  success: boolean;
  days: number;
  /** Unit prices used for the estimate (USD per minute). */
  pricing: { ttsPerMinuteUsd: number; sttPerMinuteUsd: number };
  totals: {
    ttsSeconds: number;
    sttSeconds: number;
    ttsRequests: number;
    sttRequests: number;
    activeUsers: number;
    estimatedCostUsd: number;
  };
  perDay: Array<{
    day: string;
    ttsSeconds: number;
    sttSeconds: number;
    requests: number;
    estimatedCostUsd: number;
  }>;
  perVoice: Array<{ voice: string; requests: number; ttsSeconds: number }>;
  error?: string;
}

export interface AdminAiUsageSummaryResponse {
  success: boolean;
  days: number;
  totals: {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    errorCount: number;
  };
  perDay: AdminAiUsageDayPoint[];
  perRoute: AdminAiUsageRouteBreakdown[];
  error?: string;
}

export interface AdminFunnelStage {
  key: "signup" | "onboarded" | "activated" | "retained" | "paying";
  label: string;
  /** Cumulative population currently at this stage. null if the query failed. */
  total: number | null;
  /** Users who entered this stage in the last 7 days. */
  newThisWeek: number | null;
  /** Users who entered this stage in the 7 days before that. */
  newLastWeek: number | null;
  /**
   * total / previous stage total. Usually in [0,1], but CAN exceed 1.0 because
   * stages are not strict subsets (e.g. a user can activate without completing
   * onboarding) — a value >1 is real signal that a stage is reached out of order.
   * null for signup or when the prior stage total is null/0.
   */
  convFromPrev: number | null;
}

export interface AdminFunnelCohort {
  /** ISO week label, e.g. "2026-W28". */
  cohortWeek: string;
  size: number;
  /** % of cohort active in relative week 1 / 2 / 4. null if window not yet elapsed. */
  w1Pct: number | null;
  w2Pct: number | null;
  w4Pct: number | null;
}

export interface AdminFunnelResponse {
  generatedAt: string;
  /**
   * NOTE: stage matching is by user_id string equality across tables that may
   * use different id namespaces (Clerk vs profile). Cross-namespace users are
   * undercounted at activated/retained. See plan Global Constraints.
   */
  stages: AdminFunnelStage[];
  referral: { invitersTotal: number | null; invitersThisWeek: number | null };
  cohorts: AdminFunnelCohort[];
}
