import React, { ReactNode } from 'react';
import {
    Search,
    Bell,
    Briefcase,
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
        <div className={`flex min-h-[180px] flex-col items-center justify-center px-4 py-8 text-center ${className}`}>
            {icon && (
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#eaf3ff] text-[#146ef5] dark:bg-white/10 dark:text-brand-300">
                    {icon}
                </div>
            )}

            <h3 className="text-base font-black text-gray-900 dark:text-white">
                {title}
            </h3>

            <p className="mt-2 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
                {description}
            </p>

            {(action || secondaryAction) && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {action && (
                        <Button
                            onClick={action.onClick}
                            variant={action.variant || 'primary'}
                            size="sm"
                        >
                            {action.label}
                        </Button>
                    )}
                    {secondaryAction && (
                        <Button
                            onClick={secondaryAction.onClick}
                            variant="secondary"
                            size="sm"
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
 * Empty Opportunities State
 */
export const EmptyOpportunities: React.FC<{ onExplore?: () => void }> = ({ onExplore }) => (
    <EmptyState
        icon={<Briefcase size={32} />}
        title="No opportunities found"
        description="No matches for this filter. Clear it or try a broader search."
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
            ? `No results for "${query}". Try a shorter or broader search.`
            : "Try a broader search or clear the current filter."
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
        description="New opportunity alerts and reminders will appear here."
    />
);

/**
 * Empty Achievements State
 */
export const EmptyAchievements: React.FC<{ onExplore?: () => void }> = ({ onExplore }) => (
    <EmptyState
        icon={<Trophy size={32} />}
        title="No achievements yet"
        description="Progress from applications and opportunities will appear here."
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
        description="New messages and updates will appear here."
    />
);

/**
 * Empty Folder State (Generic)
 */
export const EmptyFolder: React.FC<{ folderName?: string }> = ({ folderName = 'folder' }) => (
    <EmptyState
        icon={<FolderOpen size={32} />}
        title={`This ${folderName} is empty`}
        description="Nothing has been added here yet."
    />
);

/**
 * Offline State
 */
export const OfflineState: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
    <EmptyState
        icon={<WifiOff size={32} />}
        title="You're offline"
        description="Check your connection, then retry."
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
        description={message || "The view could not load. Try again."}
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
        description={`${feature} is not available yet.`}
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
