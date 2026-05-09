/**
 * Marketplace Admin Service
 * Handles community marketplace moderation, approval, and featuring
 */

import { supabase } from '../../lib/supabaseClient';
import { logAdminAction } from './adminService';
import type { CommunityStory, CommunityStoryStatus } from '../../types/community';

// ================================
// Types
// ================================

export interface MarketplaceItem {
    id: string;
    title: string;
    type: 'roadmap' | 'marketplace' | 'resource';
    status: CommunityStoryStatus;
    authorId: string;
    authorName: string;
    authorEmail: string;
    category: string;
    submittedAt: string;
    reviewedAt?: string;
    reviewedBy?: string;
    featured: boolean;
    featuredRank?: number;
    stats: {
        views: number;
        saves: number;
        adoptions: number;
        likes: number;
    };
    moderatorNotes: Array<{
        id: string;
        note: string;
        author: string;
        createdAt: string;
    }>;
}

export interface MarketplaceFilters {
    status?: CommunityStoryStatus[];
    type?: string[];
    category?: string;
    featured?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
}

export interface ApprovalPayload {
    itemId: string;
    decision: 'approve' | 'reject' | 'request_changes';
    note?: string;
    featured?: boolean;
    featuredRank?: number;
}

// ================================
// Fetch Functions
// ================================

export async function getMarketplaceItems(filters: MarketplaceFilters = {}): Promise<MarketplaceItem[]> {
    const items: MarketplaceItem[] = [];

    // Fetch from community_posts (roadmaps)
    if (!filters.type || filters.type.includes('roadmap')) {
        let query = supabase
            .from('community_posts')
            .select(`
        *,
        profiles!community_posts_user_id_fkey (
          full_name,
          email
        )
      `)
            .eq('type', 'roadmap');

        if (filters.status && filters.status.length > 0) {
            const visibilityMap: Record<CommunityStoryStatus, string> = {
                approved: 'public',
                pending: 'admins',
                rejected: 'mentors', // Using mentors as rejected visibility
                hidden: 'admins',
            };
            const visibilities = filters.status.map(s => visibilityMap[s]).filter(Boolean);
            if (visibilities.length > 0) {
                query = query.in('visibility', visibilities);
            }
        }

        if (filters.category) {
            query = query.contains('metadata', { category: filters.category });
        }

        if (filters.featured !== undefined) {
            query = query.contains('metadata', { featured: filters.featured });
        }

        if (filters.search) {
            query = query.ilike('title', `%${filters.search}%`);
        }

        if (filters.limit) {
            query = query.limit(filters.limit);
        }

        if (filters.offset) {
            query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
        }

        query = query.order('created_at', { ascending: false });

        const { data, error } = await query;
        if (!error && data) {
            items.push(...data.map(row => mapPostToMarketplaceItem(row)));
        }
    }

    // Fetch from marketplace_listings
    if (!filters.type || filters.type.includes('marketplace')) {
        let query = supabase
            .from('marketplace_listings')
            .select(`
        *,
        profiles!marketplace_listings_user_id_fkey (
          full_name,
          email
        )
      `);

        if (filters.status && filters.status.length > 0) {
            const statusMap: Record<CommunityStoryStatus, string> = {
                approved: 'active',
                pending: 'paused',
                rejected: 'closed',
                hidden: 'closed',
            };
            const statuses = filters.status.map(s => statusMap[s]).filter(Boolean);
            if (statuses.length > 0) {
                query = query.in('status', statuses);
            }
        }

        if (filters.category) {
            query = query.eq('category', filters.category);
        }

        if (filters.search) {
            query = query.ilike('title', `%${filters.search}%`);
        }

        if (filters.limit) {
            query = query.limit(filters.limit);
        }

        query = query.order('created_at', { ascending: false });

        const { data, error } = await query;
        if (!error && data) {
            items.push(...data.map(row => mapListingToMarketplaceItem(row)));
        }
    }

    return items;
}

export async function getPendingApprovals(): Promise<MarketplaceItem[]> {
    return getMarketplaceItems({
        status: ['pending'],
        limit: 50,
    });
}

