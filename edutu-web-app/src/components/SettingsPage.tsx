import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ChevronRight, Sparkles } from "lucide-react";
import AppearanceSettings from "./AppearanceSettings";
import ReminderSettings from "./ReminderSettings";
import WebPushSettings from "./WebPushSettings";
import LanguageSwitcher from "./LanguageSwitcher";
import MemberSettingsPanel from "./MemberSettingsPanel";
import { usePersonalization } from "../hooks/usePersonalization";

export default function SettingsPage() {
  const { t } = useTranslation();
  const { preferences } = usePersonalization();
  const selectionCount =
    (preferences?.interests.length ?? 0) +
    (preferences?.careerGoals.length ?? 0);

  return (
    <>
      <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-6 lg:px-8">
        <Link
          to="/app/personalization"
          className="group mb-6 flex w-full items-center gap-4 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft transition hover:border-brand/40 hover:shadow-elevated"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <Sparkles size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text-primary">
              Feed personalization
            </span>
            <span className="mt-0.5 block text-xs text-text-muted">
              {selectionCount > 0
                ? `${selectionCount} interests and goals selected — tap to update`
                : "Pick interests and goals to personalize your opportunities"}
            </span>
          </span>
          <ChevronRight
            size={18}
            className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-brand"
          />
        </Link>

        <AppearanceSettings />

        {/* Durable, two-way control for server-sent push. `ReminderSettings`
            below covers local (in-tab) reminders, which is a different
            mechanism. */}
        <WebPushSettings />

        <ReminderSettings />

        <section className="mb-6 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
            {t("settings.language.title")}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {t("settings.language.select")}
          </p>
          <div className="mt-3 max-w-sm">
            <LanguageSwitcher />
          </div>
        </section>

        <MemberSettingsPanel />
      </main>
    </>
  );
}
