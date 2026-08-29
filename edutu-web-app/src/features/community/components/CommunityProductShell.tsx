import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Compass,
  Home,
  MessageCircle,
  UserCircle,
  UsersRound,
} from "lucide-react";
import { cn } from "../../../lib/cn";

const tabs = [
  {
    to: "/app/community/explore",
    label: "Explore",
    icon: Compass,
  },
  {
    to: "/app/community/groups",
    label: "Groups",
    icon: UsersRound,
  },
  {
    to: "/app/community/chats",
    label: "Chats",
    icon: MessageCircle,
  },
];

function focusedBackLink(pathname: string) {
  if (pathname.startsWith("/app/community/dm/")) {
    return { to: "/app/community/chats", label: "Back to chats" };
  }
  const postGroup = pathname.match(
    /^\/app\/community\/groups\/([^/]+)\/posts\/[^/]+\/?$/,
  );
  if (postGroup) {
    return {
      to: `/app/community/groups/${postGroup[1]}`,
      label: "Back to community",
    };
  }
  if (pathname.startsWith("/app/community/groups/")) {
    return { to: "/app/community/groups", label: "Back to groups" };
  }
  return { to: "/app/community/explore", label: "Back to Community" };
}

export default function CommunityProductShell({
  title,
  restingTitle,
  titleAnchorId,
  description,
  action,
  children,
}: {
  title: string;
  restingTitle?: string;
  titleAnchorId?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const showPrimaryNavigation = tabs.some(({ to }) => pathname === to);
  const isExplorePage = pathname === "/app/community/explore";
  const groupRoom =
    /^\/app\/community\/groups\/[^/]+\/?$/.test(pathname) &&
    pathname !== "/app/community/groups/new";
  const backLink = focusedBackLink(pathname);
  const headerRef = useRef<HTMLElement>(null);
  const [scrollTitleVisible, setScrollTitleVisible] = useState(false);

  useEffect(() => {
    if (!titleAnchorId) {
      setScrollTitleVisible(false);
      return;
    }

    const updateScrollTitle = () => {
      const titleAnchor = document.getElementById(titleAnchorId);
      if (!titleAnchor) {
        setScrollTitleVisible(false);
        return;
      }

      const headerBottom =
        headerRef.current?.getBoundingClientRect().bottom ?? 64;
      setScrollTitleVisible(
        titleAnchor.getBoundingClientRect().top <= headerBottom,
      );
    };

    updateScrollTitle();
    window.addEventListener("scroll", updateScrollTitle, { passive: true });
    window.addEventListener("resize", updateScrollTitle);
    return () => {
      window.removeEventListener("scroll", updateScrollTitle);
      window.removeEventListener("resize", updateScrollTitle);
    };
  }, [titleAnchorId]);

  return (
    <section className="community-product min-h-[100dvh] overflow-x-clip bg-white text-[#17120f] dark:bg-surface-body dark:text-text-primary">
      {description ? <p className="sr-only">{description}</p> : null}
      <header
        ref={headerRef}
        className="sticky top-0 z-30 border-b border-[#ece8e5] bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl dark:border-subtle dark:bg-surface-body"
      >
        <div className="mx-auto grid min-h-16 max-w-3xl grid-cols-[3rem_1fr_3rem] items-center px-3 sm:px-5">
          {showPrimaryNavigation ? (
            <Link
              to={isExplorePage ? "/dashboard" : "/app/community/profile"}
              aria-label={
                isExplorePage ? "Go to Edutu home" : "Community profile"
              }
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#17120f] transition hover:bg-[#f7f4f2] hover:text-[#f45b16] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/35 dark:text-text-primary dark:hover:bg-surface-elevated"
            >
              {isExplorePage ? (
                <Home size={24} strokeWidth={2.1} />
              ) : (
                <UserCircle size={26} strokeWidth={2.1} />
              )}
            </Link>
          ) : (
            <Link
              to={backLink.to}
              aria-label={backLink.label}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#17120f] transition hover:bg-[#f7f4f2] hover:text-[#f45b16] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/35 dark:text-text-primary dark:hover:bg-surface-elevated"
            >
              <ArrowLeft size={22} className="rtl:rotate-180" />
            </Link>
          )}
          {groupRoom ? (
            titleAnchorId ? (
              <h1 className="relative h-7 min-w-0 overflow-hidden px-2 text-center font-display text-lg font-bold tracking-[-0.025em] sm:text-xl">
                <span
                  data-testid="community-resting-title"
                  data-state={scrollTitleVisible ? "hidden" : "visible"}
                  aria-hidden={scrollTitleVisible}
                  className={cn(
                    "absolute inset-x-2 truncate will-change-transform motion-reduce:transform-none motion-reduce:transition-none",
                    "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    scrollTitleVisible
                      ? "-translate-y-3 scale-[0.96] opacity-0"
                      : "translate-y-0 scale-100 opacity-100",
                  )}
                >
                  {restingTitle || "Community"}
                </span>
                <span
                  data-testid="community-scroll-title"
                  data-state={scrollTitleVisible ? "visible" : "hidden"}
                  aria-hidden={!scrollTitleVisible}
                  className={cn(
                    "absolute inset-x-2 truncate will-change-transform motion-reduce:transform-none motion-reduce:transition-none",
                    "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    scrollTitleVisible
                      ? "translate-y-0 scale-100 opacity-100"
                      : "translate-y-3 scale-[0.96] opacity-0",
                  )}
                >
                  {title}
                </span>
              </h1>
            ) : (
              <span aria-hidden="true" />
            )
          ) : (
            <h1 className="truncate px-2 text-center font-display text-xl font-bold tracking-[-0.025em] sm:text-2xl">
              {title}
            </h1>
          )}
          <div className="flex h-11 w-11 items-center justify-center justify-self-end">
            {isExplorePage ? (
              <Link
                to="/app/community/profile"
                aria-label="Community profile"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#17120f] transition hover:bg-[#f7f4f2] hover:text-[#f45b16] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/35 dark:text-text-primary dark:hover:bg-surface-elevated"
              >
                <UserCircle size={26} strokeWidth={2.1} />
              </Link>
            ) : (
              action
            )}
          </div>
        </div>
      </header>

      <div
        className={cn(
          "mx-auto w-full max-w-3xl px-4 sm:px-5",
          showPrimaryNavigation
            ? "pb-[calc(5rem+env(safe-area-inset-bottom))]"
            : "pb-[calc(1rem+env(safe-area-inset-bottom))]",
        )}
      >
        {children}
      </div>

      {showPrimaryNavigation ? (
        <nav
          aria-label="Community mobile navigation"
          data-keyboard-hide
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ece8e5] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_-24px_rgba(23,18,15,.45)] backdrop-blur-xl dark:border-subtle dark:bg-surface-layer dark:shadow-[0_-14px_34px_-22px_rgba(0,0,0,.8)]"
        >
          <div className="mx-auto grid h-16 max-w-lg grid-cols-3 px-4">
            {tabs.map(({ to, label, icon: Icon }) => {
              const active = pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f45b16]/35",
                    active
                      ? "text-[#f45b16] dark:text-brand"
                      : "text-[#817a76] dark:text-text-muted",
                  )}
                >
                  <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </section>
  );
}
