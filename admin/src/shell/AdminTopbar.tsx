import { Menu, Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { routeForPath } from "../app/route-manifest";
import { useShell } from "./ShellContext";
import type { RefObject } from "react";

interface AdminTopbarProps {
  navigationTriggerRef: RefObject<HTMLButtonElement | null>;
}

export default function AdminTopbar({
  navigationTriggerRef,
}: AdminTopbarProps) {
  const location = useLocation();
  const { isDark, toggleTheme, openMobileNavigation } = useShell();
  const route = routeForPath(location.pathname);

  return (
    <header className="admin-topbar">
      <button
        ref={navigationTriggerRef}
        type="button"
        className="admin-topbar-control"
        aria-label="Open admin navigation"
        aria-controls="admin-mobile-navigation"
        onClick={openMobileNavigation}
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <div className="admin-topbar-brand">
        <img src="/logo.png" alt="" aria-hidden="true" />
        <div>
          <span>Edutu Admin</span>
          <strong>{route?.title || "Admin console"}</strong>
        </div>
      </div>

      <button
        type="button"
        className="admin-topbar-control"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={toggleTheme}
      >
        {isDark ? (
          <Sun size={20} aria-hidden="true" />
        ) : (
          <Moon size={20} aria-hidden="true" />
        )}
      </button>
    </header>
  );
}
