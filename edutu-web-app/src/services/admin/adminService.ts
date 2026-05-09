/**
 * Admin Service - Central hub for all admin-related operations
 * This service provides the connection layer between the main app and admin dashboard
 */

import { supabase } from '../../lib/supabaseClient';
import type { AppNotification, NotificationDraft } from '../../types/notification';

// ================================
// Types for Admin Portal Integration
// ================================

export interface AdminUser {
    id: string;
    email: string;
    fullName: string;
    role: 'super_admin' | 'admin' | 'moderator' | 'support_agent';
    permissions: AdminPermission[];
    createdAt: string;
    lastActiveAt: string | null;
}

export type AdminPermission =
    | 'opportunities:manage'
    | 'opportunities:approve'
    | 'marketplace:moderate'
    | 'marketplace:feature'
    | 'notifications:send'
    | 'users:manage'
    | 'support:respond'
    | 'analytics:view'
    | 'settings:manage';

export interface AdminStats {
    users: {
        total: number;
        activeThisWeek: number;
        newThisWeek: number;
        onboardingCompleted: number;
    };
    opportunities: {
        total: number;
        active: number;
        expiringSoon: number;
        pendingReview: number;
    };
    marketplace: {
        totalRoadmaps: number;
        pendingApproval: number;
        featured: number;
    };
    support: {
        openTickets: number;
        avgResponseTime: number; // in hours
        resolvedThisWeek: number;
    };
    engagement: {
        dailyActiveUsers: number;
        aiInteractions: number;
        opportunityClicks: number;
    };
}

export interface BroadcastNotificationPayload {
    title: string;
    body: string;
    kind: 'admin-broadcast' | 'system';
    severity?: 'info' | 'success' | 'warning' | 'critical';
    targetAudience: 'all' | 'active' | 'specific';
    targetUserIds?: string[];
    metadata?: Record<string, unknown>;
    scheduledFor?: string; // ISO date string for scheduled broadcasts
}

export interface SupportTicketResponse {
    ticketId: string;
    message: string;
    isResolution: boolean;
    internalNote?: string;
}

// ================================
// Admin Authentication & Authorization
// ================================

export async function checkAdminAccess(): Promise<{ isAdmin: boolean; role: AdminUser['role'] | null }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { isAdmin: false, role: null };

        const { data: profile } = await supabase
            .from('profiles')
            .select('preferences')
            .eq('user_id', user.id)
            .single();

        const role = profile?.preferences?.role;
        const isAdmin = ['super_admin', 'admin', 'moderator', 'support_agent'].includes(role);

        return { isAdmin, role: isAdmin ? role : null };
    } catch (error) {
        console.error('Error checking admin access:', error);
        return { isAdmin: false, role: null };
    }
}

export async function getAdminPermissions(userId: string): Promise<AdminPermission[]> {
    const { data: profile } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('user_id', userId)
        .single();

    const role = profile?.preferences?.role;

    // Define permissions based on role
    const permissionMap: Record<string, AdminPermission[]> = {
        super_admin: [
            'opportunities:manage',
            'opportunities:approve',
            'marketplace:moderate',
            'marketplace:feature',
            'notifications:send',
            'users:manage',
            'support:respond',
            'analytics:view',
            'settings:manage',
        ],
        admin: [
            'opportunities:manage',
            'opportunities:approve',
            'marketplace:moderate',
            'marketplace:feature',
            'notifications:send',
            'support:respond',
            'analytics:view',
        ],
        moderator: [
            'marketplace:moderate',
            'notifications:send',
            'support:respond',
        ],
        support_agent: [
            'support:respond',
        ],
    };

    return permissionMap[role] || [];
}

// ================================
// Platform Statistics for Admin Dashboard
// ================================

