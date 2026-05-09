/**
 * Admin Dashboard Overview
 * Stats, recent activity, quick actions
 */
import React, { useState, useEffect } from 'react';
import { Users, DollarSign, ShoppingBag, TrendingUp, ArrowUpRight, Crown } from 'lucide-react';
import { getPaymentsStats } from '../../services/admin/paymentsAdmin';
import { getAdminStats } from '../../services/admin/adminService';

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [paymentStats, setPaymentStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [adminData, payData] = await Promise.allSettled([
          getAdminStats(),
          getPaymentsStats(),
        ]);
        if (adminData.status === 'fulfilled') setStats(adminData.value);
        if (payData.status === 'fulfilled') setPaymentStats(payData.value);
      } catch (err) {
        console.error('Failed to load dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const userStats = stats?.users || { total: 0, activeThisWeek: 0, newThisWeek: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Overview of your Edutu platform</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <Users size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <ArrowUpRight size={16} className="text-green-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{userStats.total.toLocaleString()}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Users</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
            +{userStats.newThisWeek || 0} this week
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <DollarSign size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {paymentStats?.totalRevenue?.toLocaleString() || '0'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Revenue (Credits)</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Crown size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {paymentStats?.totalTransactions?.toLocaleString() || '0'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Transactions</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <TrendingUp size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats?.opportunities?.total?.toLocaleString() || '0'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Opportunities</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a
            href="/admin/users"
            className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors group"
          >
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg group-hover:bg-indigo-200 dark:group-hover:bg-indigo-900/50 transition-colors">
              <Users size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Manage Users</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Grant credits, toggle Pro</p>
            </div>
          </a>
          <a
            href="/admin/payments"
            className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-emerald-300 dark:hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors group"
          >
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/50 transition-colors">
              <DollarSign size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">View Payments</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Revenue & transactions</p>
            </div>
          </a>
          <a
            href="/admin/opportunities"
            className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors group"
          >
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition-colors">
              <ShoppingBag size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Opportunities</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Manage listings</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
