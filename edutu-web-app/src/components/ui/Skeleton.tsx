import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
    width?: string | number;
    height?: string | number;
    animation?: 'pulse' | 'wave' | 'none';
}

/**
 * Skeleton Component
 * 
 * A placeholder loading component that mimics the shape of content while loading.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    variant = 'text',
    width,
    height,
    animation = 'pulse'
}) => {
    const baseClasses = 'bg-gray-200 dark:bg-gray-700';

    const animationClasses = {
        pulse: 'animate-pulse',
        wave: 'skeleton-wave',
        none: ''
    };

    const variantClasses = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-none',
        rounded: 'rounded-xl'
    };

    const style: React.CSSProperties = {
        width: width,
        height: height
    };

    return (
        <div
            className={`${baseClasses} ${animationClasses[animation]} ${variantClasses[variant]} ${className}`}
            style={style}
            aria-hidden="true"
            role="presentation"
        />
    );
};

/**
 * Skeleton Text - For text content placeholders
 */
export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({
    lines = 3,
    className = ''
}) => (
    <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, index) => (
            <Skeleton
                key={index}
                variant="text"
                className={`h-4 ${index === lines - 1 ? 'w-3/4' : 'w-full'}`}
            />
        ))}
    </div>
);

/**
 * Skeleton Card - For card content placeholders
 */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-start gap-4">
            <Skeleton variant="circular" className="w-12 h-12 shrink-0" />
            <div className="flex-1 space-y-2">
                <Skeleton variant="text" className="h-5 w-3/4" />
                <Skeleton variant="text" className="h-4 w-1/2" />
            </div>
        </div>
        <div className="mt-4 space-y-2">
            <Skeleton variant="text" className="h-3 w-full" />
            <Skeleton variant="text" className="h-3 w-5/6" />
        </div>
    </div>
);

/**
 * Skeleton Stats Card - For dashboard stat cards
 */
export const SkeletonStatsCard: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ${className}`}>
        <Skeleton variant="text" className="h-3 w-20 mb-2" />
        <Skeleton variant="text" className="h-8 w-16 mb-1" />
        <Skeleton variant="text" className="h-3 w-24" />
    </div>
);

/**
 * Skeleton Avatar - For user avatar placeholders
 */
export const SkeletonAvatar: React.FC<{ size?: 'sm' | 'md' | 'lg' | 'xl' }> = ({ size = 'md' }) => {
    const sizes = {
        sm: 'w-8 h-8',
        md: 'w-10 h-10',
        lg: 'w-12 h-12',
        xl: 'w-16 h-16'
    };

    return <Skeleton variant="circular" className={sizes[size]} />;
};

/**
 * Skeleton Button - For button placeholders
 */
export const SkeletonButton: React.FC<{ className?: string }> = ({ className = '' }) => (
    <Skeleton variant="rounded" className={`h-10 w-24 ${className}`} />
);

/**
 * Skeleton Image - For image placeholders
 */
export const SkeletonImage: React.FC<{ className?: string; aspectRatio?: string }> = ({
    className = '',
    aspectRatio = '16/9'
}) => (
    <Skeleton
        variant="rounded"
        className={`w-full ${className}`}
        style={{ aspectRatio }}
    />
);

/**
 * Skeleton List - For list item placeholders
 */
export const SkeletonList: React.FC<{ count?: number; className?: string }> = ({
    count = 3,
    className = ''
}) => (
    <div className={`space-y-3 ${className}`}>
        {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                <Skeleton variant="circular" className="w-10 h-10 shrink-0" />
                <div className="flex-1 space-y-1">
                    <Skeleton variant="text" className="h-4 w-3/4" />
                    <Skeleton variant="text" className="h-3 w-1/2" />
                </div>
                <Skeleton variant="rounded" className="w-6 h-6" />
            </div>
        ))}
    </div>
);

/**
 * Skeleton Dashboard - Complete dashboard loading state
 */
export const SkeletonDashboard: React.FC = () => (
    <div className="p-4 space-y-6 animate-pulse">
        {/* Header */}
        <div className="flex items-center justify-between">
            <div className="space-y-2">
                <Skeleton variant="text" className="h-6 w-32" />
                <Skeleton variant="text" className="h-4 w-48" />
            </div>
            <Skeleton variant="circular" className="w-12 h-12" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonStatsCard key={index} />
            ))}
        </div>

        {/* Featured Section */}
        <div className="space-y-3">
            <Skeleton variant="text" className="h-5 w-40" />
            <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, index) => (
                    <SkeletonCard key={index} />
                ))}
            </div>
        </div>
    </div>
);

/**
 * Skeleton Opportunities - Opportunities list loading state
 */
export const SkeletonOpportunities: React.FC = () => (
    <div className="p-4 space-y-4">
        {/* Search Bar */}
        <Skeleton variant="rounded" className="h-12 w-full" />

        {/* Filter Chips */}
        <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} variant="rounded" className="h-8 w-20 shrink-0" />
            ))}
        </div>

        {/* Cards */}
        <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonCard key={index} />
            ))}
        </div>
    </div>
);

/**
 * Skeleton Chat - Chat interface loading state
 */
export const SkeletonChat: React.FC = () => (
    <div className="flex flex-col h-full p-4">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
            <Skeleton variant="circular" className="w-12 h-12" />
            <div className="space-y-1">
                <Skeleton variant="text" className="h-5 w-32" />
                <Skeleton variant="text" className="h-3 w-20" />
            </div>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-4 py-4">
            <div className="flex gap-3">
                <Skeleton variant="circular" className="w-8 h-8 shrink-0" />
                <Skeleton variant="rounded" className="h-20 w-3/4" />
            </div>
            <div className="flex gap-3 justify-end">
                <Skeleton variant="rounded" className="h-12 w-1/2" />
                <Skeleton variant="circular" className="w-8 h-8 shrink-0" />
            </div>
            <div className="flex gap-3">
                <Skeleton variant="circular" className="w-8 h-8 shrink-0" />
                <Skeleton variant="rounded" className="h-16 w-2/3" />
            </div>
        </div>

        {/* Input */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <Skeleton variant="rounded" className="h-12 w-full" />
        </div>
    </div>
);

/**
 * Skeleton Profile - Profile page loading state
 */
export const SkeletonProfile: React.FC = () => (
    <div className="p-4 space-y-6">
        {/* Avatar and Name */}
        <div className="flex flex-col items-center gap-4">
            <Skeleton variant="circular" className="w-24 h-24" />
            <div className="text-center space-y-2">
                <Skeleton variant="text" className="h-6 w-40 mx-auto" />
                <Skeleton variant="text" className="h-4 w-32 mx-auto" />
            </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="text-center space-y-1">
                    <Skeleton variant="text" className="h-6 w-12 mx-auto" />
                    <Skeleton variant="text" className="h-3 w-16 mx-auto" />
                </div>
            ))}
        </div>

        {/* Menu Items */}
        <SkeletonList count={4} />
    </div>
);

export default Skeleton;
