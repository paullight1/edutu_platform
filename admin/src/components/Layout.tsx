import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { signOutAdmin } from "../lib/auth";
import BackendHealthChip from "./BackendHealthChip";
import { NAV, type NavEntry, groupForPath } from "./nav-items";
import {
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface User {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
}

const Layout = () => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : true;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar");
    return saved ? saved === "collapsed" : false;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const location = useLocation();
  // Manual flyout override, scoped to the path it was made on. While the user
  // stays on that exact path, `group` wins; once they navigate, we fall back to
  // the route's own group so the flyout follows context without an effect.
  const [override, setOverride] = useState<{
    path: string;
    group: string | null;
  }>({ path: "", group: null });
  // Which groups are expanded in the mobile drawer accordion.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const routeGroup = groupForPath(location.pathname);
  const openGroup =
    override.path === location.pathname ? override.group : routeGroup;
  const setFlyout = (group: string | null) =>
    setOverride({ path: location.pathname, group });

  useEffect(() => {
    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser({
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
        });
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email,
          user_metadata: session.user.user_metadata,
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem(
      "sidebar",
      isSidebarCollapsed ? "collapsed" : "expanded",
    );
  }, [isSidebarCollapsed]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    await signOutAdmin();
  };

  const getUserInitials = () => {
    const name = user?.user_metadata?.full_name || user?.email || "A";
    return name.charAt(0).toUpperCase();
  };

  const activeGroup = NAV.find(
    (e) => e.kind === "group" && e.id === openGroup,
  ) as Extract<NavEntry, { kind: "group" }> | undefined;
  const railMode = openGroup !== null;

  const closeAfterNav = () => {
    setIsMobileMenuOpen(false);
    if (window.innerWidth <= 768) setIsSidebarCollapsed(true);
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside
        className={`sidebar ${isSidebarCollapsed || railMode ? "collapsed" : ""} ${railMode ? "rail" : ""} ${isMobileMenuOpen ? "mobile-open" : ""}`}
      >
        {/* Sidebar Header with Logo and Collapse Toggle */}
        <div className="sidebar-header">
          <div className="logo-container">
            <img src="/logo.png" alt="Edutu" style={{ height: 36 }} />
            <span className="logo-text">Edutu</span>
          </div>
          <button
            className="collapse-toggle"
            onClick={toggleSidebar}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? (
              <ChevronRight size={18} />
            ) : (
              <ChevronLeft size={18} />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav" aria-label="Primary">
          {NAV.map((entry) => {
            if (entry.kind === "leaf") {
              return (
                <NavLink
                  key={entry.to}
                  to={entry.to}
                  end={entry.to === "/"}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "active" : ""}`
                  }
                  onClick={() => {
                    setFlyout(null);
                    closeAfterNav();
                  }}
                  title={entry.label}
                >
                  <entry.icon size={18} strokeWidth={1.5} />
                  <span className="nav-label">{entry.label}</span>
                </NavLink>
              );
            }
            const isOpen = openGroup === entry.id;
            const isExpanded = expanded.has(entry.id);
            const groupActive = groupForPath(location.pathname) === entry.id;
            return (
              <div key={entry.id} className="nav-group">
                <button
                  type="button"
                  className={`nav-link nav-parent ${isOpen || groupActive ? "active-parent" : ""}`}
                  title={entry.label}
                  aria-expanded={isOpen || isExpanded}
                  onClick={() => {
                    if (window.innerWidth <= 768) {
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(entry.id)) next.delete(entry.id);
                        else next.add(entry.id);
                        return next;
                      });
                    } else {
                      setFlyout(openGroup === entry.id ? null : entry.id);
                    }
                  }}
                >
                  <entry.icon size={18} strokeWidth={1.5} />
                  <span className="nav-label">{entry.label}</span>
                  <ChevronRight size={15} className="nav-caret" />
                </button>
                {/* Mobile accordion children */}
                {isExpanded && (
                  <div className="nav-accordion">
                    {entry.children.map((c) => (
                      <NavLink
                        key={c.to}
                        to={c.to}
                        end={c.to === "/engine" || c.to === "/monetization"}
                        className={({ isActive }) =>
                          `nav-link nav-child ${isActive ? "active" : ""}`
                        }
                        onClick={closeAfterNav}
                      >
                        {c.icon ? (
                          <c.icon size={16} strokeWidth={1.5} />
                        ) : (
                          <span className="nav-dot" />
                        )}
                        <span className="nav-label">{c.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom Section - Profile & Sign Out */}
        <div className="sidebar-bottom">
          {/* Backend health indicator */}
          <BackendHealthChip />

          {/* User Profile */}
          <NavLink
            to="/profile"
            className="nav-link profile-link"
            onClick={() => setIsMobileMenuOpen(false)}
            title="My Profile"
          >
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt={user.user_metadata.full_name || "User"}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--apple-blue)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                  fontSize: "13px",
                  color: "white",
                  flexShrink: 0,
                }}
              >
                {getUserInitials()}
              </div>
            )}
            <div className="profile-info">
              <span className="profile-name">
                {user?.user_metadata?.full_name || "Admin"}
              </span>
              <span className="profile-email">
                {user?.email?.split("@")[0] || "Admin"}
              </span>
            </div>
          </NavLink>

          {/* Theme toggle (moved off the top header into the sidebar) */}
          <button
            className="nav-link"
            onClick={toggleTheme}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDark ? (
              <Sun size={18} strokeWidth={1.5} />
            ) : (
              <Moon size={18} strokeWidth={1.5} />
            )}
            <span className="nav-label">{isDark ? "Light Mode" : "Dark Mode"}</span>
          </button>

          {/* Sign Out */}
          <button
            className="nav-link sign-out-link"
            onClick={handleSignOut}
            disabled={isSigningOut}
            title="Sign Out"
          >
            <LogOut size={18} strokeWidth={1.5} />
            <span className="nav-label">
              {isSigningOut ? "Signing out..." : "Sign Out"}
            </span>
          </button>
        </div>
      </aside>

      {/* Desktop flyout — children of the open group, flush to the icon rail */}
      {railMode && activeGroup && (
        <div className="nav-flyout" role="menu" aria-label={activeGroup.label}>
          <div className="nav-flyout-head">
            <button
              type="button"
              className="nav-flyout-back"
              onClick={() => setFlyout(null)}
              title="Close section"
            >
              <ChevronLeft size={16} />
            </button>
            <span>{activeGroup.label}</span>
          </div>
          <div className="nav-flyout-list">
            {activeGroup.children.map((c) => (
              <NavLink
                key={c.to}
                to={c.to}
                end={c.to === "/engine" || c.to === "/monetization"}
                className={({ isActive }) =>
                  `nav-flyout-link ${isActive ? "active" : ""}`
                }
                onClick={closeAfterNav}
              >
                {c.icon ? (
                  <c.icon size={16} strokeWidth={1.5} />
                ) : (
                  <span className="nav-dot" />
                )}
                <span>{c.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Main Content — no top header; content gets the full height */}
      <div className="main-content">
        {/* Floating menu button (mobile only) since the top header is removed */}
        <button
          className="mobile-menu-btn floating"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <main className="page-content animate-fade-in">
          <Outlet />
        </main>
      </div>

      <style>{`
        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .header-logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .header-logo img {
          height: 32px;
          object-fit: contain;
        }

        .header-logo .logo-text {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.5px;
          text-transform: lowercase;
        }

        .mobile-menu-btn {
          display: none;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border: 1px solid var(--border-light);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          border-radius: 10px;
          cursor: pointer;
        }

        .mobile-menu-btn.floating {
          position: fixed;
          top: 12px;
          left: 12px;
          z-index: 45;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
        }

        /* Sidebar Styles */
        .sidebar {
          width: 260px;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-light);
          display: flex;
          flex-direction: column;
          padding: 0;
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: fixed;
          top: 0;
          left: 0;
          height: 100vh;
          z-index: 50;
          overflow: hidden;
        }

        .sidebar.collapsed {
          width: 72px;
        }

        /* Sidebar Header */
        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 12px;
          border-bottom: 1px solid var(--border-light);
          min-height: 64px;
        }

        .logo-container {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          overflow: hidden;
        }

        .logo-container img {
          height: 36px;
          object-fit: contain;
          flex-shrink: 0;
          transition: opacity 0.2s;
        }

        .sidebar.collapsed .logo-container img {
          opacity: 0;
          width: 0;
        }

        .logo-text {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.5px;
          white-space: nowrap;
          transition: opacity 0.2s;
        }

        .sidebar.collapsed .logo-text {
          opacity: 0;
          width: 0;
          display: none;
        }

        .collapse-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .collapse-toggle:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .sidebar.collapsed .collapse-toggle {
          margin: 0 auto;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          padding: 16px 12px;
          overflow-y: auto;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          color: var(--text-secondary);
          text-decoration: none;
          transition: all 0.2s;
          font-size: 14px;
          font-weight: 500;
          border: none;
          background: none;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
        }

        .nav-link:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .nav-link.active {
          background: var(--apple-blue);
          color: white;
        }

        .nav-link svg {
          flex-shrink: 0;
        }

        .nav-label {
          opacity: 1;
          transition: opacity 0.2s;
        }

        .sidebar.collapsed .nav-label {
          opacity: 0;
          width: 0;
        }

        /* Bottom Section */
        .sidebar-bottom {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding-top: 16px;
          border-top: 1px solid var(--border-light);
          margin-top: auto;
        }

        .profile-link {
          position: relative;
        }

        .profile-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }

        .profile-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .profile-email {
          font-size: 11px;
          color: var(--text-tertiary);
        }

        .sidebar.collapsed .profile-info,
        .sidebar.collapsed .profile-name,
        .sidebar.collapsed .profile-email {
          opacity: 0;
          width: 0;
          display: none;
        }

        .sign-out-link {
          color: var(--danger);
        }

        .sign-out-link:hover {
          background: rgba(255, 59, 48, 0.1);
        }

        /* Main Content */
        .main-content {
          margin-left: 260px;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .sidebar.collapsed ~ .main-content {
          margin-left: 72px;
        }

        .header {
          height: 64px;
          padding: 0 24px;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-light);
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 40;
        }

        .page-content {
          flex: 1;
          padding: 24px;
        }

        /* Custom Tooltip for Sidebar */
        .sidebar.collapsed .nav-link {
          position: relative;
        }

        .sidebar.collapsed .nav-link:hover::after {
          content: attr(title);
          position: absolute;
          left: 100%;
          top: 50%;
          transform: translateY(-50%) translateX(8px);
          background: var(--bg-primary);
          color: var(--text-primary);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          opacity: 1;
          pointer-events: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          border: 1px solid var(--border-light);
          z-index: 100;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .sidebar {
            transform: translateX(-100%);
            width: 280px; /* Slightly wider side panel */
            box-shadow: 20px 0 50px rgba(0,0,0,0.1);
          }

          [data-theme="dark"] .sidebar {
            box-shadow: 20px 0 50px rgba(0,0,0,0.5);
          }

          .sidebar.mobile-open {
            transform: translateX(0);
          }

          .main-content {
            margin-left: 0;
          }

          .sidebar.collapsed ~ .main-content {
            margin-left: 0;
          }

          .mobile-menu-btn {
            display: flex !important;
          }

          .sidebar-toggle {
            display: none !important;
          }

          /* Clear space for the floating menu button now that there's no header. */
          .page-content {
            padding-top: 64px;
          }
        }

        /* Hide logo text on very small screens */
        @media (max-width: 480px) {
          .logo-text {
            display: none;
          }
        }

        /* ─── Nested nav ─── */
        .nav-group {
          display: flex;
          flex-direction: column;
        }

        .nav-parent {
          width: 100%;
          justify-content: flex-start;
        }

        .nav-parent .nav-caret {
          margin-left: auto;
          opacity: 0.55;
          transition: transform 0.2s, opacity 0.2s;
        }

        .sidebar.collapsed .nav-parent .nav-caret {
          opacity: 0;
          width: 0;
        }

        .nav-parent.active-parent {
          color: var(--text-primary);
          background: var(--bg-tertiary);
        }

        .nav-parent.active-parent .nav-caret {
          transform: rotate(90deg);
          opacity: 0.9;
        }

        .nav-accordion {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin: 2px 0 4px 0;
        }

        .nav-child {
          padding-left: 34px;
          font-size: 13px;
        }

        .nav-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-tertiary);
          flex-shrink: 0;
          margin: 0 5px;
        }

        /* Desktop flyout sitting flush to the 72px rail */
        .nav-flyout {
          position: fixed;
          top: 0;
          left: 72px;
          height: 100vh;
          width: 220px;
          z-index: 49;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-light);
          box-shadow: 8px 0 24px rgba(0, 0, 0, 0.06);
          display: flex;
          flex-direction: column;
          padding: 12px;
          animation: flyoutIn 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        }

        [data-theme="dark"] .nav-flyout {
          box-shadow: 8px 0 24px rgba(0, 0, 0, 0.4);
        }

        @keyframes flyoutIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .nav-flyout-head {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 8px 12px;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-tertiary);
          border-bottom: 1px solid var(--border-light);
          margin-bottom: 8px;
        }

        .nav-flyout-back {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          border-radius: 8px;
          cursor: pointer;
        }

        .nav-flyout-back:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .nav-flyout-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          overflow-y: auto;
        }

        .nav-flyout-link {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-radius: 10px;
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
          animation: flyoutChild 0.28s both;
        }

        .nav-flyout-link:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .nav-flyout-link.active {
          background: var(--apple-blue);
          color: #fff;
        }

        .nav-flyout-link:nth-child(1) { animation-delay: 0.02s; }
        .nav-flyout-link:nth-child(2) { animation-delay: 0.05s; }
        .nav-flyout-link:nth-child(3) { animation-delay: 0.08s; }
        .nav-flyout-link:nth-child(4) { animation-delay: 0.11s; }
        .nav-flyout-link:nth-child(5) { animation-delay: 0.14s; }
        .nav-flyout-link:nth-child(6) { animation-delay: 0.17s; }

        @keyframes flyoutChild {
          from {
            opacity: 0;
            transform: translateX(-6px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        /* When the flyout is open, push main content past rail + flyout */
        .sidebar.rail ~ .main-content {
          margin-left: 292px;
        }

        @media (max-width: 768px) {
          /* On mobile there is no rail/flyout — the drawer stays full width
             and groups expand inline as an accordion. */
          .nav-flyout {
            display: none;
          }
          .sidebar.rail ~ .main-content,
          .sidebar.collapsed ~ .main-content {
            margin-left: 0;
          }
          /* The open drawer is always full width with labels, even when the
             route forces `collapsed`/`rail` — otherwise the accordion is
             unusable in a 72px strip. */
          .sidebar.mobile-open,
          .sidebar.rail,
          .sidebar.collapsed.mobile-open {
            width: 280px;
          }
          .sidebar.mobile-open .nav-label,
          .sidebar.rail .nav-label {
            opacity: 1;
            width: auto;
          }
          .sidebar.mobile-open .nav-parent .nav-caret {
            opacity: 0.55;
            width: auto;
          }
        }
      `}</style>
    </div>
  );
};

export default Layout;
