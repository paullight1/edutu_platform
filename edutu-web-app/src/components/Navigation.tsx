import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Compass, Sparkles, Store, MoreHorizontal } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { useTranslation } from 'react-i18next';

const Navigation: React.FC = () => {
  const { isDarkMode } = useDarkMode();
  const location = useLocation();
  const { t } = useTranslation();

  const navItems = [
    { path: '/app/home', icon: Home, label: t('navigation.home'), ariaLabel: t('navigation.home') },
    { path: '/app/opportunities', icon: Compass, label: t('navigation.explore'), ariaLabel: t('navigation.explore') },
    { path: '/app/chat', icon: Sparkles, label: t('navigation.ai'), isAI: true, ariaLabel: t('navigation.ai') },
    { path: '/app/community', icon: Store, label: t('navigation.market'), ariaLabel: t('navigation.market') },
    { path: '/app/settings', icon: MoreHorizontal, label: t('navigation.more'), ariaLabel: t('navigation.settings') },
  ];

  const activeIndex = navItems.findIndex((item) => location.pathname === item.path);

  return (
    <>
      {/* Mobile Bottom Navigation - Simple Clean Style */}
      <nav
        className={`fixed bottom-0 left-0 right-0 z-50 lg:hidden ${isDarkMode
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
        {/* Navigation Items */}
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
                {/* Special Circle Emphasis for Edutu AI */}
                {item.isAI ? (
                  <div
                    className={`relative w-12 h-12 rounded-full flex items-center justify-center -mt-4 transition-colors duration-200 gradient-accent text-white ${isActive
                      ? 'shadow-lg ring-2 ring-brand-300/50'
                      : ''
                      }`}
                    style={{
                      boxShadow: isActive
                        ? '0 4px 20px rgba(var(--color-brand-500), 0.4)'
                        : '0 2px 12px rgba(var(--color-brand-500), 0.3)',
                    }}
                    aria-hidden="true"
                  >
                    <item.icon size={22} strokeWidth={2} aria-hidden="true" />
                  </div>
                ) : (
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
                )}

                {/* Label */}
                <span
                  className={`mt-1 text-[10px] font-medium whitespace-nowrap transition-colors duration-200 ${item.isAI
                    ? isDarkMode
                      ? 'text-brand-400'
                      : 'text-brand-600'
                    : isActive
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
              className={`group relative flex items-center gap-4 p-3 rounded-xl transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${item.isAI
                ? 'gradient-accent text-white shadow-md'
                : isActive
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
              <item.icon size={20} strokeWidth={isActive || item.isAI ? 2.5 : 2} aria-hidden="true" />

              {/* Tooltip on hover */}
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
    </>
  );
};

export default Navigation;

