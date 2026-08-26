import { ChevronDown, LogOut, Moon, Sun, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { NavLink } from "react-router-dom";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_ROUTES,
  getAdminRoute,
  type AdminNavGroupId,
} from "../app/route-manifest";
import BackendHealthChip from "../components/BackendHealthChip";
import { useShell } from "./shell-context";
import type { ShellUser } from "./types";

interface MobileNavigationProps {
  navigationTriggerRef: RefObject<HTMLButtonElement | null>;
  user: ShellUser | null;
  isSigningOut: boolean;
  onSignOut(): void;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function userName(user: ShellUser | null): string {
  return user?.user_metadata?.full_name || user?.email || "Admin";
}

export default function MobileNavigation({
  navigationTriggerRef,
  user,
  isSigningOut,
  onSignOut,
}: MobileNavigationProps) {
  const {
    isDark,
    toggleTheme,
    routeGroupId,
    isMobileNavigationOpen,
    closeMobileNavigation,
  } = useShell();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<AdminNavGroupId>>(
    () => new Set(routeGroupId ? [routeGroupId] : []),
  );

  const closeAndRestore = useCallback(() => {
    navigationTriggerRef.current?.focus();
    closeMobileNavigation();
  }, [closeMobileNavigation, navigationTriggerRef]);

  useEffect(() => {
    if (!isMobileNavigationOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndRestore();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          [],
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAndRestore, isMobileNavigationOpen]);

  if (!isMobileNavigationOpen) return null;

  const dashboard = getAdminRoute("dashboard");
  const settings = getAdminRoute("settings");
  const profile = getAdminRoute("profile");

  const toggleGroup = (groupId: AdminNavGroupId) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <div className="admin-mobile-layer">
      <button
        type="button"
        className="admin-mobile-scrim"
        aria-label="Close admin navigation"
        onClick={closeAndRestore}
      />
      <div
        id="admin-mobile-navigation"
        ref={dialogRef}
        className="admin-mobile-navigation"
        role="dialog"
        aria-modal="true"
        aria-label="Admin navigation"
      >
        <header className="admin-mobile-navigation-header">
          <div className="admin-mobile-navigation-brand">
            <img src="/logo.png" alt="" aria-hidden="true" />
            <div>
              <strong>Edutu Admin</strong>
              <span>{userName(user)}</span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="admin-mobile-close"
            aria-label="Close admin navigation"
            onClick={closeAndRestore}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <nav
          className="admin-mobile-navigation-content"
          aria-label="Mobile admin navigation"
        >
          <NavLink
            to={dashboard.path}
            end
            className={({ isActive }) =>
              `admin-mobile-link${isActive ? " is-active" : ""}`
            }
            onClick={closeAndRestore}
          >
            <dashboard.icon size={19} aria-hidden="true" />
            <span>{dashboard.label}</span>
          </NavLink>

          {ADMIN_NAV_GROUPS.map((group) => {
            const isExpanded = expandedGroups.has(group.id);
            const routes = ADMIN_ROUTES.filter(
              (route) =>
                route.navigation === "group" && route.groupId === group.id,
            );

            return (
              <section key={group.id} className="admin-mobile-group">
                <button
                  type="button"
                  className="admin-mobile-group-toggle"
                  aria-expanded={isExpanded}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span>
                    <group.icon size={19} aria-hidden="true" />
                    {group.label}
                  </span>
                  <ChevronDown
                    size={18}
                    className={isExpanded ? "is-expanded" : ""}
                    aria-hidden="true"
                  />
                </button>
                {isExpanded ? (
                  <div className="admin-mobile-group-links">
                    {routes.map((route) => (
                      <NavLink
                        key={route.id}
                        to={route.path}
                        end={route.exact}
                        className={({ isActive }) =>
                          `admin-mobile-link admin-mobile-link--child${
                            isActive ? " is-active" : ""
                          }`
                        }
                        onClick={closeAndRestore}
                      >
                        <route.icon size={17} aria-hidden="true" />
                        <span>{route.label}</span>
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}

          <NavLink
            to={settings.path}
            end
            className={({ isActive }) =>
              `admin-mobile-link${isActive ? " is-active" : ""}`
            }
            onClick={closeAndRestore}
          >
            <settings.icon size={19} aria-hidden="true" />
            <span>{settings.label}</span>
          </NavLink>
        </nav>

        <footer className="admin-mobile-navigation-footer">
          <BackendHealthChip />
          <NavLink
            to={profile.path}
            end
            className={({ isActive }) =>
              `admin-mobile-utility${isActive ? " is-active" : ""}`
            }
            onClick={closeAndRestore}
          >
            <profile.icon size={19} aria-hidden="true" />
            <span>My Profile</span>
          </NavLink>
          <button
            type="button"
            className="admin-mobile-utility"
            onClick={toggleTheme}
          >
            {isDark ? (
              <Sun size={19} aria-hidden="true" />
            ) : (
              <Moon size={19} aria-hidden="true" />
            )}
            <span>{isDark ? "Light mode" : "Dark mode"}</span>
          </button>
          <button
            type="button"
            className="admin-mobile-utility admin-mobile-utility--danger"
            disabled={isSigningOut}
            onClick={onSignOut}
          >
            <LogOut size={19} aria-hidden="true" />
            <span>{isSigningOut ? "Signing out…" : "Sign Out"}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
