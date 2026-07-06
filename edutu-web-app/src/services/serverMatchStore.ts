import type {
  MatchReason,
  MatchReasonKind,
} from "./personalizedRecommendations";

/**
 * Synchronous per-opportunity store of SERVER-computed match scores.
 *
 * The recommendations feed and the /opportunities/match-scores endpoint both
 * return authoritative hybrid-engine scores; this store lets any component
 * (badges, "why this matches" panels) read them synchronously instead of
 * falling back to the local heuristic. Backed by an in-memory map plus a
 * sessionStorage snapshot (same pattern as the reco cache in
 * usePersonalizedOpportunities) so scores survive in-tab reloads.
 */

const STORAGE_KEY = "edutu:matchScores:v1";
const MATCH_FRESH_MS = 30 * 60 * 1000;

export interface ServerMatch {
  score: number;
  reasons: MatchReason[];
  risks: string[];
}

export interface ServerMatchEntry extends ServerMatch {
  id: string;
}

interface StoredMatch extends ServerMatch {
  savedAt: number;
}

interface StoreState {
  userKey: string | null;
  entries: Record<string, StoredMatch>;
}

let state: StoreState = { userKey: null, entries: {} };
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A broken listener must not take down the store.
    }
  });
}

function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best effort — the in-memory copy still serves this session.
  }
}

function hydrateOnce() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoreState;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.userKey === "string" &&
      parsed.entries &&
      typeof parsed.entries === "object"
    ) {
      state = { userKey: parsed.userKey, entries: parsed.entries };
    }
  } catch {
    // Corrupt/unavailable storage — start empty.
  }
}

const KNOWN_KINDS = new Set<MatchReasonKind>([
  "field",
  "interest",
  "category",
  "location",
  "remote",
  "experience",
  "goal",
  "education",
]);

/** Nearest-kind aliases for backend reason kinds the UI union doesn't know. */
const KIND_ALIASES: Record<string, MatchReasonKind> = {
  semantic: "interest",
  behavior: "category",
  profile_fit: "field",
  profilefit: "field",
  skill: "field",
  freshness: "category",
  deadline: "category",
  country: "location",
  region: "location",
};

function coerceKind(value: unknown): MatchReasonKind {
  if (typeof value === "string") {
    const kind = value.trim().toLowerCase();
    if (KNOWN_KINDS.has(kind as MatchReasonKind)) {
      return kind as MatchReasonKind;
    }
    if (KIND_ALIASES[kind]) return KIND_ALIASES[kind];
  }
  return "category";
}

function coerceLabel(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const label = (value as { label?: unknown }).label;
    if (typeof label === "string") return label.trim();
  }
  return "";
}

/**
 * Normalise a backend recommendation/score row into UI MatchReason objects.
 * Prefers the structured `match_reason_details` array; falls back to coercing
 * legacy string reasons (object items are reduced to their `.label` so
 * nothing ever renders as "[object Object]").
 */
export function toMatchReasons(row: unknown): MatchReason[] {
  if (!row || typeof row !== "object") return [];
  const source = row as Record<string, unknown>;

  const details =
    source.match_reason_details ?? source.matchReasonDetails ?? null;
  if (Array.isArray(details) && details.length > 0) {
    return details
      .map((item) => {
        const label = coerceLabel(item);
        if (!label) return null;
        const record =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : {};
        const points = Number(record.points);
        return {
          kind: coerceKind(record.kind),
          label,
          points: Number.isFinite(points) ? points : 0,
        } satisfies MatchReason;
      })
      .filter((reason): reason is MatchReason => reason !== null);
  }

  const reasons = source.match_reasons ?? source.matchReasons ?? null;
  if (Array.isArray(reasons) && reasons.length > 0) {
    const labels = reasons.map(coerceLabel).filter(Boolean);
    return labels.map((label, index) => ({
      kind: "category" as MatchReasonKind,
      label,
      points: labels.length - index,
    }));
  }

  return [];
}

/**
 * Store server scores for a user. Priming for a different user replaces the
 * previous user's entries entirely (scores are strictly per-user).
 */
export function primeServerMatches(
  userKey: string,
  entries: ServerMatchEntry[],
): void {
  if (!userKey || entries.length === 0) return;
  hydrateOnce();

  const now = Date.now();
  const nextEntries: Record<string, StoredMatch> =
    state.userKey === userKey ? { ...state.entries } : {};

  entries.forEach((entry) => {
    if (!entry?.id) return;
    nextEntries[entry.id] = {
      score: entry.score,
      reasons: entry.reasons ?? [],
      risks: entry.risks ?? [],
      savedAt: now,
    };
  });

  state = { userKey, entries: nextEntries };
  persist();
  notify();
}

/**
 * Synchronous lookup. Returns null when the id is unknown, belongs to a
 * different user, or the entry is stale (>30 minutes).
 */
export function getServerMatch(
  userKey: string,
  id: string,
): ServerMatch | null {
  if (!userKey || !id) return null;
  hydrateOnce();
  if (state.userKey !== userKey) return null;

  const entry = state.entries[id];
  if (!entry) return null;
  if (Date.now() - entry.savedAt > MATCH_FRESH_MS) return null;

  return { score: entry.score, reasons: entry.reasons, risks: entry.risks };
}

/** Subscribe to store updates (prime/clear). Returns an unsubscribe fn. */
export function subscribeServerMatches(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearServerMatches(): void {
  hydrated = true;
  state = { userKey: null, entries: {} };
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — memory copy is already cleared.
  }
  notify();
}
