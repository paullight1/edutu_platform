/**
 * Opportunities Webhook Handler
 * Processes incoming opportunities from n8n scraper tool
 * and manages the personalization pipeline
 */

import { supabase } from '../../lib/supabaseClient';
import { logAdminAction } from './adminService';
import type { Opportunity } from '../../types/opportunity';
import { clearOpportunitiesCache } from '../opportunities';

// ================================
// Types for Webhook Payloads
// ================================

export interface N8nOpportunityPayload {
    action: 'create' | 'update' | 'delete' | 'bulk_sync';
    source: string;
    timestamp: string;
    apiKey?: string;
    opportunities: N8nOpportunityData[];
    metadata?: {
        scraperName?: string;
        sourceUrl?: string;
        totalScraped?: number;
        batchId?: string;
    };
}

export interface N8nOpportunityData {
    externalId?: string; // ID from the source system
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
}

export interface WebhookResponse {
    success: boolean;
    message: string;
    processed: number;
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
}

// ================================
// Webhook Processing
// ================================

export async function processN8nWebhook(payload: N8nOpportunityPayload): Promise<WebhookResponse> {
    const response: WebhookResponse = {
        success: false,
        message: '',
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [],
    };

    try {
        // Validate API key if provided (recommended for production)
        if (payload.apiKey) {
            const isValid = await validateWebhookApiKey(payload.apiKey);
            if (!isValid) {
                response.message = 'Invalid API key';
                return response;
            }
        }

        const opportunities = payload.opportunities || [];

        switch (payload.action) {
            case 'create':
                await processCreateAction(opportunities, response, payload.source);
                break;

            case 'update':
                await processUpdateAction(opportunities, response, payload.source);
                break;

            case 'delete':
                await processDeleteAction(opportunities, response);
                break;

            case 'bulk_sync':
                await processBulkSyncAction(opportunities, response, payload.source);
                break;

            default:
                response.message = `Unknown action: ${payload.action}`;
                return response;
        }

        // Clear the cache after processing
        clearOpportunitiesCache();

        // Log the webhook processing
        await logAdminAction(
            `webhook:${payload.action}`,
            'opportunities',
            payload.metadata?.batchId || 'unknown',
            {
                source: payload.source,
                processed: response.processed,
                created: response.created,
                updated: response.updated,
                scraper: payload.metadata?.scraperName,
            }
        );

        response.success = response.errors.length === 0;
        response.message = response.success
            ? `Successfully processed ${response.processed} opportunities`
            : `Processed with ${response.errors.length} errors`;

        return response;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        response.errors.push(message);
        response.message = 'Webhook processing failed';
        return response;
    }
}

async function processCreateAction(
    opportunities: N8nOpportunityData[],
    response: WebhookResponse,
    source: string
): Promise<void> {
    for (const opp of opportunities) {
        try {
            const insertData = mapToSupabaseFormat(opp, source);

            // Check for duplicates by external ID or title+organization
            const existingQuery = opp.externalId
                ? supabase.from('opportunities').select('id').eq('metadata->>external_id', opp.externalId)
                : supabase.from('opportunities').select('id')
                    .eq('title', opp.title)
                    .eq('organization', opp.organization || '');

            const { data: existing } = await existingQuery.maybeSingle();

            if (existing) {
                response.skipped++;
                response.processed++;
                continue;
            }

            const { error } = await supabase.from('opportunities').insert(insertData);

            if (error) {
                response.errors.push(`Failed to create "${opp.title}": ${error.message}`);
            } else {
                response.created++;
            }
            response.processed++;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            response.errors.push(`Error processing "${opp.title}": ${message}`);
            response.processed++;
        }
    }
}

async function processUpdateAction(
    opportunities: N8nOpportunityData[],
    response: WebhookResponse,
    source: string
): Promise<void> {
    for (const opp of opportunities) {
        try {
            if (!opp.externalId) {
                response.errors.push(`Cannot update "${opp.title}": missing externalId`);
                response.processed++;
                continue;
            }

            const updateData = mapToSupabaseFormat(opp, source);

            const { error } = await supabase
                .from('opportunities')
                .update(updateData)
                .eq('metadata->>external_id', opp.externalId);

            if (error) {
                response.errors.push(`Failed to update "${opp.title}": ${error.message}`);
            } else {
                response.updated++;
            }
            response.processed++;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            response.errors.push(`Error updating "${opp.title}": ${message}`);
            response.processed++;
        }
    }
}

async function processDeleteAction(
    opportunities: N8nOpportunityData[],
    response: WebhookResponse
): Promise<void> {
    for (const opp of opportunities) {
        try {
            if (!opp.externalId) {
                response.errors.push(`Cannot delete: missing externalId`);
                response.processed++;
                continue;
            }

            const { error } = await supabase
                .from('opportunities')
                .delete()
                .eq('metadata->>external_id', opp.externalId);

            if (error) {
                response.errors.push(`Failed to delete "${opp.externalId}": ${error.message}`);
            } else {
                response.updated++; // Using updated for deletions
            }
            response.processed++;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            response.errors.push(`Error deleting "${opp.externalId}": ${message}`);
            response.processed++;
        }
    }
}

