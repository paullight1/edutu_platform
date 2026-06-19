import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, UserRound, X } from "lucide-react";
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";

interface PublicHeaderProps {
  fixed?: boolean;
  onPrimaryAction?: () => void;
}

const publicNavItems = [
  { label: "Opportunities", to: "/opportunities" },
  { label: "Mentor", to: "/mentor" },
  { label: "About", to: "/about" },
  { label: "Blog", to: "/blog" },
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

  return (
    <header
      className={`${positionClass} inset-x-0 top-0 z-50 border-b border-slate-200 bg-white text-slate-950`}
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
          {publicNavItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="transition hover:text-[#146ef5]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {renderPrimaryAction()}
          {profileLink}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-950 transition hover:bg-slate-50 md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {menuOpen && (
        <nav
          className="border-t border-slate-200 bg-white px-4 py-3 md:hidden"
          aria-label="Mobile navigation"
        >
          <div className="mx-auto flex max-w-[1200px] flex-col gap-1">
            {publicNavItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
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
