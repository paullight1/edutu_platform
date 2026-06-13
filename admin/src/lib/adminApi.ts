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

export function formatRoleLabel(role: string): string {
  const normalized = role.toLowerCase();

  switch (normalized) {
    case "super_admin":
      return "Super Admin";
    case "support_agent":
      return "Support Agent";
    case "moderator":
      return "Moderator";
    case "admin":
      return "Admin";
    case "creator":
      return "Creator";
    case "user":
      return "User";
    default:
      return role
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

export function formatCreatorStatus(status: string): string {
  const normalized = status.toLowerCase();

  switch (normalized) {
    case "approved":
      return "Approved";
    case "pending":
      return "Pending";
    case "rejected":
      return "Rejected";
    case "none":
      return "Not Applied";
    default:
      return formatRoleLabel(status);
  }
}

export function getUserInitials(user: Pick<AdminUserRecord, "fullName" | "email">): string {
  const fromName = user.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("");

  if (fromName) return fromName.toUpperCase();
  return (user.email.charAt(0) || "U").toUpperCase();
}
