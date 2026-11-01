import { NavLink } from "react-router-dom";
import { ADMIN_NAV_GROUPS, ADMIN_ROUTES } from "../app/route-manifest";
import { useShell } from "./shell-context";

export default function SectionNavigation() {
  const { selectedGroupId, isSectionOpen } = useShell();
  const group = ADMIN_NAV_GROUPS.find((entry) => entry.id === selectedGroupId);
  if (!group || !isSectionOpen) return null;
  const routes = ADMIN_ROUTES.filter(
    (route) =>
      route.navigation === "group" && route.groupId === selectedGroupId,
  );

  return (
    <nav
      className="admin-section-links"
      id={`admin-section-${group.id}`}
      aria-label={`${group.label} navigation`}
    >
      {routes.map((route) => (
        <NavLink
          key={route.id}
          to={route.path}
          end={route.exact}
          className={({ isActive }) =>
            `admin-section-link${isActive ? " is-active" : ""}`
          }
        >
          <route.icon size={16} strokeWidth={1.7} aria-hidden="true" />
          <span>{route.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
