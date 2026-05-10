/**
 * Admin Layout
 * Sidebar + main content area for admin panel
 */
import React, { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, DollarSign, ShoppingBag, BarChart3,
  Settings, Menu, X, Shield, LogOut
} from 'lucide-react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { cn } from '../lib/cn';

const navItems = [
  { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { path: '/admin/users', icon: Users, label: 'Users & Credits' },
  { path: '/admin/payments', icon: DollarSign, label: 'Payments' },
  { path: '/admin/opportunities', icon: ShoppingBag, label: 'Opportunities' },
  { path: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/admin/settings', icon: Settings, label: 'Settings' },
];

const AdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { signOut } = useAuth();
  const { user } = useUser();

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const name = user?.fullName || user?.username || email.split('@')[0] || 'Admin';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
              Ed
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Edutu Admin</p>
              <p className="text-[10px] text-gray-400">Control Center</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
                    isActive && 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                  )
                }
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* User info */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
              {name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{name}</p>
              <p className="text-[10px] text-gray-400 truncate">{email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 sm:px-6 gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Menu size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <Shield size={16} className="text-indigo-500" />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Admin Panel</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
