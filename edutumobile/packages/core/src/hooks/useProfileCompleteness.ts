import { useState, useCallback, useEffect, useMemo } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { toSafeUUID } from '../utils/auth';

/**
 * Three different questions, three different groups — the old scorer collapsed
 * them into one flat percentage, which is why "83% complete" could sit next to
 * "we can't rank you yet" without contradiction.
 *
 *   core        — can we RANK this user at all? Without these there is no
 *                 similarity signal and every opportunity scores the same.
 *   eligibility — can we FILTER OUT what they cannot win? These are the hard
 *                 gates real programmes apply (age caps, citizenship, level of
 *                 study). Missing them is why a feed shows opportunities the
 *                 user is disqualified from — the single loudest complaint in
 *                 the Amara persona audit.
 *   edge        — can we tell them how to COMPETE? Differentiators that shape
 *                 advice and essays rather than eligibility.
 */
export type ProfileFieldGroup = 'core' | 'eligibility' | 'edge';

export interface ProfileFieldSpec {
    key: string;
    label: string;
    /** Relative importance inside its group. */
    weight: number;
    group: ProfileFieldGroup;
    /** Shown in the UI as the reason to bother filling it in. */
    impact: string;
}

/**
 * NOTE ON COVERAGE: onboarding currently captures country, interests,
 * ambitions, schoolName, pursuit and age — it never asks for skills, and never
 * asks for any of the eligibility gates. That is a capture-surface gap, not a
 * scoring gap; the fields are declared here so the product can see and close
 * it. `rankable` deliberately does not depend on the uncaptured fields, so
 * declaring them cannot regress anybody's existing state.
 */
export const PROFILE_FIELDS: ProfileFieldSpec[] = [
    // ── core: needed to rank at all ──────────────────────────────────────────
    { key: 'country', label: 'Country', weight: 2, group: 'core', impact: 'Filters out opportunities closed to your region.' },
    { key: 'interests', label: 'Interests', weight: 3, group: 'core', impact: 'The main signal behind every recommendation you see.' },
    { key: 'ambitions', label: 'Career goals', weight: 2, group: 'core', impact: 'Lets Edutu rank by where you are going, not just what you studied.' },
    { key: 'education', label: 'Education', weight: 2, group: 'core', impact: 'Most programmes gate on your school or level.' },
    { key: 'field_of_study', label: 'Field of study', weight: 2, group: 'core', impact: 'Matches you to field-specific funding.' },

    // ── eligibility: needed to rule things OUT ───────────────────────────────
    { key: 'age', label: 'Age', weight: 3, group: 'eligibility', impact: 'Most fellowships and youth grants have a hard age cap.' },
    { key: 'citizenship', label: 'Citizenship', weight: 3, group: 'eligibility', impact: 'Eligibility keys on your passport, not where you live now.' },
    { key: 'education_level', label: 'Current level', weight: 2, group: 'eligibility', impact: "Separates undergraduate, Master's and PhD calls." },
    { key: 'english_proficiency', label: 'English proficiency', weight: 1, group: 'eligibility', impact: 'Many international programmes require a test score.' },

    // ── edge: needed to compete ──────────────────────────────────────────────
    { key: 'skills', label: 'Skills', weight: 2, group: 'edge', impact: 'Sharpens your essays and referee asks.' },
    { key: 'experience', label: 'Experience', weight: 1, group: 'edge', impact: 'Evidence reviewers look for in a strong application.' },
];

const CORE_FIELDS = PROFILE_FIELDS.filter((f) => f.group === 'core');

export interface ProfileCompleteness {
    /** Weighted 0-100 across every group. */
    score: number;
    /**
     * Back-compatible flag. Now means "we have enough to rank you" rather than
     * "score >= 80" — the old bar was met at 5/6 equal-weight fields, which let
     * a profile with no skills and no eligibility data read as finished.
     */
    isComplete: boolean;
    missingFields: string[];
    missingCount: number;
    totalFields: number;
    hasInterests: boolean;
    hasSkills: boolean;
    hasAmbitions: boolean;
    hasCountry: boolean;
    hasEducation: boolean;
    hasFieldOfStudy: boolean;

    // ── added ────────────────────────────────────────────────────────────────
    /** Every core field present: recommendations are meaningful. */
    rankable: boolean;
    /** Per-group 0-100, so the UI can say *what kind* of gap this is. */
    coreScore: number;
    eligibilityScore: number;
    edgeScore: number;
    /** Missing specs, richest-impact first — drives the prompts. */
    missing: ProfileFieldSpec[];
    /** The single highest-value thing to ask for next, or null when done. */
    nextBestField: ProfileFieldSpec | null;
}

function getUserLookupIds(userId: string): string[] {
    return Array.from(new Set([userId, toSafeUUID(userId)]));
}

