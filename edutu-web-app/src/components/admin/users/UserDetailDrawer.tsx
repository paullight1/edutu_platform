import React from 'react';
import type { UserRole } from '../../../hooks/useRoleManager';
import type { AdminUserRecord } from './types';

interface UserDetailDrawerProps {
  open: boolean;
  user: AdminUserRecord | null;
  onClose: () => void;
  onChangeRole: (userId: string, role: UserRole) => Promise<void>;
  roleOptions: readonly UserRole[];
  roleUpdating?: boolean;
  updatingUserId?: string | null;
  onDeactivate?: (user: AdminUserRecord) => void;
  onResetPassword?: (user: AdminUserRecord) => void;
  feedback?: { message: string | null; error: string | null };
}

const formatDate = (date: Date | null | undefined) => {
  if (!date) {
    return 'Not available';
  }
  return date.toLocaleString();
};

const formatPercentage = (value: number | undefined | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
};

const UserDetailDrawer: React.FC<UserDetailDrawerProps> = ({
  open,
  user,
  onClose,
  onChangeRole,
  roleOptions,
  roleUpdating = false,
  updatingUserId,
  onDeactivate,
  onResetPassword,
  feedback
}) => {
  if (!open || !user) {
    return null;
  }

  const handleChangeRole = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextRole = event.target.value as UserRole;
    void onChangeRole(user.id, nextRole);
  };

  const handleDeactivate = () => {
    onDeactivate?.(user);
  };

  const handleResetPassword = () => {
    onResetPassword?.(user);
  };

  const isUpdating = roleUpdating && updatingUserId === user.id;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md transform bg-white shadow-xl transition duration-200 ease-out">
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary/70">User profile</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">{user.name || 'Unnamed user'}</h2>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {feedback?.error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {feedback.error}
            </div>
          )}
          {feedback?.message && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {feedback.message}
            </div>
          )}

          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Profile</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-600">
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-gray-500">Role</dt>
                  <dd className="mt-1">
                    <select
                      value={user.role}
                      onChange={handleChangeRole}
                      disabled={isUpdating}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed"
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-gray-500">Joined</dt>
                  <dd className="mt-1">{formatDate(user.joinedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-gray-500">Location</dt>
                  <dd className="mt-1">{user.location || 'Not provided'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-gray-500">Last active</dt>
                  <dd className="mt-1">{formatDate(user.lastActive)}</dd>
                </div>
              </dl>
              {user.bio && <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">{user.bio}</p>}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-700">Goal progress</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-600">
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-gray-500">Goals completed</dt>
                  <dd className="mt-1 text-base font-semibold text-gray-900">{user.goalsCompleted}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-gray-500">Completion rate</dt>
                  <dd className="mt-1 text-base font-semibold text-gray-900">
                    {formatPercentage(user.goalCompletionRate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-gray-500">Opportunities explored</dt>
                  <dd className="mt-1">{user.opportunitiesExplored}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-gray-500">Engagement score</dt>
                  <dd className="mt-1">{typeof user.engagementScore === 'number' ? user.engagementScore : '—'}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-700">AI usage</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-600">
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-gray-500">AI chat sessions</dt>
                  <dd className="mt-1 text-base font-semibold text-gray-900">
                    {user.aiInteractions ?? 0}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-gray-500">Last engagement</dt>
                  <dd className="mt-1">{formatDate(user.lastActive)}</dd>
                </div>
              </dl>
            </div>
          </section>
        </div>

        <footer className="border-t border-gray-200 px-6 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-gray-500">
              Administrative actions for {user.email}. Changes apply immediately.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleResetPassword}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
              >
                Reset password
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
              >
                Deactivate user
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default UserDetailDrawer;
