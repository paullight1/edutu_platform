import {
  CalendarDays,
  ClipboardList,
  FileCheck2,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Plus,
  Target,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  isWorkspaceFeatureEnabled,
  type WorkspaceFeature,
} from "../features/workspace/release";
export type PlanSection =
  "overview" | "applications" | "deadlines" | "cv" | "documents" | "goals";
const SECTIONS = [
  {
    key: "overview",
    translationKey: "myPlan.overview",
    route: "/app/my-plan",
    Icon: LayoutDashboard,
  },
  {
    key: "applications",
    translationKey: "myPlan.applications",
    route: "/app/applications",
    Icon: FileCheck2,
  },
  {
    key: "cv",
    translationKey: "planWorkspace.cv",
    route: "/app/cv",
    Icon: FileText,
  },
  {
    key: "documents",
    translationKey: "planWorkspace.documents",
    route: "/app/documents",
    Icon: FolderOpen,
  },
  {
    key: "goals",
    translationKey: "navigation.goals",
    route: "/app/goals",
    Icon: Target,
  },
  {
    key: "deadlines",
    translationKey: "myPlan.calendar",
    route: "/app/deadlines",
    Icon: CalendarDays,
  },
] as const;
export default function PlanWorkspaceHeader({
  section,
  hideIntroOnMobile = false,
  compact = false,
}: {
  section: PlanSection;
  hideIntroOnMobile?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const container = nav.current;
    const active = container?.querySelector<HTMLElement>("[aria-current]");
    if (container && active)
      container.scrollLeft = Math.max(
        0,
        active.offsetLeft -
          container.offsetLeft -
          (container.clientWidth - active.clientWidth) / 2,
      );
  }, [section]);
  return (
    <header className="mb-6 min-w-0">
      {!compact && (
        <div
          className={`flex items-start justify-between gap-4 ${hideIntroOnMobile ? "hidden sm:flex" : ""}`}
        >
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
              <ClipboardList size={16} aria-hidden="true" />
              {t("planWorkspace.label")}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
              {t("planWorkspace.description")}
            </p>
          </div>
          <Link
            to="/app/opportunities"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-subtle bg-surface-layer text-brand transition hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label={t("myPlan.exploreOpportunities")}
          >
            <Plus size={18} aria-hidden="true" />
          </Link>
        </div>
      )}
      <nav
        ref={nav}
        className={`${compact || hideIntroOnMobile ? "mt-0" : "mt-5"} flex max-w-full gap-5 overflow-x-auto border-b border-subtle [scrollbar-width:thin]`}
        aria-label={t("myPlan.workspaceNav")}
      >
        {SECTIONS.filter((item) =>
          isWorkspaceFeatureEnabled(item.key as WorkspaceFeature),
        ).map((item) => (
          <Link
            key={item.key}
            to={item.route}
            aria-current={section === item.key ? "page" : undefined}
            className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-1 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${section === item.key ? "border-brand text-brand" : "border-transparent text-text-secondary hover:border-brand/30 hover:text-brand"}`}
          >
            <item.Icon size={17} strokeWidth={1.8} aria-hidden="true" />
            {t(item.translationKey)}
          </Link>
        ))}
      </nav>
    </header>
  );
}
export function getPlanSection(pathname: string): PlanSection | null {
  if (pathname.startsWith("/app/my-plan")) return "overview";
  if (
    pathname.startsWith("/app/copilot") ||
    pathname.startsWith("/app/applications")
  )
    return "applications";
  if (pathname.startsWith("/app/cv") || pathname.startsWith("/app/ai-tools"))
    return "cv";
  if (pathname.startsWith("/app/documents")) return "documents";
  if (pathname.startsWith("/app/goals")) return "goals";
  if (pathname.startsWith("/app/deadlines")) return "deadlines";
  return null;
}
