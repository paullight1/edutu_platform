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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { backendFetchJson } from "../lib/backend";
import {
  type AdminDashboardActivity,
  type AdminDashboardResponse,
  type AdminDashboardStats,
} from "../lib/adminApi";

interface HealthStatus {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  uptime: number;
  database: {
    status: "connected" | "disconnected";
    responseTime?: number;
  };
  ai: {
    gemini: "configured" | "missing";
    openrouter: "configured" | "missing";
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
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
  const [loading, setLoading] = useState(true);
  const [dataBanner, setDataBanner] = useState<{ type: string; message: string } | null>(
    null,
  );
  const [actionBanner, setActionBanner] = useState<{ type: string; message: string } | null>(
    null,
  );

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardResult, healthResult] = await Promise.allSettled([
        backendFetchJson<AdminDashboardResponse>("/admin/dashboard"),
        backendFetchJson<HealthStatus>("/health"),
      ]);

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
        setDataBanner((current) =>
          current
            ? {
                ...current,
                message: `${current.message} Health: ${message}`,
              }
            : {
                type: "warning",
                message: `Dashboard loaded, but health check failed: ${message}`,
              },
        );
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

  const healthMetrics: DashboardMetric[] = useMemo(() => {
    const databaseConnected = health?.database.status === "connected";
    const memoryPercent = health
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((health.memory.heapUsed / Math.max(health.memory.heapTotal, 1)) * 100),
          ),
        )
      : 0;
    const aiConfigured =
      (health?.ai.gemini === "configured" ? 1 : 0) +
      (health?.ai.openrouter === "configured" ? 1 : 0);

    return [
      {
        label: "Database",
        value: databaseConnected
          ? `${health?.database.responseTime ?? 0} ms`
          : "Disconnected",
        progress: databaseConnected ? 100 : 0,
        color: databaseConnected ? "#34c759" : "#ef4444",
        icon: CheckCircle2,
      },
      {
        label: "Memory Usage",
        value: `${memoryPercent}%`,
        progress: memoryPercent,
        color: "#0071e3",
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
      <div className="page-header">
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
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
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
          className="card"
          style={{
            padding: "16px 20px",
            border: `1px solid ${
              dataBanner.type === "error"
                ? "#fca5a5"
                : "#fcd34d"
            }`,
            background:
              dataBanner.type === "error" ? "#fef2f2" : "#fffbeb",
            color: "var(--text-primary)",
          }}
        >
          {dataBanner.message}
        </div>
      )}

      {actionBanner && (
        <div
          className="card"
          style={{
            padding: "16px 20px",
            border: "1px solid #86efac",
            background: "#f0fdf4",
            color: "var(--text-primary)",
          }}
        >
          {actionBanner.message}
        </div>
      )}

      <div className="stats-grid">
        {mainStats.map((stat, index) => (
          <div
            key={index}
            className="card card-hover tooltip"
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
              className="stat-value"
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
            <div style={{ fontWeight: 600, color: "#ffffff", marginBottom: "2px", fontSize: "15px" }}>
              {stat.label}
            </div>
            <div style={{ position: "absolute", top: "20px", right: "20px", opacity: 0.95 }}>
              <stat.icon size={28} strokeWidth={1.5} style={{ color: stat.iconColor }} />
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 style={{ marginBottom: "16px", fontSize: "19px", fontWeight: 600 }}>Quick Actions</h3>
        <div className="grid grid-cols-4">
          {quickActions.map((action, index) => (
            <div
              key={index}
              className="card card-hover tooltip"
              title={action.label}
              onClick={action.action}
              style={{
                padding: "24px",
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
                background: action.bgPattern,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "12px",
                  background: action.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  marginBottom: "16px",
                  boxShadow: `0 4px 16px ${action.color}40`,
                }}
              >
                <action.icon size={22} strokeWidth={1.5} />
              </div>
              <div
                style={{
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: "4px",
                  fontSize: "16px",
                }}
              >
                {action.label}
              </div>
              <div style={{ fontSize: "14px", color: "var(--text-tertiary)" }}>
                {action.desc}
              </div>
              <ArrowRight
                size={18}
                style={{
                  position: "absolute",
                  bottom: "24px",
                  right: "24px",
                  color: "var(--text-tertiary)",
                  opacity: 0.5,
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2">
        <div className="card" style={{ overflow: "hidden" }}>
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

        <div className="card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
            <div>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "17px", fontWeight: 600 }}>
                Platform Health
              </h3>
              <p style={{ margin: 0, color: "var(--text-tertiary)", fontSize: "14px" }}>
                {health ? `Last refreshed ${formatTimeAgo(health.timestamp)}` : "Live server telemetry"}
              </p>
            </div>
            {health && (
              <span className={`badge ${health.status === "ok" ? "badge-success" : "badge-warning"}`}>
                {health.status === "ok" ? "Healthy" : "Degraded"}
              </span>
            )}
          </div>

          <div style={{ marginTop: "20px", marginBottom: "18px", color: "var(--text-secondary)", fontSize: "14px" }}>
            Uptime: {health ? formatUptime(health.uptime) : "Unavailable"}
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
                className={`badge ${health.ai.gemini === "configured" ? "badge-success" : "badge-danger"}`}
              >
                Gemini: {health.ai.gemini}
              </span>
              <span
                className={`badge ${health.ai.openrouter === "configured" ? "badge-success" : "badge-danger"}`}
              >
                OpenRouter: {health.ai.openrouter}
              </span>
            </div>
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
