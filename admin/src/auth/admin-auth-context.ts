import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export interface AdminAuthState {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
}

export interface AdminAuthContextValue extends AdminAuthState {
  signOut(): Promise<void>;
}

export const AdminAuthContext =
  createContext<AdminAuthContextValue | null>(null);

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  }
  return context;
}
