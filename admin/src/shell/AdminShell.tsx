import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { signOutAdmin } from "../lib/auth";
import { supabase } from "../lib/supabase";
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
  const [user, setUser] = useState<ShellUser | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      if (active && currentUser) setUser(toShellUser(currentUser));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ? toShellUser(session.user) : null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOutAdmin();
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
        user={user}
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
        user={user}
        isSigningOut={isSigningOut}
        onSignOut={() => void handleSignOut()}
      />
    </div>
  );
}

export default function AdminShell() {
  return (
    <ShellProvider>
      <AdminShellFrame />
    </ShellProvider>
  );
}
