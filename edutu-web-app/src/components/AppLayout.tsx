import React, { useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navigation from './Navigation';

// Screens where the navigation bar should be hidden
const HIDDEN_NAV_ROUTES = [
    '/app/opportunities',   // Explore
    '/app/chat',            // Edutu AI
    '/app/community',       // Market
    '/app/settings',        // More (Settings)
    '/app/profile-edit',
    '/app/notifications',
    '/app/privacy',
    '/app/help',
    '/app/cv',
    '/app/personalization',
    '/app/add-goal',
    '/app/goals',
    '/app/achievements',
    '/app/saved',
    '/app/applied',
    '/app/deadlines',
];

const AppLayout: React.FC = () => {
    const location = useLocation();

    // Determine if navigation should be shown
    const showNavigation = useMemo(() => {
        // Hide nav on specific routes
        const isHiddenRoute = HIDDEN_NAV_ROUTES.some(route =>
            location.pathname.startsWith(route)
        );

        // Also hide on opportunity detail, goal roadmap, package detail pages
        const isDynamicHiddenRoute =
            location.pathname.includes('/opportunity/') ||
            location.pathname.includes('/goal/') ||
            location.pathname.includes('/package/');

        return !isHiddenRoute && !isDynamicHiddenRoute;
    }, [location.pathname]);

    return (
        <div className="flex flex-col min-h-screen">
            <main className={showNavigation ? 'flex-1 pb-20 sm:pb-24 md:pb-28' : 'flex-1'}>
                <Outlet />
            </main>
            {showNavigation && <Navigation />}
        </div>
    );
};

export default AppLayout;
