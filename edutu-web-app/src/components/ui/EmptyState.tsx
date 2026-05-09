import React, { ReactNode } from 'react';
import {
    Target,
    Search,
    Bell,
    MessageCircle,
    Briefcase,
    FileText,
    Users,
    Trophy,
    Inbox,
    FolderOpen,
    WifiOff,
    AlertCircle,
    Sparkles
} from 'lucide-react';
import Button from './Button';

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
        variant?: 'primary' | 'secondary';
    };
    secondaryAction?: {
        label: string;
        onClick: () => void;
    };
    className?: string;
}

/**
 * EmptyState Component
 * 
 * A flexible empty state component for when there's no data to display.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    action,
    secondaryAction,
    className = ''
}) => {
    return (
        <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
            {/* Icon */}
            {icon && (
                <div className="w-16 h-16 mb-6 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500">
                    {icon}
                </div>
            )}

            {/* Title */}
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {title}
            </h3>

            {/* Description */}
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
                {description}
            </p>

            {/* Actions */}
            {(action || secondaryAction) && (
                <div className="flex flex-col sm:flex-row gap-3">
                    {action && (
                        <Button
                            onClick={action.onClick}
                            variant={action.variant || 'primary'}
                            className="min-w-[140px]"
                        >
                            {action.label}
                        </Button>
                    )}
                    {secondaryAction && (
                        <Button
                            onClick={secondaryAction.onClick}
                            variant="secondary"
                            className="min-w-[140px]"
                        >
                            {secondaryAction.label}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================
// Pre-built Empty State Variants
// ============================================

/**
 * Empty Goals State
 */
export const EmptyGoals: React.FC<{ onAddGoal?: () => void }> = ({ onAddGoal }) => (
    <EmptyState
        icon={<Target size={32} />}
        title="No goals yet"
        description="Set your first goal to start tracking your progress and building momentum toward your dreams."
        action={onAddGoal ? {
            label: 'Create First Goal',
            onClick: onAddGoal
        } : undefined}
    />
);

/**
 * Empty Opportunities State
 */
export const EmptyOpportunities: React.FC<{ onExplore?: () => void }> = ({ onExplore }) => (
    <EmptyState
        icon={<Briefcase size={32} />}
        title="No opportunities found"
        description="We couldn't find any opportunities matching your criteria. Try adjusting your filters or check back later."
        action={onExplore ? {
            label: 'Clear Filters',
            onClick: onExplore
        } : undefined}
    />
);

/**
 * Empty Search Results State
 */
export const EmptySearchResults: React.FC<{ query?: string; onClear?: () => void }> = ({
    query,
    onClear
}) => (
    <EmptyState
        icon={<Search size={32} />}
        title="No results found"
        description={query
            ? `We couldn't find anything matching "${query}". Try different keywords or check your spelling.`
            : "We couldn't find any results. Try adjusting your search."
        }
        action={onClear ? {
            label: 'Clear Search',
            onClick: onClear,
            variant: 'secondary'
        } : undefined}
    />
);

/**
 * Empty Notifications State
 */
export const EmptyNotifications: React.FC = () => (
    <EmptyState
        icon={<Bell size={32} />}
        title="All caught up!"
        description="You have no new notifications. We'll let you know when something important happens."
    />
);

/**
 * Empty Chat History State
 */
export const EmptyChatHistory: React.FC<{ onStartChat?: () => void }> = ({ onStartChat }) => (
    <EmptyState
        icon={<MessageCircle size={32} />}
        title="No conversations yet"
        description="Start a conversation with Edutu AI to get personalized career guidance and opportunity recommendations."
        action={onStartChat ? {
            label: 'Start Chatting',
            onClick: onStartChat
        } : undefined}
    />
);

/**
 * Empty CV/Documents State
 */
export const EmptyDocuments: React.FC<{ onUpload?: () => void }> = ({ onUpload }) => (
    <EmptyState
        icon={<FileText size={32} />}
        title="No documents yet"
        description="Upload your CV or resume to get AI-powered feedback and recommendations for improvement."
        action={onUpload ? {
            label: 'Upload Document',
            onClick: onUpload
        } : undefined}
    />
);

/**
 * Empty Community Roadmaps State
 */
export const EmptyRoadmaps: React.FC<{ onBrowse?: () => void }> = ({ onBrowse }) => (
    <EmptyState
        icon={<Users size={32} />}
        title="No roadmaps found"
        description="Explore success trajectories shared by the Edutu community or be the first to share your journey."
        action={onBrowse ? {
            label: 'Browse All',
            onClick: onBrowse
        } : undefined}
    />
);

/**
 * Empty Achievements State
 */
export const EmptyAchievements: React.FC<{ onExplore?: () => void }> = ({ onExplore }) => (
    <EmptyState
        icon={<Trophy size={32} />}
        title="No achievements yet"
        description="Complete goals and explore opportunities to earn achievements and showcase your progress."
        action={onExplore ? {
            label: 'Start Exploring',
            onClick: onExplore
        } : undefined}
    />
);

/**
 * Empty Inbox State
 */
export const EmptyInbox: React.FC = () => (
    <EmptyState
        icon={<Inbox size={32} />}
        title="Inbox is empty"
        description="You're all caught up! New messages and updates will appear here."
    />
);

/**
 * Empty Folder State (Generic)
 */
export const EmptyFolder: React.FC<{ folderName?: string }> = ({ folderName = 'folder' }) => (
    <EmptyState
        icon={<FolderOpen size={32} />}
        title={`This ${folderName} is empty`}
        description="There's nothing here yet. Add some items to get started."
    />
);

/**
 * Offline State
 */
export const OfflineState: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
    <EmptyState
        icon={<WifiOff size={32} />}
        title="You're offline"
        description="Please check your internet connection and try again. Some features may be limited."
        action={onRetry ? {
            label: 'Retry',
            onClick: onRetry
        } : undefined}
    />
);

/**
 * Error State
 */
export const ErrorState: React.FC<{
    message?: string;
    onRetry?: () => void
}> = ({ message, onRetry }) => (
    <EmptyState
        icon={<AlertCircle size={32} />}
        title="Something went wrong"
        description={message || "We encountered an error while loading. Please try again."}
        action={onRetry ? {
            label: 'Try Again',
            onClick: onRetry
        } : undefined}
    />
);

/**
 * Coming Soon State
 */
export const ComingSoonState: React.FC<{ feature?: string }> = ({ feature = 'This feature' }) => (
    <EmptyState
        icon={<Sparkles size={32} />}
        title="Coming Soon"
        description={`${feature} is currently under development. Check back soon for updates!`}
    />
);

/**
 * No Internet Connection Inline Banner
 */
export const OfflineBanner: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
    <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
        <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                No internet connection
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
                Some features may be unavailable
            </p>
        </div>
        {onRetry && (
            <button
                onClick={onRetry}
                className="px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg transition-colors"
            >
                Retry
            </button>
        )}
    </div>
);

export default EmptyState;
