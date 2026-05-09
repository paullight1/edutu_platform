import React, { useState, useRef, useCallback, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

interface PullToRefreshProps {
    children: ReactNode;
    onRefresh: () => Promise<void>;
    pullThreshold?: number;
    className?: string;
    disabled?: boolean;
}

/**
 * PullToRefresh Component
 * 
 * Wraps content to enable pull-to-refresh functionality on mobile.
 */
const PullToRefresh: React.FC<PullToRefreshProps> = ({
    children,
    onRefresh,
    pullThreshold = 80,
    className = '',
    disabled = false
}) => {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const startY = useRef(0);
    const pullDistance = useMotionValue(0);

    const opacity = useTransform(pullDistance, [0, pullThreshold], [0, 1]);
    const rotate = useTransform(pullDistance, [0, pullThreshold], [0, 360]);
    const scale = useTransform(pullDistance, [0, pullThreshold * 0.5, pullThreshold], [0.5, 0.8, 1]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (disabled || isRefreshing) return;

        // Only enable pull-to-refresh if at top of scroll
        const scrollTop = containerRef.current?.scrollTop ?? 0;
        if (scrollTop > 0) return;

        startY.current = e.touches[0].clientY;
        setIsPulling(true);
    }, [disabled, isRefreshing]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isPulling || disabled || isRefreshing) return;

        const currentY = e.touches[0].clientY;
        const diff = currentY - startY.current;

        // Only allow pulling down
        if (diff > 0) {
            // Apply resistance
            const resistance = 0.5;
            const adjustedDiff = Math.min(diff * resistance, pullThreshold * 1.5);
            pullDistance.set(adjustedDiff);
        }
    }, [isPulling, disabled, isRefreshing, pullThreshold, pullDistance]);

    const handleTouchEnd = useCallback(async () => {
        if (!isPulling || disabled) return;

        setIsPulling(false);
        const currentPull = pullDistance.get();

        if (currentPull >= pullThreshold && !isRefreshing) {
            // Trigger refresh
            setIsRefreshing(true);
            animate(pullDistance, pullThreshold * 0.6, { type: 'spring', stiffness: 400 });

            try {
                await onRefresh();
            } finally {
                setIsRefreshing(false);
                animate(pullDistance, 0, { type: 'spring', stiffness: 400, damping: 30 });
            }
        } else {
            // Snap back
            animate(pullDistance, 0, { type: 'spring', stiffness: 400, damping: 30 });
        }
    }, [isPulling, disabled, pullThreshold, isRefreshing, onRefresh, pullDistance]);

    return (
        <div
            ref={containerRef}
            className={`relative overflow-auto ${className}`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Pull indicator */}
            <motion.div
                className="absolute left-1/2 transform -translate-x-1/2 z-10 pointer-events-none"
                style={{
                    y: useTransform(pullDistance, (v) => v - 48),
                    opacity
                }}
            >
                <motion.div
                    className={`w-10 h-10 rounded-full flex items-center justify-center
            ${isRefreshing
                            ? 'bg-brand-500 text-white'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 shadow-lg border border-gray-200 dark:border-gray-700'
                        }`}
                    style={{
                        scale,
                        rotate: isRefreshing ? undefined : rotate
                    }}
                    animate={isRefreshing ? { rotate: 360 } : {}}
                    transition={isRefreshing ? {
                        rotate: { duration: 1, repeat: Infinity, ease: 'linear' }
                    } : {}}
                >
                    <RefreshCw size={20} />
                </motion.div>
            </motion.div>

            {/* Content wrapper */}
            <motion.div style={{ y: pullDistance }}>
                {children}
            </motion.div>
        </div>
    );
};

export default PullToRefresh;