export async function getAdminStats(): Promise<AdminStats> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoISO = weekAgo.toISOString();

    // Get user stats
    const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

    const { count: activeThisWeek } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('last_seen_at', weekAgoISO);

    const { count: newThisWeek } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgoISO);

    // Get opportunity stats
    const { count: totalOpportunities } = await supabase
        .from('opportunities')
        .select('*', { count: 'exact', head: true });

    const { count: activeOpportunities } = await supabase
        .from('opportunities')
        .select('*', { count: 'exact', head: true })
        .or(`close_date.is.null,close_date.gte.${now.toISOString().split('T')[0]}`);

    // Get marketplace stats
    const { count: totalRoadmaps } = await supabase
        .from('community_posts')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'roadmap');

    const { count: pendingRoadmaps } = await supabase
        .from('community_posts')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'roadmap')
        .eq('visibility', 'admins');

    // Get support ticket stats
    const { count: openTickets } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']);

    const { count: resolvedThisWeek } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved')
        .gte('updated_at', weekAgoISO);

    return {
        users: {
            total: totalUsers ?? 0,
            activeThisWeek: activeThisWeek ?? 0,
            newThisWeek: newThisWeek ?? 0,
            onboardingCompleted: 0, // Would need onboarding tracking
        },
        opportunities: {
            total: totalOpportunities ?? 0,
            active: activeOpportunities ?? 0,
            expiringSoon: 0, // Would need date calculation
            pendingReview: 0,
        },
        marketplace: {
            totalRoadmaps: totalRoadmaps ?? 0,
            pendingApproval: pendingRoadmaps ?? 0,
            featured: 0, // Would need featured count
        },
        support: {
            openTickets: openTickets ?? 0,
            avgResponseTime: 0, // Would need calculation
            resolvedThisWeek: resolvedThisWeek ?? 0,
        },
        engagement: {
            dailyActiveUsers: 0, // Would need analytics aggregation
            aiInteractions: 0,
            opportunityClicks: 0,
        },
    };
}

// ================================
// Broadcast Notifications (Admin -> Users)
// ================================

export async function sendBroadcastNotification(
    payload: BroadcastNotificationPayload
): Promise<{ success: boolean; sentCount: number; errors: string[] }> {
    const errors: string[] = [];
    let sentCount = 0;

    try {
        let targetUsers: string[] = [];

        if (payload.targetAudience === 'specific' && payload.targetUserIds) {
            targetUsers = payload.targetUserIds;
        } else if (payload.targetAudience === 'active') {
            // Get users active in the last 7 days
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const { data } = await supabase
                .from('profiles')
                .select('user_id')
                .gte('last_seen_at', weekAgo);
            targetUsers = data?.map(p => p.user_id) ?? [];
        } else {
            // All users
            const { data } = await supabase
                .from('profiles')
                .select('user_id');
            targetUsers = data?.map(p => p.user_id) ?? [];
        }

        // Insert notifications for each user
        const notifications = targetUsers.map(userId => ({
            user_id: userId,
            kind: payload.kind,
            title: payload.title,
            body: payload.body,
            severity: payload.severity ?? 'info',
            metadata: payload.metadata ?? {},
            dedupe_key: `broadcast-${Date.now()}`,
        }));

        if (notifications.length > 0) {
            // Insert in batches of 100
            const batchSize = 100;
            for (let i = 0; i < notifications.length; i += batchSize) {
                const batch = notifications.slice(i, i + batchSize);
                const { error } = await supabase.from('notifications').insert(batch);
                if (error) {
                    errors.push(`Batch ${i / batchSize + 1} failed: ${error.message}`);
                } else {
                    sentCount += batch.length;
                }
            }
        }

        return { success: errors.length === 0, sentCount, errors };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, sentCount, errors: [message] };
    }
}

export async function scheduleNotification(
    payload: BroadcastNotificationPayload
): Promise<{ success: boolean; scheduledId?: string }> {
    // For scheduled notifications, we store them in a queue table
    // This would be processed by a cron job or Edge Function
    try {
        const { data, error } = await supabase
            .from('notification_queue')
            .insert({
                payload: payload,
                scheduled_for: payload.scheduledFor,
                status: 'pending',
            })
            .select('id')
            .single();

        if (error) throw error;
        return { success: true, scheduledId: data.id };
    } catch (error) {
        console.error('Error scheduling notification:', error);
        return { success: false };
    }
}

// ================================
// Support Ticket Management
// ================================

