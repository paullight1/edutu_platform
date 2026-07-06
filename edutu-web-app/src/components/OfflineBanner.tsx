import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useNetworkStatus";

/**
 * Slim, persistent banner shown while the device is offline. Complements the
 * cached-content fallback in services/opportunities.ts — the app keeps working
 * from its last snapshot, and this bar tells the user why data may be stale.
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-amber-950 shadow-sm"
      style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
    >
      <WifiOff size={14} className="shrink-0" />
      You're offline — showing saved content
    </div>
  );
}
