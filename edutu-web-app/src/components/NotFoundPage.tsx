import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Compass } from 'lucide-react';

/**
 * NotFoundPage Component
 * 
 * Displayed when users navigate to a route that doesn't exist.
 */
const NotFoundPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center">
                {/* 404 Illustration */}
                <div className="relative mb-8">
                    <div className="text-[120px] md:text-[160px] font-bold text-gray-200 dark:text-gray-800 leading-none select-none">
                        404
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-20 h-20 bg-brand-100 dark:bg-brand-900/30 rounded-full flex items-center justify-center">
                            <Compass className="w-10 h-10 text-brand-600 dark:text-brand-400" />
                        </div>
                    </div>
                </div>

                {/* Message */}
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-3">
                    Page Not Found
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mb-8">
                    Oops! The page you're looking for doesn't exist or has been moved.
                    Let's get you back on track.
                </p>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={() => navigate('/app/home')}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors"
                    >
                        <Home className="w-5 h-5" />
                        Go to Home
                    </button>

                    <button
                        onClick={() => navigate(-1)}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold rounded-xl transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        Go Back
                    </button>
                </div>

                {/* Quick Links */}
                <div className="mt-10 pt-8 border-t border-gray-200 dark:border-gray-800">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-500 mb-4">
                        Popular pages
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                        <QuickLink label="Dashboard" path="/app/home" />
                        <QuickLink label="Opportunities" path="/app/opportunities" />
                        <QuickLink label="AI Coach" path="/app/chat" />
                        <QuickLink label="Marketplace" path="/app/community" />
                        <QuickLink label="Settings" path="/app/settings" />
                    </div>
                </div>
            </div>
        </div>
    );
};

const QuickLink: React.FC<{ label: string; path: string }> = ({ label, path }) => {
    const navigate = useNavigate();

    return (
        <button
            onClick={() => navigate(path)}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
            {label}
        </button>
    );
};

export default NotFoundPage;
