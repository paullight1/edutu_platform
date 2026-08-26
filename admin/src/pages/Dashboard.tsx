import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  Target,
  Activity,
  ArrowRight,
  UserPlus,
  Plus,
  Shield,
  BarChart3,
  Zap,
  Award,
  CheckCircle2,
  Download,
  Send,
  AlertTriangle,
  Lightbulb,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { backendFetchJson } from "../lib/backend";
import {
  type AdminDashboardActivity,
  type AdminDashboardResponse,
  type AdminDashboardStats,
} from "../lib/adminApi";

interface HealthStatus {
  status: "ready" | "not_ready";
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  checks: {
    database: {
      status: "up" | "down";
      responseTimeMs: number;
      reason?: "query_failed" | "timeout";
    };
    ai: {
      status: "configured" | "degraded";
      providers: {
        gemini: "configured" | "missing";
        openrouter: "configured" | "missing";
      };
    };
  };
}

interface AiUsageDayPoint {
  day: string;
  totalTokens: number;
  estimatedCostUsd: number;
  calls: number;
}

interface AiUsageRouteBreakdown {
  route: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  errorCount: number;
  avgLatencyMs: number | null;
}

interface AiUsageSummaryResponse {
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
  perDay: AiUsageDayPoint[];
  perRoute: AiUsageRouteBreakdown[];
  error?: string;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

interface DashboardMetric {
  label: string;
  value: string | number;
  progress: number;
  color: string;
  icon: LucideIcon;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getActivityIcon(type: AdminDashboardActivity["type"]): LucideIcon {
  switch (type) {
    case "opportunity":
      return Plus;
    case "application":
      return Send;
    case "creator":
      return CheckCircle2;
    case "user":
    default:
      return UserPlus;
  }
}

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [stats, setStats] = useState<AdminDashboardStats>({
    totalUsers: 0,
    activeOpportunities: 0,
    applications: 0,
    approvedCreators: 0,
    pendingCreators: 0,
    newUsersThisWeek: 0,
    newOpportunitiesThisWeek: 0,
  });
  const [recentActivity, setRecentActivity] = useState<AdminDashboardActivity[]>(
    [],
  );
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataBanner, setDataBanner] = useState<{ type: string; message: string } | null>(
    null,
  );
  const [actionBanner, setActionBanner] = useState<{ type: string; message: string } | null>(
    null,
  );

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setDataBanner(null);
    setHealthError(null);
    try {
      const [dashboardResult, healthResult, aiUsageResult] =
        await Promise.allSettled([
          backendFetchJson<AdminDashboardResponse>("/admin/dashboard"),
          backendFetchJson<HealthStatus>("/health"),
          backendFetchJson<AiUsageSummaryResponse>(
            "/admin/ai-usage/summary?days=30",
          ),
        ]);

      // AI usage is best-effort: 404 (backend not deployed yet) or any other
      // failure just renders the empty state — never a dashboard error banner.
      setAiUsage(
        aiUsageResult.status === "fulfilled" ? aiUsageResult.value : null,
      );

      const dashboardResponse =
        dashboardResult.status === "fulfilled" ? dashboardResult.value : null;
      const healthResponse =
        healthResult.status === "fulfilled" ? healthResult.value : null;

      if (dashboardResponse) {
        setStats(dashboardResponse.stats);
        setRecentActivity(dashboardResponse.recentActivity);
        setDataBanner(
          dashboardResponse.success
            ? null
            : {
                type: "warning",
                message:
                  dashboardResponse.error ||
                  "Dashboard loaded from fallback data.",
              },
        );
      } else {
        const message =
          dashboardResult.status === "rejected"
            ? dashboardResult.reason instanceof Error
              ? dashboardResult.reason.message
              : "Failed to load dashboard"
            : "Failed to load dashboard";
        setStats({
          totalUsers: 0,
          activeOpportunities: 0,
          applications: 0,
          approvedCreators: 0,
          pendingCreators: 0,
          newUsersThisWeek: 0,
          newOpportunitiesThisWeek: 0,
        });
        setRecentActivity([]);
        setDataBanner({ type: "error", message });
      }

      if (healthResponse) {
        setHealth(healthResponse);
      } else {
        setHealth(null);
        const message =
          healthResult.status === "rejected"
            ? healthResult.reason instanceof Error
              ? healthResult.reason.message
              : "Health check failed"
            : "Health check failed";
        setHealthError(message);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load dashboard";
      setStats({
        totalUsers: 0,
        activeOpportunities: 0,
        applications: 0,
        approvedCreators: 0,
        pendingCreators: 0,
        newUsersThisWeek: 0,
        newOpportunitiesThisWeek: 0,
      });
      setRecentActivity([]);
      setHealth(null);
      setHealthError(null);
      setDataBanner({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const mainStats = [
    {
      icon: Users,
      label: "Total Users",
      value: stats.totalUsers,
      gradient: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
      iconColor: "#ffffff",
    },
    {
      icon: Target,
      label: "Active Opportunities",
      value: stats.activeOpportunities,
      gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
      iconColor: "#ffffff",
    },
    {
      icon: Activity,
      label: "Total Applications",
      value: stats.applications,
      gradient: "linear-gradient(135deg, #ff6600 0%, #ff4500 100%)",
      iconColor: "#ffffff",
    },
    {
      icon: Shield,
      label: "Approved Creators",
      value: stats.approvedCreators,
      gradient: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
      iconColor: "#ffffff",
    },
  ];

  const quickActions = [
    {
      label: "Add User",
      desc: "Create new invitation",
      icon: UserPlus,
      color: "#0071e3",
      bgPattern: "radial-gradient(circle at top right, rgba(0,113,227,0.1) 0%, transparent 50%)",
      action: () => navigate("/users"),
    },
    {
      label: "New Opportunity",
      desc: "Post opportunity",
      icon: Plus,
      color: "#34c759",
      bgPattern: "radial-gradient(circle at top right, rgba(52,199,89,0.1) 0%, transparent 50%)",
      action: () => navigate("/opportunities"),
    },
    {
      label: "Manage Roles",
      desc: "Review users",
      icon: Shield,
      color: "#ff6600",
      bgPattern: "radial-gradient(circle at top right, rgba(255,102,0,0.1) 0%, transparent 50%)",
      action: () => navigate("/users"),
    },
    {
      label: "View Analytics",
      desc: "See insights",
      icon: BarChart3,
      color: "#af52de",
      bgPattern: "radial-gradient(circle at top right, rgba(175,82,222,0.1) 0%, transparent 50%)",
      action: () => navigate("/roadmaps"),
    },
  ];

  const dashboardTabs = [
    { label: "Overview", path: "/" },
    { label: "Opportunities", path: "/opportunities" },
    { label: "Users", path: "/users" },
    { label: "Submissions", path: "/submissions" },
    { label: "AI engine", path: "/engine" },
  ];

  const insightItems = [
    {
      label: "Creator queue",
      value: stats.pendingCreators.toLocaleString(),
      description:
        stats.pendingCreators > 0
          ? "profiles need review"
          : "nothing waiting for review",
      icon: Users,
      tone: "blue",
    },
    {
      label: "Opportunity flow",
      value: stats.newOpportunitiesThisWeek.toLocaleString(),
      description: "new this week",
      icon: Target,
      tone: "green",
    },
    {
      label: "AI signal",
      value: aiUsage ? formatTokens(aiUsage.totals.totalTokens) : "—",
      description: aiUsage ? "tokens in the last 30 days" : "tracking unavailable",
      icon: Lightbulb,
      tone: "orange",
    },
  ] as const;

  const healthMetrics: DashboardMetric[] = useMemo(() => {
    const databaseConnected = health?.checks.database.status === "up";
    const apiReady = health?.status === "ready";
    const aiConfigured =
      (health?.checks.ai.providers.gemini === "configured" ? 1 : 0) +
      (health?.checks.ai.providers.openrouter === "configured" ? 1 : 0);

    return [
      {
        label: "Database",
        value: databaseConnected
          ? `${health?.checks.database.responseTimeMs ?? 0} ms`
          : "Disconnected",
        progress: databaseConnected ? 100 : 0,
        color: databaseConnected ? "#34c759" : "#ef4444",
        icon: CheckCircle2,
      },
      {
        label: "API Readiness",
        value: apiReady ? "Ready" : "Not ready",
        progress: apiReady ? 100 : 0,
        color: apiReady ? "#0071e3" : "#ef4444",
        icon: Award,
      },
      {
        label: "AI Providers",
        value: `${aiConfigured}/2 configured`,
        progress: (aiConfigured / 2) * 100,
        color: "#ff6600",
        icon: Zap,
      },
    ];
  }, [health]);

  const handleExport = useCallback(() => {
    downloadJson(`edutu-dashboard-${new Date().toISOString().slice(0, 10)}.json`, {
      stats,
      recentActivity,
      health,
      exportedAt: new Date().toISOString(),
    });
    setActionBanner({ type: "success", message: "Dashboard export downloaded." });
    setTimeout(() => setActionBanner(null), 3500);
  }, [health, recentActivity, stats]);

  return (
    <div className="dashboard-container">
      <div className="page-header dashboard-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 className="page-title">Dashboard</h1>
            <span className="badge badge-primary" style={{ fontSize: "12px" }}>
              <Zap size={12} style={{ marginRight: "4px" }} />
              Live
            </span>
          </div>
          <p
            style={{
              color: "var(--text-tertiary)",
              margin: "4px 0 0 0",
              fontSize: "15px",
            }}
          >
            Welcome back. Here&apos;s what is happening across the platform.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={18} />
            <span className="btn-label">Export</span>
          </button>
          <button className="btn btn-primary" onClick={() => navigate("/users")}>
            <span className="btn-label">View Reports</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {dataBanner && (
        <div
          className={`dashboard-alert dashboard-alert--${dataBanner.type}`}
          role={dataBanner.type === "error" ? "alert" : "status"}
        >
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{dataBanner.message}</span>
        </div>
      )}

      {healthError && (
        <div className="dashboard-alert dashboard-alert--warning" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            Health telemetry is unavailable: {healthError}
          </span>
          <button
            type="button"
            className="dashboard-alert-action"
            onClick={() => void fetchDashboard()}
            disabled={loading}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {actionBanner && (
        <div
          className="dashboard-alert dashboard-alert--success"
          role="status"
        >
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{actionBanner.message}</span>
        </div>
      )}

      <nav className="dashboard-tabs" aria-label="Dashboard sections">
        {dashboardTabs.map((tab) => (
          <button
            key={tab.path}
            type="button"
            className={`dashboard-tab ${location.pathname === tab.path ? "active" : ""}`}
            aria-current={location.pathname === tab.path ? "page" : undefined}
            onClick={() => navigate(tab.path)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="stats-grid">
        {mainStats.map((stat, index) => (
          <div
            key={index}
            className="card card-hover tooltip dashboard-stat-card"
            title={stat.label}
            style={{
              padding: "24px",
              position: "relative",
              overflow: "hidden",
              background: stat.gradient,
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            }}
          >
            <div
              className="stat-value dashboard-stat-value"
              style={{
                fontSize: "32px",
                marginBottom: "4px",
                color: "#ffffff",
                fontWeight: 700,
                textShadow: "0 1px 2px rgba(0,0,0,0.15)",
              }}
            >
              {loading ? "-" : stat.value.toLocaleString()}
            </div>
            <div className="dashboard-stat-label">
              {stat.label}
            </div>
            <div className="dashboard-stat-icon">
              <stat.icon size={28} strokeWidth={1.5} style={{ color: stat.iconColor }} />
            </div>
          </div>
        ))}
      </div>

      <section className="dashboard-insights" aria-labelledby="dashboard-insights-title">
        <div className="dashboard-insights-heading">
          <div className="dashboard-section-kicker">
            <Lightbulb size={15} aria-hidden="true" />
            Operating cues
          </div>
          <h2 id="dashboard-insights-title">What needs your attention</h2>
          <p>Small signals that help you decide what to do next.</p>
        </div>
        <div className="dashboard-insight-list">
          {insightItems.map((item) => (
            <div key={item.label} className={`dashboard-insight dashboard-insight--${item.tone}`}>
              <span className="dashboard-insight-icon">
                <item.icon size={17} aria-hidden="true" />
              </span>
              <div className="dashboard-insight-copy">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.description}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div>
        <div className="dashboard-section-heading">
          <div>
            <h2>Quick Actions</h2>
            <p>Jump straight into the work that keeps Edutu moving.</p>
          </div>
        </div>
        <div className="grid grid-cols-4 dashboard-actions-grid">
          {quickActions.map((action, index) => (
            <button
              key={index}
              type="button"
              className="card card-hover tooltip dashboard-action-card"
              title={action.label}
              onClick={action.action}
              style={{ background: action.bgPattern }}
            >
              <div className="dashboard-action-icon" style={{ background: action.color, boxShadow: `0 4px 16px ${action.color}40` }}>
                <action.icon size={22} strokeWidth={1.5} />
              </div>
              <div className="dashboard-action-label">
                {action.label}
              </div>
              <div className="dashboard-action-description">
                {action.desc}
              </div>
              <ArrowRight size={18} className="dashboard-action-arrow" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 dashboard-lower-grid">
        <div className="card dashboard-activity-card" style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid var(--border-light)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>Recent Activity</h3>
            <button className="btn btn-pill" style={{ fontSize: "13px" }} onClick={() => navigate("/users")}>
              View All
            </button>
          </div>
          <div style={{ padding: "16px" }}>
            {loading ? (
              <div style={{ padding: "18px 0", color: "var(--text-tertiary)" }}>
                Loading activity...
              </div>
            ) : recentActivity.length === 0 ? (
              <div style={{ padding: "18px 0", color: "var(--text-tertiary)" }}>
                No recent activity yet.
              </div>
            ) : (
              recentActivity.map((activity, idx) => {
                const Icon = getActivityIcon(activity.type);
                return (
                  <div
                    key={activity.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 0",
                      borderBottom:
                        idx < recentActivity.length - 1
                          ? "1px solid var(--border-light)"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "10px",
                        background: "var(--bg-tertiary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--apple-blue)",
                      }}
                    >
                      <Icon size={18} strokeWidth={1.5} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: "14px", marginBottom: "2px" }}>
                        {activity.action}
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
                        {activity.detail}
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                      {formatTimeAgo(activity.timestamp)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="card dashboard-health-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
            <div>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "17px", fontWeight: 600 }}>
                Platform Health
              </h3>
              <p style={{ margin: 0, color: "var(--text-tertiary)", fontSize: "14px" }}>
                {health
                  ? `Last refreshed ${formatTimeAgo(health.timestamp)}`
                  : "Live server telemetry unavailable"}
            </p>
            </div>
            <span
              className={`badge ${health ? (health.status === "ready" ? "badge-success" : "badge-warning") : "badge-danger"}`}
            >
              {health ? (health.status === "ready" ? "Healthy" : "Degraded") : "Unavailable"}
            </span>
          </div>

          <div style={{ marginTop: "20px", marginBottom: "18px", color: "var(--text-secondary)", fontSize: "14px" }}>
            Uptime: {health ? formatUptime(health.uptimeSeconds) : "Unavailable"}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {healthMetrics.map((metric, idx) => (
              <div key={idx}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "8px",
                      background: `${metric.color}15`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: metric.color,
                    }}
                  >
                    <metric.icon size={16} strokeWidth={1.5} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 500, fontSize: "14px" }}>
                        {metric.label}
                      </span>
                      <span style={{ fontWeight: 600, color: metric.color }}>
                        {metric.value}
                      </span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        background: "var(--bg-tertiary)",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${metric.progress}%`,
                          background: metric.color,
                          borderRadius: "3px",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {health && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "20px" }}>
              <span
                className={`badge ${health.checks.ai.providers.gemini === "configured" ? "badge-success" : "badge-danger"}`}
              >
                Gemini: {health.checks.ai.providers.gemini}
              </span>
              <span
                className={`badge ${health.checks.ai.providers.openrouter === "configured" ? "badge-success" : "badge-danger"}`}
              >
                OpenRouter: {health.checks.ai.providers.openrouter}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="card dashboard-ai-card" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-light)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>
              AI Usage
            </h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-tertiary)" }}>
              Tokens and estimated cost, last {aiUsage?.days ?? 30} days
            </p>
          </div>
          {aiUsage && (
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Total tokens</div>
                <div style={{ fontSize: "20px", fontWeight: 700 }}>
                  {formatTokens(aiUsage.totals.totalTokens)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Estimated cost</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#ff6600" }}>
                  {formatUsd(aiUsage.totals.estimatedCostUsd)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Calls</div>
                <div style={{ fontSize: "20px", fontWeight: 700 }}>
                  {aiUsage.totals.calls.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Errors</div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: aiUsage.totals.errorCount > 0 ? "#ef4444" : "var(--text-primary)",
                  }}
                >
                  {aiUsage.totals.errorCount.toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "20px 24px" }}>
          {!aiUsage || (aiUsage.totals.calls === 0 && aiUsage.perDay.length === 0) ? (
            <div style={{ color: "var(--text-tertiary)", fontSize: "14px" }}>
              {aiUsage
                ? "No AI usage recorded in this period yet."
                : "AI usage data unavailable — the tracking endpoint is not deployed yet."}
            </div>
          ) : (
            <>
              <svg
                viewBox="0 0 300 48"
                preserveAspectRatio="none"
                style={{ width: "100%", height: "64px", display: "block" }}
                role="img"
                aria-label="AI token usage per day"
              >
                {(() => {
                  const points = aiUsage.perDay;
                  const max = Math.max(...points.map((p) => p.totalTokens), 1);
                  const barWidth = 300 / Math.max(points.length, 1);
                  return points.map((point, idx) => {
                    const height = Math.max((point.totalTokens / max) * 44, 1);
                    return (
                      <rect
                        key={point.day}
                        x={idx * barWidth + barWidth * 0.15}
                        y={48 - height}
                        width={barWidth * 0.7}
                        height={height}
                        rx={1.5}
                        fill="#0071e3"
                        opacity={0.85}
                      >
                        <title>{`${point.day}: ${formatTokens(point.totalTokens)} tokens, ${formatUsd(point.estimatedCostUsd)} (${point.calls} calls)`}</title>
                      </rect>
                    );
                  });
                })()}
              </svg>
              {aiUsage.perDay.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "var(--text-tertiary)",
                    marginTop: "4px",
                    marginBottom: "16px",
                  }}
                >
                  <span>{aiUsage.perDay[0].day}</span>
                  <span>{aiUsage.perDay[aiUsage.perDay.length - 1].day}</span>
                </div>
              )}

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
                      <th style={{ padding: "8px 12px 8px 0", fontWeight: 500 }}>Route</th>
                      <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "right" }}>Calls</th>
                      <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "right" }}>Tokens</th>
                      <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "right" }}>Est. cost</th>
                      <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "right" }}>Errors</th>
                      <th style={{ padding: "8px 0 8px 12px", fontWeight: 500, textAlign: "right" }}>Avg latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiUsage.perRoute.map((row) => (
                      <tr key={row.route} style={{ borderTop: "1px solid var(--border-light)" }}>
                        <td style={{ padding: "8px 12px 8px 0", fontWeight: 500 }}>{row.route}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{row.calls.toLocaleString()}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{formatTokens(row.totalTokens)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{formatUsd(row.estimatedCostUsd)}</td>
                        <td
                          style={{
                            padding: "8px 12px",
                            textAlign: "right",
                            color: row.errorCount > 0 ? "#ef4444" : "inherit",
                          }}
                        >
                          {row.errorCount}
                        </td>
                        <td style={{ padding: "8px 0 8px 12px", textAlign: "right" }}>
                          {row.avgLatencyMs === null ? "—" : `${row.avgLatencyMs.toLocaleString()} ms`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        .tooltip {
          position: relative;
        }

        .tooltip:hover::after {
          content: attr(title);
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%) translateY(-8px);
          background: var(--bg-primary);
          color: var(--text-primary);
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          opacity: 1;
          pointer-events: none;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          border: 1px solid var(--border-light);
          z-index: 100;
          transition: all 0.2s;
        }

        @media (max-width: 768px) {
          .tooltip:hover::after {
            display: none;
          }

          .dashboard-container {
            gap: 20px;
          }

          .page-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }

          .page-header .btn-label {
            display: none;
          }

          .page-header .btn {
            padding: 8px;
          }

          .grid.grid-cols-4 {
            grid-template-columns: 1fr;
          }

          .grid.grid-cols-2 {
            grid-template-columns: 1fr;
          }
        }

        .dashboard-container {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