export async function getFeaturedItems(): Promise<MarketplaceItem[]> {
    return getMarketplaceItems({
        featured: true,
        status: ['approved'],
        limit: 20,
    });
}

// ================================
// Moderation Actions
// ================================

export async function processApproval(payload: ApprovalPayload): Promise<{ success: boolean; error?: string }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Determine if it's a post or listing
        const { data: post } = await supabase
            .from('community_posts')
            .select('id, user_id')
            .eq('id', payload.itemId)
            .maybeSingle();

        if (post) {
            // It's a community post (roadmap)
            const newVisibility = payload.decision === 'approve' ? 'public' :
                payload.decision === 'reject' ? 'mentors' : 'admins';

            const metadata: Record<string, unknown> = {
                reviewed_at: new Date().toISOString(),
                reviewed_by: user.id,
                review_decision: payload.decision,
            };

            if (payload.featured !== undefined) {
                metadata.featured = payload.featured;
            }

            if (payload.featuredRank !== undefined) {
                metadata.featuredRank = payload.featuredRank;
            }

            // Get existing metadata
            const { data: existingPost } = await supabase
                .from('community_posts')
                .select('metadata')
                .eq('id', payload.itemId)
                .single();

            const { error } = await supabase
                .from('community_posts')
                .update({
                    visibility: newVisibility,
                    metadata: {
                        ...((existingPost?.metadata as object) || {}),
                        ...metadata,
                    },
                })
                .eq('id', payload.itemId);

            if (error) throw error;

            // Add moderator note if provided
            if (payload.note) {
                await addModeratorNote(payload.itemId, payload.note, user.id);
            }

            // Send notification to author
            await notifyAuthorOfDecision(post.user_id, payload);

            // Log the admin action
            await logAdminAction(
                `marketplace:${payload.decision}`,
                'community_post',
                payload.itemId,
                { note: payload.note, featured: payload.featured }
            );
        } else {
            // Check if it's a marketplace listing
            const { data: listing } = await supabase
                .from('marketplace_listings')
                .select('id, user_id')
                .eq('id', payload.itemId)
                .maybeSingle();

            if (!listing) throw new Error('Item not found');

            const newStatus = payload.decision === 'approve' ? 'active' : 'closed';

            const { error } = await supabase
                .from('marketplace_listings')
                .update({
                    status: newStatus,
                    metadata: {
                        reviewed_at: new Date().toISOString(),
                        reviewed_by: user.id,
                        review_decision: payload.decision,
                        featured: payload.featured,
                        featuredRank: payload.featuredRank,
                    },
                })
                .eq('id', payload.itemId);

            if (error) throw error;

            await notifyAuthorOfDecision(listing.user_id, payload);
            await logAdminAction(
                `marketplace:${payload.decision}`,
                'marketplace_listing',
                payload.itemId,
                { note: payload.note, featured: payload.featured }
            );
        }

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

export async function setFeaturedStatus(
    itemId: string,
    featured: boolean,
    featuredRank?: number
): Promise<{ success: boolean; error?: string }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Try community_posts first
        const { data: post } = await supabase
            .from('community_posts')
            .select('metadata')
            .eq('id', itemId)
            .maybeSingle();

        if (post) {
            const { error } = await supabase
                .from('community_posts')
                .update({
                    metadata: {
                        ...((post.metadata as object) || {}),
                        featured,
                        featuredRank: featuredRank ?? null,
                        featured_at: featured ? new Date().toISOString() : null,
                        featured_by: featured ? user.id : null,
                    },
                })
                .eq('id', itemId);

            if (error) throw error;
        } else {
            // Try marketplace_listings
            const { data: listing } = await supabase
                .from('marketplace_listings')
                .select('metadata')
                .eq('id', itemId)
                .maybeSingle();

            if (!listing) throw new Error('Item not found');

            const { error } = await supabase
                .from('marketplace_listings')
                .update({
                    metadata: {
                        ...((listing.metadata as object) || {}),
                        featured,
                        featuredRank: featuredRank ?? null,
                    },
                })
                .eq('id', itemId);

            if (error) throw error;
        }

        await logAdminAction(
            featured ? 'marketplace:feature' : 'marketplace:unfeature',
            'marketplace_item',
            itemId,
            { featuredRank }
        );

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

