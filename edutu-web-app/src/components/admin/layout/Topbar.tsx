import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Menu, Moon, Search, Sun } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import { useDarkMode } from '../../../hooks/useDarkMode';
import { adminNavItems, adminRouteFallbacks } from '../../../pages/admin/admin-navigation';
import { authService } from '../../../lib/auth';
import { cn } from '../../../lib/cn';
import type { User } from '@supabase/supabase-js';

interface TopbarProps {
  onToggleSidebar: () => void;
  user: User | null;
}

const Topbar: React.FC<TopbarProps> = ({ onToggleSidebar, user }) => {
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const normalisedPath = useMemo(() => {
    if (!location.pathname || location.pathname === '') {
      return '/';
    }
    return location.pathname.replace(/\/+$/, '') || '/';
  }, [location.pathname]);

  const activeNav = useMemo(() => {
    if (normalisedPath === '/' || normalisedPath === '') {
      return adminNavItems[0];
    }

    return adminNavItems.find((item) => {
      if (item.path === '/') {
        return normalisedPath === '/' || normalisedPath === '';
      }
      return normalisedPath.startsWith(item.path);
    });
  }, [normalisedPath]);

  const fallbackMeta = useMemo(() => {
    return Object.entries(adminRouteFallbacks).find(([path]) =>
      normalisedPath.startsWith(path)
    )?.[1];
  }, [normalisedPath]);

  const pageTitle = activeNav?.name ?? fallbackMeta?.title ?? 'Admin Control Center';
  const pageSubtitle =
    activeNav?.description ??
    fallbackMeta?.description ??
    'Oversee Edutu operations, insights, and personalization controls.';

  const initials = useMemo(() => {
    if (user?.displayName) {
      return user.displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((chunk) => chunk[0]?.toUpperCase() ?? '')
        .join('');
    }
    if (user?.email) {
      return user.email[0]?.toUpperCase() ?? 'A';
    }
    return 'AD';
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await authService.signOut();
      setMenuOpen(false);
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to sign out admin', error);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-subtle bg-surface-layer/85 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-subtle text-muted transition hover:text-strong lg:hidden"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
          >
            <Menu size={18} strokeWidth={2} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-strong md:text-xl">{pageTitle}</h1>
            <p className="mt-0.5 hidden text-xs text-muted sm:block">{pageSubtitle}</p>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-3 md:gap-4">
          <div className="hidden min-w-[240px] max-w-sm items-center gap-2 rounded-xl border border-subtle bg-surface-elevated/80 px-3 py-1.5 text-sm text-muted shadow-soft transition focus-within:border-brand-300/80 focus-within:ring-2 focus-within:ring-brand-500/10 md:flex">
            <Search size={16} />
            <Input
              type="search"
              placeholder="Search admin tools"
              className="h-7 border-none bg-transparent px-0 text-sm text-strong placeholder:text-muted focus-visible:outline-none focus-visible:ring-0"
            />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="hidden items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-xs font-medium text-soft hover:border-brand-200 hover:text-strong md:flex"
            onClick={toggleDarkMode}
            aria-label="Toggle color theme"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            <span>{isDarkMode ? 'Light mode' : 'Dark mode'}</span>
          </Button>

          <button
            type="button"
            onClick={toggleDarkMode}
            aria-label="Toggle color theme"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-subtle text-muted transition hover:text-strong md:hidden"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((state) => !state)}
              className="flex items-center gap-2 rounded-xl border border-subtle bg-surface-layer px-2.5 py-1.5 text-sm font-medium text-soft transition hover:border-brand-200 hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white shadow-soft">
                {initials}
              </span>
              <div className="hidden min-w-[120px] flex-col items-start text-left sm:flex">
                <span className="truncate text-sm font-semibold text-strong">
                  {user?.displayName ?? 'Admin User'}
                </span>
                <span className="truncate text-xs text-muted">
                  {user?.email ?? 'admin@edutu.ai'}
                </span>
              </div>
              <ChevronDown
                size={16}
                className={cn('text-muted transition', menuOpen ? 'rotate-180 text-strong' : '')}
              />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-subtle bg-surface-layer shadow-elevated transition">
                <div className="border-b border-subtle/80 bg-surface-elevated/70 px-4 py-3 text-sm text-soft">
                  <p className="truncate font-medium text-strong">
                    {user?.displayName ?? 'Admin User'}
                  </p>
                  <p className="truncate text-xs text-muted">{user?.email ?? 'admin@edutu.ai'}</p>
                </div>
                <button
                  type="button"
                  className="w-full px-4 py-2.5 text-left text-sm text-soft transition hover:bg-neutral-100/80 hover:text-strong dark:hover:bg-neutral-800/40"
                  onClick={() => {
                    setMenuOpen(false);
                    if (typeof window !== 'undefined') {
                      window.location.href = '/profile';
                    }
                  }}
                >
                  View profile
                </button>
                <button
                  type="button"
                  className="w-full px-4 py-2.5 text-left text-sm text-danger transition hover:bg-neutral-100/80 dark:hover:bg-neutral-800/40"
                  onClick={handleLogout}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
