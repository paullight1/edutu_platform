// Service to handle community marketplace functionality with Supabase
import { supabase } from '../lib/supabaseClient';
import logger from '../lib/logger';
import type {
  CommunityStory,
  CommunityStoryQueryOptions,
  CommunityStoryStats,
  CommunityStoryStatus,
  CommunityStorySubmissionInput,
  CommunityStoryType,
  CommunityStoryUpdateInput
} from '../types/community';
import {
  adoptRoadmap,
  createRoadmap,
  fetchRoadmap,
  fetchRoadmapCommunityStories,
  mapBackendRoadmapToCommunityStory,
  toBackendCategory,
  toBackendDifficulty,
} from './roadmapApi';

const supabaseDb = supabase as any;

/**
 * Mapping helper for marketplace listings
 */
function mapListingToStory(listing: any): CommunityStory {
  const metadata = listing.metadata || {};
  return {
    id: listing.id,
    title: listing.title,
    summary: listing.description.substring(0, 150) + '...',
    story: listing.description,
    category: listing.category || 'Marketplace',
    duration: listing.availability,
    difficulty: 'Intermediate',
    price: listing.price_range ? 'Premium' : 'Free',
    successRate: metadata.successRate || 0,
    image: metadata.image || '',
    creator: {
      name: metadata.creator_name || 'Service Provider',
      title: metadata.creator_title || '',
      avatar: metadata.creator_avatar || '',
      email: metadata.creator_email || '',
      verified: metadata.creator_verified || false
    },
    tags: listing.skills || [],
    outcomes: metadata.outcomes || [],
    resources: [],
    roadmap: [],
    status: (listing.status === 'active' ? 'approved' : 'pending') as CommunityStoryStatus,
    type: 'marketplace',
    featured: metadata.featured || false,
    featuredRank: metadata.featuredRank || null,
    createdAt: listing.created_at,
    updatedAt: listing.updated_at,
    stats: {
      rating: metadata.rating || 0,
      users: metadata.users || 0,
      successRate: metadata.successRate || 0,
      saves: metadata.saves || 0,
      adoptionCount: metadata.adoptionCount || 0,
      likes: metadata.likes || 0,
      comments: metadata.comments || 0
    },
    lastUpdatedLabel: 'Recently active',
    lastUpdatedTimestamp: new Date(listing.updated_at).getTime()
  };
}

export function listenToCommunityStories(
  options: CommunityStoryQueryOptions,
  handlers: {
    onNext: (stories: CommunityStory[]) => void;
    onError?: (error: Error) => void;
  }
) {
  // Use a combination of individual fetches or simplified real-time depending on the type
  const typeFilter = options.type || ['roadmap', 'marketplace'];
  const types = Array.isArray(typeFilter) ? typeFilter : [typeFilter];

  // For real-time, we'd ideally use supabase.channel().on('postgres_changes', ...).subscribe()
  // For now, we'll perform an initial fetch and provide the handler
  fetchCommunityStories(options)
    .then(handlers.onNext)
    .catch(handlers.onError);

  // Return a mock unsubscribe for now, or implement real subscription if needed
  return {
    unsubscribe: () => { }
  };
}

export async function fetchCommunityStories(
  options: CommunityStoryQueryOptions
): Promise<CommunityStory[]> {
  const stories: CommunityStory[] = [];
  const typeFilter = options.type || ['roadmap', 'marketplace'];
  const types = Array.isArray(typeFilter) ? typeFilter : [typeFilter];

  // 1. Fetch roadmaps from the backend API. The roadmaps table is the source of truth.
  if (types.includes('roadmap')) {
    try {
      stories.push(...await fetchRoadmapCommunityStories(options));
    } catch (error) {
      logger.error('Error fetching backend roadmaps:', error);
    }
  }

  // 2. Fetch from marketplace_listings
  if (types.includes('marketplace')) {
    let query = supabaseDb
      .from('marketplace_listings')
      .select('*');

    if (options.status) {
      const statusValue = options.status === 'approved' ? 'active' : 'paused';
      query = query.eq('status', statusValue);
    } else {
      query = query.eq('status', 'active');
    }

    if (options.category) {
      query = query.eq('category', options.category);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
      logger.error('Error fetching marketplace listings:', error);
    } else if (data) {
      stories.push(...data.map(mapListingToStory));
    }
  }

  // Sort combined results
  if (options.orderBy === 'featuredRank') {
    return stories.sort((a, b) => (a.featuredRank || 999) - (b.featuredRank || 999));
  }

  const sortDirection = options.descending === false ? 1 : -1;
  return stories.sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return (timeB - timeA) * sortDirection;
  });
}