export async function respondToTicket(
    response: SupportTicketResponse
): Promise<{ success: boolean; error?: string }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Add the response message
        const { error: messageError } = await supabase
            .from('support_messages')
            .insert({
                ticket_id: response.ticketId,
                author_id: user.id,
                role: 'agent',
                message: response.message,
                attachments: [],
            });

        if (messageError) throw messageError;

        // Update ticket status if this is a resolution
        if (response.isResolution) {
            const { error: ticketError } = await supabase
                .from('support_tickets')
                .update({ status: 'resolved' })
                .eq('id', response.ticketId);

            if (ticketError) throw ticketError;
        } else {
            // Mark as in_progress if it was open
            const { error: ticketError } = await supabase
                .from('support_tickets')
                .update({ status: 'in_progress' })
                .eq('id', response.ticketId)
                .eq('status', 'open');

            if (ticketError) throw ticketError;
        }

        // Add internal note if provided
        if (response.internalNote) {
            const { error: noteError } = await supabase
                .from('support_messages')
                .insert({
                    ticket_id: response.ticketId,
                    author_id: user.id,
                    role: 'system',
                    message: `[INTERNAL NOTE] ${response.internalNote}`,
                    attachments: [],
                });

            if (noteError) console.warn('Failed to add internal note:', noteError);
        }

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

export async function getAllTickets(filters?: {
    status?: string[];
    priority?: string[];
    category?: string;
    limit?: number;
}) {
    let query = supabase
        .from('support_tickets')
        .select(`
      *,
      support_messages (
        id,
        role,
        message,
        created_at
      ),
      profiles!support_tickets_user_id_fkey (
        full_name,
        email
      )
    `)
        .order('created_at', { ascending: false });

    if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
    }

    if (filters?.priority && filters.priority.length > 0) {
        query = query.in('priority', filters.priority);
    }

    if (filters?.category) {
        query = query.eq('category', filters.category);
    }

    if (filters?.limit) {
        query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    return data;
}

// ================================
// Analytics for Admin Dashboard
// ================================

export async function getSignupAnalytics(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('profiles')
        .select('created_at')
        .gte('created_at', startDate)
        .order('created_at', { ascending: true });

    if (error) throw error;

    // Group by date
    const signupsByDate: Record<string, number> = {};
    data?.forEach(profile => {
        const date = new Date(profile.created_at).toLocaleDateString();
        signupsByDate[date] = (signupsByDate[date] || 0) + 1;
    });

    return Object.entries(signupsByDate).map(([date, count]) => ({
        date,
        signups: count,
    }));
}

export async function getApplicationAnalytics(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('opportunity_applications')
        .select('status, created_at')
        .gte('created_at', startDate);

    if (error) throw error;

    const statusCounts: Record<string, number> = {};
    data?.forEach(app => {
        statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
    });

    return {
        total: data?.length ?? 0,
        byStatus: statusCounts,
    };
}

export async function getSupportAnalytics(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('support_tickets')
        .select('status, category, created_at, updated_at')
        .gte('created_at', startDate);

    if (error) throw error;

    const categoryBreakdown: Record<string, number> = {};
    const statusBreakdown: Record<string, number> = {};
    let totalResponseTime = 0;
    let resolvedCount = 0;

    data?.forEach(ticket => {
        categoryBreakdown[ticket.category] = (categoryBreakdown[ticket.category] || 0) + 1;
        statusBreakdown[ticket.status] = (statusBreakdown[ticket.status] || 0) + 1;

        if (ticket.status === 'resolved' && ticket.updated_at) {
            const created = new Date(ticket.created_at).getTime();
            const resolved = new Date(ticket.updated_at).getTime();
            totalResponseTime += (resolved - created) / (1000 * 60 * 60); // hours
            resolvedCount++;
        }
    });

    return {
        total: data?.length ?? 0,
        byCategory: categoryBreakdown,
        byStatus: statusBreakdown,
        avgResolutionTimeHours: resolvedCount > 0 ? totalResponseTime / resolvedCount : 0,
    };
}

// ================================
// Audit Logging for Admin Actions
// ================================

export async function logAdminAction(
    action: string,
    entityType: string,
    entityId: string,
    metadata?: Record<string, unknown>
) {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        await supabase.from('audit_log').insert({
            actor_id: user?.id ?? null,
            action,
            entity_type: entityType,
            entity_id: entityId,
            metadata: metadata ?? {},
        });
    } catch (error) {
        console.error('Failed to log admin action:', error);
    }
}

export default {
    checkAdminAccess,
    getAdminPermissions,
    getAdminStats,
    sendBroadcastNotification,
    scheduleNotification,
    respondToTicket,
    getAllTickets,
    getSignupAnalytics,
    getApplicationAnalytics,
    getSupportAnalytics,
    logAdminAction,
};
