import { useState } from "react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import MemberSettingsPanel from "./MemberSettingsPanel";
import NotificationInbox from "./NotificationInbox";

export default function SettingsPage() {
  const { t } = useTranslation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <>
      <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-6 lg:px-8">
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-950">
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            {t("settings.language.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("settings.language.select")}
          </p>
          <div className="mt-3 max-w-sm">
            <LanguageSwitcher />
          </div>
        </section>

        <MemberSettingsPanel
          onOpenNotifications={() => setNotificationsOpen(true)}
        />
      </main>

      <NotificationInbox
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </>
  );
}