export async function addModeratorNote(
    itemId: string,
    note: string,
    authorId: string
): Promise<void> {
    const noteEntry = {
        id: `note-${Date.now()}`,
        note,
        author: authorId,
        createdAt: new Date().toISOString(),
    };

    // Try community_posts first
    const { data: post } = await supabase
        .from('community_posts')
        .select('metadata')
        .eq('id', itemId)
        .maybeSingle();

    if (post) {
        const existingNotes = (post.metadata as any)?.moderator_notes || [];
        await supabase
            .from('community_posts')
            .update({
                metadata: {
                    ...((post.metadata as object) || {}),
                    moderator_notes: [...existingNotes, noteEntry],
                },
            })
            .eq('id', itemId);
    }
}

// ================================
// Helper Functions
// ================================

function mapPostToMarketplaceItem(row: any): MarketplaceItem {
    const metadata = row.metadata || {};
    const profile = row.profiles || {};

    return {
        id: row.id,
        title: row.title,
        type: 'roadmap',
        status: row.visibility === 'public' ? 'approved' :
            row.visibility === 'admins' ? 'pending' : 'hidden',
        authorId: row.user_id,
        authorName: profile.full_name || 'Anonymous',
        authorEmail: profile.email || '',
        category: metadata.category || 'General',
        submittedAt: row.created_at,
        reviewedAt: metadata.reviewed_at,
        reviewedBy: metadata.reviewed_by,
        featured: metadata.featured || false,
        featuredRank: metadata.featuredRank,
        stats: {
            views: metadata.views || 0,
            saves: metadata.saves || 0,
            adoptions: metadata.adoptionCount || 0,
            likes: row.likes || 0,
        },
        moderatorNotes: metadata.moderator_notes || [],
    };
}

function mapListingToMarketplaceItem(row: any): MarketplaceItem {
    const metadata = row.metadata || {};
    const profile = row.profiles || {};

    return {
        id: row.id,
        title: row.title,
        type: 'marketplace',
        status: row.status === 'active' ? 'approved' :
            row.status === 'paused' ? 'pending' : 'hidden',
        authorId: row.user_id,
        authorName: profile.full_name || 'Service Provider',
        authorEmail: profile.email || '',
        category: row.category || 'Services',
        submittedAt: row.created_at,
        reviewedAt: metadata.reviewed_at,
        reviewedBy: metadata.reviewed_by,
        featured: metadata.featured || false,
        featuredRank: metadata.featuredRank,
        stats: {
            views: metadata.views || 0,
            saves: metadata.saves || 0,
            adoptions: 0,
            likes: metadata.likes || 0,
        },
        moderatorNotes: metadata.moderator_notes || [],
    };
}

async function notifyAuthorOfDecision(authorId: string, payload: ApprovalPayload): Promise<void> {
    const titleMap = {
        approve: 'Your submission has been approved! 🎉',
        reject: 'Update on your submission',
        request_changes: 'Changes requested for your submission',
    };

    const bodyMap = {
        approve: 'Your submission is now live on the marketplace and visible to the community.',
        reject: 'Unfortunately, your submission did not meet our community guidelines.',
        request_changes: 'Our team has reviewed your submission and requested some changes. Please update and resubmit.',
    };

    await supabase.from('notifications').insert({
        user_id: authorId,
        kind: 'system',
        title: titleMap[payload.decision],
        body: payload.note || bodyMap[payload.decision],
        severity: payload.decision === 'approve' ? 'success' : 'info',
        metadata: {
            item_id: payload.itemId,
            decision: payload.decision,
        },
    });
}

export default {
    getMarketplaceItems,
    getPendingApprovals,
    getFeaturedItems,
    processApproval,
    setFeaturedStatus,
    addModeratorNote,
};
