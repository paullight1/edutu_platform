import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Menu, X } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';

type NavItem = {
  label: string;
  to: string;
};

const defaultNavItems: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'Opportunities', to: '/opportunities' },
  { label: 'Download', to: '/download' },
  { label: 'Mentor', to: '/mentor' },
  { label: 'About', to: '/about' },
  { label: 'Blog', to: '/blog' },
  { label: 'Contact', to: '/contact' },
];

const PublicSiteMenu: React.FC = () => {
  const { isDarkMode } = useDarkMode();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const activePath = useMemo(() => {
    return (path: string) => {
      if (path === '/') return location.pathname === '/';
      return location.pathname === path || location.pathname.startsWith(`${path}/`);
    };
  }, [location.pathname]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-11 items-center gap-2 rounded-[12px] border px-4 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
          isDarkMode
            ? 'border-white/10 bg-white/5 text-white hover:bg-white/10'
            : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
        }`}
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? <X size={18} strokeWidth={2.5} /> : <Menu size={18} strokeWidth={2.5} />}
        <span>Menu</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(92vw,22rem)] overflow-hidden rounded-[24px] border shadow-2xl ${
              isDarkMode ? 'border-white/10 bg-slate-950/95' : 'border-slate-200 bg-white/95'
            } backdrop-blur-xl`}
          >
            <div className="p-2">
              <div className={`px-4 pt-2 pb-3 text-[11px] font-semibold uppercase tracking-[0.3em] ${
                isDarkMode ? 'text-slate-500' : 'text-slate-400'
              }`}>
                Navigate
              </div>

              <div className="space-y-1">
                {defaultNavItems.map((item) => {
                  const isActive = activePath(item.to);

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
                        isActive
                          ? isDarkMode
                            ? 'bg-white/10 text-white'
                            : 'bg-slate-100 text-slate-950'
                          : isDarkMode
                            ? 'text-slate-300 hover:bg-white/5 hover:text-white'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span>{item.label}</span>
                      <ChevronRight size={16} className={isActive ? 'opacity-100' : 'opacity-60'} />
                    </Link>
                  );
                })}
              </div>

              <div className={`mt-2 border-t px-2 pt-2 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                <Link
                  to="/auth"
                  onClick={() => setOpen(false)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-transform hover:-translate-y-0.5"
                >
                  Get started
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PublicSiteMenu;
