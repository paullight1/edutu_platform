/**
 * Admin Types
 * Type definitions for admin portal integration
 */

// ================================
// User & Role Types
// ================================

export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'support_agent';

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

export interface AdminUser {
    id: string;
    email: string;
    fullName: string;
    role: AdminRole;
    permissions: AdminPermission[];
    createdAt: string;
    lastActiveAt: string | null;
}

// ================================
// Statistics Types
// ================================

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
        avgResponseTime: number;
        resolvedThisWeek: number;
    };
    engagement: {
        dailyActiveUsers: number;
        aiInteractions: number;
        opportunityClicks: number;
    };
}

export interface SignupTrend {
    date: string;
    signups: number;
}

export interface ApplicationStats {
    total: number;
    byStatus: Record<string, number>;
}

export interface SupportStats {
    total: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
    avgResolutionTimeHours: number;
}

// ================================
// Notification Types
// ================================

export type NotificationAudience = 'all' | 'active' | 'specific';

export interface BroadcastNotificationPayload {
    title: string;
    body: string;
    kind: 'admin-broadcast' | 'system';
    severity?: 'info' | 'success' | 'warning' | 'critical';
    targetAudience: NotificationAudience;
    targetUserIds?: string[];
    metadata?: Record<string, unknown>;
    scheduledFor?: string;
}

export interface ScheduledNotification {
    id: string;
    payload: BroadcastNotificationPayload;
    scheduledFor: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    processedAt?: string;
    result?: {
        sentCount: number;
        errors: string[];
    };
    createdAt: string;
}

// ================================
// Support Ticket Types
// ================================

export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SupportTicket {
    id: string;
    userId: string;
    userEmail?: string;
    userName?: string;
    subject: string;
    description: string;
    category: string;
    priority: TicketPriority;
    status: TicketStatus;
    messages: SupportMessage[];
    createdAt: string;
    updatedAt: string;
}

export interface SupportMessage {
    id: string;
    ticketId: string;
    authorId: string;
    role: 'user' | 'agent' | 'system';
    message: string;
    attachments: string[];
    createdAt: string;
}

export interface SupportTicketResponse {
    ticketId: string;
    message: string;
    isResolution: boolean;
    internalNote?: string;
}

// ================================
// Marketplace Admin Types
// ================================

export type MarketplaceItemType = 'roadmap' | 'marketplace' | 'resource';
export type MarketplaceItemStatus = 'approved' | 'pending' | 'rejected' | 'hidden';
export type ApprovalDecision = 'approve' | 'reject' | 'request_changes';

export interface MarketplaceItem {
    id: string;
    title: string;
    type: MarketplaceItemType;
    status: MarketplaceItemStatus;
    authorId: string;
    authorName: string;
    authorEmail: string;
    category: string;
    submittedAt: string;
    reviewedAt?: string;
    reviewedBy?: string;
    featured: boolean;
    featuredRank?: number;
    stats: {
        views: number;
        saves: number;
        adoptions: number;
        likes: number;
    };
    moderatorNotes: ModeratorNote[];
}

export interface ModeratorNote {
    id: string;
    note: string;
    author: string;
    createdAt: string;
}

export interface MarketplaceFilters {
    status?: MarketplaceItemStatus[];
    type?: MarketplaceItemType[];
    category?: string;
    featured?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
}

export interface ApprovalPayload {
    itemId: string;
    decision: ApprovalDecision;
    note?: string;
    featured?: boolean;
    featuredRank?: number;
}

// ================================
// Webhook Types
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

export interface WebhookApiKey {
    id: string;
    name: string;
    description?: string;
    permissions: string[];
    isActive: boolean;
    lastUsedAt?: string;
    expiresAt?: string;
    createdAt: string;
}

// ================================
// Personalization Types
// ================================

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type Availability = 'full-time' | 'part-time' | 'remote' | 'flexible';

export interface UserPersonalization {
    userId: string;
    interests: string[];
    careerGoals: string[];
    experienceLevel: ExperienceLevel;
    preferredCategories: string[];
    preferredLocations: string[];
    availability: Availability;
    recommendationWeights: {
        category?: number;
        location?: number;
        interests?: number;
    };
    onboardingCompleted: boolean;
    lastUpdated: string;
}

export interface OpportunityRecommendation {
    id: string;
    userId: string;
    opportunityId: string;
    matchScore: number;
    matchReasons: Array<{
        type: string;
        weight: number;
    }>;
    isDismissed: boolean;
    isSaved: boolean;
    generatedAt: string;
    expiresAt: string;
}

// ================================
// Audit Log Types
// ================================

export interface AuditLogEntry {
    id: string;
    actorId?: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
    createdAt: string;
}

// ================================
// Analytics Types
// ================================

export interface UserSession {
    id: string;
    userId: string;
    sessionStart: string;
    sessionEnd?: string;
    deviceInfo: Record<string, unknown>;
    pagesViewed: string[];
    actionsCount: number;
}

export interface OpportunityClick {
    id: string;
    userId?: string;
    opportunityId: string;
    clickType: 'view' | 'apply' | 'bookmark' | 'share';
    referrer?: string;
    metadata: Record<string, unknown>;
    createdAt: string;
}

export interface OpportunityPerformance {
    opportunityId: string;
    title: string;
    category: string;
    viewCount: number;
    applyCount: number;
    bookmarkCount: number;
    conversionRate: number;
}

// ================================
// Dashboard Snapshot Types
// ================================

export interface DashboardSnapshot {
    id: string;
    snapshotType: 'daily' | 'weekly' | 'monthly';
    snapshotDate: string;
    metrics: AdminStats;
    generatedAt: string;
}