function preferCurrentUserRow<T extends { user_id?: string | null }>(rows: T[] | null | undefined, userId: string): T | null {
    if (!rows?.length) {
        return null;
    }

    return rows.find(row => row.user_id === userId) || rows[0];
}

/**
 * Merge-and-dedupe for the multi-source arrays. The previous spread-concat
 * produced duplicates whenever a value existed in more than one store (Clerk
 * metadata AND the synced Supabase row is the normal case, not the exception),
 * which inflated `interests.length` and skewed anything downstream that counted
 * them. Case- and whitespace-insensitive, first spelling wins.
 */
function mergeUnique(...sources: unknown[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const source of sources) {
        if (!Array.isArray(source)) continue;
        for (const raw of source) {
            if (typeof raw !== 'string') continue;
            const value = raw.trim();
            if (!value) continue;
            const key = value.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(value);
        }
    }

    return out;
}

function hasText(value: unknown): boolean {
    return typeof value === 'string' ? value.trim().length > 0 : value != null && value !== '';
}

/**
 * @param fallbackProfile Onboarding's *primary* store — Clerk `unsafeMetadata`.
 *
 * Onboarding writes Clerk first and syncs Supabase fire-and-forget ("must never
 * block navigation… a transient API failure is fine because Clerk metadata
 * already holds the answers"). Reading Supabase alone therefore reports a fully
 * onboarded user as incomplete whenever that background sync didn't land — and
 * the sync never sends skills or major at all, so the Supabase row alone can
 * never clear the bar.
 *
 * Note the scorer already understands this shape: it checks `schoolName` and
 * `pursuit`, which are Clerk draft keys rather than Supabase columns.
 */
