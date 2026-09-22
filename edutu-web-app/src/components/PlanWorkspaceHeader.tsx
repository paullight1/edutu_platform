import { ClipboardList, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

type PlanSection = "overview" | "applications" | "deadlines";

const SECTIONS: Array<{ key: PlanSection; translationKey: string; route: string }> = [
  { key: "overview", translationKey: "myPlan.overview", route: "/app/my-plan" },
  { key: "applications", translationKey: "myPlan.applications", route: "/app/applications" },
  { key: "deadlines", translationKey: "myPlan.calendar", route: "/app/deadlines" },
];

export default function PlanWorkspaceHeader({
  section,
  hideIntroOnMobile = false,
}: {
  section: PlanSection;
  hideIntroOnMobile?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeSection = section === "overview" && pathname.startsWith("/app/my-plan")
    ? "overview"
    : section;

  return (
    <header className="mb-7">
      <div className={`flex items-start justify-between gap-4 ${hideIntroOnMobile ? "hidden sm:flex" : ""}`}>
        <div>
          <p className={hideIntroOnMobile ? "hidden sm:inline-flex items-center gap-2 text-sm font-semibold text-brand" : "inline-flex items-center gap-2 text-sm font-semibold text-brand"}>
            <ClipboardList size={16} aria-hidden="true" />
            {t("myPlan.workspaceLabel")}
          </p>
          <p className={hideIntroOnMobile ? "mt-2 hidden max-w-2xl text-sm leading-6 text-text-secondary sm:block" : "mt-2 max-w-2xl text-sm leading-6 text-text-secondary"}>
            {t("myPlan.workspaceDescription")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/opportunities")}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-subtle bg-surface-layer text-brand transition hover:border-brand/30 hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label={t("myPlan.exploreOpportunities")}
          title={t("myPlan.exploreOpportunities")}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <nav className={`${hideIntroOnMobile ? "mt-0 sm:mt-5" : "mt-5"} flex max-w-full justify-center gap-5 overflow-x-auto border-b border-subtle pb-0`} aria-label={t("myPlan.workspaceNav")}>
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => navigate(item.route)}
            aria-current={activeSection === item.key ? "page" : undefined}
            className={`min-h-11 shrink-0 border-b-2 px-1 text-sm font-semibold transition ${activeSection === item.key ? "border-brand text-text-primary" : "border-transparent text-text-secondary hover:border-brand/30 hover:text-brand"}`}
          >
                {t(item.translationKey)}
          </button>
        ))}
      </nav>
    </header>
  );
}
