import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Menu, UserRound, X } from "lucide-react";
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";

interface PublicHeaderProps {
  fixed?: boolean;
  onPrimaryAction?: () => void;
}

type NavItem = {
  label: string;
  to: string;
  external?: boolean;
};

const docsUrl = import.meta.env.VITE_DOCS_URL || "https://docs.edutu.org";

const coreNavItems: NavItem[] = [
  { label: "Opportunities", to: "/opportunities" },
  { label: "Developers", to: "/developers" },
  { label: "Mentors", to: "/mentor" },
  { label: "Blog", to: "/blog" },
];

const moreNavItems: NavItem[] = [
  { label: "Scholarship Engine", to: "/scholarship-engine" },
  { label: "Docs", to: docsUrl, external: true },
  { label: "About", to: "/about" },
  { label: "Events", to: "/events" },
];

export default function PublicHeader({
  fixed = false,
  onPrimaryAction,
}: PublicHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isSignedIn } = useClerkAuth();
  const { user } = useUser();
  const actionLabel = isSignedIn ? "Dashboard" : onPrimaryAction ? "Join Edutu" : "Sign in";
  const actionTarget = isSignedIn ? "/dashboard" : "/auth?mode=sign-in";
  const positionClass = fixed ? "fixed" : "sticky";
  const displayName =
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    "Your profile";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "U";

  const renderPrimaryAction = (className = "") =>
    onPrimaryAction ? (
      <button
        type="button"
        onClick={onPrimaryAction}
        className={`inline-flex h-10 items-center justify-center rounded-lg bg-[#146ef5] px-4 text-sm font-bold text-white transition hover:bg-[#0055d4] focus:outline-none focus:ring-2 focus:ring-[#146ef5]/40 ${className}`}
      >
        {actionLabel}
      </button>
    ) : (
      <Link
        to={actionTarget}
        className={`inline-flex h-10 items-center justify-center rounded-lg bg-[#146ef5] px-4 text-sm font-bold text-white transition hover:bg-[#0055d4] focus:outline-none focus:ring-2 focus:ring-[#146ef5]/40 ${className}`}
      >
        {actionLabel}
      </Link>
    );

  const profileLink = isSignedIn ? (
    <Link
      to="/profile"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-sm font-bold text-slate-700 transition hover:border-[#146ef5]/40 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#146ef5]/30"
      aria-label={`Open ${displayName} profile`}
      title="Profile"
    >
      {user?.imageUrl ? (
        <img
          src={user.imageUrl}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : initials ? (
        <span>{initials}</span>
      ) : (
        <UserRound size={18} />
      )}
    </Link>
  ) : null;

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  return (
    <header
      className={`${positionClass} inset-x-0 top-0 z-50 border-b border-slate-200 bg-white text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100`}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-slate-950 no-underline"
          aria-label="Edutu home"
        >
          <img src="/edutu-logo.png" alt="" className="h-8 w-8 object-contain" />
          <span className="text-xl font-bold tracking-tight">edutu</span>
        </Link>

        <nav
          className="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex"
          aria-label="Primary navigation"
        >
          {coreNavItems.map((item) =>
            item.external ? (
              <a
                key={item.to}
                href={item.to}
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-[#146ef5]"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.to}
                to={item.to}
                className="transition hover:text-[#146ef5]"
              >
                {item.label}
              </Link>
            ),
          )}

          <div className="relative" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className="flex items-center gap-1 transition hover:text-[#146ef5]"
              aria-expanded={moreOpen}
              aria-haspopup="true"
            >
              More <ChevronDown size={14} className={`transition duration-200 ${moreOpen ? 'rotate-180' : ''}`} />
            </button>

            {moreOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMoreOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-slate-200 bg-white py-2 shadow-xl dark:border-slate-800 dark:bg-slate-950">
                  {moreNavItems.map((item) =>
                    item.external ? (
                      <a
                        key={item.to}
                        href={item.to}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setMoreOpen(false)}
                        className="block px-4 py-2 text-sm font-semibold text-slate-700 transition hover:text-[#146ef5]"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMoreOpen(false)}
                        className="block px-4 py-2 text-sm font-semibold text-slate-700 transition hover:text-[#146ef5]"
                      >
                        {item.label}
                      </Link>
                    ),
                  )}
                </div>
              </>
            )}
          </div>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {renderPrimaryAction()}
          {profileLink}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border-2 border-slate-400 bg-white shadow-sm md:hidden dark:border-slate-700 dark:bg-slate-950"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          style={{ color: '#000000' }}
        >
          {menuOpen ? <X size={20} style={{ color: '#000000' }} /> : <Menu size={20} style={{ color: '#000000' }} />}
        </button>
      </div>

      {menuOpen && (
        <nav
          className="border-t border-slate-200 bg-white px-4 py-3 md:hidden dark:border-slate-800 dark:bg-slate-950"
          aria-label="Mobile navigation"
        >
          <div className="mx-auto flex max-w-[1200px] flex-col gap-1">
            {[...coreNavItems, ...moreNavItems].map((item) =>
              item.external ? (
                <a
                  key={item.to}
                  href={item.to}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  {item.label}
                </Link>
              ),
            )}
            <div className="flex items-center gap-2 px-3 py-2" onClick={() => setMenuOpen(false)}>
              {renderPrimaryAction("flex-1")}
              {profileLink}
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
