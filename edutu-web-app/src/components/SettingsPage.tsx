import { useState } from "react";
import MemberSettingsPanel from "./MemberSettingsPanel";
import NotificationInbox from "./NotificationInbox";

export default function SettingsPage() {
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <>
      <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-6 lg:px-8">
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
