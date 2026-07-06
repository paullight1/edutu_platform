import { useEffect, useRef } from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { getProductApiToken } from "../lib/clerkToken";
import { fetchOpportunityMatchScores } from "../services/opportunities";
import {
  getServerMatch,
  primeServerMatches,
} from "../services/serverMatchStore";

const HYDRATION_DEBOUNCE_MS = 300;
const MAX_IDS_PER_BATCH = 100;

/**
 * Hydrate the server match store for a list of visible opportunity ids.
 *
 * Debounced (300ms) so rapid filtering/typing doesn't spam the API; only ids
 * missing from the store are requested (once per session per id), chunking to
 * the API's 50-id limit is handled by fetchOpportunityMatchScores. Purely
 * best-effort: failures leave the local heuristic scores in place.
 */
export function useServerMatchHydration(ids: string[]): void {
  const { isSignedIn, userId, getToken } = useClerkAuth();
  const requestedRef = useRef<Set<string>>(new Set());

  // Scores are per-user; a new user may re-request everything.
  useEffect(() => {
    requestedRef.current.clear();
  }, [userId]);

  // A stable key avoids re-running the effect on every new array identity.
  const idsKey = ids.slice(0, MAX_IDS_PER_BATCH).join("|");

  useEffect(() => {
    if (!isSignedIn || !userId || !idsKey) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const missing = idsKey
        .split("|")
        .filter(
          (id) =>
            id &&
            !requestedRef.current.has(id) &&
            getServerMatch(userId, id) === null,
        );
      if (missing.length === 0) return;
      missing.forEach((id) => requestedRef.current.add(id));

      void (async () => {
        try {
          const token = await getProductApiToken(getToken);
          if (!token || cancelled) return;

          const scores = await fetchOpportunityMatchScores(token, missing);
          if (cancelled || scores.length === 0) return;

          primeServerMatches(
            userId,
            scores.map((score) => ({
              id: score.id,
              score: score.matchScore,
              reasons: score.matchReasonDetails,
              risks: score.matchRisks,
            })),
          );
        } catch {
          // Best-effort hydration — badges fall back to local scoring.
        }
      })();
    }, HYDRATION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [idsKey, isSignedIn, userId, getToken]);
}
