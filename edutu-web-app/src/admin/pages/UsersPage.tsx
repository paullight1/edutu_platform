/**
 * Admin Users Page
 * View all users, search, award credits, toggle pro status
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, Crown, Gift, Ban, Users, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, Loader2, User, Calendar
} from 'lucide-react';
import { getAllUsers, adminGrantCredits, adminSetProStatus, getUserTransactions, type UserProfile, type CreditTransaction } from '../../services/admin/paymentsAdmin';

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userTransactions, setUserTransactions] = useState<CreditTransaction[]>([]);
  const [grantAmount, setGrantAmount] = useState('');
  const [grantDescription, setGrantDescription] = useState('');
  const [grantLoading, setGrantLoading] = useState(false);
  const [proLoading, setProLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllUsers(search || undefined);
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSelectUser = async (user: UserProfile) => {
    setSelectedUser(user);
    setGrantAmount('');
    setGrantDescription('');
    setMessage('');
    try {
      const txs = await getUserTransactions(user.user_id);
      setUserTransactions(txs);
    } catch (err) {
      console.error('Failed to load user transactions:', err);
      setUserTransactions([]);
    }
  };

  const handleGrantCredits = async () => {
    if (!selectedUser || !grantAmount) return;
    const amount = parseInt(grantAmount, 10);
    if (isNaN(amount) || amount === 0) {
      setMessage('Please enter a valid amount');
      return;
    }

    setGrantLoading(true);
    setMessage('');
    try {
      const result = await adminGrantCredits(
        selectedUser.user_id,
        amount,
        grantDescription || `Admin grant: ${amount} credits`,
      );
      if (result.success) {
        setMessage(`Successfully granted ${amount} credits. New balance: ${result.balance}`);
        setGrantAmount('');
        setGrantDescription('');
        // Refresh user list to show updated credits
        const data = await getAllUsers(search || undefined);
        setUsers(data);
        // Refresh transactions
        const txs = await getUserTransactions(selectedUser.user_id);
        setUserTransactions(txs);
        // Update selected user
        setSelectedUser((prev) => prev ? { ...prev, credits: result.balance } : null);
      } else {
        setMessage(`Failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      setMessage('Failed to grant credits');
    } finally {
      setGrantLoading(false);
    }
  };

  const handleTogglePro = async (isPro: boolean) => {
    if (!selectedUser) return;
    setProLoading(true);
    setMessage('');
    try {
      const expiresAt = isPro ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null;
      const result = await adminSetProStatus(selectedUser.user_id, isPro, expiresAt);
      if (result.success) {
        setMessage(`Successfully ${isPro ? 'enabled' : 'disabled'} Pro for this user`);
        const data = await getAllUsers(search || undefined);
        setUsers(data);
        setSelectedUser((prev) => prev ? { ...prev, is_pro: isPro, pro_expires_at: expiresAt } : null);
      } else {
        setMessage(`Failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      setMessage('Failed to update Pro status');
    } finally {
      setProLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <Users size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Total Users</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{users.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Crown size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Pro Users</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {users.filter((u) => u.is_pro).length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <Gift size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Avg Credits</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {users.length > 0 ? Math.round(users.reduce((s, u) => s + u.credits, 0) / users.length).toLocaleString() : '0'}
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Users List */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Users</h2>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <Loader2 size={24} className="animate-spin mx-auto mb-3 text-gray-400" />
              <p className="text-sm text-gray-500">Loading users...</p>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
              {users.map((user) => (
                <button
                  key={user.user_id}
                  onClick={() => handleSelectUser(user)}
                  className={`w-full text-left px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors flex items-center gap-3 ${
                    selectedUser?.user_id === user.user_id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-2 border-indigo-500' : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {user.full_name ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {user.full_name || 'No name'}
                      </p>
                      {user.is_pro && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                          PRO
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email || 'No email'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{user.credits.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400">credits</p>
                  </div>
                </button>
              ))}
              {users.length === 0 && (
                <div className="p-8 text-center">
                  <User size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-gray-500 dark:text-gray-400">No users found</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Detail Panel */}
        <div className="w-full lg:w-[420px] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {!selectedUser ? (
            <div className="p-8 text-center">
              <User size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400">Select a user to manage</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {/* User Info */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
                    {selectedUser.full_name ? selectedUser.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{selectedUser.full_name || 'No name'}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{selectedUser.email || 'No email'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Credits</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{selectedUser.credits.toLocaleString()}</p>
                  </div>
                  <div className={`rounded-lg p-3 ${selectedUser.is_pro ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-50 dark:bg-gray-700'}`}>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Status</p>
                    <p className={`text-lg font-bold ${selectedUser.is_pro ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                      {selectedUser.is_pro ? 'Pro' : 'Free'}
                    </p>
                  </div>
                </div>

                {selectedUser.pro_expires_at && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-4">
                    <Calendar size={14} />
                    <span>Expires: {new Date(selectedUser.pro_expires_at).toLocaleDateString()}</span>
                  </div>
                )}

                {/* Pro Toggle */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => handleTogglePro(true)}
                    disabled={proLoading || selectedUser.is_pro}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {proLoading ? <Loader2 size={14} className="animate-spin" /> : <Crown size={14} />}
                    Enable Pro
                  </button>
                  <button
                    onClick={() => handleTogglePro(false)}
                    disabled={proLoading || !selectedUser.is_pro}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Ban size={14} />
                  </button>
                </div>

                {/* Grant Credits */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Gift size={16} className="text-emerald-500" />
                    Grant Credits
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={grantAmount}
                      onChange={(e) => setGrantAmount(e.target.value)}
                      placeholder="Amount"
                      className="w-24 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      type="text"
                      value={grantDescription}
                      onChange={(e) => setGrantDescription(e.target.value)}
                      placeholder="Description (optional)"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    onClick={handleGrantCredits}
                    disabled={grantLoading || !grantAmount}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {grantLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Grant Credits
                  </button>
                </div>

                {message && (
                  <div className={`mt-3 px-3 py-2 rounded-lg text-xs ${
                    message.startsWith('Successfully') || message.startsWith('Page')
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                  }`}>
                    {message}
                  </div>
                )}
              </div>

              {/* Recent Transactions */}
              <div className="px-5 py-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Recent Transactions</h4>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {userTransactions.slice(0, 10).map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        {tx.amount > 0
                          ? <CheckCircle size={14} className="text-emerald-500" />
                          : <XCircle size={14} className="text-red-500" />
                        }
                        <span className="text-xs text-gray-600 dark:text-gray-300">{tx.description || tx.type}</span>
                      </div>
                      <span className={`text-xs font-medium ${tx.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </span>
                    </div>
                  ))}
                  {userTransactions.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">No transactions yet</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UsersPage;
