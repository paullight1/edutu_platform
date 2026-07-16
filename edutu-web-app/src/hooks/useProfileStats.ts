import { useEffect, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useAuth as useAppAuth } from "./useAuth";
import { getProductApiToken } from "../lib/clerkToken";
import { getBookmarks, type BookmarkRecord } from "../services/bookmarks";
import {
  getApplications,
  type ApplicationRecord,
} from "../services/applications";
import { getDeadlines } from "../services/deadlines";

export interface ProfileStats {
  /** null while unknown / on error so tiles can degrade to "—" rather than 0. */
  saved: number | null;
  applications: number | null;
  deadlines: number | null;
  /** Full records backing the counts, for the Recent Activity card. */
  savedRecords: BookmarkRecord[];
  applicationRecords: ApplicationRecord[];
  loading: boolean;
}

const EMPTY: ProfileStats = {
  saved: null,
  applications: null,
  deadlines: null,
  savedRecords: [],
  applicationRecords: [],
  loading: true,
};

/**
 * Best-effort counts for the profile hub quick-stats row (saved bookmarks,
 * tracked applications, upcoming deadlines). Every source is loaded
 * independently so one failing endpoint never blanks the whole row.
 */
export function useProfileStats(options?: {
  /** Set false when a parent already fetched and passes stats down — the
   * hook stays mounted (hooks can't be conditional) but skips the network. */
  enabled?: boolean;
}): ProfileStats {
  const enabled = options?.enabled !== false;
  const { user } = useAppAuth();
  const { getToken } = useClerkAuth();
  const [stats, setStats] = useState<ProfileStats>(EMPTY);

  const userId = user?.id ?? null;

  useEffect(() => {
    let active = true;

    if (!enabled) return;

    if (!userId) {
      setStats({ ...EMPTY, loading: false });
      return;
    }

    setStats((prev) => ({ ...prev, loading: true }));

    (async () => {
      const token = await getProductApiToken(getToken).catch(() => null);
      if (!active) return;
      if (!token) {
        setStats((prev) => ({ ...prev, loading: false }));
        return;
      }

      const [bookmarks, applications, deadlines] = await Promise.allSettled([
        getBookmarks(userId, token),
        getApplications(userId, token),
        getDeadlines(userId, token),
      ]);
      if (!active) return;

      setStats({
        saved:
          bookmarks.status === "fulfilled" ? bookmarks.value.length : null,
        applications:
          applications.status === "fulfilled"
            ? applications.value.length
            : null,
        deadlines:
          deadlines.status === "fulfilled"
            ? deadlines.value.summary.total
            : null,
        savedRecords:
          bookmarks.status === "fulfilled" ? bookmarks.value : [],
        applicationRecords:
          applications.status === "fulfilled" ? applications.value : [],
        loading: false,
      });
    })();

    return () => {
      active = false;
    };
  }, [userId, getToken, enabled]);

  return stats;
}

export default useProfileStats;
