import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// In-memory storage for when Supabase is unavailable
let inMemoryOpportunities = [];
let inMemorySources = [
    { id: 1, url: 'https://opportunitiescircle.com', name: 'Opportunities Circle', tier: 1, category: 'aggregator', enabled: true }
];

let supabase = null;
let isSupabaseConnected = false;

// Try to initialize Supabase
if (supabaseUrl && supabaseServiceKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseServiceKey);
        isSupabaseConnected = true;
        console.log('✅ Supabase client initialized');
    } catch (err) {
        console.log('⚠️ Supabase not available, using in-memory storage');
    }
} else {
    console.log('⚠️ Supabase credentials not found, using in-memory storage');
}

export async function checkTableSchema(tableName) {
    if (!isSupabaseConnected || !supabase) return null;
    
    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);
    
    if (error) {
        console.error(`Error checking ${tableName}:`, error);
        return null;
    }
    return data;
}

export async function insertOpportunity(data) {
    if (!isSupabaseConnected || !supabase) {
        // Use in-memory storage
        const opp = { 
            ...data, 
            id: inMemoryOpportunities.length + 1,
            created_at: new Date().toISOString() 
        };
        inMemoryOpportunities.push(opp);
        console.log(`💾 Saved opportunity to memory: ${data.title}`);
        return opp;
    }
    
    const { data: result, error } = await supabase
        .from('opportunities')
        .insert([data])
        .select()
        .single();
    
    if (error) {
        console.error('Error inserting opportunity:', error);
        return null;
    }
    return result;
}

export async function opportunityExistsByUrl(url) {
    if (!isSupabaseConnected || !supabase) {
        return inMemoryOpportunities.some(opp => opp.source_url === url);
    }
    
    const { data, error } = await supabase
        .from('opportunities')
        .select('id')
        .eq('source_url', url)
        .limit(1);
    
    if (error) {
        console.error('Error checking opportunity:', error);
        return false;
    }
    return data && data.length > 0;
}

export async function getScrapingSources(enabledOnly = true) {
    if (!isSupabaseConnected || !supabase) {
        return enabledOnly ? inMemorySources.filter(s => s.enabled) : inMemorySources;
    }
    
    let query = supabase
        .from('scraping_sources')
        .select('*')
        .order('tier', { ascending: true });
    
    if (enabledOnly) {
        query = query.eq('enabled', true);
    }
    
    const { data, error } = await query;
    
    if (error) {
        console.error('Error getting scraping sources:', error);
        return [];
    }
    return data || [];
}

export async function updateSourceLastScraped(sourceId) {
    if (!isSupabaseConnected || !supabase) {
        const source = inMemorySources.find(s => s.id === sourceId);
        if (source) {
            source.last_scraped = new Date().toISOString();
        }
        return true;
    }
    
    const { error } = await supabase
        .from('scraping_sources')
        .update({ last_scraped: new Date().toISOString() })
        .eq('id', sourceId);
    
    if (error) {
        console.error('Error updating source:', error);
        return false;
    }
    return true;
}

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
    
    const { data: result, error } = await supabase
        .from('scraping_sources')
        .insert([data])
        .select()
        .single();
    
    if (error) {
        console.error('Error inserting source:', error);
        return null;
    }
    return result;
}

export async function getAllOpportunityUrls() {
    if (!isSupabaseConnected || !supabase) {
        return inMemoryOpportunities.map(item => item.source_url);
    }
    
    const { data, error } = await supabase
        .from('opportunities')
        .select('source_url');
    
    if (error) {
        console.error('Error getting URLs:', error);
        return [];
    }
    return data.map(item => item.source_url);
}
