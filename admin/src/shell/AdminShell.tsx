import { useMemo, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAdminAuth } from "../auth/admin-auth-context";
import { EngineRunProvider } from "../features/engine/state/EngineRunProvider";
import AdminTopbar from "./AdminTopbar";
import MobileNavigation from "./MobileNavigation";
import PrimaryRail from "./PrimaryRail";
import SectionNavigation from "./SectionNavigation";
import { ShellProvider } from "./ShellContext";
import { useShell } from "./shell-context";
import type { ShellUser } from "./types";
import "./shell.css";

function toShellUser(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): ShellUser {
  return {
    id: user.id,
    email: user.email,
    user_metadata: {
      full_name:
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : undefined,
      avatar_url:
        typeof user.user_metadata?.avatar_url === "string"
          ? user.user_metadata.avatar_url
          : undefined,
    },
  };
}

function AdminShellFrame() {
  const { isSectionOpen, isMobileNavigationOpen } = useShell();
  const { user, signOut } = useAdminAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const shellUser = useMemo(() => (user ? toShellUser(user) : null), [user]);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div
      className="admin-shell"
      data-testid="admin-shell"
      data-section-open={isSectionOpen ? "true" : "false"}
      data-mobile-open={isMobileNavigationOpen ? "true" : "false"}
    >
      <PrimaryRail
        user={shellUser}
        isSigningOut={isSigningOut}
        onSignOut={() => void handleSignOut()}
      />
      <SectionNavigation />

      <div className="admin-shell-workspace">
        <AdminTopbar navigationTriggerRef={navigationTriggerRef} />
        <main className="admin-shell-content" id="admin-main-content">
          <Outlet />
        </main>
      </div>

      <MobileNavigation
        navigationTriggerRef={navigationTriggerRef}
        user={shellUser}
        isSigningOut={isSigningOut}
        onSignOut={() => void handleSignOut()}
      />
    </div>
  );
}

export default function AdminShell() {
  return (
    <ShellProvider>
      <EngineRunProvider probeOnMount={import.meta.env.MODE !== "test"}>
        <AdminShellFrame />
      </EngineRunProvider>
    </ShellProvider>
  );
}
