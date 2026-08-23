import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Compass, MessageCircle, UserCircle, UsersRound } from "lucide-react";
import { cn } from "../../../lib/cn";

const tabs = [
  { to: "/app/community/explore", label: "Explore", icon: Compass },
  { to: "/app/community/groups", label: "Groups", icon: UsersRound },
  { to: "/app/community/chats", label: "Chats", icon: MessageCircle },
];

export default function CommunityProductShell({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { pathname } = useLocation();

  return (
    <section className="community-product -mx-4 min-h-[calc(100dvh-8rem)] bg-[#fff9f1] text-[#4a170d] dark:bg-surface-body dark:text-text-primary sm:-mx-6 lg:-mx-8">
      <div className="border-b border-[#f4dcc9] bg-[#fff9f1]/95 px-4 pt-5 backdrop-blur dark:border-subtle dark:bg-surface-body/95 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f45b16] dark:text-brand">
              Edutu Community
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#796f6b] dark:text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            <NavLink
              to="/app/community/profile"
              aria-label="Community profile"
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f4dcc9] bg-white text-[#4a170d] shadow-sm transition hover:border-[#f45b16]/40 hover:text-[#f45b16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/35 dark:border-subtle dark:bg-surface-layer dark:text-text-primary"
            >
              <UserCircle size={20} />
            </NavLink>
          </div>
        </div>

        <nav
          aria-label="Community sections"
          className="mx-auto mt-5 flex max-w-6xl gap-1 overflow-x-auto pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map(({ to, label, icon: Icon }) => {
            const active =
              pathname === to ||
              pathname.startsWith(`${to}/`) ||
              (label === "Groups" &&
                pathname.startsWith("/app/community/groups/"));
            return (
              <NavLink
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-11 shrink-0 items-center gap-2 rounded-t-xl px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/35",
                  active
                    ? "bg-white text-[#f45b16] shadow-[0_-1px_0_rgba(244,220,201,.8)] dark:bg-surface-layer dark:text-brand"
                    : "text-[#796f6b] hover:bg-white/60 hover:text-[#4a170d] dark:text-text-secondary dark:hover:bg-surface-layer",
                )}
              >
                <Icon size={17} />
                {label}
                {active ? (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[#f45b16] dark:bg-brand" />
                ) : null}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-5 pb-8 sm:px-6 sm:py-7 lg:px-8">
        {children}
      </div>
    </section>
  );
}
