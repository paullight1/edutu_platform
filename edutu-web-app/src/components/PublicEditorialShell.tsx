import type { ReactNode } from "react";
import { Link } from "react-router-dom";

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
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-gray-950/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to="/dashboard"
            className="text-lg font-black tracking-tight text-slate-950 dark:text-white"
          >
            Edutu
          </Link>
          <nav
            className="flex items-center gap-1 text-sm font-bold text-slate-600 dark:text-slate-300"
            aria-label="Primary navigation"
          >
            <Link
              className="rounded-xl px-3 py-2 transition hover:bg-slate-100 dark:hover:bg-white/10"
              to="/opportunities"
            >
              Opportunities
            </Link>
            <Link
              className="rounded-xl px-3 py-2 transition hover:bg-slate-100 dark:hover:bg-white/10"
              to="/events"
            >
              Events
            </Link>
            <Link
              className="rounded-xl px-3 py-2 transition hover:bg-slate-100 dark:hover:bg-white/10"
              to="/auth?mode=sign-in"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${mainClassName}`}>
        {children}
      </main>
    </div>
  );
}
