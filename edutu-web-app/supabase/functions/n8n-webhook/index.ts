// Supabase Edge Function: n8n-webhook
// Deploy with: supabase functions deploy n8n-webhook

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface N8nOpportunityPayload {
    action: 'create' | 'update' | 'delete' | 'bulk_sync';
    source: string;
    timestamp: string;
    apiKey?: string;
    opportunities: Array<{
        externalId?: string;
        title: string;
        summary?: string;
        description?: string;
        category?: string;
        organization?: string;
        location?: string;
        isRemote?: boolean;
        applicationUrl?: string;
        tags?: string[];
        eligibility?: Record<string, unknown>;
        stipend?: number;
        currency?: string;
        openDate?: string;
        closeDate?: string;
        source?: string;
        metadata?: Record<string, unknown>;
    }>;
    metadata?: {
        scraperName?: string;
        sourceUrl?: string;
        totalScraped?: number;
        batchId?: string;
    };
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Initialize Supabase client with service role
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Validate API key
        const apiKey = req.headers.get('x-api-key');
        if (apiKey) {
            const isValid = await validateApiKey(supabase, apiKey);
            if (!isValid) {
                return new Response(
                    JSON.stringify({ error: 'Invalid API key' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        const payload: N8nOpportunityPayload = await req.json();

        const result = {
            success: true,
            message: '',
            processed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [] as string[],
        };

        const opportunities = payload.opportunities || [];

        for (const opp of opportunities) {
            try {
                const dbData = mapToDbFormat(opp, payload.source);

                switch (payload.action) {
                    case 'create': {
                        // Check for duplicate
                        const { data: existing } = await supabase
                            .from('opportunities')
                            .select('id')
                            .eq('title', opp.title)
                            .eq('organization', opp.organization || '')
                            .maybeSingle();

                        if (existing) {
                            result.skipped++;
                        } else {
                            const { error } = await supabase.from('opportunities').insert(dbData);
                            if (error) {
                                result.errors.push(`Create failed for "${opp.title}": ${error.message}`);
                            } else {
                                result.created++;
                            }
                        }
                        break;
                    }

                    case 'update': {
                        if (!opp.externalId) {
                            result.errors.push(`Update failed: missing externalId for "${opp.title}"`);
                            break;
                        }
                        const { error } = await supabase
                            .from('opportunities')
                            .update(dbData)
                            .eq('metadata->>external_id', opp.externalId);
                        if (error) {
                            result.errors.push(`Update failed for "${opp.title}": ${error.message}`);
                        } else {
                            result.updated++;
                        }
                        break;
                    }

                    case 'delete': {
                        if (!opp.externalId) {
                            result.errors.push(`Delete failed: missing externalId`);
                            break;
                        }
                        const { error } = await supabase
                            .from('opportunities')
                            .delete()
                            .eq('metadata->>external_id', opp.externalId);
                        if (error) {
                            result.errors.push(`Delete failed: ${error.message}`);
                        } else {
                            result.updated++;
                        }
                        break;
                    }

                    case 'bulk_sync': {
                        // Upsert logic
                        if (opp.externalId) {
                            const { data: existing } = await supabase
                                .from('opportunities')
                                .select('id')
                                .eq('metadata->>external_id', opp.externalId)
                                .maybeSingle();

                            if (existing) {
                                const { error } = await supabase
                                    .from('opportunities')
                                    .update(dbData)
                                    .eq('id', existing.id);
                                if (error) result.errors.push(`Sync update failed: ${error.message}`);
                                else result.updated++;
                            } else {
                                const { error } = await supabase.from('opportunities').insert(dbData);
                                if (error) result.errors.push(`Sync create failed: ${error.message}`);
                                else result.created++;
                            }
                        } else {
                            const { error } = await supabase.from('opportunities').insert(dbData);
                            if (error) result.errors.push(`Sync create failed: ${error.message}`);
                            else result.created++;
                        }
                        break;
                    }
                }

                result.processed++;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                result.errors.push(`Processing error: ${message}`);
                result.processed++;
            }
        }

        // Log the webhook processing
        await supabase.from('audit_log').insert({
            action: `webhook:${payload.action}`,
            entity_type: 'opportunities',
            entity_id: payload.metadata?.batchId || 'unknown',
            metadata: {
                source: payload.source,
                processed: result.processed,
                created: result.created,
                updated: result.updated,
                scraper: payload.metadata?.scraperName,
            },
        });

        result.success = result.errors.length === 0;
        result.message = result.success
            ? `Successfully processed ${result.processed} opportunities`
            : `Processed with ${result.errors.length} errors`;

        return new Response(
            JSON.stringify(result),
            { status: result.success ? 200 : 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

async function validateApiKey(supabase: any, apiKey: string): Promise<boolean> {
    // Hash the API key and check against stored keys
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: keyRecord } = await supabase
        .from('webhook_api_keys')
        .select('id, is_active, expires_at')
        .eq('key_hash', keyHash)
        .maybeSingle();

    if (!keyRecord) return false;
    if (!keyRecord.is_active) return false;
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) return false;

    // Update last used timestamp
    await supabase
        .from('webhook_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', keyRecord.id);

    return true;
}

function mapToDbFormat(opp: N8nOpportunityPayload['opportunities'][0], source: string) {
    return {
        title: opp.title,
        summary: opp.summary || null,
        description: opp.description || null,
        category: opp.category || null,
        organization: opp.organization || null,
        location: opp.location || null,
        is_remote: opp.isRemote ?? false,
        application_url: opp.applicationUrl || null,
        tags: opp.tags || [],
        eligibility: opp.eligibility || {},
        stipend: opp.stipend || null,
        currency: opp.currency || null,
        open_date: opp.openDate || null,
        close_date: opp.closeDate || null,
        source: source,
        metadata: {
            ...(opp.metadata || {}),
            external_id: opp.externalId,
            imported_at: new Date().toISOString(),
        },
    };
}
