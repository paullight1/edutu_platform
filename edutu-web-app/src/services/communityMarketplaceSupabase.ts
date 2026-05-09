// Service to handle community marketplace functionality with Supabase
import { supabase } from '../lib/supabaseClient';
import type {
  CommunityModeratorNote,
  CommunityResource,
  CommunityRoadmapStage,
  CommunityStory,
  CommunityStoryQueryOptions,
  CommunityStoryStats,
  CommunityStoryStatus,
  CommunityStorySubmissionInput,
  CommunityStoryType,
  CommunityStoryUpdateInput
} from '../types/community';

/**
 * Mapping helper for community posts (Roadmaps)
 */
function mapPostToStory(post: any): CommunityStory {
  const metadata = post.metadata || {};
  return {
    id: post.id,
    title: post.title,
    summary: metadata.summary || post.content.substring(0, 150) + '...',
    story: post.content,
    category: metadata.category || 'General',
    duration: metadata.duration,
    difficulty: metadata.difficulty || 'Intermediate',
    price: metadata.price || 'Free',
    successRate: metadata.successRate || 0,
    image: metadata.image || '',
    creator: {
      name: metadata.creator_name || 'Community Member',
      title: metadata.creator_title || '',
      avatar: metadata.creator_avatar || '',
      email: metadata.creator_email || '',
      verified: metadata.creator_verified || false
    },
    tags: post.tags || [],
    outcomes: metadata.outcomes || [],
    resources: metadata.resources || [],
    roadmap: metadata.roadmap || [],
    status: (post.visibility === 'public' ? 'approved' : post.visibility === 'admins' ? 'pending' : 'hidden') as CommunityStoryStatus,
    type: post.type as CommunityStoryType,
    featured: metadata.featured || false,
    featuredRank: metadata.featuredRank || null,
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    approvedAt: metadata.approved_at,
    approvedBy: metadata.approved_by,
    moderatorNotes: metadata.moderator_notes || [],
    stats: {
      rating: metadata.rating || 0,
      users: metadata.users || 0,
      successRate: metadata.successRate || 0,
      saves: metadata.saves || 0,
      adoptionCount: metadata.adoptionCount || 0,
      likes: post.likes || 0,
      comments: post.comments_count || 0
    },
    lastUpdatedLabel: 'Recently updated',
    lastUpdatedTimestamp: new Date(post.updated_at).getTime()
  };
}

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

  // 1. Fetch from community_posts (Roadmaps)
  if (types.includes('roadmap')) {
    let query = supabase
      .from('community_posts')
      .select('*')
      .eq('type', 'roadmap');

    if (options.status) {
      const visibility = options.status === 'approved' ? 'public' : options.status === 'pending' ? 'admins' : 'public';
      query = query.eq('visibility', visibility);
    } else {
      query = query.eq('visibility', 'public');
    }

    if (options.category) {
      // In community_posts, category is in metadata
      query = query.contains('metadata', { category: options.category });
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching roadmaps:', error);
    } else if (data) {
      stories.push(...data.map(mapPostToStory));
    }
  }

  // 2. Fetch from marketplace_listings
  if (types.includes('marketplace')) {
    let query = supabase
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
      console.error('Error fetching marketplace listings:', error);
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
  // First try roadmaps
  const { data: post, error: postError } = await supabase
    .from('community_posts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (post) return mapPostToStory(post);

  // Then try marketplace
  const { data: listing, error: listingError } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (listing) return mapListingToStory(listing);

  return null;
}

export async function submitCommunityStory(userId: string, input: CommunityStorySubmissionInput) {
  if (!userId) throw new Error('Not authenticated');

  if (input.type === 'marketplace') {
    const { data, error } = await supabase
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
    // Default to roadmap/post
    const { data, error } = await supabase
      .from('community_posts')
      .insert({
        user_id: userId,
        type: 'roadmap',
        title: input.title,
        content: input.story || input.summary,
        tags: input.tags || [],
        visibility: 'admins', // New submissions are pending by default
        metadata: {
          summary: input.summary,
          category: input.category,
          duration: input.duration,
          difficulty: input.difficulty,
          price: input.price,
          image: input.coverImage,
          creator_name: input.creator.name,
          creator_title: input.creator.title,
          creator_avatar: input.creator.avatar,
          creator_email: input.creator.email,
          successRate: input.successRate,
          outcomes: input.outcomes,
          resources: input.resources,
          roadmap: input.roadmap,
          creator_notes: input.creatorNotes
        }
      })
      .select()
      .single();

    if (error) throw error;
    return { id: data.id };
  }
}

export async function updateCommunityStory(id: string, updates: CommunityStoryUpdateInput) {
  // Determine if it's a post or listing
  const story = await getCommunityStory(id);
  if (!story) throw new Error('Story not found');

  if (story.type === 'marketplace') {
    const { error } = await supabase
      .from('marketplace_listings')
      .update({
        title: updates.title,
        description: updates.summary || updates.story ? (updates.summary || '') + (updates.story ? '\n\n' + updates.story : '') : undefined,
        category: updates.category,
        status: updates.status === 'approved' ? 'active' : updates.status === 'hidden' ? 'closed' : undefined,
        metadata: {
          ...((await supabase.from('marketplace_listings').select('metadata').eq('id', id).single()).data?.metadata as object),
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
    const { error } = await supabase
      .from('community_posts')
      .update({
        title: updates.title,
        content: updates.story,
        tags: updates.tags,
        visibility: updates.status === 'approved' ? 'public' : updates.status === 'hidden' ? 'admins' : undefined,
        metadata: {
          ...((await supabase.from('community_posts').select('metadata').eq('id', id).single()).data?.metadata as object),
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
  // Implementation for incrementing adoptionCount in metadata
  // This is complex with JSONB in Supabase without a RPC, so we'll do a read-modify-write for now
  // In production, an Edge Function or RPC would be better
  const story = await getCommunityStory(id);
  if (!story) return;

  const currentCount = story.stats.adoptionCount || 0;
  return updateCommunityStory(id, {
    stats: { ...story.stats, adoptionCount: currentCount + 1 }
  });
}

export async function recordCommunityStoryLike(id: string) {
  const { error } = await supabase.rpc('increment_post_likes', { post_id: id });
  if (error) {
    // Fallback if RPC doesn't exist
    const { data: post } = await supabase.from('community_posts').select('likes').eq('id', id).single();
    if (post) {
      await supabase.from('community_posts').update({ likes: (post.likes || 0) + 1 }).eq('id', id);
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