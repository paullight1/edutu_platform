import { useState, useCallback, useEffect, useMemo } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { toSafeUUID } from '../utils/auth';

export interface ProfileCompleteness {
    score: number;
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
}

const PROFILE_FIELDS = [
    { key: 'country', label: 'Country', weight: 1 },
    { key: 'interests', label: 'Interests', weight: 1 },
    { key: 'skills', label: 'Skills', weight: 1 },
    { key: 'ambitions', label: 'Career Goals', weight: 1 },
    { key: 'education', label: 'Education', weight: 1 },
    { key: 'field_of_study', label: 'Field of Study', weight: 1 },
];

function getUserLookupIds(userId: string): string[] {
    return Array.from(new Set([userId, toSafeUUID(userId)]));
}

function preferCurrentUserRow<T extends { user_id?: string | null }>(rows: T[] | null | undefined, userId: string): T | null {
    if (!rows?.length) {
        return null;
    }

    return rows.find(row => row.user_id === userId) || rows[0];
}

export function useProfileCompleteness(supabase: SupabaseClient, userId: string | null) {
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
    });
    const [isLoading, setIsLoading] = useState(false);
    const [rawProfile, setRawProfile] = useState<Record<string, any> | null>(null);

    const calculateCompleteness = useCallback((profile: Record<string, any>): ProfileCompleteness => {
        const missingFields: string[] = [];
        let score = 0;

        const hasInterests = Array.isArray(profile.interests) && profile.interests.length > 0;
        const hasSkills = Array.isArray(profile.skills) && profile.skills.length > 0;
        const hasAmbitions = Array.isArray(profile.ambitions) && profile.ambitions.length > 0;
        const hasCountry = !!profile.country && profile.country.length > 0;
        const hasEducation = !!profile.education || !!profile.schoolName || !!profile.degree;
        const hasFieldOfStudy = !!profile.field_of_study || !!profile.major || !!profile.pursuit;

        if (!hasCountry) missingFields.push('country');
        else score += 1;

        if (!hasInterests) missingFields.push('interests');
        else score += 1;

        if (!hasSkills) missingFields.push('skills');
        else score += 1;

        if (!hasAmbitions) missingFields.push('ambitions');
        else score += 1;

        if (!hasEducation) missingFields.push('education');
        else score += 1;

        if (!hasFieldOfStudy) missingFields.push('field_of_study');
        else score += 1;

        const totalFields = PROFILE_FIELDS.length;
        const completionScore = Math.round((score / totalFields) * 100);

        return {
            score: completionScore,
            isComplete: completionScore >= 80,
            missingFields,
            missingCount: missingFields.length,
            totalFields,
            hasInterests,
            hasSkills,
            hasAmbitions,
            hasCountry,
            hasEducation,
            hasFieldOfStudy,
        };
    }, []);

    const loadProfile = useCallback(async () => {
        if (!userId) return;

        setIsLoading(true);
        try {
            const lookupIds = getUserLookupIds(userId);

            const [profileResult, prefsResult] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('*')
                    .in('user_id', lookupIds),
                supabase
                    .from('user_opportunity_preferences')
                    .select('*')
                    .in('user_id', lookupIds),
            ]);

            const profileData = preferCurrentUserRow(profileResult.data, userId) || {};
            const prefsData = preferCurrentUserRow(prefsResult.data, userId) || {};
            const storedPrefs = profileData.preferences || {};

            const mergedProfile = {
                ...profileData,
                ...storedPrefs,
                interests: [
                    ...(storedPrefs.interests || []),
                    ...(profileData.interests || []),
                    ...(prefsData.preferred_categories || []),
                ],
                skills: [
                    ...(storedPrefs.skills || []),
                    ...(profileData.skills || []),
                    ...(prefsData.preferred_skills || []),
                ],
                ambitions: storedPrefs.ambitions || profileData.ambitions || [],
                country: profileData.country || storedPrefs.countryCode || '',
                education: profileData.education || profileData.school || storedPrefs.schoolName || '',
                field_of_study: profileData.field_of_study || profileData.major || storedPrefs.pursuit || '',
            };

            setRawProfile(mergedProfile);
            const calculated = calculateCompleteness(mergedProfile);
            setCompleteness(calculated);
        } catch (error) {
            console.error('Error loading profile for completeness check:', error);
        } finally {
            setIsLoading(false);
        }
    }, [supabase, userId, calculateCompleteness]);

    const needsProfileUpdate = useMemo(() => {
        return !completeness.isComplete && completeness.missingCount >= 2;
    }, [completeness]);

    const personalizedMatchEnabled = useMemo(() => {
        return completeness.hasInterests && completeness.hasCountry;
    }, [completeness]);

    useEffect(() => {
        if (userId) {
            loadProfile();
        }
    }, [userId, loadProfile]);

    return {
        completeness,
        isLoading,
        rawProfile,
        needsProfileUpdate,
        personalizedMatchEnabled,
        refresh: loadProfile,
    };
}
