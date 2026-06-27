import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  BarChart3,
  Calendar,
  CheckCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  ExternalLink,
  Filter,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { backendFetchJson } from "../lib/backend";

type CreatorStatus = "none" | "pending" | "approved" | "rejected";
type CreatorTab = CreatorStatus | "all";

interface AdminCreatorApplicationRecord {
  id: string;
  userId: string;
  displayName: string;
  bio: string;
  contentType: string;
  experience: string;
  sampleContentUrl: string | null;
  status: CreatorStatus;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
  full_name?: string | null;
  email?: string | null;
  motivation?: string | null;
  opportunity_type?: string | null;
  opportunity_name?: string | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
  kyc_image_url?: string | null;
  social_links?: Record<string, string> | string | null;
  reviewer_notes?: string | null;
  applied_at?: string | null;
  reviewed_at?: string | null;
  [key: string]: unknown;
}

interface AdminUserRecord {
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

interface AdminUsersResponse {
  success: boolean;
  source: "database" | "fallback";
  users: AdminUserRecord[];
  error?: string;
}

interface AdminCreatorReviewResponse {
  success: boolean;
  decision: "approved" | "rejected";
  notificationSent?: boolean;
  error?: string;
}

interface CreatorApplicationView {
  id: string;
  userId: string;
  displayName: string;
  profileName: string;
  email: string;
  role: string;
  country: string | null;
  skills: string[];
  creditsBalance: number;
  profileStatus: CreatorStatus;
  profileRejectionReason: string | null;
  profileMetadata: Record<string, unknown>;
  status: CreatorStatus;
  bio: string;
  contentType: string;
  experience: string;
  sampleContentUrl: string | null;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
  legacy: {
    motivation: string;
    opportunityType: string;
    opportunityName: string;
    linkedinUrl: string;
    portfolioUrl: string;
    kycImageUrl: string;
    reviewerNotes: string;
    socialLinks: Record<string, string>;
  };
}

type Banner = {
  type: "success" | "warning" | "error" | "info";
  message: string;
} | null;

type LoadOptions = {
  quiet?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim());
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

function formatDateTime(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
}

function formatTimeAgo(value: string | null): string {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function escapeCsv(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/[,"\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function normalizeStatus(value: unknown): CreatorStatus {
  return value === "approved" || value === "rejected" || value === "pending" ? value : "none";
}

function normalizeSocialLinks(value: unknown): Record<string, string> {
  if (!value) return {};

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isRecord(parsed)) {
        return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, link]) => {
          if (typeof link === "string" && link.trim()) {
            acc[key] = link.trim();
          }
          return acc;
        }, {});
      }
    } catch {
      return {};
    }
    return {};
  }

  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<Record<string, string>>((acc, [key, link]) => {
    if (typeof link === "string" && link.trim()) {
      acc[key] = link.trim();
    }
    return acc;
  }, {});
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return "";
}

