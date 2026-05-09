import React, { FormEvent, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp
} from '../../../lib/firebaseMock';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import Select from '../../ui/Select';
import Badge from '../../ui/Badge';
import { useToast } from '../../ui/ToastProvider';

type AnnouncementAudience = 'all' | 'active' | 'region';

interface AnnouncementFormState {
  title: string;
  message: string;
  audience: AnnouncementAudience;
  publishDate: string;
}

interface AnnouncementRecord {
  id: string;
  title: string;
  message: string;
  audience: AnnouncementAudience;
  createdAt: Date | null;
  publishDate: Date | null;
}

const defaultFormState: AnnouncementFormState = {
  title: '',
  message: '',
  audience: 'all',
  publishDate: ''
};

const audienceOptions: Array<{ value: AnnouncementAudience; label: string }> = [
  { value: 'all', label: 'All users' },
  { value: 'active', label: 'Active users' },
  { value: 'region', label: 'Specific region' }
];

const formatDateTime = (date: Date | null) => {
  if (!date) {
    return 'Not scheduled';
  }
  return date.toLocaleString();
};

interface AnnouncementsManagerProps {
  onCountChange?: (count: number) => void;
}

const AnnouncementsManager: React.FC<AnnouncementsManagerProps> = ({ onCountChange }) => {
  const { toast } = useToast();
  const [formState, setFormState] = useState<AnnouncementFormState>(defaultFormState);
  const [submitting, setSubmitting] = useState(false);
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setError('Firestore is not initialised. Announcements will not persist.');
      setLoading(false);
      return;
    }

    const announcementsQuery = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      announcementsQuery,
      (snapshot) => {
        const payload = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data() as Record<string, unknown>;
          const createdAtValue = data.createdAt;
          const publishDateValue = data.publishDate ?? data.publishAt;
          const toDate = (value: unknown): Date | null => {
            if (!value) {
              return null;
            }
            if (value instanceof Date) {
              return value;
            }
            if (value && typeof value === 'object' && 'toDate' in value) {
              return (value as { toDate: () => Date }).toDate();
            }
            if (typeof value === 'string' || typeof value === 'number') {
              const parsed = new Date(value);
              return Number.isNaN(parsed.getTime()) ? null : parsed;
            }
            return null;
          };

          const audience =
            data.audience === 'active' || data.audience === 'region' ? (data.audience as AnnouncementAudience) : 'all';

          return {
            id: docSnapshot.id,
            title: typeof data.title === 'string' ? data.title : 'Untitled announcement',
            message: typeof data.message === 'string' ? data.message : '',
            audience,
            createdAt: toDate(createdAtValue),
            publishDate: toDate(publishDateValue)
          };
        });

        setAnnouncements(payload);
        onCountChange?.(payload.length);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to stream announcements', err);
        setError('Unable to load announcements. Try refreshing.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [onCountChange]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.title.trim() || !formState.message.trim()) {
      toast({
        title: 'Missing fields',
        description: 'Title and message are required.',
        variant: 'error'
      });
      return;
    }

    if (!db) {
      toast({
        title: 'Firestore unavailable',
        description: 'Cannot post announcement without Firebase.',
        variant: 'error'
      });
      return;
    }

    try {
      setSubmitting(true);
      const publishDate = formState.publishDate ? new Date(formState.publishDate) : null;
      await addDoc(collection(db, 'announcements'), {
        title: formState.title.trim(),
        message: formState.message.trim(),
        audience: formState.audience,
        createdAt: serverTimestamp(),
        publishDate: publishDate ? Timestamp.fromDate(publishDate) : null
      });

      setFormState(defaultFormState);
      toast({
        title: 'Announcement posted',
        description: 'Learners will see the update once it is published.',
        variant: 'success'
      });
    } catch (err) {
      console.error('Failed to create announcement', err);
      toast({
        title: 'Post failed',
        description: err instanceof Error ? err.message : 'Unable to post announcement.',
        variant: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (announcement: AnnouncementRecord) => {
    if (!db) {
      toast({
        title: 'Delete unavailable',
        description: 'Cannot delete announcement without Firebase.',
        variant: 'error'
      });
      return;
    }

    try {
      await deleteDoc(doc(db, 'announcements', announcement.id));
      toast({
        title: 'Announcement deleted',
        description: `${announcement.title} removed from feed.`,
        variant: 'success'
      });
    } catch (err) {
      console.error('Failed to delete announcement', err);
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unable to delete announcement.',
        variant: 'error'
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <header className="space-y-2 border-b border-gray-100 pb-4">
          <h3 className="text-base font-semibold text-gray-900">Create announcement</h3>
          <p className="text-sm text-gray-500">
            Share updates with the community. Messages can target active learners or upcoming regional cohorts.
          </p>
        </header>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold tracking-wide text-gray-500">Title</label>
              <Input
                value={formState.title}
                onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Upcoming sprint announcement"
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wide text-gray-500">Audience</label>
              <Select
                value={formState.audience}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, audience: event.target.value as AnnouncementAudience }))
                }
              >
                {audienceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold tracking-wide text-gray-500">Message</label>
            <Textarea
              rows={5}
              value={formState.message}
              onChange={(event) => setFormState((prev) => ({ ...prev, message: event.target.value }))}
              placeholder="Tell learners what is happening and what actions to take."
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold tracking-wide text-gray-500">Publish date</label>
              <Input
                type="datetime-local"
                value={formState.publishDate}
                onChange={(event) => setFormState((prev) => ({ ...prev, publishDate: event.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              type="reset"
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
              onClick={() => setFormState(defaultFormState)}
            >
              Clear form
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Posting…' : 'Post announcement'}
            </button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4">
        <header className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Recent announcements</h3>
            <p className="text-sm text-gray-500">Manage published updates for the Edutu community.</p>
          </div>
          <Badge variant="outline">{announcements.length} total</Badge>
        </header>

        {loading && (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
            Loading announcements…
          </div>
        )}

        {!loading && announcements.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
            No announcements yet. Create your first update above.
          </div>
        )}

        <div className="space-y-4">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{announcement.title}</p>
                  <p className="text-xs text-gray-500">
                    Created {formatDateTime(announcement.createdAt)} · Publishes {formatDateTime(announcement.publishDate)}
                  </p>
                </div>
                <Badge variant="outline">
                  {announcement.audience === 'region'
                    ? 'Regional cohort'
                    : announcement.audience === 'active'
                      ? 'Active users'
                      : 'All users'}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-gray-700">{announcement.message}</p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleDelete(announcement)}
                  className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default AnnouncementsManager;
