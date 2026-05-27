/**
 * Edutu Scraper Engine - Database Layer
 * Phase 1: Enhanced with proper error handling and fallbacks
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { refineOpportunityWithGemini, isGeminiConfigured } from './gemini.js';

dotenv.config();

// Configuration
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// In-memory fallback storage
/** @type {Array<Object>} */
let inMemoryOpportunities = [];

/** @type {Array<Object>} */
let inMemorySources = [
    {
        id: 1,
        url: 'https://opportunitiescircle.com',
        name: 'Opportunities Circle',
        tier: 1,
        category: 'aggregator',
        enabled: true,
        priority: 1,
        rate_limit_requests: 10,
        rate_limit_delay_ms: 2000
    }
];

/** @type {Array<Object>} */
let inMemoryScrapeLogs = [];

/** @type {Array<Object>} */
let inMemoryScrapedUrls = [];

// Connection state
/** @type {SupabaseClient|null} */
export let supabase = null;
export let isSupabaseConnected = false;

// Initialize Supabase client with proper error handling
function initializeSupabase() {
    if (!supabaseUrl || !supabaseServiceKey) {
        console.log('⚠️ Supabase credentials not found, using in-memory storage');
        return;
    }

    try {
        supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
        isSupabaseConnected = true;
        console.log('✅ Supabase client initialized');
    } catch (error) {
        console.error('❌ Failed to initialize Supabase:', error.message);
        isSupabaseConnected = false;
    }
}

initializeSupabase();

/**
 * Check if table schema exists
 * @param {string} tableName - Table to check
 * @returns {Promise<Array<Object>|null>}
 */
export async function checkTableSchema(tableName) {
    if (!isSupabaseConnected || !supabase) return null;

    try {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .limit(1);

        if (error) throw error;
        return data;
    } catch (error) {
        console.error(`[Database] Error checking ${tableName}:`, error.message);
        return null;
    }
}

/**
 * Check database connection health
 * @returns {Promise<boolean>}
 */
export async function checkConnection() {
    if (!isSupabaseConnected || !supabase) return false;

    try {
        const { error } = await supabase.from('opportunities').select('id').limit(1);
        return !error;
    } catch {
        return false;
    }
}

/**
 * Insert a new opportunity
 * @param {Object} data - Opportunity data
 * @returns {Promise<Object|null>}
 */
export async function insertOpportunity(data) {
    let finalData = { ...data };

    // Apply second pass Gemini refinements if configured and not already refined
    if (isGeminiConfigured() && !finalData.refined_summary) {
        try {
            console.log(`[Database] 🧠 Running AI enrichment for: ${finalData.title}`);
            const aiRefinement = await refineOpportunityWithGemini(finalData);
            if (aiRefinement) {
                finalData = {
                    ...finalData,
                    refined_summary: aiRefinement.summary || finalData.summary || finalData.description || '',
                    ai_tags: aiRefinement.tags || [],
                    ai_eligible_majors: aiRefinement.eligibleMajors || [],
                    ai_eligible_countries: aiRefinement.eligibleCountries || [],
                    ai_recommended_levels: aiRefinement.recommendedLevels || [],
                    ai_funding_highlights: aiRefinement.fundingHighlights || [],
                    ai_match_keywords: aiRefinement.matchKeywords || []
                };
                console.log(`[Database] ✨ AI enrichment successful`);
            }
        } catch (enrichErr) {
            console.error(`[Database] AI enrichment failed: ${enrichErr.message}`);
        }
    }

    if (!isSupabaseConnected || !supabase) {
        // Use in-memory fallback
        const opportunity = {
            ...finalData,
            id: inMemoryOpportunities.length + 1,
            created_at: new Date().toISOString()
        };
        inMemoryOpportunities.push(opportunity);
        console.log(`[Database] 💾 Saved to memory: ${finalData.title}`);
        return opportunity;
    }

    try {
        const { data: result, error } = await supabase
            .from('opportunities')
            .insert([finalData])
            .select()
            .single();

        if (error) throw error;

        console.log(`[Database] ✅ Saved to Supabase: ${finalData.title}`);
        return result;
    } catch (error) {
        console.error('[Database] Error inserting opportunity:', error.message);
        return null;
    }
}

/**
 * Check if opportunity exists by source URL
 * @param {string} url - Source URL
 * @returns {Promise<boolean>}
 */
