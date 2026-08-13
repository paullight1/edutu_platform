import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Menu, UserRound, X } from "lucide-react";
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";
import { getDocsUrl, isExternalDocsUrl } from "../lib/apiProductUrls";

interface PublicHeaderProps {
  fixed?: boolean;
  onPrimaryAction?: () => void;
  darkAtTop?: boolean;
}

type NavItem = {
  label: string;
  to: string;
  external?: boolean;
};

const docsUrl = getDocsUrl();

const coreNavItems: NavItem[] = [
  { label: "Opportunities", to: "/opportunities" },
  { label: "Community", to: "/community" },
  { label: "Impact", to: "/impact" },
  { label: "Blog", to: "/blog" },
];

const moreNavItems: NavItem[] = [
  { label: "Scholarship Engine", to: "/scholarship-engine" },
  { label: "Docs", to: docsUrl, external: isExternalDocsUrl() },
  { label: "About", to: "/about" },
  { label: "What We Believe", to: "/what-we-believe" },
  { label: "Mentors", to: "/mentor" },
  { label: "Developers", to: "/developers" },
  { label: "Events", to: "/events" },
];

export default function PublicHeader({
  fixed = false,
  onPrimaryAction,
  darkAtTop = false,
}: PublicHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const { isSignedIn } = useClerkAuth();
  const { user } = useUser();

  const actionLabel = isSignedIn ? "Dashboard" : onPrimaryAction ? "Join Edutu" : "Sign in";
  const actionTarget = isSignedIn ? "/dashboard" : "/auth?mode=sign-in";
  const positionClass = fixed ? "fixed" : "sticky";
  const useDarkTopChrome = darkAtTop && !scrolled;
  const displayName =
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    "Your profile";
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U";

  // Add elevation + stronger blur once the page scrolls under the bar.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const renderPrimaryAction = (className = "") =>
    onPrimaryAction ? (
      <button
        type="button"
        onClick={onPrimaryAction}
        className={`inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${className}`}
      >
        {actionLabel}
      </button>
    ) : (
      <Link
        to={actionTarget}
        className={`inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${className}`}
      >
        {actionLabel}
      </Link>
    );

  const profileLink = isSignedIn ? (
    <Link
      to="/profile"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-subtle bg-surface-elevated text-sm font-bold text-text-secondary transition hover:border-brand/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
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

  return (
    <header
      className={`${positionClass} inset-x-0 top-0 z-50 border-b transition-theme ${
        scrolled
          ? "border-subtle bg-surface-layer/80 backdrop-blur-xl shadow-soft"
          : useDarkTopChrome
            ? "border-transparent bg-slate-950/25 text-white backdrop-blur-md"
            : "border-transparent bg-surface-layer/60 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className={`flex items-center gap-2 no-underline ${useDarkTopChrome ? "text-white" : "text-text-primary"}`}
          aria-label="Edutu home"
        >
          <img src="/edutu-logo.png" alt="" className="h-8 w-8 object-contain" />
          <span className="font-display text-xl font-bold tracking-tight">edutu</span>
        </Link>

        <nav
          className={`hidden items-center gap-8 text-sm font-semibold md:flex ${useDarkTopChrome ? "text-white/80" : "text-text-secondary"}`}
          aria-label="Primary navigation"
        >
          {coreNavItems.map((item) =>
            item.external ? (
              <a
                key={item.to}
                href={item.to}
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-brand"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.to}
                to={item.to}
                className="transition hover:text-brand"
              >
                {item.label}
              </Link>
            ),
          )}

          <div className="relative" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className={`flex items-center gap-1 transition hover:text-brand ${useDarkTopChrome ? "text-white/80" : ""}`}
              aria-expanded={moreOpen}
              aria-haspopup="true"
            >
              More{" "}
              <ChevronDown
                size={14}
                className={`transition duration-200 ${moreOpen ? "rotate-180" : ""}`}
              />
            </button>

            {moreOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMoreOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-2xl border border-subtle bg-surface-layer py-2 shadow-elevated">
                  {moreNavItems.map((item) =>
                    item.external ? (
                      <a
                        key={item.to}
                        href={item.to}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setMoreOpen(false)}
                        className="block px-4 py-2 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated hover:text-brand"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMoreOpen(false)}
                        className="block px-4 py-2 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated hover:text-brand"
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

        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm ${useDarkTopChrome ? "border-white/20 bg-slate-950/30 text-white" : "border-subtle bg-surface-layer text-text-primary"}`}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          className="border-t border-subtle bg-surface-layer px-4 py-3 md:hidden"
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
                  className="rounded-xl px-3 py-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated hover:text-brand"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated hover:text-brand"
                >
                  {item.label}
                </Link>
              ),
            )}
            <div
              className="flex items-center gap-2 px-3 py-2"
              onClick={() => setMenuOpen(false)}
            >
              {renderPrimaryAction("flex-1")}
              {profileLink}
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
