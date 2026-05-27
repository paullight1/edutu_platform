import React, { useEffect, useMemo, useState } from 'react';
import type { UserRole } from '../../../hooks/useRoleManager';
import type { AdminUserRecord } from './types';

interface UserListProps {
  users: AdminUserRecord[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  onSelectUser: (user: AdminUserRecord) => void;
  onChangeRole: (userId: string, role: UserRole) => Promise<void>;
  roleOptions: readonly UserRole[];
  roleUpdating?: boolean;
  updatingUserId?: string | null;
  onSuspendUser?: (user: AdminUserRecord) => void;
  onDeleteUser?: (user: AdminUserRecord) => void;
  feedback?: { message: string | null; error: string | null };
}

type RoleDrafts = Record<string, UserRole>;
type RoleFilter = 'all' | UserRole;
type ActivityFilter = 'all' | 'high-engagement' | 'low-engagement';

const activityFilters: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: 'All activity' },
  { value: 'high-engagement', label: 'Highly engaged' },
  { value: 'low-engagement', label: 'Needs activation' }
];

const roleFilterOptions = (roleOptions: readonly UserRole[]) => [
  { value: 'all' as RoleFilter, label: 'All roles' },
  ...roleOptions.map((role) => ({
    value: role as RoleFilter,
    label: role.charAt(0).toUpperCase() + role.slice(1)
  }))
];

const matchesActivityFilter = (user: AdminUserRecord, filter: ActivityFilter) => {
  if (filter === 'all') {
    return true;
  }

  const completionRate = typeof user.goalCompletionRate === 'number' ? user.goalCompletionRate : 0;
  const interactions = typeof user.aiInteractions === 'number' ? user.aiInteractions : 0;

  if (filter === 'high-engagement') {
    return completionRate >= 0.5 || interactions >= 10 || user.opportunitiesExplored >= 5;
  }

  return completionRate < 0.2 && interactions < 3 && user.opportunitiesExplored < 2;
};

const UserList: React.FC<UserListProps> = ({
  users,
  loading,
  error,
  onRefresh,
  onSelectUser,
  onChangeRole,
  roleOptions,
  roleUpdating = false,
  updatingUserId = null,
  onSuspendUser,
  onDeleteUser,
  feedback
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [roleDrafts, setRoleDrafts] = useState<RoleDrafts>({});

  useEffect(() => {
    setRoleDrafts(
      users.reduce<RoleDrafts>((accumulator, user) => {
        accumulator[user.id] = user.role;
        return accumulator;
      }, {})
    );
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users
      .filter((user) => {
        if (roleFilter !== 'all' && user.role !== roleFilter) {
          return false;
        }
        if (!matchesActivityFilter(user, activityFilter)) {
          return false;
        }
        if (!searchTerm.trim()) {
          return true;
        }
        const term = searchTerm.trim().toLowerCase();
        return (
          user.name?.toLowerCase().includes(term) ||
          user.email?.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const left = (a.lastActive ?? a.joinedAt ?? new Date(0)).getTime();
        const right = (b.lastActive ?? b.joinedAt ?? new Date(0)).getTime();
        return right - left;
      });
  }, [activityFilter, roleFilter, searchTerm, users]);

  const handleRoleDraftChange = (userId: string, nextRole: UserRole) => {
    setRoleDrafts((previous) => ({
      ...previous,
      [userId]: nextRole
    }));
  };

  const handleApplyRole = async (user: AdminUserRecord) => {
    const draftRole = roleDrafts[user.id] ?? user.role;
    if (draftRole === user.role) {
      return;
    }
    await onChangeRole(user.id, draftRole);
  };

  const activeCount = filteredUsers.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Users &amp; roles</h1>
          <p className="text-sm text-gray-500">
            Review learner accounts, promote moderators, and keep Edutu&apos;s community safe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-2 rounded-2xl border border-gray-200 bg-white p-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold tracking-wide text-gray-500">
            Search
          </label>
          <input
            type="search"
            placeholder="Search by name or email"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold tracking-wide text-gray-500">
            Role
          </label>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {roleFilterOptions(roleOptions).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold tracking-wide text-gray-500">
            Activity
          </label>
          <select
            value={activityFilter}
            onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {activityFilters.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedback?.error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {feedback.error}
        </div>
      )}

      {feedback?.message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {feedback.message}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 text-xs text-gray-500">
          <span>
            Showing {activeCount} {activeCount === 1 ? 'user' : 'users'}
          </span>
          <span className="hidden sm:block">Click a row to view profile insights</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Goals completed</th>
                <th className="px-4 py-3">Opportunities explored</th>
                <th className="px-4 py-3">Last active</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                    Loading users…
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              )}

              {!loading && !error && filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                    No users match these filters. Try updating your search.
                  </td>
                </tr>
              )}

              {!loading &&
                !error &&
                filteredUsers.map((user) => {
                  const draftRole = roleDrafts[user.id] ?? user.role;
                  const isUpdating = roleUpdating && updatingUserId === user.id;

                  return (
                    <tr
                      key={user.id}
                      className="group cursor-pointer transition hover:bg-gray-50"
                      onClick={() => onSelectUser(user)}
                    >
                      <td className="px-4 py-4 font-medium text-gray-900">
                        {user.name || 'Unnamed user'}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">{user.email}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <select
                            value={draftRole}
                            onChange={(event) => handleRoleDraftChange(user.id, event.target.value as UserRole)}
                            onClick={(event) => event.stopPropagation()}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            {roleOptions.map((role) => (
                              <option key={`${user.id}-${role}`} value={role}>
                                {role.charAt(0).toUpperCase() + role.slice(1)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleApplyRole(user);
                            }}
                            disabled={isUpdating || draftRole === user.role}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isUpdating ? 'Saving…' : 'Change role'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{user.goalsCompleted}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{user.opportunitiesExplored}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {(user.lastActive ?? user.joinedAt)?.toLocaleDateString?.() ?? '—'}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectUser(user);
                            }}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100"
                          >
                            View profile
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSuspendUser?.(user);
                            }}
                            className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-600 transition hover:bg-amber-50"
                          >
                            Suspend
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteUser?.(user);
                            }}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserList;
