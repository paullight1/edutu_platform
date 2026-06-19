import type { ReactNode } from "react";
import PublicHeader from "./PublicHeader";

interface PublicEditorialShellProps {
  children: ReactNode;
  mainClassName?: string;
}

export default function PublicEditorialShell({
  children,
  mainClassName = "max-w-6xl py-6 sm:py-8",
}: PublicEditorialShellProps) {
  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-950 dark:bg-gray-950 dark:text-white">
      <PublicHeader />
      <main className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${mainClassName}`}>
        {children}
      </main>
    </div>
  );
}
