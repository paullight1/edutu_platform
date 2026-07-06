import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useAuth } from "./useAuth";
import { getProductApiToken } from "../lib/clerkToken";
import {
  fetchBackendProfile,
  updateBackendProfile,
  type BackendProfile,
} from "../services/profile";
import {
  evaluateMatch,
  type MatchResult,
  type UserProfileForRecommendations,
} from "../services/personalizedRecommendations";
import { trackOpportunityClick } from "../services/personalizationService";
import {
  mapInteractionToSignal,
  recordOpportunitySignal,
} from "../services/opportunitySignals";
import {
  clearServerMatches,
  getServerMatch,
  subscribeServerMatches,
} from "../services/serverMatchStore";
import type { Opportunity } from "../types/opportunity";

// ================================
// Types
// ================================

export interface PersonalizationPreferences {
  interests: string[];
  careerGoals: string[];
  preferredCategories: string[];
  educationLevel: string;
  experienceLevel: string;
  location: string;
  completedAt?: string;
}

export type InteractionType = "view" | "apply" | "bookmark" | "share";

export interface TrackInteractionOptions {
  /** Signal weight override (e.g. bookmark removal passes -1). */
  value?: number;
  /** Where the interaction happened: 'detail' | 'card_open' | 'unsave' | … */
  context?: string;
}

interface BehaviorWeights {
  categories: Record<string, number>;
  keywords: Record<string, number>;
  updatedAt: string;
}

interface PersonalizationContextValue {
  /** Explicit preferences (chips picked by the user), null until loaded/set */
  preferences: PersonalizationPreferences | null;
  /** Merged profile in the shape the scoring engine expects */
  recommendationProfile: UserProfileForRecommendations | null;
  /** True once localStorage + backend hydration has settled */
  ready: boolean;
  /** True when we have enough signal to meaningfully personalize */
  isPersonalized: boolean;
  /** Score a single opportunity 0-100 against the current profile */
  scoreOpportunity: (opportunity: Opportunity) => number;
  /**
   * Full explanation for a single opportunity: score plus the plain-English
   * "why this matches you" reasons and any risks to be aware of. Combines the
   * profile-based match with implicit behaviour signals.
   */
  explainOpportunity: (opportunity: Opportunity) => MatchResult;
  /**
   * Rank a feed by match score. Keeps ranking meaningful while adding
   * variety: items are ordered by score, then lightly shuffled within
   * same-score tiers so the feed doesn't feel frozen between visits.
   */
  personalizeFeed: <T extends Opportunity>(
    opportunities: T[],
    options?: { seed?: number; tierSize?: number },
  ) => T[];
  /** Record an implicit signal (view/save/apply/share) for learning */
  trackInteraction: (
    opportunity: Opportunity,
    type: InteractionType,
    options?: TrackInteractionOptions,
  ) => void;
  /** Persist explicit preferences (localStorage + backend profile) */
  savePreferences: (
    preferences: Partial<PersonalizationPreferences>,
  ) => Promise<void>;
  /** Re-fetch the backend profile */
  refresh: () => void;
}

// ================================
// Constants & helpers
// ================================

const PREFS_KEY_PREFIX = "edutu.personalization.prefs.";
const BEHAVIOR_KEY_PREFIX = "edutu.personalization.behavior.";

const INTERACTION_WEIGHTS: Record<InteractionType, number> = {
  view: 1,
  share: 2,
  bookmark: 3,
  apply: 5,
};

/** How much implicit behavior can add on top of the explicit match score. */
const MAX_BEHAVIOR_BOOST = 20;

const INTEREST_CATEGORY_MAP: Record<string, string[]> = {
  Technology: ["Technology", "Software", "IT", "Tech", "Computer Science"],
  Business: ["Business", "Entrepreneurship", "Startup"],
  Health: ["Health", "Medical", "Healthcare"],
  Education: ["Education", "Teaching", "Learning"],
  Arts: ["Arts", "Creative", "Design"],
  Science: ["Science", "Research"],
  Engineering: ["Engineering"],
  Finance: ["Finance", "Banking", "Investment"],
  Marketing: ["Marketing", "Sales"],
  Design: ["Design", "UX", "UI"],
  "AI & Machine Learning": ["AI", "Machine Learning", "ML", "Data Science"],
  "Data Science": ["Data Science", "Analytics", "Data"],
  Entrepreneurship: ["Entrepreneurship", "Startup", "Business"],
  Scholarships: ["Scholarship", "Fellowship", "Grant"],
  Leadership: ["Leadership", "Fellowship"],
};

