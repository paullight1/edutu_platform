import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import AppearanceSettings from "./AppearanceSettings";
import ReminderSettings from "./ReminderSettings";
import WebPushSettings from "./WebPushSettings";
import LanguageSwitcher from "./LanguageSwitcher";
import MemberSettingsPanel from "./MemberSettingsPanel";
import { usePersonalization } from "../hooks/usePersonalization";

export default function SettingsPage() {
  const { preferences } = usePersonalization();
  const selectionCount =
    (preferences?.interests.length ?? 0) +
    (preferences?.careerGoals.length ?? 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 min-[412px]:px-5 sm:px-6 sm:py-6 lg:px-8">
      <h1 className="mb-6 font-display text-[30px] font-semibold leading-9 tracking-[-0.035em] text-text-primary">
        Settings
      </h1>

      <SettingsGroup title="Preferences">
        <Link
          to="/app/personalization"
          className="group flex min-h-[64px] w-full items-center gap-3 border-b border-subtle px-4 py-3 transition hover:bg-surface-elevated"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text-primary">
              Feed personalization
            </span>
            <span className="mt-0.5 block truncate text-xs text-text-muted">
              {selectionCount > 0
                ? `${selectionCount} interests and goals selected`
                : "Choose interests and goals"}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-text-muted transition group-hover:translate-x-0.5" />
        </Link>
        <AppearanceSettings />
        <div className="flex min-h-[64px] items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">Language</p>
            <p className="mt-0.5 truncate text-xs text-text-muted">App language</p>
          </div>
          <div className="w-36 shrink-0">
            <LanguageSwitcher />
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Notifications">
        <WebPushSettings />
        <ReminderSettings />
      </SettingsGroup>

      <MemberSettingsPanel />
    </main>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-sm font-semibold text-text-secondary">
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-subtle bg-surface-layer">
        {children}
      </div>
    </section>
  );
}
