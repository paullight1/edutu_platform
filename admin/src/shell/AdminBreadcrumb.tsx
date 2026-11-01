import { ChevronRight } from "lucide-react";
import { useLocation } from "react-router-dom";
import { ADMIN_NAV_GROUPS, routeForPath } from "../app/route-manifest";

export default function AdminBreadcrumb() {
  const { pathname } = useLocation();
  const route = routeForPath(pathname);
  const group = ADMIN_NAV_GROUPS.find((entry) => entry.id === route?.groupId);

  return (
    <nav
      className="admin-breadcrumb admin-breadcrumb-row"
      aria-label="Breadcrumb"
    >
      {group && (
        <>
          <span className="admin-breadcrumb-group">{group.label}</span>
          <ChevronRight size={13} aria-hidden="true" />
        </>
      )}
      <span aria-current="page">
        {(group ? route?.label : route?.title) || "Admin console"}
      </span>
    </nav>
  );
}