export async function getCommunityStory(id: string): Promise<CommunityStory | null> {
  // First try backend roadmaps, which are the roadmap source of truth.
  try {
    const roadmap = await fetchRoadmap(id);
    if (roadmap) return mapBackendRoadmapToCommunityStory(roadmap);
  } catch {
    // Non-roadmap marketplace rows still live in Supabase.
  }

  // Then try marketplace
  const { data: listing } = await supabaseDb
    .from('marketplace_listings')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (listing) return mapListingToStory(listing);

  return null;
}

export async function submitCommunityStory(userId: string, input: CommunityStorySubmissionInput, authToken?: string | null) {
  if (!userId) throw new Error('Not authenticated');

  if (input.type === 'marketplace') {
    const { data, error } = await supabaseDb
      .from('marketplace_listings')
      .insert({
        user_id: userId,
        title: input.title,
        description: input.summary + (input.story ? '\n\n' + input.story : ''),
        category: input.category,
        skills: input.tags || [],
        status: 'active',
        metadata: {
          creator_name: input.creator.name,
          creator_title: input.creator.title,
          creator_avatar: input.creator.avatar,
          creator_email: input.creator.email,
          image: input.coverImage,
          successRate: input.successRate,
          outcomes: input.outcomes
        }
      })
      .select()
      .single();

    if (error) throw error;
    return { id: data.id };
  } else {
    const steps = (input.roadmap || [])
      .filter((stage) => stage.title.trim() && (stage.description || '').trim())
      .map((stage, index) => ({
        id: stage.id || `step-${index + 1}`,
        title: stage.title,
        description: stage.description || stage.title,
        duration: stage.duration,
        resources: stage.resourceIds || [],
        relativeDueDays: stage.relativeDueDays,
        phase: stage.phase || stage.milestone,
        taskType: stage.taskType || stage.checkpoint,
        calendarSyncEnabled: stage.calendarSyncEnabled,
      }));

    const fallbackStep = {
      id: 'step-1',
      title: 'Start the roadmap',
      description: input.summary,
      duration: input.duration,
      resources: [],
    };

    const created = await createRoadmap({
      title: input.title,
      description: input.story || input.summary,
      category: toBackendCategory(input.category),
      difficulty: toBackendDifficulty(input.difficulty),
      estimatedDuration: input.duration,
      outcomes: (input.outcomes || []).join('\n'),
      coverImage: input.coverImage || '',
      creatorProof: {
        ...(input.creatorProof || {}),
        name: input.creator.name,
        title: input.creator.title,
        email: input.creator.email,
        avatar: input.creator.avatar,
        story: input.story,
      },
      deadlineStrategy: input.deadlineStrategy || input.creatorNotes || undefined,
      steps: steps.length > 0 ? steps : [fallbackStep],
      resources: (input.resources || []).map((resource) => ({
        id: resource.id,
        title: resource.title,
        url: resource.url || '',
        type: resource.type === 'video' ? 'video' : resource.type === 'tool' ? 'tool' : 'link',
      })),
      relatedOpportunities: input.tags || [],
    }, authToken);

    return { id: created.id };
  }
}

