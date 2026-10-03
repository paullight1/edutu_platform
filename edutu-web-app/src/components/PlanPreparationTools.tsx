import {
  ArrowRight,
  FileText,
  FolderOpen,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  isWorkspaceFeatureEnabled,
  type WorkspaceFeature,
} from "../features/workspace/release";
const TOOLS = [
  {
    feature: "cv",
    route: "/app/cv",
    Icon: FileText,
    title: "cvTitle",
    detail: "cvDetail",
  },
  {
    feature: "documents",
    route: "/app/documents",
    Icon: FolderOpen,
    title: "documentsTitle",
    detail: "documentsDetail",
  },
  {
    feature: "goals",
    route: "/app/goals",
    Icon: Target,
    title: "goalsTitle",
    detail: "goalsDetail",
  },
] as const;
export default function PlanPreparationTools() {
  const { t } = useTranslation();
  return (
    <section className="mb-8 mt-5" aria-labelledby="plan-preparation-heading">
      <div className="mb-4">
        <h2
          id="plan-preparation-heading"
          className="font-display text-xl font-semibold tracking-tight text-text-primary"
        >
          {t("planWorkspace.toolsTitle")}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {t("planWorkspace.toolsDescription")}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {TOOLS.filter((item) =>
          isWorkspaceFeatureEnabled(item.feature as WorkspaceFeature),
        ).map((item) => (
          <Link
            key={item.feature}
            to={item.route}
            className="group flex min-h-24 items-center gap-3 sm:gap-4 rounded-2xl bg-surface-layer p-4 transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <item.Icon size={23} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text-primary">
                {t(`planWorkspace.${item.title}`)}
              </span>
              <span className="mt-1 hidden text-sm leading-5 text-text-secondary sm:block">
                {t(`planWorkspace.${item.detail}`)}
              </span>
            </span>
            <ArrowRight
              size={17}
              aria-hidden="true"
              className="hidden shrink-0 text-text-muted transition-transform sm:block group-hover:translate-x-1 motion-reduce:transform-none"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