export function useProfileCompleteness(
    supabase: SupabaseClient,
    userId: string | null,
    fallbackProfile?: Record<string, any> | null,
) {
    const [completeness, setCompleteness] = useState<ProfileCompleteness>({
        score: 0,
        isComplete: false,
        missingFields: [],
        missingCount: PROFILE_FIELDS.length,
        totalFields: PROFILE_FIELDS.length,
        hasInterests: false,
        hasSkills: false,
        hasAmbitions: false,
        hasCountry: false,
        hasEducation: false,
        hasFieldOfStudy: false,
        rankable: false,
        coreScore: 0,
        eligibilityScore: 0,
        edgeScore: 0,
        missing: [],
        nextBestField: null,
    });
    // Starts true: the mount effect immediately fetches when a user is present,
    // so rendering "loading" from the first frame avoids a synchronous setState
    // in the effect. The returned value derives to false while signed out.
    const [isLoading, setIsLoading] = useState(true);
    const [rawProfile, setRawProfile] = useState<Record<string, any> | null>(null);

    const calculateCompleteness = useCallback((profile: Record<string, any>): ProfileCompleteness => {
        const present: Record<string, boolean> = {
            country: hasText(profile.country),
            interests: Array.isArray(profile.interests) && profile.interests.length > 0,
            ambitions: Array.isArray(profile.ambitions) && profile.ambitions.length > 0,
            education: hasText(profile.education) || hasText(profile.schoolName) || hasText(profile.degree),
            field_of_study: hasText(profile.field_of_study) || hasText(profile.major) || hasText(profile.pursuit),

            // Captured at onboarding but previously never scored or used — age
            // is the single most common hard gate on youth opportunities.
            age: profile.age != null && profile.age !== '' && Number.isFinite(Number(profile.age)),
            citizenship: hasText(profile.citizenship) || hasText(profile.nationality),
            education_level: hasText(profile.education_level) || hasText(profile.educationLevel),
            english_proficiency: hasText(profile.english_proficiency) || hasText(profile.englishProficiency),

            skills: Array.isArray(profile.skills) && profile.skills.length > 0,
            experience: Array.isArray(profile.experience)
                ? profile.experience.length > 0
                : hasText(profile.experience),
        };

        const groupScore = (group: ProfileFieldGroup): number => {
            const fields = PROFILE_FIELDS.filter((f) => f.group === group);
            const total = fields.reduce((sum, f) => sum + f.weight, 0);
            if (total === 0) return 100;
            const earned = fields.reduce((sum, f) => sum + (present[f.key] ? f.weight : 0), 0);
            return Math.round((earned / total) * 100);
        };

        const totalWeight = PROFILE_FIELDS.reduce((sum, f) => sum + f.weight, 0);
        const earnedWeight = PROFILE_FIELDS.reduce((sum, f) => sum + (present[f.key] ? f.weight : 0), 0);

        const missing = PROFILE_FIELDS
            .filter((f) => !present[f.key])
            // Highest weight first, and within equal weight keep core before
            // eligibility before edge — ask for the unlocking field, not the
            // merely nice-to-have one.
            .sort((a, b) => {
                if (b.weight !== a.weight) return b.weight - a.weight;
                const order: ProfileFieldGroup[] = ['core', 'eligibility', 'edge'];
                return order.indexOf(a.group) - order.indexOf(b.group);
            });

        const rankable = CORE_FIELDS.every((f) => present[f.key]);

        return {
            score: Math.round((earnedWeight / totalWeight) * 100),
            isComplete: rankable,
            missingFields: missing.map((f) => f.key),
            missingCount: missing.length,
            totalFields: PROFILE_FIELDS.length,
            hasInterests: present.interests,
            hasSkills: present.skills,
            hasAmbitions: present.ambitions,
            hasCountry: present.country,
            hasEducation: present.education,
            hasFieldOfStudy: present.field_of_study,
            rankable,
            coreScore: groupScore('core'),
            eligibilityScore: groupScore('eligibility'),
            edgeScore: groupScore('edge'),
            missing,
            nextBestField: missing[0] ?? null,
        };
    }, []);

    // Internal fetch as an explicit promise chain: all state updates happen in
    // async callbacks, so the mount effect can call this without a synchronous
    // setState. The public loadProfile below keeps the loading flip for manual
    // refresh callers (event-handler context).
    // Serialised so the fetch callback can depend on the contents rather than
    // the object identity — Clerk hands back a fresh object every render.
    const fallbackKey = fallbackProfile ? JSON.stringify(fallbackProfile) : '';

    const fetchProfile = useCallback((): Promise<void> => {
        if (!userId) return Promise.resolve();

        const fallback: Record<string, any> = fallbackKey ? JSON.parse(fallbackKey) : {};
        const lookupIds = getUserLookupIds(userId);

        return Promise.all([
            supabase
                .from('profiles')
                .select('*')
                .in('user_id', lookupIds),
            supabase
                .from('user_opportunity_preferences')
                .select('*')
                .in('user_id', lookupIds),
        ]).then(([profileResult, prefsResult]) => {
            const profileData = preferCurrentUserRow(profileResult.data, userId) || {};
            const prefsData = preferCurrentUserRow(prefsResult.data, userId) || {};
            const storedPrefs = profileData.preferences || {};

            const mergedProfile = {
                // Clerk metadata sits underneath so a synced Supabase row still
                // wins, but an unsynced one no longer erases the answers.
                ...fallback,
                ...profileData,
                ...storedPrefs,
                interests: mergeUnique(
                    storedPrefs.interests,
                    profileData.interests,
                    prefsData.preferred_categories,
                    fallback.interests,
                ),
                skills: mergeUnique(
                    storedPrefs.skills,
                    profileData.skills,
                    prefsData.preferred_skills,
                    fallback.skills,
                ),
                ambitions: mergeUnique(
                    storedPrefs.ambitions,
                    profileData.ambitions,
                    fallback.ambitions,
                ),
                country: profileData.country || storedPrefs.countryCode || fallback.country || '',
                education:
                    profileData.education || profileData.school || storedPrefs.schoolName
                    || fallback.schoolName || '',
                field_of_study:
                    profileData.field_of_study || profileData.major || storedPrefs.pursuit
                    || fallback.pursuit || '',
                age: profileData.age ?? storedPrefs.age ?? fallback.age ?? null,
                citizenship:
                    profileData.citizenship || profileData.nationality
                    || storedPrefs.citizenship || fallback.citizenship || '',
                education_level:
                    profileData.education_level || storedPrefs.educationLevel
                    || fallback.educationLevel || '',
                english_proficiency:
                    profileData.english_proficiency || storedPrefs.englishProficiency
                    || fallback.englishProficiency || '',
                experience: profileData.experience || storedPrefs.experience || fallback.experience || [],
            };

            setRawProfile(mergedProfile);
            const calculated = calculateCompleteness(mergedProfile);
            setCompleteness(calculated);
        })
            .catch((error: unknown) => {
                console.error('Error loading profile for completeness check:', error);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [supabase, userId, calculateCompleteness, fallbackKey]);

    const loadProfile = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        return fetchProfile();
    }, [userId, fetchProfile]);

    const needsProfileUpdate = useMemo(() => {
        return !completeness.rankable || completeness.eligibilityScore < 50;
    }, [completeness]);

    const personalizedMatchEnabled = useMemo(() => {
        return completeness.hasInterests && completeness.hasCountry;
    }, [completeness]);

    useEffect(() => {
        if (userId) {
            fetchProfile();
        }
    }, [userId, fetchProfile]);

    return {
        completeness,
        // Never report "loading" while signed out — the mount effect only
        // fetches when a user is present.
        isLoading: userId ? isLoading : false,
        rawProfile,
        needsProfileUpdate,
        personalizedMatchEnabled,
        refresh: loadProfile,
    };
}
