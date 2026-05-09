import React, { FormEvent, useEffect, useState } from 'react';

export type AnnouncementAudience = 'all' | 'learners' | 'partners';

export interface AnnouncementFormValues {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  scheduledAt: string;
}

interface AnnouncementFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: AnnouncementFormValues) => Promise<void> | void;
  loading?: boolean;
}

const defaultValues: AnnouncementFormValues = {
  title: '',
  body: '',
  audience: 'all',
  scheduledAt: ''
};

const audienceOptions: Array<{ value: AnnouncementAudience; label: string }> = [
  { value: 'all', label: 'All users' },
  { value: 'learners', label: 'Learners' },
  { value: 'partners', label: 'Partners' }
];

const AnnouncementForm: React.FC<AnnouncementFormProps> = ({ isOpen, onClose, onSubmit, loading = false }) => {
  const [values, setValues] = useState<AnnouncementFormValues>(defaultValues);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setValues(defaultValues);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!values.title.trim()) {
      setError('Please provide a title for the announcement.');
      return;
    }
    if (!values.body.trim()) {
      setError('Please provide body content for the announcement.');
      return;
    }

    setError(null);
    await onSubmit(values);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <header className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Create Announcement</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-3 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
            >
              Close
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Share updates with learners and partners. Scheduled announcements publish automatically.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700" htmlFor="admin-announcement-title">
              Title
            </label>
            <input
              id="admin-announcement-title"
              type="text"
              value={values.title}
              onChange={(event) => setValues((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Quarterly community update"
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700" htmlFor="admin-announcement-body">
              Body
            </label>
            <textarea
              id="admin-announcement-body"
              value={values.body}
              onChange={(event) => setValues((prev) => ({ ...prev, body: event.target.value }))}
              placeholder="Share context, highlight wins, and outline next steps."
              rows={6}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="admin-announcement-audience">
                Audience
              </label>
              <select
                id="admin-announcement-audience"
                value={values.audience}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, audience: event.target.value as AnnouncementAudience }))
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {audienceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="admin-announcement-date">
                Scheduled date (optional)
              </label>
              <input
                id="admin-announcement-date"
                type="datetime-local"
                value={values.scheduledAt}
                onChange={(event) => setValues((prev) => ({ ...prev, scheduledAt: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Publish announcement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AnnouncementForm;