function normalizeApplication(
  application: AdminCreatorApplicationRecord,
  profile?: AdminUserRecord,
): CreatorApplicationView {
  const profileMetadata = isRecord(profile?.creatorMetadata) ? profile!.creatorMetadata : {};
  const lastApplication = isRecord(profileMetadata.lastApplication) ? profileMetadata.lastApplication : {};
  const lastReview = isRecord(profileMetadata.lastReview) ? profileMetadata.lastReview : {};

  const status = normalizeStatus(application.status ?? profile?.creatorStatus);
  const profileStatus = normalizeStatus(profile?.creatorStatus);
  const displayName = pickString(application.displayName, application.full_name, profile?.fullName) || "Anonymous User";
  const profileName = pickString(profile?.fullName, application.full_name, application.displayName) || "Anonymous User";
  const email = pickString(application.email, profile?.email) || "No email";
  const role = pickString(profile?.role) || "user";
  const country = pickString(profile?.country) || null;
  const skills = asStringArray(profile?.skills);
  const creditsBalance = Number(profile?.creditsBalance ?? 0);
  const bio = pickString(
    application.bio,
    application.motivation,
    lastApplication.bio,
    profileMetadata.bio,
  );
  const contentType = pickString(
    application.contentType,
    application.opportunity_type,
    lastApplication.contentType,
    profileMetadata.contentType,
  ) || "General";
  const experience = pickString(
    application.experience,
    application.opportunity_name,
    lastApplication.experience,
    profileMetadata.experience,
  );
  const sampleContentUrl = pickString(
    application.sampleContentUrl,
    application.portfolio_url,
    application.linkedin_url,
    application.kyc_image_url,
    lastApplication.sampleContentUrl,
    profileMetadata.sampleContentUrl,
  ) || null;
  const adminNote = pickString(
    application.adminNote,
    application.reviewer_notes,
    lastReview.adminNote,
    profile?.creatorRejectionReason,
  ) || null;
  const submittedAt = toIsoString(
    application.submittedAt ??
      application.applied_at ??
      lastApplication.submittedAt ??
      profile?.createdAt,
  );
  const reviewedAt = toIsoString(
    application.reviewedAt ??
      application.reviewed_at ??
      application.updatedAt ??
      lastReview.reviewedAt ??
      profile?.updatedAt,
  );
  const updatedAt = toIsoString(application.updatedAt ?? profile?.updatedAt);

  return {
    id: application.id,
    userId: application.userId,
    displayName,
    profileName,
    email,
    role,
    country,
    skills,
    creditsBalance,
    profileStatus,
    profileRejectionReason: profile?.creatorRejectionReason ?? null,
    profileMetadata,
    status,
    bio,
    contentType,
    experience,
    sampleContentUrl,
    adminNote,
    reviewedBy: application.reviewedBy ?? null,
    reviewedAt,
    submittedAt,
    updatedAt,
    legacy: {
      motivation: pickString(application.motivation, lastApplication.motivation),
      opportunityType: pickString(
        application.opportunity_type,
        lastApplication.opportunityType,
        contentType,
      ),
      opportunityName: pickString(
        application.opportunity_name,
        lastApplication.opportunityName,
      ),
      linkedinUrl: pickString(
        application.linkedin_url,
        lastApplication.linkedinUrl,
      ),
      portfolioUrl: pickString(
        application.portfolio_url,
        application.sampleContentUrl,
        lastApplication.portfolioUrl,
      ),
      kycImageUrl: pickString(
        application.kyc_image_url,
        lastApplication.kycImageUrl,
      ),
      reviewerNotes: pickString(
        application.reviewer_notes,
        lastReview.adminNote,
        adminNote,
      ),
      socialLinks: normalizeSocialLinks(
        application.social_links ?? lastApplication.socialLinks,
      ),
    },
  };
}

function creatorBadgeClass(status: CreatorStatus): string {
  switch (status) {
    case "approved":
      return "badge-success";
    case "rejected":
      return "badge-danger";
    case "pending":
      return "badge-warning";
    default:
      return "badge-primary";
  }
}

function creatorLabel(status: CreatorStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "pending":
      return "Pending";
    default:
      return "No Status";
  }
}

function roleLabel(role: string): string {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "moderator") return "Moderator";
  if (role === "support_agent") return "Support Agent";
  if (role === "user") return "User";

  return role
    ? role
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "User";
}

function roleBadgeClass(role: string): string {
  if (role === "admin" || role === "super_admin") return "badge-primary";
  if (role === "moderator" || role === "support_agent") return "badge-warning";
  return "badge-success";
}

