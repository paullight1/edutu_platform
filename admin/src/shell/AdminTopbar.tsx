import { Menu } from "lucide-react";
import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { useShell } from "./shell-context";

interface AdminTopbarProps {
  navigationTriggerRef: RefObject<HTMLButtonElement | null>;
}

export default function AdminTopbar({
  navigationTriggerRef,
}: AdminTopbarProps) {
  const { openMobileNavigation, isMobileNavigationOpen } = useShell();

  return (
    <header className="admin-topbar">
      <button
        ref={navigationTriggerRef}
        type="button"
        className="admin-topbar-control admin-mobile-trigger"
        aria-label="Open admin navigation"
        aria-controls="admin-mobile-navigation"
        aria-expanded={isMobileNavigationOpen}
        onClick={openMobileNavigation}
      >
        <Menu size={20} aria-hidden="true" />
      </button>
      <Link to="/" className="admin-topbar-brand" aria-label="Edutu Admin home">
        <img src="/logo.png" alt="" aria-hidden="true" />
        <span>Edutu Admin</span>
      </Link>
    </header>
  );
}
