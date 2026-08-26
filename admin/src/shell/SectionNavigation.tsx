import { ChevronLeft } from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_ROUTES,
} from "../app/route-manifest";
import { useShell } from "./shell-context";

export default function SectionNavigation() {
  const { selectedGroupId, isSectionOpen, collapseSection } = useShell();
  if (!selectedGroupId || !isSectionOpen) return null;

  const group = ADMIN_NAV_GROUPS.find((entry) => entry.id === selectedGroupId);
  if (!group) return null;

  const routes = ADMIN_ROUTES.filter(
    (route) =>
      route.navigation === "group" && route.groupId === selectedGroupId,
  );

  return (
    <aside className="admin-section-panel">
      <nav
        className="admin-section-navigation"
        aria-label={`${group.label} navigation`}
      >
        <header className="admin-section-header">
          <div className="admin-section-heading">
            <span className="admin-section-icon" aria-hidden="true">
              <group.icon size={18} strokeWidth={1.8} />
            </span>
            <div>
              <span className="admin-section-eyebrow">Section</span>
              <strong>{group.label}</strong>
            </div>
          </div>
          <button
            type="button"
            className="admin-section-collapse"
            aria-label={`Close ${group.label} navigation`}
            onClick={collapseSection}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="admin-section-links">
          {routes.map((route) => (
            <NavLink
              key={route.id}
              to={route.path}
              end={route.exact}
              className={({ isActive }) =>
                `admin-section-link${isActive ? " is-active" : ""}`
              }
            >
              <route.icon size={18} strokeWidth={1.7} aria-hidden="true" />
              <span>{route.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </aside>
  );
}
