import type { ReactNode } from "react";
import PublicHeader from "./PublicHeader";
import SiteFooter from "./SiteFooter";

interface PublicEditorialShellProps {
  children: ReactNode;
  mainClassName?: string;
  /** Hide the marketing footer on transient screens (redirects, spinners). */
  hideFooter?: boolean;
}

export default function PublicEditorialShell({
  children,
  mainClassName = "max-w-6xl py-6 sm:py-8",
  hideFooter = false,
}: PublicEditorialShellProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface-body text-text-primary">
      <PublicHeader />
      <main className={`mx-auto w-full flex-1 px-4 sm:px-6 lg:px-8 ${mainClassName}`}>
        {children}
      </main>
      {hideFooter ? null : <SiteFooter />}
    </div>
  );
}
