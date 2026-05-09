/**
 * Admin Services Index
 * Re-exports all admin services for easy importing
 */

// Core admin service
export {
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
} from './adminService';

export type {
    AdminUser,
    AdminPermission,
    AdminStats,
    BroadcastNotificationPayload,
    SupportTicketResponse,
} from './adminService';

// Marketplace admin service
export {
    getMarketplaceItems,
    getPendingApprovals,
    getFeaturedItems,
    processApproval,
    setFeaturedStatus,
    addModeratorNote,
} from './marketplaceAdmin';

export type {
    MarketplaceItem,
    MarketplaceFilters,
    ApprovalPayload,
} from './marketplaceAdmin';

// Opportunities webhook service
export {
    processN8nWebhook,
    createOpportunityManually,
    updateOpportunityManually,
    deleteOpportunityManually,
    featureOpportunity,
} from './opportunitiesWebhook';

export type {
    N8nOpportunityPayload,
    N8nOpportunityData,
    WebhookResponse,
} from './opportunitiesWebhook';

// Legacy opportunities service (Supabase)
export {
    listOpportunities,
    createOpportunity,
    updateOpportunity,
    deleteOpportunity,
} from './opportunitiesSupabase';
