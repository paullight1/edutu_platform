import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Compass, Home, ListChecks, Map, UserCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { useTranslation } from 'react-i18next';

interface NavItem {
  path: string;
  icon: LucideIcon;
  label: string;
  ariaLabel: string;
  match: (pathname: string) => boolean;
}

interface NavigationProps {
  showDesktopNavigation?: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ showDesktopNavigation = true }) => {
  const { isDarkMode } = useDarkMode();
  const location = useLocation();
  const { t } = useTranslation();

  const navItems: NavItem[] = [
    {
      path: '/app/home',
      icon: Home,
      label: t('navigation.home'),
      ariaLabel: t('navigation.home'),
      match: (pathname) => pathname === '/app/home'
    },
    {
      path: '/app/opportunities',
      icon: Compass,
      label: t('navigation.discover'),
      ariaLabel: t('navigation.discover'),
      match: (pathname) => pathname.startsWith('/app/opportunities')
    },
    {
      path: '/app/goals',
      icon: Map,
      label: t('navigation.plan'),
      ariaLabel: t('navigation.plan'),
      match: (pathname) => pathname.startsWith('/app/goals') || pathname.startsWith('/app/community')
    },
    {
      path: '/app/saved',
      icon: ListChecks,
      label: t('navigation.track'),
      ariaLabel: t('navigation.track'),
      match: (pathname) =>
        pathname.startsWith('/app/saved') ||
        pathname.startsWith('/app/applied') ||
        pathname.startsWith('/app/deadlines')
    },
    {
      path: '/app/profile',
      icon: UserCircle,
      label: t('navigation.me'),
      ariaLabel: t('navigation.me'),
      match: (pathname) => pathname.startsWith('/app/profile') || pathname.startsWith('/app/settings')
    },
  ];

  const activeIndex = navItems.findIndex((item) => item.match(location.pathname));

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <nav
        className={`fixed bottom-0 left-0 right-0 z-40 lg:hidden ${isDarkMode
          ? 'bg-gray-900/95 border-white/10'
          : 'bg-white/95 border-slate-200'
          } backdrop-blur-xl border-t`}
        style={{
          padding: '8px 12px',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        }}
        role="navigation"
        aria-label="Main navigation"
      >
        <div
          className="flex items-center justify-between w-full max-w-md mx-auto"
          role="menubar"
          aria-label="Navigation menu"
        >
          {navItems.map((item, index) => {
            const isActive = activeIndex === index;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className="relative flex flex-col items-center outline-none py-1 px-2 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-lg"
                role="menuitem"
                aria-label={item.ariaLabel}
                aria-current={isActive ? 'page' : undefined}
              >
                <div
                  className={`p-2.5 rounded-xl transition-colors duration-200 ${isActive
                    ? isDarkMode
                      ? 'bg-white/15 text-white'
                      : 'bg-slate-100 text-slate-900'
                    : isDarkMode
                      ? 'text-slate-400'
                      : 'text-slate-500'
                    }`}
                  aria-hidden="true"
                >
                  <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                </div>

                <span
                  className={`mt-1 text-[10px] font-medium whitespace-nowrap transition-colors duration-200 ${isActive
                    ? isDarkMode
                      ? 'text-white'
                      : 'text-slate-900'
                    : isDarkMode
                      ? 'text-slate-500'
                      : 'text-slate-400'
                    }`}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Desktop Sidebar Navigation */}
      {showDesktopNavigation && (
        <aside
          className={`hidden lg:flex fixed left-6 top-1/2 -translate-y-1/2 z-50 flex-col gap-3 p-4 rounded-2xl backdrop-blur-xl border transition-colors duration-200 ${isDarkMode
            ? 'bg-gray-900/60 border-white/10'
            : 'bg-white/60 border-slate-200/50'
            }`}
          role="navigation"
          aria-label="Desktop navigation"
        >
          {navItems.map((item, index) => {
            const isActive = activeIndex === index;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`group relative flex items-center gap-4 p-3 rounded-xl transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${isActive
                  ? isDarkMode
                    ? 'bg-white/15 text-white'
                    : 'bg-slate-100 text-slate-900'
                  : isDarkMode
                    ? 'text-slate-400 hover:text-white hover:bg-white/10'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                aria-label={item.ariaLabel}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />

                <span
                  className={`absolute left-full ml-4 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-200 ${isDarkMode ? 'bg-gray-800 text-white' : 'bg-slate-900 text-white'
                    } opacity-0 -translate-x-2 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0`}
                  role="tooltip"
                  aria-hidden="true"
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </aside>
      )}
    </>
  );
};

export default Navigation;