export async function opportunityExistsByUrl(url) {
    if (!isSupabaseConnected || !supabase) {
        return inMemoryOpportunities.some(opp => opp.external_url === url);
    }

    try {
        const { data, error } = await supabase
            .from('opportunities')
            .select('id')
            .eq('external_url', url)
            .limit(1);

        if (error) throw error;
        return !!data && data.length > 0;
    } catch (error) {
        console.error('[Database] Error checking opportunity:', error.message);
        return false;
    }
}

/**
 * Get scraping sources
 * @param {boolean} enabledOnly - Filter to enabled sources only
 * @returns {Promise<Array<Object>>}
 */
export async function getScrapingSources(enabledOnly = true) {
    if (!isSupabaseConnected || !supabase) {
        const sources = enabledOnly
            ? inMemorySources.filter(s => s.enabled)
            : inMemorySources;
        return sources.sort((a, b) => a.priority - b.priority);
    }

    try {
        let query = supabase
            .from('scraping_sources')
            .select('*')
            .order('priority', { ascending: true });

        if (enabledOnly) {
            query = query.eq('enabled', true);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[Database] Error getting sources:', error.message);
        return enabledOnly ? inMemorySources.filter(s => s.enabled) : inMemorySources;
    }
}

/**
 * Get a single source by ID
 * @param {number} sourceId - Source ID
 * @returns {Promise<Object|null>}
 */
export async function getSourceById(sourceId) {
    if (!isSupabaseConnected || !supabase) {
        return inMemorySources.find(s => s.id === sourceId) || null;
    }

    try {
        const { data, error } = await supabase
            .from('scraping_sources')
            .select('*')
            .eq('id', sourceId)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[Database] Error getting source:', error.message);
        return null;
    }
}

/**
 * Update source last scraped timestamp
 * @param {number} sourceId - Source ID
 * @returns {Promise<boolean>}
 */
export async function updateSourceLastScraped(sourceId) {
    if (!isSupabaseConnected || !supabase) {
        const source = inMemorySources.find(s => s.id === sourceId);
        if (source) {
            source.last_scraped = new Date().toISOString();
        }
        return true;
    }

    try {
        const { error } = await supabase
            .from('scraping_sources')
            .update({
                last_scraped: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', sourceId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[Database] Error updating source:', error.message);
        return false;
    }
}

/**
 * Update source statistics
 * @param {number} sourceId - Source ID
 * @param {Object} stats - Statistics to update
 * @returns {Promise<boolean>}
 */
export async function updateSourceStats(sourceId, stats) {
    if (!isSupabaseConnected || !supabase) {
        const source = inMemorySources.find(s => s.id === sourceId);
        if (source) {
            if (stats.total_scraped) source.total_scraped = (source.total_scraped || 0) + stats.total_scraped;
            if (stats.total_failed) source.total_failed = (source.total_failed || 0) + stats.total_failed;
            if (stats.total_urls_discovered) source.total_urls_discovered = (source.total_urls_discovered || 0) + stats.total_urls_discovered;
            source.last_scraped = new Date().toISOString();
        }
        return true;
    }

    try {
        const updates = {
            updated_at: new Date().toISOString(),
            last_scraped: new Date().toISOString()
        };

        if (stats.total_scraped) {
            const { data: source } = await supabase
                .from('scraping_sources')
                .select('total_scraped')
                .eq('id', sourceId)
                .single();

            updates.total_scraped = (source?.total_scraped || 0) + stats.total_scraped;
        }

        if (stats.total_failed) {
            updates.total_failed = stats.total_failed;
        }

        const { error } = await supabase
            .from('scraping_sources')
            .update(updates)
            .eq('id', sourceId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[Database] Error updating source stats:', error.message);
        return false;
    }
}

/**
 * Insert a new scraping source
 * @param {Object} data - Source data
 * @returns {Promise<Object|null>}
 */
export async function insertScrapingSource(data) {
    if (!isSupabaseConnected || !supabase) {
        const newSource = {
            ...data,
            id: inMemorySources.length + 1,
            created_at: new Date().toISOString()
        };
        inMemorySources.push(newSource);
        return newSource;
    }

    try {
        const { data: result, error } = await supabase
            .from('scraping_sources')
            .insert([data])
            .select()
            .single();

        if (error) throw error;
        return result;
    } catch (error) {
        console.error('[Database] Error inserting source:', error.message);
        return null;
    }
}

/**
 * Get all opportunity URLs (for deduplication)
 * @returns {Promise<Array<string>>}
 */
export async function getAllOpportunityUrls() {
    if (!isSupabaseConnected || !supabase) {
        return inMemoryOpportunities
            .map(item => item.source_url)
            .filter(Boolean);
    }

    try {
        const { data, error } = await supabase
            .from('opportunities')
            .select('source_url')
            .not('source_url', 'is', null);

        if (error) throw error;
        return data.map(item => item.source_url);
    } catch (error) {
        console.error('[Database] Error getting URLs:', error.message);
        return [];
    }
}

/**
 * Add URL to scraped URLs cache
 * @param {string} url - URL to cache
 * @param {number} sourceId - Source ID
 * @param {string} status - Status (pending, processed, failed)
 * @returns {Promise<boolean>}
 */
export async function addUrlToCache(url, sourceId, status = 'pending') {
    if (!isSupabaseConnected || !supabase) {
        const existing = inMemoryScrapedUrls.find(u => u.url === url);
        if (!existing) {
            inMemoryScrapedUrls.push({
                url,
                source_id: sourceId,
                status,
                first_seen: new Date().toISOString(),
                last_checked: new Date().toISOString()
            });
        }
        return true;
    }

    try {
        const { error } = await supabase
            .from('scraped_urls')
            .upsert({
                url,
                source_id: sourceId,
                status,
                last_checked: new Date().toISOString()
            }, { onConflict: 'url' });

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[Database] Error adding URL to cache:', error.message);
        return false;
    }
}

/**
 * Create scrape log entry
 * @param {Object} logData - Log data
 * @returns {Promise<string|null>}
 */
export async function createScrapeLog(logData) {
    const logEntry = {
        ...logData,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString()
    };

    if (!isSupabaseConnected || !supabase) {
        inMemoryScrapeLogs.push(logEntry);
        return logEntry.id;
    }

    try {
        const { data, error } = await supabase
            .from('scrape_logs')
            .insert([logEntry])
            .select('id')
            .single();

        if (error) throw error;
        return data?.id || null;
    } catch (error) {
        console.error('[Database] Error creating scrape log:', error.message);
        return null;
    }
}

/**
 * Update scrape log entry
 * @param {string} logId - Log ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<boolean>}
 */
export async function updateScrapeLog(logId, updates) {
    if (!isSupabaseConnected || !supabase) {
        const log = inMemoryScrapeLogs.find(l => l.id === logId);
        if (log) {
            Object.assign(log, updates, { updated_at: new Date().toISOString() });
        }
        return true;
    }

    try {
        const { error } = await supabase
            .from('scrape_logs')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', logId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[Database] Error updating scrape log:', error.message);
        return false;
    }
}

/**
 * Get recent scrape logs
 * @param {number} limit - Number of logs to fetch
 * @returns {Promise<Array<Object>>}
 */
export async function getScrapeLogs(limit = 50) {
    if (!isSupabaseConnected || !supabase) {
        return inMemoryScrapeLogs
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, limit);
    }

    try {
        const { data, error } = await supabase
            .from('scrape_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[Database] Error getting scrape logs:', error.message);
        return [];
    }
}

/**
 * Get database statistics
 * @returns {Promise<Object>}
 */
export async function getDatabaseStats() {
    const stats = {
        storage: isSupabaseConnected ? 'supabase' : 'memory',
        opportunities_count: inMemoryOpportunities.length,
        sources_count: inMemorySources.length,
        scraped_urls_count: inMemoryScrapedUrls.length,
        logs_count: inMemoryScrapeLogs.length
    };

    if (isSupabaseConnected && supabase) {
        try {
            const [oppResult, sourceResult] = await Promise.all([
                supabase.from('opportunities').select('id', { count: 'exact', head: true }),
                supabase.from('scraping_sources').select('id', { count: 'exact', head: true })
            ]);

            stats.opportunities_count = oppResult.count || 0;
            stats.sources_count = sourceResult.count || 0;
        } catch (error) {
            console.error('[Database] Error getting stats:', error.message);
        }
    }

    return stats;
}

export default {
    supabase,
    isSupabaseConnected,
    checkConnection,
    checkTableSchema,
    insertOpportunity,
    opportunityExistsByUrl,
    getScrapingSources,
    getSourceById,
    updateSourceLastScraped,
    updateSourceStats,
    insertScrapingSource,
    getAllOpportunityUrls,
    addUrlToCache,
    createScrapeLog,
    updateScrapeLog,
    getScrapeLogs,
    getDatabaseStats
};
