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
            <div className="min-h-screen flex items-center justify-center bg-surface-body">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full border-4 border-brand/20" />
                        <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-t-brand animate-spin" />
                    </div>
                    <p className="text-sm font-medium text-text-muted">
                        {message}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center p-8">
            <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
                <span className="text-sm text-text-muted">{message}</span>
            </div>
        </div>
    );
};

export default LoadingFallback;
