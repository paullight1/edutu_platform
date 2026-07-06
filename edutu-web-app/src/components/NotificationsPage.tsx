import NotificationInbox from "./NotificationInbox";
import Seo from "./Seo";

/**
 * Full-page notifications view rendered at /app/notifications (and /notifications).
 * Reuses NotificationInbox in its "page" variant so the inbox UI stays in one place.
 */
export default function NotificationsPage() {
  return (
    <>
      <Seo title="Notifications | Edutu" path="/app/notifications" noindex />
      <NotificationInbox variant="page" />
    </>
  );
}
