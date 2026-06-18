import { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  LayoutDashboard,
  Target,
  Users,
  Settings,
  LogOut,
  ShieldCheck,
  BookOpen,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  FileText,
  Smartphone,
  DollarSign,
  Bell,
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar");
    return saved ? saved === "collapsed" : false;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

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
    localStorage.setItem(
      "sidebar",
      isSidebarCollapsed ? "collapsed" : "expanded",
    );
  }, [isSidebarCollapsed]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const getUserInitials = () => {
    const name = user?.user_metadata?.full_name || user?.email || "A";
    return name.charAt(0).toUpperCase();
  };

  const navItems = [
    { to: "/admin", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/admin/opportunities", icon: Target, label: "Opportunities" },
    { to: "/admin/users", icon: Users, label: "Users" },
    { to: "/admin/payments", icon: DollarSign, label: "Payments" },
    { to: "/admin/notifications", icon: Bell, label: "Notifications" },
    { to: "/admin/creators", icon: ShieldCheck, label: "Creators" },
    { to: "/admin/roadmaps", icon: BookOpen, label: "Roadmaps" },
    { to: "/admin/blog", icon: FileText, label: "Blog" },
    { to: "/admin/mobile-control", icon: Smartphone, label: "Mobile Control" },
    { to: "/admin/edutu-engine", icon: Settings, label: "Edutu Engine" },
  ];

  return (
    <div className="admin-shell admin-light app-container">
      {/* Sidebar */}
      <aside
        className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""} ${isMobileMenuOpen ? "mobile-open" : ""}`}
      >
        {/* Sidebar Header with Logo and Collapse Toggle */}
        <div className="sidebar-header">
          <div className="logo-container">
            <img src="/edutu-logo.png" alt="Edutu" style={{ height: 36 }} />
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
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
              onClick={() => {
                setIsMobileMenuOpen(false);
                if (window.innerWidth <= 768) setIsSidebarCollapsed(true);
              }}
              title={item.label}
            >
              <item.icon size={18} strokeWidth={1.5} />
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom Section - Profile & Sign Out */}
        <div className="sidebar-bottom">
          {/* User Profile */}
          <NavLink
            to="/admin/profile"
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

          {/* Sign Out */}
          <button
            className="nav-link sign-out-link"
            onClick={handleSignOut}
            title="Sign Out"
          >
            <LogOut size={18} strokeWidth={1.5} />
            <span className="nav-label">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-content">
        <header className="header">
          <div className="header-left">
            {/* Mobile Menu Button */}
            <button
              className="mobile-menu-btn"
              onClick={() => {
                setIsSidebarCollapsed(false);
                setIsMobileMenuOpen((open) => !open);
              }}
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* Logo */}
            <div className="header-logo">
              <img src="/edutu-logo.png" alt="Edutu" />
              <span className="logo-text">edutu</span>
            </div>
          </div>
        </header>

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
          width: 36px;
          height: 36px;
          border: none;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          border-radius: 8px;
          cursor: pointer;
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

          .admin-shell.admin-dark .sidebar {
            box-shadow: 20px 0 50px rgba(0,0,0,0.5);
          }

          .sidebar.mobile-open {
            transform: translateX(0);
            width: 280px;
          }

          .sidebar.mobile-open .logo-container img,
          .sidebar.mobile-open .logo-text,
          .sidebar.mobile-open .nav-label,
          .sidebar.mobile-open .profile-info,
          .sidebar.mobile-open .profile-name,
          .sidebar.mobile-open .profile-email {
            opacity: 1;
            width: auto;
            display: initial;
          }

          .sidebar.mobile-open .profile-info {
            display: flex;
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
          
          .header {
            padding: 0 16px;
          }
        }

        /* Hide logo text on very small screens */
        @media (max-width: 480px) {
          .logo-text {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};

export default Layout;