async function processBulkSyncAction(
    opportunities: N8nOpportunityData[],
    response: WebhookResponse,
    source: string
): Promise<void> {
    // Get all existing opportunities from this source
    const { data: existingOpps } = await supabase
        .from('opportunities')
        .select('id, metadata')
        .eq('source', source);

    const existingMap = new Map<string, string>();
    existingOpps?.forEach(opp => {
        const externalId = (opp.metadata as any)?.external_id;
        if (externalId) {
            existingMap.set(externalId, opp.id);
        }
    });

    const incomingExternalIds = new Set<string>();

    for (const opp of opportunities) {
        const externalId = opp.externalId;
        if (externalId) {
            incomingExternalIds.add(externalId);
        }

        try {
            const dbData = mapToSupabaseFormat(opp, source);

            if (externalId && existingMap.has(externalId)) {
                // Update existing
                const { error } = await supabase
                    .from('opportunities')
                    .update(dbData)
                    .eq('id', existingMap.get(externalId)!);

                if (error) {
                    response.errors.push(`Sync update failed for "${opp.title}": ${error.message}`);
                } else {
                    response.updated++;
                }
            } else {
                // Create new
                const { error } = await supabase.from('opportunities').insert(dbData);

                if (error) {
                    response.errors.push(`Sync create failed for "${opp.title}": ${error.message}`);
                } else {
                    response.created++;
                }
            }
            response.processed++;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            response.errors.push(`Sync error for "${opp.title}": ${message}`);
            response.processed++;
        }
    }

    // Optionally mark opportunities not in incoming data as expired
    // (commented out for safety - enable if desired)
    /*
    for (const [externalId, id] of existingMap) {
      if (!incomingExternalIds.has(externalId)) {
        await supabase
          .from('opportunities')
          .update({ metadata: supabase.rpc('jsonb_set_key', { key: 'status', value: 'expired' }) })
          .eq('id', id);
      }
    }
    */
}

// ================================
// Helper Functions
// ================================

function mapToSupabaseFormat(opp: N8nOpportunityData, source: string) {
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

async function validateWebhookApiKey(apiKey: string): Promise<boolean> {
    // In production, validate against stored API keys
    // For now, check against environment variable
    const validKey = import.meta.env.VITE_N8N_API_KEY;
    return validKey ? apiKey === validKey : true; // Allow if no key configured
}

// ================================
// Manual Opportunity Management
// ================================

export async function createOpportunityManually(
    data: N8nOpportunityData,
    adminId: string
): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        const insertData = {
            ...mapToSupabaseFormat(data, 'admin'),
            created_by: adminId,
            metadata: {
                ...(data.metadata || {}),
                created_manually: true,
                created_by: adminId,
            },
        };

        const { data: result, error } = await supabase
            .from('opportunities')
            .insert(insertData)
            .select('id')
            .single();

        if (error) throw error;

        await logAdminAction('opportunities:create', 'opportunity', result.id, data);
        clearOpportunitiesCache();

        return { success: true, id: result.id };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

export async function updateOpportunityManually(
    id: string,
    data: Partial<N8nOpportunityData>,
    adminId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const updateData: Record<string, any> = {};

        if (data.title) updateData.title = data.title;
        if (data.summary) updateData.summary = data.summary;
        if (data.description) updateData.description = data.description;
        if (data.category) updateData.category = data.category;
        if (data.organization) updateData.organization = data.organization;
        if (data.location) updateData.location = data.location;
        if (data.isRemote !== undefined) updateData.is_remote = data.isRemote;
        if (data.applicationUrl) updateData.application_url = data.applicationUrl;
        if (data.tags) updateData.tags = data.tags;
        if (data.closeDate) updateData.close_date = data.closeDate;

        const { error } = await supabase
            .from('opportunities')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        await logAdminAction('opportunities:update', 'opportunity', id, { ...data, updatedBy: adminId });
        clearOpportunitiesCache();

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

export async function deleteOpportunityManually(
    id: string,
    adminId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('opportunities')
            .delete()
            .eq('id', id);

        if (error) throw error;

        await logAdminAction('opportunities:delete', 'opportunity', id, { deletedBy: adminId });
        clearOpportunitiesCache();

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

export async function featureOpportunity(
    id: string,
    featured: boolean,
    adminId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Get existing metadata
        const { data: existing } = await supabase
            .from('opportunities')
            .select('metadata')
            .eq('id', id)
            .single();

        const { error } = await supabase
            .from('opportunities')
            .update({
                metadata: {
                    ...((existing?.metadata as object) || {}),
                    featured,
                    featured_at: featured ? new Date().toISOString() : null,
                    featured_by: featured ? adminId : null,
                },
            })
            .eq('id', id);

        if (error) throw error;

        await logAdminAction(
            featured ? 'opportunities:feature' : 'opportunities:unfeature',
            'opportunity',
            id,
            { adminId }
        );

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

export default {
    processN8nWebhook,
    createOpportunityManually,
    updateOpportunityManually,
    deleteOpportunityManually,
    featureOpportunity,
};
