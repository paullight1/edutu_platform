import { LogOut, Moon, Sun } from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  ADMIN_NAV_GROUPS,
  getAdminRoute,
} from "../app/route-manifest";
import BackendHealthChip from "../components/BackendHealthChip";
import { useShell } from "./ShellContext";
import type { ShellUser } from "./types";

interface PrimaryRailProps {
  user: ShellUser | null;
  isSigningOut: boolean;
  onSignOut(): void;
}

function userInitial(user: ShellUser | null): string {
  const value = user?.user_metadata?.full_name || user?.email || "A";
  return value.trim().charAt(0).toUpperCase() || "A";
}

export default function PrimaryRail({
  user,
  isSigningOut,
  onSignOut,
}: PrimaryRailProps) {
  const {
    isDark,
    toggleTheme,
    routeGroupId,
    selectedGroupId,
    isSectionOpen,
    toggleSection,
  } = useShell();
  const dashboard = getAdminRoute("dashboard");
  const settings = getAdminRoute("settings");
  const profile = getAdminRoute("profile");

  return (
    <aside className="admin-primary-rail">
      <nav
        className="admin-primary-navigation"
        aria-label="Primary admin navigation"
      >
        <NavLink
          to={dashboard.path}
          end
          className="admin-rail-brand"
          aria-label="Edutu admin home"
          data-tooltip="Edutu admin"
        >
          <img src="/logo.png" alt="" aria-hidden="true" />
        </NavLink>

        <div className="admin-rail-destinations">
          <NavLink
            to={dashboard.path}
            end
            aria-label={dashboard.label}
            data-tooltip={dashboard.label}
            className={({ isActive }) =>
              `admin-rail-control${isActive ? " is-active" : ""}`
            }
          >
            <dashboard.icon size={20} strokeWidth={1.7} aria-hidden="true" />
            <span className="admin-visually-hidden">{dashboard.label}</span>
          </NavLink>

          {ADMIN_NAV_GROUPS.map((group) => {
            const isExpanded =
              isSectionOpen && selectedGroupId === group.id;
            const isActive = routeGroupId === group.id;

            return (
              <button
                key={group.id}
                type="button"
                className={`admin-rail-control${
                  isExpanded || isActive ? " is-active" : ""
                }`}
                aria-label={`${group.label} section`}
                aria-expanded={isExpanded}
                data-tooltip={group.label}
                onClick={() => toggleSection(group.id)}
              >
                <group.icon size={20} strokeWidth={1.7} aria-hidden="true" />
                <span className="admin-visually-hidden">{group.label}</span>
              </button>
            );
          })}

          <NavLink
            to={settings.path}
            end
            aria-label={settings.label}
            data-tooltip={settings.label}
            className={({ isActive }) =>
              `admin-rail-control${isActive ? " is-active" : ""}`
            }
          >
            <settings.icon size={20} strokeWidth={1.7} aria-hidden="true" />
            <span className="admin-visually-hidden">{settings.label}</span>
          </NavLink>
        </div>

        <div className="admin-rail-utilities">
          <BackendHealthChip />

          <NavLink
            to={profile.path}
            end
            aria-label="My Profile"
            data-tooltip={
              user?.user_metadata?.full_name || user?.email || "My Profile"
            }
            className={({ isActive }) =>
              `admin-rail-control admin-profile-control${
                isActive ? " is-active" : ""
              }`
            }
          >
            {user?.user_metadata?.avatar_url ? (
              <img
                className="admin-rail-avatar"
                src={user.user_metadata.avatar_url}
                alt=""
                aria-hidden="true"
              />
            ) : (
              <span className="admin-rail-avatar admin-rail-avatar--initial">
                {userInitial(user)}
              </span>
            )}
            <span className="admin-visually-hidden">My Profile</span>
          </NavLink>

          <button
            type="button"
            className="admin-rail-control"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            data-tooltip={isDark ? "Light mode" : "Dark mode"}
            onClick={toggleTheme}
          >
            {isDark ? (
              <Sun size={20} strokeWidth={1.7} aria-hidden="true" />
            ) : (
              <Moon size={20} strokeWidth={1.7} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            className="admin-rail-control admin-rail-control--danger"
            aria-label="Sign Out"
            data-tooltip={isSigningOut ? "Signing out…" : "Sign out"}
            disabled={isSigningOut}
            onClick={onSignOut}
          >
            <LogOut size={20} strokeWidth={1.7} aria-hidden="true" />
            <span className="admin-visually-hidden">
              {isSigningOut ? "Signing out" : "Sign Out"}
            </span>
          </button>
        </div>
      </nav>
    </aside>
  );
}
