import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingFallbackProps {
    message?: string;
    fullScreen?: boolean;
}

/**
 * LoadingFallback Component
 * 
 * Used as a Suspense fallback when lazy loading components.
 */
const LoadingFallback: React.FC<LoadingFallbackProps> = ({
    message = 'Loading...',
    fullScreen = true
}) => {
    if (fullScreen) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full border-4 border-brand-100 dark:border-brand-900" />
                        <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-t-brand-500 animate-spin" />
                    </div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {message}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center p-8">
            <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">{message}</span>
            </div>
        </div>
    );
};

export default LoadingFallback;