function deriveCategories(interests: string[]): string[] {
  const categories = new Set<string>();
  interests.forEach((interest) => {
    categories.add(interest);
    (INTEREST_CATEGORY_MAP[interest] || []).forEach((category) =>
      categories.add(category),
    );
  });
  return Array.from(categories);
}

function emptyPreferences(): PersonalizationPreferences {
  return {
    interests: [],
    careerGoals: [],
    preferredCategories: [],
    educationLevel: "",
    experienceLevel: "intermediate",
    location: "",
  };
}

function emptyBehavior(): BehaviorWeights {
  return { categories: {}, keywords: {}, updatedAt: new Date().toISOString() };
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full/unavailable — personalization degrades gracefully.
  }
}

function normaliseStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
}

/** Deterministic PRNG so tier shuffles are stable for a given seed. */
function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "are",
  "you",
  "your",
  "will",
  "can",
  "has",
  "have",
  "was",
  "were",
  "who",
  "what",
  "how",
  "all",
  "any",
  "our",
  "their",
  "about",
  "into",
  "more",
  "than",
  "then",
  "them",
  "they",
  "its",
  "also",
  "when",
  "where",
  "which",
  "would",
  "should",
  "could",
  "there",
  "here",
  "been",
  "being",
  "over",
  "under",
  "after",
  "before",
  "between",
  "during",
  "each",
  "other",
  "such",
  "only",
  "very",
  "just",
  "most",
  "some",
  "these",
  "those",
  "2024",
  "2025",
  "2026",
  "2027",
  "fully",
  "funded",
  "apply",
  "application",
  "applications",
  "open",
  "deadline",
  "program",
  "programme",
  "opportunity",
  "opportunities",
]);

function extractKeywords(opportunity: Opportunity, limit = 8): string[] {
  const text = `${opportunity.title} ${opportunity.category}`.toLowerCase();
  const words = text.match(/[a-z]{4,}/g) || [];
  const unique: string[] = [];
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    if (!unique.includes(word)) unique.push(word);
    if (unique.length >= limit) break;
  }
  return unique;
}

// ================================
// Context
// ================================

const PersonalizationContext =
  createContext<PersonalizationContextValue | null>(null);

