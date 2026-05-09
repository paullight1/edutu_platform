import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from '../../../lib/firebaseMock';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/Table';
import Badge from '../../ui/Badge';
import Select from '../../ui/Select';
import { useToast } from '../../ui/ToastProvider';

type PostStatus = 'approved' | 'pending' | 'hidden';

interface CommunityPost {
  id: string;
  authorId: string;
  topic: string;
  likes: number;
  flags: number;
  status: PostStatus;
  createdAt: Date | null;
}

type PostFilter = 'all' | 'pending' | 'flagged' | 'hidden';

interface CommunityPostsProps {
  onFlaggedCountChange?: (count: number) => void;
}

const filterOptions: Array<{ value: PostFilter; label: string }> = [
  { value: 'all', label: 'All posts' },
  { value: 'pending', label: 'Pending review' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'hidden', label: 'Hidden' }
];

const formatDate = (value: Date | null) => {
  if (!value) {
    return '—';
  }
  return value.toLocaleDateString();
};

const CommunityPosts: React.FC<CommunityPostsProps> = ({ onFlaggedCountChange }) => {
  const { toast } = useToast();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PostFilter>('all');

  useEffect(() => {
    if (!db) {
      setError('Firestore is not initialised. Community posts will not update.');
      setLoading(false);
      return;
    }

    const postsQuery = query(collection(db, 'community_posts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      postsQuery,
      (snapshot) => {
        const records: CommunityPost[] = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data() as Record<string, unknown>;
          let createdAt: Date | null = null;
          const rawCreated = data.createdAt;
          if (rawCreated instanceof Date) {
            createdAt = rawCreated;
          } else if (rawCreated && typeof rawCreated === 'object' && 'toDate' in rawCreated) {
            createdAt = (rawCreated as { toDate: () => Date }).toDate();
          } else if (typeof rawCreated === 'string' || typeof rawCreated === 'number') {
            const parsed = new Date(rawCreated);
            createdAt = Number.isNaN(parsed.getTime()) ? null : parsed;
          }
          const status: PostStatus =
            data.status === 'hidden' ? 'hidden' : data.status === 'approved' ? 'approved' : 'pending';

          return {
            id: docSnapshot.id,
            authorId: typeof data.authorId === 'string' ? data.authorId : 'unknown-user',
            topic: typeof data.topic === 'string' ? data.topic : 'Untitled topic',
            likes: typeof data.likes === 'number' ? data.likes : 0,
            flags: typeof data.flags === 'number' ? data.flags : 0,
            status,
            createdAt
          };
        });

        setPosts(records);
        const flaggedCount = records.filter((post) => post.flags > 0 || post.status === 'pending').length;
        onFlaggedCountChange?.(flaggedCount);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to stream community posts', err);
        setError('Unable to load community posts.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [onFlaggedCountChange]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (filter === 'all') {
        return true;
      }
      if (filter === 'pending') {
        return post.status === 'pending';
      }
      if (filter === 'flagged') {
        return post.flags > 0 || post.status === 'pending';
      }
      if (filter === 'hidden') {
        return post.status === 'hidden';
      }
      return true;
    });
  }, [filter, posts]);

  const updateStatus = async (post: CommunityPost, status: PostStatus) => {
    if (!db) {
      toast({
        title: 'Update unavailable',
        description: 'Cannot update post status without Firebase.',
        variant: 'error'
      });
      return;
    }

    try {
      await setDoc(
        doc(db, 'community_posts', post.id),
        {
          status
        },
        { merge: true }
      );
      toast({
        title: `Post ${status === 'approved' ? 'approved' : status === 'hidden' ? 'hidden' : 'queued'}`,
        description: `${post.topic} moderation updated.`,
        variant: 'success'
      });
    } catch (err) {
      toast({
        title: 'Moderation failed',
        description: err instanceof Error ? err.message : 'Unable to update post status.',
        variant: 'error'
      });
    }
  };

  const deletePost = async (post: CommunityPost) => {
    if (!db) {
      toast({
        title: 'Delete unavailable',
        description: 'Cannot delete post without Firebase.',
        variant: 'error'
      });
      return;
    }

    try {
      await deleteDoc(doc(db, 'community_posts', post.id));
      toast({
        title: 'Post deleted',
        description: `${post.topic} removed from the community feed.`,
        variant: 'success'
      });
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unable to delete post.',
        variant: 'error'
      });
    }
  };

  const flagUser = (post: CommunityPost) => {
    toast({
      title: 'User flagged',
      description: `${post.authorId} queued for manual review.`,
      variant: 'success'
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Community posts</h3>
          <p className="text-sm text-gray-500">Moderate discussions and spotlight helpful contributions.</p>
        </div>
        <Select value={filter} onChange={(event) => setFilter(event.target.value as PostFilter)} className="w-48">
          {filterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Author</TableHead>
            <TableHead>Topic</TableHead>
            <TableHead>Likes</TableHead>
            <TableHead>Flags</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-gray-500">
                Loading community posts…
              </TableCell>
            </TableRow>
          )}
          {!loading && filteredPosts.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-gray-500">
                No posts match this filter.
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            filteredPosts.map((post) => (
              <TableRow key={post.id}>
                <TableCell>{post.authorId}</TableCell>
                <TableCell className="max-w-xs">
                  <p className="truncate font-medium text-gray-900">{post.topic}</p>
                </TableCell>
                <TableCell>{post.likes}</TableCell>
                <TableCell>
                  <Badge variant={post.flags > 0 ? 'danger' : 'outline'}>{post.flags}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      post.status === 'approved' ? 'success' : post.status === 'hidden' ? 'outline' : 'default'
                    }
                  >
                    {post.status === 'approved' ? 'Approved' : post.status === 'pending' ? 'Pending' : 'Hidden'}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(post.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void updateStatus(post, 'approved')}
                      className="rounded-xl border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateStatus(post, 'hidden')}
                      className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100"
                    >
                      Hide
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePost(post)}
                      className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => flagUser(post)}
                      className="rounded-xl border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-600 transition hover:bg-amber-50"
                    >
                      Flag user
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default CommunityPosts;
