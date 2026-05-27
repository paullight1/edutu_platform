import React, { useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navigation from './Navigation';

// Full-screen flows keep focus on the current task instead of app switching.
const HIDDEN_NAV_PREFIXES = [
    '/app/profile-edit',
    '/app/notifications',
    '/app/privacy',
    '/app/help',
    '/app/cv',
    '/app/personalization',
    '/app/add-goal',
    '/app/roadmap-templates',
    '/app/achievements',
    '/app/creator',
];

const HIDDEN_NAV_SEGMENTS = [
    '/app/opportunity/',
    '/app/goal/',
    '/app/package/',
];

const AppLayout: React.FC = () => {
    const location = useLocation();

    // Determine if navigation should be shown
    const showNavigation = useMemo(() => {
        const isHiddenRoute = HIDDEN_NAV_PREFIXES.some(route =>
            location.pathname.startsWith(route)
        );

        const isDynamicHiddenRoute = HIDDEN_NAV_SEGMENTS.some(segment =>
            location.pathname.includes(segment)
        );

        return !isHiddenRoute && !isDynamicHiddenRoute;
    }, [location.pathname]);

    const showDesktopNavigation = location.pathname !== '/app/home';

    return (
        <div className="flex flex-col min-h-screen">
            <main className={showNavigation ? 'flex-1 pb-20 sm:pb-24 md:pb-28' : 'flex-1'}>
                <Outlet />
            </main>
            {showNavigation && <Navigation showDesktopNavigation={showDesktopNavigation} />}
        </div>
    );
};

export default AppLayout;
