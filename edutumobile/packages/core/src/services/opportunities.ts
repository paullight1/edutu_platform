import AsyncStorage from '@react-native-async-storage/async-storage';
import { SupabaseClient } from '@supabase/supabase-js';
import { MatchReason, Opportunity, OpportunityDifficulty } from '../types/opportunity';
import { toSafeUUID } from '../utils/auth';
import { categorizeOpportunity } from './opportunityCategorization';

let cachedOpportunities: Opportunity[] | null = null;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com';
const OPPORTUNITIES_CACHE_KEY = 'edutu_opportunities_cache';

interface FetchOptions {
  supabase: SupabaseClient;
  signal?: AbortSignal;
  force?: boolean;
  userId?: string;
  getAuthToken?: () => Promise<string | null | undefined>;
  profileOverride?: Record<string, unknown> | null;
  onSyncSnapshot?: (opportunities: Opportunity[]) => Promise<void>;
  onUpdateN8n?: (opportunities: Opportunity[], userId: string) => Promise<void>;
}

function getCacheKey(userId?: string): string {
  return `${OPPORTUNITIES_CACHE_KEY}:${userId || 'guest'}`;
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

export async function getCachedOpportunitiesSnapshot(userId?: string): Promise<Opportunity[]> {
  try {
    const raw = await AsyncStorage.getItem(getCacheKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Opportunity[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persistOpportunitiesSnapshot(opportunities: Opportunity[], userId?: string): Promise<void> {
  try {
    await AsyncStorage.setItem(getCacheKey(userId), JSON.stringify(opportunities));
  } catch {
    // Ignore cache persistence failures.
  }
}

async function syncExternalSnapshot(
  onSyncSnapshot: FetchOptions['onSyncSnapshot'],
  opportunities: Opportunity[],
): Promise<void> {
  if (!onSyncSnapshot) {
    return;
  }

  void onSyncSnapshot(opportunities).catch(() => {
    // Widget/feed snapshots should not block opportunity loading.
  });
}

function normaliseOpportunity(row: any): Opportunity {
  const meta = row.metadata || {};
  const shareCard = meta.share_card || {};
  const canonicalCategory = categorizeOpportunity(row);
  return {
    id: row.id,
    title: row.title,
    organization: row.organization || row.provider || row.fundingType || row.category || 'Community Provider',
    category: row.category || 'General',
    canonicalCategory,
    location: row.location || row.targetRegion || (row.is_remote || row.isRemote ? 'Remote' : 'Worldwide'),
    description: row.description || 'No description provided.',
    deadline: row.close_date || row.deadline || null,
    image: row.image_url || row.imageUrl || null,
    requirements: row.requirements?.length
      ? row.requirements
      : (meta.requirements ?? (row.eligibilityCriteria ? [row.eligibilityCriteria] : [])),
    benefits: row.benefits?.length ? row.benefits : (meta.benefits ?? []),
    applicationProcess: row.application_process?.length ? row.application_process : (meta.application_process ?? []),
    applyUrl: row.application_url || row.external_url || row.applyUrl || null,
    shareImageUrl: row.share_image_url || row.shareImageUrl || shareCard.url || null,
    lastUpdated: row.updated_at,
    match: row.match || 0,
    difficulty: (row.difficulty as OpportunityDifficulty) || 'Medium',
    featured: row.is_featured || row.isFeatured || false,
    aiSummary: row.aiSummary || row.ai_summary || row.refined_summary || null,
    matchReasons: row.matchReasons || row.match_reasons || [],
    matchRisks: row.matchRisks || row.match_risks || [],
    aiTags: row.aiTags || row.ai_tags || row.tags || [],
    stipend: row.stipend || null,
    currency: row.currency || null,
    eligibility: row.eligibility || {},
    roadmap: row.roadmap || meta.roadmap || [],
    tags: row.tags || [],
  };
}

function normaliseProfileInput(profile: Record<string, any> | null | undefined) {
  if (!profile) {
    return null;
  }

  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  const ambitions = Array.isArray(profile.ambitions) ? profile.ambitions : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];

  return {
    ...profile,
    interests,
    ambitions,
    skills,
    country: profile.country || profile.countryCode || '',
    field_of_study:
      profile.field_of_study ||
      profile.pursuit ||
      profile.schoolName ||
      profile.gradeLevel ||
      '',
  };
}

function buildOpportunityContext(opportunity: any): string {
  return [
    opportunity.title,
    opportunity.organization,
    opportunity.category,
    opportunity.location,
    opportunity.aiSummary,
    opportunity.description,
    ...(opportunity.requirements || []),
    ...(opportunity.benefits || []),
    ...(opportunity.applicationProcess || opportunity.application_process || []),
    ...(opportunity.aiTags || opportunity.ai_tags || []),
    ...(opportunity.tags || []),
    ...(opportunity.skills || []),
    ...(opportunity.roadmap || []).map((step: any) => `${step?.title || ''} ${step?.description || ''}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export interface MatchResult {
  score: number;
  reasons: MatchReason[];
  risks: string[];
}

/**
 * Pure scoring: given a (normalised) profile and an opportunity row, returns the
 * match score together with plain-English reasons and any risks worth flagging.
 * Does NOT mutate the opportunity — callers assign the results explicitly.
 */
export function evaluateMatch(profile: any, opportunity: any): MatchResult {
  const reasons: MatchReason[] = [];
  const risks: string[] = [];

  if (!profile) {
    return { score: 0, reasons, risks };
  }

  let score = 0;
  let criteriaCount = 0;
  const eligibility = opportunity.eligibility || {};
  const oppSearchText = buildOpportunityContext(opportunity);

  // 1. Field of Study / Major Match
  if (profile.field_of_study) {
    criteriaCount++;
    const userField = profile.field_of_study.toLowerCase();
    const oppField = eligibility.major?.toLowerCase();

    if (oppField && userField === oppField) {
      score += 1.5;
      reasons.push({ kind: 'field', label: `Fits your field, ${profile.field_of_study}`, points: 1.5 });
    } else if (oppSearchText.includes(userField)) {
      score += 1.0;
      reasons.push({ kind: 'field', label: `Related to your field, ${profile.field_of_study}`, points: 1.0 });
    }
  }

  // 2. Skills Overlap
  if (profile.skills && Array.isArray(profile.skills) && profile.skills.length > 0) {
    criteriaCount++;
    let hitCount = 0;
    const matchedSkills: string[] = [];
    profile.skills.forEach((skill: string) => {
      if (oppSearchText.includes(skill.toLowerCase())) {
        hitCount++;
        matchedSkills.push(skill);
      }
    });
    const points = Math.min(1.5, hitCount / Math.max(1, profile.skills.length / 2));
    score += points;
    if (matchedSkills.length > 0) {
      reasons.push({
        kind: 'experience',
        label: `Uses your skills: ${matchedSkills.slice(0, 2).join(', ')}`,
        points,
      });
    }
  }

  // 3. Interests Overlap
  if (profile.interests && Array.isArray(profile.interests) && profile.interests.length > 0) {
    criteriaCount++;
    let hitCount = 0;
    const matchedInterests: string[] = [];
    profile.interests.forEach((interest: string) => {
      if (oppSearchText.includes(interest.toLowerCase())) {
        hitCount++;
        matchedInterests.push(interest);
      }
    });
    const points = Math.min(1.0, hitCount / Math.max(1, profile.interests.length / 2));
    score += points;
    if (matchedInterests.length > 0) {
      reasons.push({
        kind: 'interest',
        label: `Matches your interest in ${matchedInterests[0]}`,
        points,
      });
    }
  }

  // 4. Ambition / goal alignment
  if (profile.ambitions && Array.isArray(profile.ambitions) && profile.ambitions.length > 0) {
    criteriaCount++;
    let hitCount = 0;
    const matchedGoals: string[] = [];
    profile.ambitions.forEach((ambition: string) => {
      if (oppSearchText.includes(ambition.toLowerCase())) {
        hitCount++;
        matchedGoals.push(ambition);
      }
    });
    const points = Math.min(1.0, hitCount / Math.max(1, profile.ambitions.length));
    score += points;
    if (matchedGoals.length > 0) {
      reasons.push({ kind: 'goal', label: `Supports your goal: ${matchedGoals[0]}`, points });
    }
  }

  // 5. Country Match (Strict Filter)
  if (eligibility.countries && Array.isArray(eligibility.countries) && eligibility.countries.length > 0) {
    criteriaCount++;
    const countries = eligibility.countries.map((c: string) => c.toLowerCase());

    if (profile.country) {
      if (countries.includes(profile.country.toLowerCase())) {
        score += 1.0;
        reasons.push({ kind: 'location', label: `Open to your country, ${profile.country}`, points: 1.0 });
      } else {
        risks.push(`May not be open to applicants from ${profile.country}`);
        return { score: 0, reasons, risks };
      }
    } else {
      // User has no country set, apply a partial penalty
      score += 0.3;
      risks.push('Confirm this opportunity is open in your country');
    }
  } else {
    // Open to all countries
    criteriaCount++;
    score += 0.5;
  }

  if (profile.preferredRegions && profile.preferredRegions.length > 0) {
    criteriaCount++;
    let hitCount = 0;
    const matchedRegions: string[] = [];
    profile.preferredRegions.forEach((region: string) => {
      if (oppSearchText.includes(region.toLowerCase()) || opportunity.location?.toLowerCase().includes(region.toLowerCase())) {
        hitCount++;
        matchedRegions.push(region);
      }
    });
    const points = Math.min(1.0, hitCount);
    score += points;
    if (matchedRegions.length > 0) {
      reasons.push({ kind: 'location', label: `Open to your region, ${matchedRegions[0]}`, points });
    }
  }

  // Remote Only preference
  if (profile.remoteOnly) {
    criteriaCount++;
    if (opportunity.location?.toLowerCase().includes('remote') || opportunity.is_remote) {
      score += 1.5;
      reasons.push({ kind: 'remote', label: 'Remote — open to applicants anywhere', points: 1.5 });
    } else {
      risks.push('Not a remote opportunity');
      return { score: 0, reasons, risks };
    }
  }

  // 6. Deadline urgency bonus (opportunities with closer deadlines get a slight boost)
  if (opportunity.deadline || opportunity.close_date) {
    const deadline = new Date(opportunity.deadline || opportunity.close_date);
    const now = new Date();
    const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil > 0 && daysUntil <= 30) {
      score += 0.3;
    }
    if (daysUntil >= 0 && daysUntil <= 3) {
      risks.push('Deadline is very close — apply soon');
    }
  }

  // 7. Featured bonus
  if (opportunity.is_featured || opportunity.featured) {
    score += 0.2;
  }

  // Difficulty vs experience level risk (informational, does not affect score)
  const difficulty = (opportunity.difficulty || '').toString().toLowerCase();
  const level = (profile.experienceLevel || profile.level || '').toString().toLowerCase();
  if (difficulty === 'hard' && /beginner|entry|student|junior/.test(level)) {
    risks.push('This is an advanced opportunity for your level');
  }

  // If no criteria could be evaluated, assign a low baseline score
  if (criteriaCount === 0) {
    return { score: 15, reasons, risks };
  }

  const maxPossibleScore = 9.5;
  const normalizedPercentage = (score / Math.min(criteriaCount * 1.5, maxPossibleScore)) * 100;

  const finalScore = Math.min(100, Math.round(normalizedPercentage));

  return { score: finalScore, reasons, risks };
}

function calculateMatchScore(opportunity: any, profile: any): number {
  return evaluateMatch(profile, opportunity).score;
}

export async function fetchOpportunities(options: FetchOptions): Promise<Opportunity[]> {
  const { supabase, force, userId, getAuthToken, profileOverride, signal, onSyncSnapshot } = options;

  if (!force && cachedOpportunities && !userId) {
    return cachedOpportunities;
  }

  let profile: any = normaliseProfileInput(profileOverride);
  if (userId) {
    try {
      const lookupIds = getUserLookupIds(userId);
      const [profileResult, prefsResult] = await Promise.all([
        supabase.from('profiles').select('*').in('user_id', lookupIds),
        supabase.from('user_opportunity_preferences').select('*').in('user_id', lookupIds)
      ]);

      const profData = preferCurrentUserRow(profileResult.data, userId) || {};
      const prefData = preferCurrentUserRow(prefsResult.data, userId) || {};
      const storedPrefs = (profData as any).preferences || {};

      profile = normaliseProfileInput({
        ...profileOverride,
        ...profData,
        ...storedPrefs,
        interests: [
          ...(storedPrefs.interests || []),
          ...(profData.interests || []),
          ...(prefData.preferred_categories || [])
        ],
        ambitions: storedPrefs.ambitions || profData.ambitions || [],
        skills: [...(storedPrefs.skills || []), ...(profData.skills || []), ...(prefData.preferred_skills || [])],
        preferredRegions: prefData.preferred_regions || [],
        remoteOnly: prefData.remote_only || false,
      });
    } catch (e) {
      if (__DEV__) {
        console.warn('Failed to fetch user profile/preferences for matching:', e);
      }
    }
  }

  // Prefer the authenticated backend. It can use server-side profile data,
  // preferences, goals, dismiss signals, and AI reranking consistently.
  const isLocalhost = API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1');
  const shouldSkipApi = isLocalhost && typeof window !== 'undefined' && !window.location; // Simple mobile detection fallback

  if (API_BASE_URL && !shouldSkipApi && userId && getAuthToken) {
    try {
      const token = await getAuthToken();
      if (token) {
        const response = await fetch(`${API_BASE_URL}/opportunities/recommendations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            limit: 50,
            minMatchScore: 0,
          }),
          signal,
        });

        if (response.ok) {
          const payload = await response.json();
          const apiOpportunities = (payload.opportunities || []).map((row: any) => normaliseOpportunity(row));
          cachedOpportunities = apiOpportunities;
          await persistOpportunitiesSnapshot(apiOpportunities, userId);
          syncExternalSnapshot(onSyncSnapshot, apiOpportunities);
          return apiOpportunities;
        }
      }
    } catch (networkError) {
      if (__DEV__) {
        console.warn('Authenticated recommendations failed, falling back to local matching:', networkError);
      }
    }
  }

  if (API_BASE_URL && !shouldSkipApi) {
    try {
      const response = await fetch(`${API_BASE_URL}/opportunities/recommendations/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile,
          limit: 50,
          minMatchScore: userId ? 0 : 30,
        }),
        signal,
      });

      if (response.ok) {
        const payload = await response.json();
        let apiOpportunities = (payload.opportunities || []).map((row: any) => normaliseOpportunity(row));
        cachedOpportunities = apiOpportunities;
        await persistOpportunitiesSnapshot(apiOpportunities, userId);
        syncExternalSnapshot(onSyncSnapshot, apiOpportunities);
        return apiOpportunities;
      }
    } catch (networkError) {
      // Fallback silently to Supabase if API is down
      if (__DEV__) {
        if (isLocalhost) {
          console.log('Local API not reachable, using direct Supabase connection');
        } else {
          console.warn('API fetch failed, falling back to direct Supabase query:', networkError);
        }
      }
    }
  }

  const { data: opps, error: oppError } = await supabase
    .from('opportunities')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (oppError) throw oppError;

  let normalised = (opps || []).map(row => {
    const opt = normaliseOpportunity(row);
    const result = evaluateMatch(profile, row);
    opt.match = result.score;
    // Prefer server-provided reasons; only fall back to local evaluation when
    // the row didn't already carry any.
    if (!opt.matchReasons || opt.matchReasons.length === 0) {
      opt.matchReasons = result.reasons.map(r => r.label);
      opt.matchReasonDetails = result.reasons;
    }
    if (!opt.matchRisks || opt.matchRisks.length === 0) {
      opt.matchRisks = result.risks;
    }
    return opt;
  });

  // Sort by match score if we have a profile to match against
  if (userId) {
    normalised.sort((a, b) => (b.match || 0) - (a.match || 0));
  }

  cachedOpportunities = normalised;
  await persistOpportunitiesSnapshot(normalised, userId);
  syncExternalSnapshot(onSyncSnapshot, normalised);

  return normalised;
}

export async function getOpportunity(id: string, supabase?: SupabaseClient): Promise<Opportunity | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('opportunities')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw error || new Error('No data found');
    }

    return normaliseOpportunity(data);
  } catch (error) {
    console.error('Error fetching single opportunity:', error);
    return null;
  }
}

export function clearOpportunitiesCache() {
  cachedOpportunities = null;
}
