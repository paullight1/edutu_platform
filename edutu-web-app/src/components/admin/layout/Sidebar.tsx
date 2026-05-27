import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { adminNavItems } from '../../../pages/admin/admin-navigation';
import { cn } from '../../../lib/cn';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity',
          isOpen ? 'opacity-100 lg:hidden' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-subtle bg-surface-layer/95 px-4 pb-6 pt-5 shadow-elevated transition-transform duration-200',
          'lg:static lg:translate-x-0 lg:bg-transparent lg:shadow-none',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Admin navigation"
      >
        <div className="mb-6 flex items-center justify-between gap-3 px-1 lg:mb-8">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500 text-sm font-semibold text-white shadow-soft">
              Ed
            </div>
            <div className="flex flex-col">
              <span className="text-base font-semibold text-strong">Edutu Admin</span>
              <span className="text-xs font-medium text-muted">Control Center</span>
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-subtle text-muted transition hover:text-strong lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto pr-2" aria-label="Primary">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isRoot = item.path === '/';

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={isRoot}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    'text-muted hover:text-strong hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40',
                    isActive &&
                      'bg-brand-50/70 text-strong shadow-soft ring-1 ring-brand-500/10 dark:bg-neutral-800/60'
                  )
                }
                onClick={onClose}
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-xl border border-transparent bg-neutral-100 text-muted transition-colors',
                        'group-hover:text-brand-600 group-hover:bg-brand-50',
                        isActive && 'border-brand-200 bg-brand-50 text-brand-600'
                      )}
                    >
                      <Icon size={18} strokeWidth={1.9} />
                    </span>
                    <span className="truncate">{item.name}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-6 rounded-xl border border-dashed border-subtle/70 bg-surface-elevated/60 px-4 py-3 text-xs leading-relaxed text-muted">
          Need more admin automations? Drop us a note at{' '}
          <a className="font-medium text-brand-600 hover:underline" href="mailto:ops@edutu.ai">
            ops@edutu.ai
          </a>
          .
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
