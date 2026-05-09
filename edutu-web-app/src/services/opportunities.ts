import type { Opportunity, OpportunityDifficulty } from '../types/opportunity';
import { supabase } from '../lib/supabaseClient';
import { syncOpportunityInventorySnapshot } from './analyticsAggregator';
import { updateOpportunitiesInN8n } from './n8nIntegration';

let cachedOpportunities: Opportunity[] | null = null;

interface FetchOptions {
  signal?: AbortSignal;
  force?: boolean;
  userId?: string; // Optional userId for n8n integration
}

/**
 * Normalizes a database row to the application's Opportunity type
 */
function normaliseOpportunity(row: any): Opportunity {
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
    match: row.metadata?.match_score || 0,
    difficulty: (row.metadata?.difficulty as OpportunityDifficulty) || 'Medium'
  };
}

export async function fetchOpportunities(options: FetchOptions = {}): Promise<Opportunity[]> {
  const { force, userId } = options;

  if (!force && cachedOpportunities) {
    return cachedOpportunities;
  }

  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching opportunities from Supabase:', error);
    // If no data in Supabase yet, we might want to fallback to local or return empty
    return [];
  }

  const normalised = data.map(normaliseOpportunity);
  cachedOpportunities = normalised;

  // Background tasks
  void (async () => {
    try {
      await syncOpportunityInventorySnapshot(normalised);
      if (userId) {
        await updateOpportunitiesInN8n(normalised, userId);
      }
    } catch (err) {
      console.error('Failed to sync opportunity analytics or update n8n:', err);
    }
  })();

  return normalised;
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return normaliseOpportunity(data);
}

export function clearOpportunitiesCache() {
  cachedOpportunities = null;
}