export const PersonalizationProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { user } = useAuth();
  const { getToken, isSignedIn } = useClerkAuth();
  const userId = user?.id ?? null;

  const [preferences, setPreferences] =
    useState<PersonalizationPreferences | null>(null);
  const [behavior, setBehavior] = useState<BehaviorWeights>(emptyBehavior);
  const [backendProfile, setBackendProfile] = useState<BackendProfile | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const prefsKey = userId ? `${PREFS_KEY_PREFIX}${userId}` : null;
  const behaviorKey = userId ? `${BEHAVIOR_KEY_PREFIX}${userId}` : null;

  // Hydrate from localStorage as soon as we know who the user is.
  useEffect(() => {
    if (!userId) {
      setPreferences(null);
      setBehavior(emptyBehavior());
      setBackendProfile(null);
      setReady(false);
      // Server-computed match scores are strictly per-user.
      clearServerMatches();
      return;
    }
    setPreferences(
      readJson<PersonalizationPreferences>(`${PREFS_KEY_PREFIX}${userId}`),
    );
    setBehavior(
      readJson<BehaviorWeights>(`${BEHAVIOR_KEY_PREFIX}${userId}`) ??
        emptyBehavior(),
    );
  }, [userId]);

  // Hydrate/merge from the backend profile (durable store shared with mobile).
  useEffect(() => {
    if (!userId || !isSignedIn) {
      setReady(Boolean(userId));
      return;
    }
    let isActive = true;

    (async () => {
      try {
        const token = await getProductApiToken(getToken);
        if (!token) return;
        const profile = await fetchBackendProfile(token);
        if (!isActive) return;
        setBackendProfile(profile);

        const backendInterests = normaliseStrings(profile.interests);
        const backendSkills = normaliseStrings(profile.skills);

        if (backendInterests.length || backendSkills.length) {
          setPreferences((prev) => {
            // Explicit local prefs win; backend fills the gaps.
            const base = prev ?? emptyPreferences();
            const interests = base.interests.length
              ? base.interests
              : Array.from(new Set([...backendInterests, ...backendSkills]));
            const merged: PersonalizationPreferences = {
              ...base,
              interests,
              preferredCategories: base.preferredCategories.length
                ? base.preferredCategories
                : deriveCategories(interests),
              location:
                base.location ||
                (typeof profile.country === "string" ? profile.country : ""),
            };
            return merged;
          });
        }
      } catch (error) {
        console.warn("Personalization: backend profile unavailable", error);
      } finally {
        if (isActive) setReady(true);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [userId, isSignedIn, getToken, refreshIndex]);

  // Persist prefs whenever they change.
  useEffect(() => {
    if (prefsKey && preferences) writeJson(prefsKey, preferences);
  }, [prefsKey, preferences]);

  const recommendationProfile =
    useMemo<UserProfileForRecommendations | null>(() => {
      if (!userId) return null;
      const prefs = preferences ?? emptyPreferences();
      const backendCourse =
        (backendProfile?.courseOfStudy as string | undefined) ||
        (backendProfile?.major as string | undefined) ||
        user?.courseOfStudy;
      return {
        id: userId,
        name: user?.name,
        age: user?.age,
        courseOfStudy: backendCourse,
        interests: prefs.interests,
        location:
          prefs.location ||
          (typeof backendProfile?.country === "string"
            ? backendProfile.country
            : "") ||
          "",
        careerGoals: prefs.careerGoals,
        experienceLevel: prefs.experienceLevel || "intermediate",
        preferredCategories: prefs.preferredCategories.length
          ? prefs.preferredCategories
          : deriveCategories(prefs.interests),
        availability: "flexible",
        educationLevel: prefs.educationLevel || undefined,
      };
    }, [userId, preferences, backendProfile, user]);

  const isPersonalized = Boolean(
    recommendationProfile &&
      (recommendationProfile.interests.length > 0 ||
        recommendationProfile.careerGoals.length > 0 ||
        Boolean(recommendationProfile.courseOfStudy)),
  );

  const behaviorRef = useRef(behavior);
  behaviorRef.current = behavior;

  // Bumped whenever the server match store primes/clears so consumers of
  // explainOpportunity/personalizeFeed re-render with the fresh scores.
  const [matchVersion, setMatchVersion] = useState(0);
  useEffect(
    () => subscribeServerMatches(() => setMatchVersion((v) => v + 1)),
    [],
  );

  const explainOpportunity = useCallback(
    (opportunity: Opportunity): MatchResult => {
      // matchVersion invalidates this callback when server scores arrive.
      void matchVersion;

      // Server-computed scores win outright: the hybrid engine already folds
      // in behaviour signals, so no local boost is layered on top.
      if (userId) {
        const serverMatch = getServerMatch(userId, opportunity.id);
        if (serverMatch) {
          return {
            score: serverMatch.score,
            reasons: serverMatch.reasons,
            risks: serverMatch.risks,
          };
        }
      }

      const base: MatchResult = recommendationProfile
        ? evaluateMatch(recommendationProfile, opportunity)
        : { score: 0, reasons: [], risks: [] };

      const weights = behaviorRef.current;
      let boost = 0;
      const categoryWeight =
        weights.categories[opportunity.category?.toLowerCase() ?? ""] ?? 0;
      boost += Math.min(10, categoryWeight * 2);

      let keywordHits = 0;
      for (const keyword of extractKeywords(opportunity)) {
        keywordHits += weights.keywords[keyword] ?? 0;
      }
      boost += Math.min(10, keywordHits);
      boost = Math.min(MAX_BEHAVIOR_BOOST, boost);

      const reasons = [...base.reasons];
      if (boost >= 4) {
        reasons.push({
          kind: "category",
          label: "Similar to opportunities you've engaged with",
          points: Math.round(boost),
        });
        reasons.sort((a, b) => b.points - a.points);
      }

      return {
        score: Math.min(100, Math.round(base.score + boost)),
        reasons,
        risks: base.risks,
      };
    },
    [recommendationProfile, userId, matchVersion],
  );

  const scoreOpportunity = useCallback(
    (opportunity: Opportunity): number => explainOpportunity(opportunity).score,
    [explainOpportunity],
  );

  const personalizeFeed = useCallback(
    <T extends Opportunity>(
      opportunities: T[],
      options: { seed?: number; tierSize?: number } = {},
    ): T[] => {
      const { seed = 1, tierSize = 15 } = options;
      const scored = opportunities
        .map((opportunity) => ({
          opportunity,
          score: scoreOpportunity(opportunity),
        }))
        .sort((a, b) => b.score - a.score);

      // Group into score tiers and shuffle within each tier so equally good
      // matches rotate between visits without breaking the overall ranking.
      const random = seededRandom(seed);
      const result: T[] = [];
      let tierStart = 0;
      while (tierStart < scored.length) {
        const tierScore = scored[tierStart].score;
        let tierEnd = tierStart + 1;
        while (
          tierEnd < scored.length &&
          tierScore - scored[tierEnd].score < tierSize
        ) {
          tierEnd += 1;
        }
        const tier = scored.slice(tierStart, tierEnd);
        for (let index = tier.length - 1; index > 0; index -= 1) {
          const swap = Math.floor(random() * (index + 1));
          [tier[index], tier[swap]] = [tier[swap], tier[index]];
        }
        tier.forEach((item) => result.push(item.opportunity));
        tierStart = tierEnd;
      }
      return result;
    },
    [scoreOpportunity],
  );

  const trackInteraction = useCallback(
    (
      opportunity: Opportunity,
      type: InteractionType,
      options?: TrackInteractionOptions,
    ) => {
      if (!opportunity?.id) return;
      const weight = INTERACTION_WEIGHTS[type] ?? 1;

      setBehavior((prev) => {
        const next: BehaviorWeights = {
          categories: { ...prev.categories },
          keywords: { ...prev.keywords },
          updatedAt: new Date().toISOString(),
        };
        const category = opportunity.category?.toLowerCase();
        if (category) {
          next.categories[category] = Math.min(
            25,
            (next.categories[category] ?? 0) + weight,
          );
        }
        extractKeywords(opportunity, 5).forEach((keyword) => {
          next.keywords[keyword] = Math.min(
            10,
            (next.keywords[keyword] ?? 0) + weight * 0.5,
          );
        });

        // Keep the maps bounded: drop the weakest entries beyond 60 keys.
        const keywordEntries = Object.entries(next.keywords);
        if (keywordEntries.length > 60) {
          keywordEntries.sort((a, b) => b[1] - a[1]);
          next.keywords = Object.fromEntries(keywordEntries.slice(0, 60));
        }

        if (behaviorKey) writeJson(behaviorKey, next);
        return next;
      });

      // Fire-and-forget analytics write; user_id column expects a Supabase
      // auth UUID which Clerk IDs are not, so identity travels in metadata.
      // TODO: retire once backend exposes engagement analytics (admin views
      // still read this Supabase table).
      void trackOpportunityClick(opportunity.id, type, undefined, "web-app").catch(
        () => undefined,
      );

      // Mirror the signal to the backend recommender (hybrid engine input).
      if (isSignedIn) {
        const signal = mapInteractionToSignal(type, options);
        if (signal) {
          void recordOpportunitySignal(
            {
              opportunityId: opportunity.id,
              signalType: signal.signalType,
              signalValue: signal.signalValue,
              ...(options?.context ? { context: options.context } : {}),
            },
            getToken,
          );
        }
      }
    },
    [behaviorKey, isSignedIn, getToken],
  );

  const savePreferences = useCallback(
    async (update: Partial<PersonalizationPreferences>) => {
      const base = preferences ?? emptyPreferences();
      const interests = update.interests ?? base.interests;
      const next: PersonalizationPreferences = {
        ...base,
        ...update,
        interests,
        preferredCategories:
          update.preferredCategories ?? deriveCategories(interests),
        completedAt: new Date().toISOString(),
      };
      setPreferences(next);
      if (prefsKey) writeJson(prefsKey, next);

      // Best-effort sync into the backend profile so the server-side
      // recommender (and other devices) see the same signals.
      try {
        const token = await getProductApiToken(getToken);
        if (token) {
          await updateBackendProfile(token, {
            interests: next.interests,
            ...(next.location ? { country: next.location } : {}),
          });
        }
      } catch (error) {
        console.warn(
          "Personalization: could not sync preferences to backend",
          error,
        );
      }
    },
    [preferences, prefsKey, getToken],
  );

  const refresh = useCallback(() => setRefreshIndex((v) => v + 1), []);

  const value = useMemo<PersonalizationContextValue>(
    () => ({
      preferences,
      recommendationProfile,
      ready,
      isPersonalized,
      scoreOpportunity,
      explainOpportunity,
      personalizeFeed,
      trackInteraction,
      savePreferences,
      refresh,
    }),
    [
      preferences,
      recommendationProfile,
      ready,
      isPersonalized,
      scoreOpportunity,
      explainOpportunity,
      personalizeFeed,
      trackInteraction,
      savePreferences,
      refresh,
    ],
  );

  return (
    <PersonalizationContext.Provider value={value}>
      {children}
    </PersonalizationContext.Provider>
  );
};

export function usePersonalization(): PersonalizationContextValue {
  const context = useContext(PersonalizationContext);
  if (!context) {
    throw new Error(
      "usePersonalization must be used within a PersonalizationProvider",
    );
  }
  return context;
}