export async function updateCommunityStory(id: string, updates: CommunityStoryUpdateInput) {
  // Determine if it's a post or listing
  const story = await getCommunityStory(id);
  if (!story) throw new Error('Story not found');

  if (story.type === 'marketplace') {
    const { error } = await supabaseDb
      .from('marketplace_listings')
      .update({
        title: updates.title,
        description: updates.summary || updates.story ? (updates.summary || '') + (updates.story ? '\n\n' + updates.story : '') : undefined,
        category: updates.category,
        status: updates.status === 'approved' ? 'active' : updates.status === 'hidden' ? 'closed' : undefined,
        metadata: {
          ...((await supabaseDb.from('marketplace_listings').select('metadata').eq('id', id).single()).data?.metadata as object),
          image: updates.image,
          featured: updates.featured,
          featuredRank: updates.featuredRank,
          approved_at: updates.approvedAt,
          approved_by: updates.approvedBy
        }
      })
      .eq('id', id);

    if (error) throw error;
  } else {
    const { error } = await supabaseDb
      .from('community_posts')
      .update({
        title: updates.title,
        content: updates.story,
        tags: updates.tags,
        visibility: updates.status === 'approved' ? 'public' : updates.status === 'hidden' ? 'admins' : undefined,
        metadata: {
          ...((await supabaseDb.from('community_posts').select('metadata').eq('id', id).single()).data?.metadata as object),
          summary: updates.summary,
          category: updates.category,
          duration: updates.duration,
          difficulty: updates.difficulty,
          price: updates.price,
          image: updates.image,
          featured: updates.featured,
          featuredRank: updates.featuredRank,
          approved_at: updates.approvedAt,
          approved_by: updates.approvedBy,
          roadmap: updates.roadmap,
          resources: updates.resources
        }
      })
      .eq('id', id);

    if (error) throw error;
  }

  return { id };
}

export async function setCommunityStoryStatus(
  id: string,
  status: CommunityStoryStatus,
  metadata?: { approvedBy?: string }
) {
  return updateCommunityStory(id, {
    status,
    approvedBy: metadata?.approvedBy,
    approvedAt: status === 'approved' ? new Date().toISOString() : undefined
  });
}

export async function setCommunityStoryFeatured(
  id: string,
  featured: boolean,
  featuredRank?: number | null
) {
  return updateCommunityStory(id, { featured, featuredRank });
}

export async function recordCommunityStoryAdoption(id: string) {
  return recordCommunityStoryAdoptionWithToken(id);
}

export async function recordCommunityStoryAdoptionWithToken(
  id: string,
  authToken?: string | null,
  adoptionOptions: { targetDeadline?: string; calendarSyncEnabled?: boolean } = {},
) {
  // Implementation for incrementing adoptionCount in metadata
  // This is complex with JSONB in Supabase without a RPC, so we'll do a read-modify-write for now
  // In production, an Edge Function or RPC would be better
  const story = await getCommunityStory(id);
  if (!story) return;

  if (story.type === 'roadmap') {
    return adoptRoadmap(id, adoptionOptions, authToken);
  }

  const currentCount = story.stats.adoptionCount || 0;
  return updateCommunityStory(id, {
    stats: { ...story.stats, adoptionCount: currentCount + 1 }
  });
}

export async function recordCommunityStoryLike(id: string) {
  const { error } = await supabaseDb.rpc('increment_post_likes', { post_id: id });
  if (error) {
    // Fallback if RPC doesn't exist
    const { data: post } = await supabaseDb.from('community_posts').select('likes').eq('id', id).single();
    if (post) {
      await supabaseDb.from('community_posts').update({ likes: (post.likes || 0) + 1 }).eq('id', id);
    }
  }
  return { id };
}

export async function recordCommunityStorySave(id: string) {
  const story = await getCommunityStory(id);
  if (!story) return;

  const currentCount = story.stats.saves || 0;
  return updateCommunityStory(id, {
    stats: { ...story.stats, saves: currentCount + 1 }
  });
}

export async function appendModeratorNote(
  id: string,
  entry: { note: string; author?: string }
) {
  const story = await getCommunityStory(id);
  if (!story) return;

  const notes = [...(story.moderatorNotes || [])];
  notes.push({
    id: `note-${Date.now()}`,
    note: entry.note,
    createdAt: new Date().toISOString(),
    author: entry.author
  });

  return updateCommunityStory(id, { moderatorNotes: notes });
}
