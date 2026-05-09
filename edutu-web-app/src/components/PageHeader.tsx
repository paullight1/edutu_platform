/**
 * PageHeader
 * A shared header component with a bold back button and page title.
 * Used across all pages that need navigation back and a clear title.
 */

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    onBack: () => void;
    rightContent?: React.ReactNode;
    className?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    onBack,
    rightContent,
    className = '',
}) => {
    const { isDarkMode } = useDarkMode();

    return (
        <header
            className={`sticky top-0 z-40 backdrop-blur-xl border-b transition-all duration-300 ${isDarkMode
                    ? 'bg-gray-950/90 border-white/10'
                    : 'bg-white/90 border-gray-200'
                } ${className}`}
        >
            <div className="px-4 py-3">
                <div className="flex items-center gap-4">
                    {/* Bold Back Button */}
                    <button
                        onClick={onBack}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm transition-all ${isDarkMode
                                ? 'bg-white/10 text-white hover:bg-white/20'
                                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                            }`}
                    >
                        <ArrowLeft size={20} strokeWidth={2.5} />
                        <span className="hidden sm:inline">Back</span>
                    </button>

                    {/* Title Section */}
                    <div className="flex-1 min-w-0">
                        <h1
                            className={`text-xl md:text-2xl font-display font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'
                                }`}
                        >
                            {title}
                        </h1>
                        {subtitle && (
                            <p
                                className={`text-xs md:text-sm truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                    }`}
                            >
                                {subtitle}
                            </p>
                        )}
                    </div>

                    {/* Right Content (optional) */}
                    {rightContent && (
                        <div className="shrink-0">{rightContent}</div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default PageHeader;