function downloadCsv(filename: string, rows: CreatorApplicationView[]) {
  const columns = [
    "id",
    "displayName",
    "email",
    "profileName",
    "role",
    "country",
    "skills",
    "status",
    "profileStatus",
    "contentType",
    "experience",
    "bio",
    "sampleContentUrl",
    "adminNote",
    "submittedAt",
    "reviewedAt",
    "reviewedBy",
    "motivation",
    "opportunityType",
    "opportunityName",
    "linkedinUrl",
    "portfolioUrl",
  ] as const;

  const csv = [
    columns.join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.displayName,
        row.email,
        row.profileName,
        row.role,
        row.country ?? "",
        row.skills.join(" | "),
        row.status,
        row.profileStatus,
        row.contentType,
        row.experience,
        row.bio,
        row.sampleContentUrl ?? "",
        row.adminNote ?? "",
        row.submittedAt ?? "",
        row.reviewedAt ?? "",
        row.reviewedBy ?? "",
        row.legacy.motivation,
        row.legacy.opportunityType,
        row.legacy.opportunityName,
        row.legacy.linkedinUrl,
        row.legacy.portfolioUrl,
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const CreatorManagement = () => {
  const [applications, setApplications] = useState<CreatorApplicationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<CreatorTab>("pending");
  const [selectedApplication, setSelectedApplication] = useState<CreatorApplicationView | null>(null);
  const [selectedApplicationNote, setSelectedApplicationNote] = useState("");
  const [banner, setBanner] = useState<Banner>(null);

  const fetchData = useCallback(
    async (options: LoadOptions = {}): Promise<CreatorApplicationView[]> => {
      const quiet = options.quiet ?? false;

      if (quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setBanner(null);

      try {
        const [applicationsResult, usersResult] = await Promise.allSettled([
          backendFetchJson<AdminCreatorApplicationRecord[]>("/admin/creator-applications"),
          backendFetchJson<AdminUsersResponse>("/admin/users?limit=500"),
        ]);

        const applicationRows =
          applicationsResult.status === "fulfilled"
            ? applicationsResult.value
            : [];
        const userRows =
          usersResult.status === "fulfilled" ? usersResult.value.users : [];
        const userById = new Map(userRows.map((user) => [user.userId, user]));

        const nextApplications = applicationRows
          .map((application) =>
            normalizeApplication(application, userById.get(application.userId)),
          )
          .sort(
            (a, b) =>
              new Date(b.submittedAt ?? b.updatedAt ?? 0).getTime() -
              new Date(a.submittedAt ?? a.updatedAt ?? 0).getTime(),
          );

        setApplications(nextApplications);

        const warnings: string[] = [];

        if (applicationsResult.status === "rejected") {
          warnings.push(
            applicationsResult.reason instanceof Error
              ? applicationsResult.reason.message
              : "Failed to load creator applications",
          );
        }

        if (usersResult.status === "rejected") {
          warnings.push(
            usersResult.reason instanceof Error
              ? usersResult.reason.message
              : "Failed to load user profiles",
          );
        } else if (!usersResult.value.success) {
          warnings.push(
            usersResult.value.error
              ? `User data loaded from fallback storage: ${usersResult.value.error}`
              : "User data loaded from fallback storage.",
          );
        }

        if (warnings.length > 0) {
          setBanner({
            type:
              applicationsResult.status === "rejected" ? "error" : "warning",
            message: warnings.join(" "),
          });
        }

        return nextApplications;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load creator applications.";
        setApplications([]);
        setBanner({ type: "error", message });
        return [];
      } finally {
        if (quiet) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedApplication) {
      setSelectedApplicationNote("");
      return;
    }

    setSelectedApplicationNote(
      selectedApplication.adminNote ||
        selectedApplication.legacy.reviewerNotes ||
        "",
    );
  }, [selectedApplication]);

  const filteredApplications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return applications.filter((application) => {
      const matchesTab =
        activeTab === "all" ? true : application.status === activeTab;

      const haystack = [
        application.displayName,
        application.profileName,
        application.email,
        application.role,
        application.country || "",
        application.contentType,
        application.bio,
        application.experience,
        application.sampleContentUrl || "",
        application.adminNote || "",
        application.profileRejectionReason || "",
        application.legacy.motivation,
        application.legacy.opportunityType,
        application.legacy.opportunityName,
        application.legacy.linkedinUrl,
        application.legacy.portfolioUrl,
        application.legacy.kycImageUrl,
        application.legacy.reviewerNotes,
        application.skills.join(" "),
        application.creditsBalance.toString(),
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || haystack.includes(query);

      return matchesTab && matchesSearch;
    });
  }, [applications, activeTab, searchQuery]);

  const stats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    return {
      total: applications.length,
      pending: applications.filter((app) => app.status === "pending").length,
      approved: applications.filter((app) => app.status === "approved").length,
      rejected: applications.filter((app) => app.status === "rejected").length,
      submittedThisWeek: applications.filter((app) => {
        const timestamp = new Date(
          app.submittedAt ?? app.updatedAt ?? 0,
        ).getTime();
        return timestamp >= weekAgo;
      }).length,
    };
  }, [applications]);

  const tabs: Array<{
    id: CreatorTab;
    label: string;
    count: number;
    icon: LucideIcon;
  }> = [
    { id: "pending", label: "Pending", count: stats.pending, icon: Clock },
    { id: "approved", label: "Approved", count: stats.approved, icon: ShieldCheck },
    { id: "rejected", label: "Rejected", count: stats.rejected, icon: XCircle },
    { id: "all", label: "All", count: stats.total, icon: Users },
  ];

  const statCards = [
    {
      label: "Pending Review",
      value: stats.pending,
      icon: Clock,
      gradient: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    },
    {
      label: "Approved Creators",
      value: stats.approved,
      icon: ShieldCheck,
      gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    },
    {
      label: "Total Applications",
      value: stats.total,
      icon: Sparkles,
      gradient: "linear-gradient(135deg, #ff6600 0%, #ff4500 100%)",
    },
    {
      label: "Submitted This Week",
      value: stats.submittedThisWeek,
      icon: BarChart3,
      gradient: "linear-gradient(135deg, #146ef5 0%, #1d4ed8 100%)",
    },
  ];

  const submitReview = useCallback(
    async (
      application: CreatorApplicationView,
      decision: "approved" | "rejected",
      adminNote?: string,
    ) => {
      return backendFetchJson<AdminCreatorReviewResponse>(
        `/admin/creator-applications/${application.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            decision,
            adminNote,
          }),
        },
      );
    },
    [],
  );

  const reviewApplication = useCallback(
    async (
      application: CreatorApplicationView,
      decision: "approved" | "rejected",
      adminNote?: string,
    ) => {
      setActionLoadingId(application.id);

      try {
        await submitReview(application, decision, adminNote);
        await fetchData({ quiet: true });
        setSelectedApplication(null);
        setSelectedApplicationNote("");
        return true;
      } catch (error) {
        setBanner({
          type: "error",
          message:
            error instanceof Error ? error.message : "Unable to update review.",
        });
        return false;
      } finally {
        setActionLoadingId(null);
      }
    },
    [fetchData, submitReview],
  );

  const handleBulkAction = useCallback(
    async (decision: "approved" | "rejected") => {
      const pendingApplications = filteredApplications.filter(
        (application) => application.status === "pending",
      );

      if (pendingApplications.length === 0) {
        return;
      }

      const confirmMessage =
        decision === "approved"
          ? `Approve ${pendingApplications.length} creator application(s)?`
          : `Reject ${pendingApplications.length} creator application(s)?`;

      if (!window.confirm(confirmMessage)) {
        return;
      }

      const note =
        decision === "rejected"
          ? window.prompt("Reason for rejection (optional):")?.trim() || undefined
          : undefined;

      setBulkLoading(true);

      try {
        const failures: string[] = [];

        for (const application of pendingApplications) {
          try {
            await submitReview(application, decision, note);
          } catch (error) {
            failures.push(
              error instanceof Error ? error.message : application.displayName,
            );
          }
        }

        await fetchData({ quiet: true });

        if (failures.length > 0) {
          setBanner({
            type: "warning",
            message: `Completed with ${failures.length} failure(s). ${failures[0]}`,
          });
        }
      } finally {
        setBulkLoading(false);
      }
    },
    [fetchData, filteredApplications, submitReview],
  );

  const exportCurrentView = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `creator-applications-${stamp}.csv`;
    downloadCsv(filename, filteredApplications);
  };

  const openApplication = (application: CreatorApplicationView) => {
    setSelectedApplication(application);
  };

  const showNotePrompt = (application: CreatorApplicationView) => {
    const note =
      window.prompt("Reason for rejection (optional):", selectedApplicationNote) ??
      "";
    void reviewApplication(application, "rejected", note.trim() || undefined);
  };

  const hasLegacyFields = (application: CreatorApplicationView) =>
    Boolean(
      application.legacy.motivation ||
        application.legacy.opportunityType ||
        application.legacy.opportunityName ||
        application.legacy.linkedinUrl ||
        application.legacy.portfolioUrl ||
        application.legacy.kycImageUrl ||
        application.legacy.reviewerNotes ||
        Object.keys(application.legacy.socialLinks).length > 0,
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Creator Management</h1>
          <p
            style={{
              color: "var(--text-tertiary)",
              margin: "4px 0 0 0",
              fontSize: "15px",
            }}
          >
            Review creator applications through the backend admin pipeline
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={exportCurrentView}>
            <Download size={18} />
            Export CSV
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void fetchData({ quiet: true })}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} />
            )}
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {banner && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 16px",
            borderRadius: "10px",
            border:
              banner.type === "error"
                ? "1px solid rgba(239, 68, 68, 0.3)"
                : banner.type === "warning"
                  ? "1px solid rgba(245, 158, 11, 0.3)"
                  : "1px solid rgba(59, 130, 246, 0.3)",
            background:
              banner.type === "error"
                ? "rgba(239, 68, 68, 0.1)"
                : banner.type === "warning"
                  ? "rgba(245, 158, 11, 0.1)"
                  : "rgba(59, 130, 246, 0.1)",
          }}
        >
          <AlertCircle
            size={16}
            style={{
              color:
                banner.type === "error"
                  ? "#ef4444"
                  : banner.type === "warning"
                    ? "#f59e0b"
                    : "#3b82f6",
            }}
          />
          <span style={{ color: "var(--text-primary)", fontSize: "13px" }}>
            {banner.message}
          </span>
        </div>
      )}

      <div className="grid grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="card card-hover"
            style={{
              padding: "20px",
              position: "relative",
              overflow: "hidden",
              background: stat.gradient,
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            }}
          >
            <div
              style={{
                fontSize: "32px",
                marginBottom: "4px",
                color: "#ffffff",
                fontWeight: 700,
                textShadow: "0 1px 2px rgba(0,0,0,0.15)",
              }}
            >
              {stat.value}
            </div>
            <div style={{ fontWeight: 600, color: "#ffffff", fontSize: "13px" }}>
              {stat.label}
            </div>
            <div style={{ position: "absolute", top: "16px", right: "16px", opacity: 0.9 }}>
              <stat.icon size={24} strokeWidth={1.5} style={{ color: "#ffffff" }} />
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: "16px 20px" }}>
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ position: "relative", flex: 1, minWidth: "240px" }}>
            <Search
              size={18}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-tertiary)",
              }}
            />
            <input
              type="text"
              className="input-field"
              placeholder="Search by name, email, content type, or notes..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              style={{ paddingLeft: "40px" }}
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: "6px",
              background: "var(--bg-tertiary)",
              padding: "4px",
              borderRadius: "10px",
              flexWrap: "wrap",
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background:
                    activeTab === tab.id ? "var(--apple-blue)" : "transparent",
                  color: activeTab === tab.id ? "white" : "var(--text-secondary)",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: "13px",
                  transition: "all 0.2s",
                }}
              >
                <tab.icon size={14} />
                {tab.label}
                <span
                  style={{
                    padding: "2px 6px",
                    background:
                      activeTab === tab.id
                        ? "rgba(255,255,255,0.2)"
                        : "var(--bg-secondary)",
                    borderRadius: "8px",
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {activeTab === "pending" && stats.pending > 0 && (
            <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
              <button
                className="btn"
                onClick={() => void handleBulkAction("approved")}
                disabled={bulkLoading}
                style={{
                  background: "rgba(52, 199, 89, 0.1)",
                  color: "var(--success)",
                  border: "1px solid var(--success)",
                  padding: "8px 14px",
                  fontSize: "13px",
                }}
              >
                {bulkLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle size={14} />
                )}
                Approve All
              </button>
              <button
                className="btn"
                onClick={() => void handleBulkAction("rejected")}
                disabled={bulkLoading}
                style={{
                  background: "rgba(255, 59, 48, 0.1)",
                  color: "var(--danger)",
                  border: "1px solid var(--danger)",
                  padding: "8px 14px",
                  fontSize: "13px",
                }}
              >
                {bulkLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <XCircle size={14} />
                )}
                Reject All
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "72px 24px", textAlign: "center" }}>
            <Loader2
              size={40}
              className="animate-spin"
              style={{ margin: "0 auto 16px" }}
            />
            <p style={{ color: "var(--text-tertiary)" }}>Loading creators...</p>
          </div>
        ) : filteredApplications.length === 0 ? (
          <div style={{ padding: "72px 24px", textAlign: "center" }}>
            {activeTab === "pending" ? (
              <>
                <CheckCircle2
                  size={48}
                  style={{
                    opacity: 0.3,
                    marginBottom: "16px",
                    color: "#10b981",
                  }}
                />
                <p
                  style={{
                    color: "var(--text-primary)",
                    fontWeight: 600,
                    marginBottom: "4px",
                  }}
                >
                  All caught up!
                </p>
                <p style={{ color: "var(--text-tertiary)", fontSize: "14px" }}>
                  No pending applications to review
                </p>
              </>
            ) : (
              <>
                <Users size={48} style={{ opacity: 0.3, marginBottom: "16px" }} />
                <p
                  style={{
                    color: "var(--text-tertiary)",
                    marginBottom: "8px",
                  }}
                >
                  No {activeTab} creators found
                </p>
                <p style={{ fontSize: "14px", color: "var(--text-tertiary)" }}>
                  {searchQuery
                    ? "Try adjusting your search"
                    : "Changes will appear here in real-time"}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <div
              style={{
                padding: "12px 20px",
                background: "var(--bg-tertiary)",
                borderBottom: "1px solid var(--border-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--text-tertiary)",
                  fontWeight: 500,
                }}
              >
                Showing {filteredApplications.length} of {stats.total} applications
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                Click a row for full application details
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>Submission</th>
                    <th>Profile</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApplications.map((application) => {
                    const statusMismatch =
                      application.profileStatus !== "none" &&
                      application.profileStatus !== application.status;

                    return (
                      <tr
                        key={application.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => openApplication(application)}
                      >
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                {application.displayName}
                              </span>
                              <span className={`badge ${roleBadgeClass(application.role)}`}>
                                {roleLabel(application.role)}
                              </span>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "2px",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "13px",
                                  color: "var(--text-secondary)",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <Mail size={12} />
                                {application.email}
                              </span>
                              {application.profileName !== application.displayName && (
                                <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                                  Profile name: {application.profileName}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                              {application.contentType}
                            </div>
                            <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                              {application.experience || "No experience summary"}
                            </div>
                            {application.sampleContentUrl && (
                              <a
                                href={application.sampleContentUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  fontSize: "12px",
                                  color: "var(--apple-blue)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <ExternalLink size={12} />
                                Sample content
                              </a>
                            )}
                          </div>
                        </td>

                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                              {application.country || "Country not set"}
                            </div>
                            <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                              {application.skills.length > 0
                                ? application.skills.slice(0, 3).join(", ")
                                : "No skills recorded"}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                              Credits: {application.creditsBalance.toLocaleString()}
                            </div>
                            {statusMismatch && (
                              <span style={{ fontSize: "12px", color: "#f59e0b" }}>
                                Profile status: {creatorLabel(application.profileStatus)}
                              </span>
                            )}
                          </div>
                        </td>

                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                              {formatTimeAgo(application.submittedAt)}
                            </span>
                            <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                              {formatDateTime(application.submittedAt)}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <span className={`badge ${creatorBadgeClass(application.status)}`}>
                              {creatorLabel(application.status)}
                            </span>
                            {application.adminNote && (
                              <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                                Review note available
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              justifyContent: "flex-end",
                              flexWrap: "wrap",
                            }}
                          >
                            {application.status === "pending" ? (
                              <>
                                <button
                                  className="btn btn-primary"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void reviewApplication(application, "approved");
                                  }}
                                  disabled={actionLoadingId === application.id}
                                  style={{
                                    padding: "6px 12px",
                                    fontSize: "12px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  {actionLoadingId === application.id ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <CheckCircle size={14} />
                                  )}
                                  Approve
                                </button>
                                <button
                                  className="btn"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    showNotePrompt(application);
                                  }}
                                  disabled={actionLoadingId === application.id}
                                  style={{
                                    padding: "6px 12px",
                                    background: "rgba(255, 59, 48, 0.1)",
                                    color: "var(--danger)",
                                    border: "1px solid var(--danger)",
                                    fontSize: "12px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  {actionLoadingId === application.id ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <XCircle size={14} />
                                  )}
                                  Reject
                                </button>
                              </>
                            ) : (
                              <>
                                {application.status === "approved" ? (
                                  <button
                                    className="btn btn-secondary"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      showNotePrompt(application);
                                    }}
                                    disabled={actionLoadingId === application.id}
                                    style={{
                                      padding: "6px 10px",
                                      fontSize: "11px",
                                    }}
                                    title="Revoke creator access"
                                  >
                                    <XCircle size={14} />
                                    Revoke
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-primary"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void reviewApplication(application, "approved");
                                    }}
                                    disabled={actionLoadingId === application.id}
                                    style={{
                                      padding: "6px 10px",
                                      fontSize: "11px",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                  >
                                    {actionLoadingId === application.id ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <CheckCircle size={14} />
                                    )}
                                    Re-approve
                                  </button>
                                )}
                              </>
                            )}

                            <button
                              className="btn btn-secondary"
                              onClick={(event) => {
                                event.stopPropagation();
                                openApplication(application);
                              }}
                              style={{ padding: "6px 10px", fontSize: "11px" }}
                            >
                              <Eye size={14} />
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 16px",
          background: "var(--bg-tertiary)",
          borderRadius: "8px",
          fontSize: "13px",
          color: "var(--text-tertiary)",
        }}
      >
        <AlertCircle size={16} />
        <span>
          <strong>Tip:</strong> Review decisions now update the backend profile
          state and broadcast notifications from the API, so the creator dashboard
          stays in sync with the admin review.
        </span>
      </div>

      {selectedApplication && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(15, 23, 42, 0.55)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
          onClick={() => {
            setSelectedApplication(null);
            setSelectedApplicationNote("");
          }}
        >
          <div
            className="card"
            style={{
              width: "min(100%, 960px)",
              maxHeight: "90vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              background: "var(--bg-primary)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "16px",
                padding: "24px 24px 16px",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                  <span className={`badge ${creatorBadgeClass(selectedApplication.status)}`}>
                    {creatorLabel(selectedApplication.status)}
                  </span>
                  <span className={`badge ${roleBadgeClass(selectedApplication.role)}`}>
                    {roleLabel(selectedApplication.role)}
                  </span>
                  {selectedApplication.profileStatus !== "none" &&
                    selectedApplication.profileStatus !== selectedApplication.status && (
                      <span className="badge badge-secondary">
                        Profile: {creatorLabel(selectedApplication.profileStatus)}
                      </span>
                    )}
                </div>
                <h2 className="page-title" style={{ marginBottom: "4px" }}>
                  {selectedApplication.displayName}
                </h2>
                <p style={{ color: "var(--text-tertiary)", margin: 0 }}>
                  {selectedApplication.email} • Submitted{" "}
                  {formatDateTime(selectedApplication.submittedAt)}
                </p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSelectedApplication(null);
                  setSelectedApplicationNote("");
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                padding: "24px",
                overflowY: "auto",
                display: "grid",
                gap: "18px",
              }}
            >
              <div className="grid grid-cols-2">
                <div className="card" style={{ padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <Sparkles size={16} style={{ color: "var(--apple-blue)" }} />
                    <h3 style={{ margin: 0 }}>Application</h3>
                  </div>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Content Type</div>
                      <div style={{ fontWeight: 600 }}>{selectedApplication.contentType}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Experience</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{selectedApplication.experience || "N/A"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Bio</div>
                      <div style={{ whiteSpace: "pre-wrap", color: "var(--text-secondary)" }}>
                        {selectedApplication.bio || "No bio provided."}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Sample Content</div>
                      {selectedApplication.sampleContentUrl ? (
                        <a
                          href={selectedApplication.sampleContentUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "var(--apple-blue)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            wordBreak: "break-word",
                          }}
                        >
                          <ExternalLink size={14} />
                          {selectedApplication.sampleContentUrl}
                        </a>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>No sample content linked.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="card" style={{ padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <Shield size={16} style={{ color: "#10b981" }} />
                    <h3 style={{ margin: 0 }}>Profile</h3>
                  </div>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Name</div>
                      <div style={{ fontWeight: 600 }}>{selectedApplication.profileName}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Email</div>
                      <div>{selectedApplication.email}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Role</div>
                      <div>{roleLabel(selectedApplication.role)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Country</div>
                      <div>{selectedApplication.country || "N/A"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Skills</div>
                      <div>{selectedApplication.skills.length > 0 ? selectedApplication.skills.join(", ") : "N/A"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Credits</div>
                      <div>{selectedApplication.creditsBalance.toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Profile Status</div>
                      <div>{creatorLabel(selectedApplication.profileStatus)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2">
                <div className="card" style={{ padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <Calendar size={16} style={{ color: "var(--apple-blue)" }} />
                    <h3 style={{ margin: 0 }}>Review Timeline</h3>
                  </div>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Submitted</div>
                      <div>{formatDateTime(selectedApplication.submittedAt)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Reviewed</div>
                      <div>{formatDateTime(selectedApplication.reviewedAt)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Updated</div>
                      <div>{formatDateTime(selectedApplication.updatedAt)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Reviewed By</div>
                      <div>{selectedApplication.reviewedBy || "N/A"}</div>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <Filter size={16} style={{ color: "#f59e0b" }} />
                    <h3 style={{ margin: 0 }}>Review Note</h3>
                  </div>
                  <textarea
                    className="input-field"
                    rows={8}
                    value={selectedApplicationNote}
                    onChange={(event) => setSelectedApplicationNote(event.target.value)}
                    placeholder="Add a note for the creator or keep the existing note..."
                    style={{ resize: "vertical" }}
                  />
                </div>
              </div>

              <div className="card" style={{ padding: "18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                  <Sparkles size={16} style={{ color: "#146ef5" }} />
                  <h3 style={{ margin: 0 }}>Creator Metadata</h3>
                </div>
                {Object.keys(selectedApplication.profileMetadata).length > 0 ? (
                  <pre
                    style={{
                      margin: 0,
                      padding: "14px",
                      background: "var(--bg-tertiary)",
                      borderRadius: "10px",
                      overflowX: "auto",
                      fontSize: "12px",
                      lineHeight: 1.5,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {JSON.stringify(selectedApplication.profileMetadata, null, 2)}
                  </pre>
                ) : (
                  <p style={{ margin: 0, color: "var(--text-tertiary)" }}>
                    No metadata stored on the profile yet.
                  </p>
                )}
              </div>

              {hasLegacyFields(selectedApplication) && (
                <div className="card" style={{ padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <Mail size={16} style={{ color: "#ef4444" }} />
                    <h3 style={{ margin: 0 }}>Legacy Application Fields</h3>
                  </div>
                  <div className="grid grid-cols-2" style={{ gap: "14px" }}>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Motivation</div>
                      <div>{selectedApplication.legacy.motivation || "N/A"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Opportunity Type</div>
                      <div>{selectedApplication.legacy.opportunityType || "N/A"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Opportunity Name</div>
                      <div>{selectedApplication.legacy.opportunityName || "N/A"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>LinkedIn</div>
                      <div>
                        {selectedApplication.legacy.linkedinUrl ? (
                          <a
                            href={selectedApplication.legacy.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--apple-blue)" }}
                          >
                            {selectedApplication.legacy.linkedinUrl}
                          </a>
                        ) : (
                          "N/A"
                        )}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Portfolio</div>
                      <div>
                        {selectedApplication.legacy.portfolioUrl ? (
                          <a
                            href={selectedApplication.legacy.portfolioUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--apple-blue)" }}
                          >
                            {selectedApplication.legacy.portfolioUrl}
                          </a>
                        ) : (
                          "N/A"
                        )}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>KYC Image</div>
                      <div>{selectedApplication.legacy.kycImageUrl || "N/A"}</div>
                    </div>
                  </div>
                  {Object.keys(selectedApplication.legacy.socialLinks).length > 0 && (
                    <div style={{ marginTop: "14px" }}>
                      <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "8px" }}>
                        Social Links
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {Object.entries(selectedApplication.legacy.socialLinks).map(([label, value]) => (
                          <a
                            key={label}
                            href={value}
                            target="_blank"
                            rel="noreferrer"
                            className="badge badge-secondary"
                            style={{ textTransform: "capitalize" }}
                          >
                            {label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div
              style={{
                padding: "18px 24px 24px",
                borderTop: "1px solid var(--border-light)",
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
                flexWrap: "wrap",
              }}
            >
              {selectedApplication.status === "pending" ? (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={() => void reviewApplication(selectedApplication, "approved")}
                    disabled={actionLoadingId === selectedApplication.id}
                  >
                    {actionLoadingId === selectedApplication.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <CheckCircle size={16} />
                    )}
                    Approve
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      void reviewApplication(
                        selectedApplication,
                        "rejected",
                        selectedApplicationNote.trim() || undefined,
                      )
                    }
                    disabled={actionLoadingId === selectedApplication.id}
                    style={{
                      background: "rgba(255, 59, 48, 0.1)",
                      color: "var(--danger)",
                      border: "1px solid var(--danger)",
                    }}
                  >
                    {actionLoadingId === selectedApplication.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <XCircle size={16} />
                    )}
                    Reject
                  </button>
                </>
              ) : selectedApplication.status === "approved" ? (
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    void reviewApplication(
                      selectedApplication,
                      "rejected",
                      selectedApplicationNote.trim() || undefined,
                    )
                  }
                  disabled={actionLoadingId === selectedApplication.id}
                >
                  {actionLoadingId === selectedApplication.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <XCircle size={16} />
                  )}
                  Revoke
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => void reviewApplication(selectedApplication, "approved")}
                  disabled={actionLoadingId === selectedApplication.id}
                >
                  {actionLoadingId === selectedApplication.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  Re-approve
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatorManagement;
