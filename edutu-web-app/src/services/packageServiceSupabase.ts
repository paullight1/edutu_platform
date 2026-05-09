import { supabase } from '../lib/supabaseClient';
import type { 
  CommunityPackage, 
  PackageStep, 
  PackageTask, 
  PackageTemplate, 
  PackageResource, 
  PersonalStory, 
  PackageTips, 
  PackageReview, 
  PackageProgress 
} from './packageService';

/**
 * Maps a marketplace listing database row to a CommunityPackage
 */
function mapListingToPackage(listing: any): CommunityPackage {
  const metadata = listing.metadata || {};
  return {
    id: listing.id,
    title: listing.title,
    shortDescription: metadata.shortDescription || listing.description.substring(0, 150) + '...',
    fullDescription: listing.description,
    coverImageUrl: metadata.coverImageUrl || metadata.image || '',
    difficulty: metadata.difficulty || 'Intermediate',
    estimatedCompletionTime: metadata.estimatedCompletionTime || 'Flexible',
    price: metadata.price || 0,
    tags: listing.skills || [],
    creator: {
      id: metadata.creator_id || listing.user_id,
      name: metadata.creator_name || 'Community Member',
      shortBio: metadata.creator_bio || '',
      avatarUrl: metadata.creator_avatar || '',
      credibilityBadge: metadata.creator_badge
    },
    includedItems: metadata.includedItems || [],
    createdAt: listing.created_at,
    version: metadata.version || '1.0.0',
    roadmap: metadata.roadmap || [],
    templates: metadata.templates || [],
    resources: metadata.resources || [],
    personalStory: metadata.personalStory || { text: '', proofs: [] },
    tips: metadata.tips || { dos: [], donts: [] },
    reviews: metadata.reviews || [],
    progress: metadata.progress
  };
}

export async function getCommunityPackage(id: string): Promise<CommunityPackage | null> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    // If it's the sample ID, we might want to return the hardcoded one if DB is empty
    if (id === 'mc-001') {
        // We can return a default or seed the DB later
    }
    return null;
  }

  return mapListingToPackage(data);
}

export async function updatePackageTaskProgress(
  packageId: string, 
  taskId: string, 
  done: boolean
): Promise<void> {
  // In a real implementation with multi-user support, this would be in a separate table
  // For now, we'll use a placeholder as the user table might not be ready for progress tracking
  console.log(`Updating task ${taskId} in package ${packageId} to ${done ? 'done' : 'not done'}`);
  
  // Example of how we'd update a progress table:
  /*
  await supabase
    .from('package_progress')
    .upsert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        package_id: packageId,
        completed_tasks: done ? [taskId] : [] // Logic to append/remove
    });
  */
}

export async function downloadAllPackageTemplates(packageId: string): Promise<Blob | null> {
  // This would typically involve fetching from Supabase Storage
  console.log(`Downloading all templates for package ${packageId}`);
  return null;
}

export async function askPackageCreator(
  packageId: string, 
  userId: string, 
  message: string
): Promise<void> {
  await supabase
    .from('support_tickets')
    .insert({
        user_id: userId,
        subject: `Question about package ${packageId}`,
        description: message,
        category: 'Marketplace',
        priority: 'medium',
        metadata: { package_id: packageId }
    });
}

export async function addPackageReview(
  packageId: string,
  userId: string,
  rating: number,
  comment: string
): Promise<void> {
  // Fetch current reviews
  const pkg = await getCommunityPackage(packageId);
  if (!pkg) return;

  const reviews = [...(pkg.reviews || [])];
  reviews.push({
    id: `rev-${Date.now()}`,
    userId,
    rating,
    comment,
    createdAt: new Date().toISOString()
  });

  await supabase
    .from('marketplace_listings')
    .update({
        metadata: {
            ...((await supabase.from('marketplace_listings').select('metadata').eq('id', packageId).single()).data?.metadata as object),
            reviews
        }
    })
    .eq('id', packageId);
}

export async function getPackageMarketplaceList(): Promise<CommunityPackage[]> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('status', 'active');

  if (error || !data) return [];

  return data.map(mapListingToPackage);
}
