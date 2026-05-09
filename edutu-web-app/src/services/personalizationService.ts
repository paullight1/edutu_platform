/**
 * Personalization Service (Supabase-backed)
 * Manages user personalization profiles and generates recommendations
 */

import { supabase } from '../lib/supabaseClient';
import type { Opportunity } from '../types/opportunity';
import type { UserPersonalization, OpportunityRecommendation } from '../types/admin';
import { calculateMatchScore, type UserProfileForRecommendations } from './personalizedRecommendations';

// ================================
// User Personalization Profile
// ================================

export async function getUserPersonalization(userId: string): Promise<UserPersonalization | null> {
    const { data, error } = await supabase
        .from('user_personalization')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data) return null;

    return {
        userId: data.user_id,
        interests: data.interests || [],
        careerGoals: data.career_goals || [],
        experienceLevel: data.experience_level || 'intermediate',
        preferredCategories: data.preferred_categories || [],
        preferredLocations: data.preferred_locations || [],
        availability: data.availability || 'flexible',
        recommendationWeights: data.recommendation_weights || {},
        onboardingCompleted: data.onboarding_completed || false,
        lastUpdated: data.last_updated || data.created_at,
    };
}

export async function saveUserPersonalization(
    userId: string,
    personalization: Partial<UserPersonalization>
): Promise<{ success: boolean; error?: string }> {
    try {
        const payload: Record<string, unknown> = {
            user_id: userId,
        };

        if (personalization.interests !== undefined) {
            payload.interests = personalization.interests;
        }
        if (personalization.careerGoals !== undefined) {
            payload.career_goals = personalization.careerGoals;
        }
        if (personalization.experienceLevel !== undefined) {
            payload.experience_level = personalization.experienceLevel;
        }
        if (personalization.preferredCategories !== undefined) {
            payload.preferred_categories = personalization.preferredCategories;
        }
        if (personalization.preferredLocations !== undefined) {
            payload.preferred_locations = personalization.preferredLocations;
        }
        if (personalization.availability !== undefined) {
            payload.availability = personalization.availability;
        }
        if (personalization.recommendationWeights !== undefined) {
            payload.recommendation_weights = personalization.recommendationWeights;
        }
        if (personalization.onboardingCompleted !== undefined) {
            payload.onboarding_completed = personalization.onboardingCompleted;
        }

        const { error } = await supabase
            .from('user_personalization')
            .upsert(payload, { onConflict: 'user_id' });

        if (error) throw error;

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

export async function completeOnboarding(
    userId: string,
    data: {
        interests: string[];
        careerGoals: string[];
        experienceLevel: string;
        preferredCategories: string[];
        preferredLocations?: string[];
        availability?: string;
    }
): Promise<{ success: boolean; error?: string }> {
    const result = await saveUserPersonalization(userId, {
        ...data,
        experienceLevel: data.experienceLevel as UserPersonalization['experienceLevel'],
        availability: data.availability as UserPersonalization['availability'],
        onboardingCompleted: true,
    });

    if (result.success) {
        // Trigger initial recommendation generation
        await generateRecommendationsForUser(userId);
    }

    return result;
}

// ================================
// Recommendations Engine
// ================================

export async function generateRecommendationsForUser(userId: string): Promise<number> {
    // Get user personalization
    const personalization = await getUserPersonalization(userId);
    if (!personalization) return 0;

    // Get all active opportunities
    const { data: opportunities, error: oppError } = await supabase
        .from('opportunities')
        .select('*')
        .or(`close_date.is.null,close_date.gte.${new Date().toISOString().split('T')[0]}`);

    if (oppError || !opportunities) return 0;

    // Convert to user profile format
    const userProfile: UserProfileForRecommendations = {
        id: userId,
        interests: personalization.interests,
        careerGoals: personalization.careerGoals,
        experienceLevel: personalization.experienceLevel,
        preferredCategories: personalization.preferredCategories,
        availability: personalization.availability,
        location: personalization.preferredLocations[0], // Primary location
    };

    // Calculate match scores
    const recommendations: Array<{
        user_id: string;
        opportunity_id: string;
        match_score: number;
        match_reasons: Array<{ type: string; weight: number }>;
        expires_at: string;
    }> = [];

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const opp of opportunities) {
        const opportunity = normalizeOpportunityForScoring(opp);
        const score = calculateMatchScore(userProfile, opportunity);

        // Apply custom weights if set
        const weights = personalization.recommendationWeights || {};
        let adjustedScore = score;

        // Apply weight adjustments (simplified)
        if (weights.category && userProfile.preferredCategories.includes(opportunity.category)) {
            adjustedScore *= weights.category;
        }
        if (weights.location && opportunity.location.toLowerCase().includes(userProfile.location?.toLowerCase() || '')) {
            adjustedScore *= weights.location;
        }

        // Only save if score is above threshold (20)
        if (adjustedScore >= 20) {
            recommendations.push({
                user_id: userId,
                opportunity_id: opp.id,
                match_score: Math.round(adjustedScore),
                match_reasons: getMatchReasons(userProfile, opportunity, score),
                expires_at: expiresAt,
            });
        }
    }

    // Clear old recommendations
    await supabase
        .from('user_opportunity_recommendations')
        .delete()
        .eq('user_id', userId)
        .lt('expires_at', new Date().toISOString());

    // Insert new recommendations (upsert to handle existing)
    if (recommendations.length > 0) {
        for (const rec of recommendations) {
            await supabase
                .from('user_opportunity_recommendations')
                .upsert(rec, { onConflict: 'user_id,opportunity_id' });
        }
    }

    return recommendations.length;
}

export async function getRecommendationsForUser(
    userId: string,
    options: { limit?: number; includeDismissed?: boolean } = {}
): Promise<Array<{ opportunity: Opportunity; matchScore: number; matchReasons: any[] }>> {
    const { limit = 20, includeDismissed = false } = options;

    let query = supabase
        .from('user_opportunity_recommendations')
        .select(`
      match_score,
      match_reasons,
      opportunities (*)
    `)
        .eq('user_id', userId)
        .gte('expires_at', new Date().toISOString())
        .order('match_score', { ascending: false })
        .limit(limit);

    if (!includeDismissed) {
        query = query.eq('is_dismissed', false);
    }

    const { data, error } = await query;

    if (error || !data) return [];

    return data.map((row: any) => ({
        opportunity: normalizeOpportunityForDisplay(row.opportunities),
        matchScore: row.match_score,
        matchReasons: row.match_reasons || [],
    }));
}

export async function dismissRecommendation(userId: string, opportunityId: string): Promise<void> {
    await supabase
        .from('user_opportunity_recommendations')
        .update({ is_dismissed: true })
        .eq('user_id', userId)
        .eq('opportunity_id', opportunityId);
}

export async function saveRecommendation(userId: string, opportunityId: string): Promise<void> {
    await supabase
        .from('user_opportunity_recommendations')
        .update({ is_saved: true })
        .eq('user_id', userId)
        .eq('opportunity_id', opportunityId);

    // Also add to bookmarks
    await supabase
        .from('opportunity_bookmarks')
        .upsert({
            user_id: userId,
            opportunity_id: opportunityId,
            saved_at: new Date().toISOString(),
        }, { onConflict: 'user_id,opportunity_id' });
}

// ================================
// Opportunity Click Tracking
// ================================

export async function trackOpportunityClick(
    opportunityId: string,
    clickType: 'view' | 'apply' | 'bookmark' | 'share',
    userId?: string,
    referrer?: string
): Promise<void> {
    await supabase.from('opportunity_clicks').insert({
        opportunity_id: opportunityId,
        user_id: userId || null,
        click_type: clickType,
        referrer: referrer || null,
        metadata: {
            timestamp: new Date().toISOString(),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        },
    });
}

// ================================
// Helper Functions
// ================================

function normalizeOpportunityForScoring(row: any): Opportunity {
    return {
        id: row.id,
        title: row.title,
        organization: row.organization || 'Unknown',
        category: row.category || 'General',
        location: row.location || (row.is_remote ? 'Remote' : ''),
        description: row.description || row.summary || '',
        requirements: row.metadata?.requirements || [],
        benefits: row.metadata?.benefits || [],
        applicationProcess: row.metadata?.application_process || [],
        match: 0,
        difficulty: row.metadata?.difficulty,
        isRemote: row.is_remote,
        tags: row.tags || [],
    };
}

function normalizeOpportunityForDisplay(row: any): Opportunity {
    return {
        id: row.id,
        title: row.title,
        organization: row.organization || 'Community Provider',
        category: row.category || 'General',
        location: row.location || (row.is_remote ? 'Remote' : ''),
        description: row.description || row.summary || 'No description provided.',
        deadline: row.close_date || null,
        image: row.metadata?.image || null,
        requirements: row.metadata?.requirements || [],
        benefits: row.metadata?.benefits || [],
        applicationProcess: row.metadata?.application_process || [],
        applicants: row.metadata?.applicants,
        successRate: row.metadata?.success_rate,
        applyUrl: row.application_url,
        lastUpdated: row.updated_at,
        match: row.match_score || 0,
        difficulty: row.metadata?.difficulty,
        isRemote: row.is_remote,
        featured: row.metadata?.featured,
        tags: row.tags || [],
        source: row.source,
    };
}

function getMatchReasons(
    userProfile: UserProfileForRecommendations,
    opportunity: Opportunity,
    score: number
): Array<{ type: string; weight: number }> {
    const reasons: Array<{ type: string; weight: number }> = [];

    // Check category match
    if (userProfile.preferredCategories.includes(opportunity.category)) {
        reasons.push({ type: 'preferred_category', weight: 30 });
    }

    // Check interest match
    const hasInterestMatch = userProfile.interests.some(interest =>
        opportunity.category.toLowerCase().includes(interest.toLowerCase()) ||
        opportunity.title.toLowerCase().includes(interest.toLowerCase()) ||
        (opportunity.tags || []).some(tag => tag.toLowerCase().includes(interest.toLowerCase()))
    );
    if (hasInterestMatch) {
        reasons.push({ type: 'interest_match', weight: 25 });
    }

    // Check location match
    if (opportunity.isRemote ||
        (userProfile.location && opportunity.location.toLowerCase().includes(userProfile.location.toLowerCase()))) {
        reasons.push({ type: 'location_match', weight: 15 });
    }

    // Check career goal match
    const opportunityText = `${opportunity.title} ${opportunity.description}`.toLowerCase();
    const hasGoalMatch = userProfile.careerGoals.some(goal =>
        opportunityText.includes(goal.toLowerCase())
    );
    if (hasGoalMatch) {
        reasons.push({ type: 'career_goal_match', weight: 20 });
    }

    return reasons;
}

export default {
    getUserPersonalization,
    saveUserPersonalization,
    completeOnboarding,
    generateRecommendationsForUser,
    getRecommendationsForUser,
    dismissRecommendation,
    saveRecommendation,
    trackOpportunityClick,
};
