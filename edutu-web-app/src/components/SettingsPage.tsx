import { useState } from "react";
import MemberSettingsPanel from "./MemberSettingsPanel";
import NotificationInbox from "./NotificationInbox";

export default function SettingsPage() {
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <>
      <main className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <section className="mb-5">
          <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">
            Workspace
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            Settings
          </h1>
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
