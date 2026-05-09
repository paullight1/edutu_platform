import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc
} from '../../../lib/firebaseMock';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/Table';
import Select from '../../ui/Select';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import { useToast } from '../../ui/ToastProvider';

type ListingStatus = 'pending' | 'approved' | 'hidden';
type ListingType = 'roadmap' | 'marketplace';

interface CommunityListing {
  id: string;
  title: string;
  summary: string;
  creatorName: string;
  creatorEmail?: string;
  type: ListingType;
  category?: string;
  status: ListingStatus;
  featured: boolean;
  likes: number;
  submissions: number;
  createdAt: Date | null;
  priceType?: 'free' | 'premium';
  tags?: string[];
}

interface MarketplaceModerationProps {
  onPendingCountChange?: (count: number) => void;
}

const statusOptions: Array<{ value: ListingStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'hidden', label: 'Hidden' }
];

const typeOptions: Array<{ value: ListingType | 'all'; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'roadmap', label: 'Roadmaps' },
  { value: 'marketplace', label: 'Opportunity marketplace' }
];

const featuredOptions: Array<{ value: 'all' | 'featured' | 'non-featured'; label: string }> = [
  { value: 'all', label: 'Featured + non-featured' },
  { value: 'featured', label: 'Featured only' },
  { value: 'non-featured', label: 'Non-featured' }
];

const fallbackListings: CommunityListing[] = [
  {
    id: 'fallback-roadmap-1',
    title: 'UX Design Sprint Mastery',
    summary: 'Eight-week guided roadmap used by Edutu mentors to ship portfolio-ready UX case studies.',
    creatorName: 'Lara Benson',
    creatorEmail: 'lara@example.com',
    type: 'roadmap',
    category: 'Design',
    status: 'approved',
    featured: true,
    likes: 148,
    submissions: 62,
    createdAt: new Date(),
    priceType: 'premium',
    tags: ['Design', 'Portfolio', 'Case study']
  },
  {
    id: 'fallback-market-1',
    title: 'Community Mentorship Circle',
    summary: 'Monthly group mentorship for career switchers. Limited seats with rotating expert lineup.',
    creatorName: 'Growth Guild',
    creatorEmail: 'hello@growthguild.com',
    type: 'marketplace',
    category: 'Career',
    status: 'pending',
    featured: false,
    likes: 54,
    submissions: 19,
    createdAt: new Date(),
    priceType: 'premium',
    tags: ['Mentorship', 'Networking']
  },
  {
    id: 'fallback-roadmap-2',
    title: 'Scholarship Fast Track Playbook',
    summary: 'Step-by-step plan with templates for winning three scholarships in six months.',
    creatorName: 'Adeolu Ade',
    creatorEmail: 'adeolu@example.org',
    type: 'roadmap',
    category: 'Funding',
    status: 'pending',
    featured: false,
    likes: 87,
    submissions: 33,
    createdAt: new Date(),
    priceType: 'free',
    tags: ['Scholarships', 'Funding']
  }
];

const formatDate = (value: Date | null) => {
  if (!value) {
    return '--';
  }
  return value.toLocaleDateString();
};

const MarketplaceModeration: React.FC<MarketplaceModerationProps> = ({ onPendingCountChange }) => {
  const { toast } = useToast();
  const [listings, setListings] = useState<CommunityListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ListingStatus>('pending');
  const [typeFilter, setTypeFilter] = useState<'all' | ListingType>('all');
  const [featuredFilter, setFeaturedFilter] = useState<'all' | 'featured' | 'non-featured'>('all');
  const [hasRealtime, setHasRealtime] = useState(false);

  useEffect(() => {
    if (!db) {
      setListings(fallbackListings);
      setHasRealtime(false);
      setLoading(false);
      onPendingCountChange?.(fallbackListings.filter((listing) => listing.status === 'pending').length);
      setError('Firestore is not initialised. Showing sample data only.');
      return;
    }

    const marketplaceQuery = query(collection(db, 'community_marketplace'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      marketplaceQuery,
      (snapshot) => {
        const payload = snapshot.docs.map<CommunityListing>((docSnapshot) => {
          const data = docSnapshot.data() as Record<string, unknown>;
          const createdValue = data.createdAt;
          let createdAt: Date | null = null;
          if (createdValue instanceof Date) {
            createdAt = createdValue;
          } else if (createdValue && typeof createdValue === 'object' && 'toDate' in createdValue) {
            createdAt = (createdValue as { toDate: () => Date }).toDate();
          } else if (typeof createdValue === 'string' || typeof createdValue === 'number') {
            const parsed = new Date(createdValue);
            createdAt = Number.isNaN(parsed.getTime()) ? null : parsed;
          }

          const status: ListingStatus =
            data.status === 'approved' ? 'approved' : data.status === 'hidden' ? 'hidden' : 'pending';
          const featured = Boolean(data.featured);
          const type: ListingType = data.type === 'marketplace' ? 'marketplace' : 'roadmap';

          return {
            id: docSnapshot.id,
            title: typeof data.title === 'string' ? data.title : 'Untitled listing',
            summary: typeof data.summary === 'string' ? data.summary : 'Submission pending full description.',
            creatorName: typeof data.creatorName === 'string' ? data.creatorName : 'Unknown creator',
            creatorEmail: typeof data.creatorEmail === 'string' ? data.creatorEmail : undefined,
            type,
            category: typeof data.category === 'string' ? data.category : undefined,
            status,
            featured,
            likes: typeof data.likes === 'number' ? data.likes : 0,
            submissions: typeof data.submissions === 'number' ? data.submissions : 0,
            createdAt,
            priceType: data.priceType === 'premium' ? 'premium' : 'free',
            tags: Array.isArray(data.tags)
              ? data.tags.filter((tag): tag is string => typeof tag === 'string')
              : undefined
          };
        });

        setListings(payload);
        setHasRealtime(true);
        setLoading(false);
        onPendingCountChange?.(payload.filter((listing) => listing.status === 'pending').length);
        setError(null);
      },
      (err) => {
        console.error('Failed to stream community marketplace data', err);
        setError('Unable to load marketplace submissions from Firestore.');
        setListings(fallbackListings);
        onPendingCountChange?.(fallbackListings.filter((listing) => listing.status === 'pending').length);
        setLoading(false);
        setHasRealtime(false);
      }
    );

    return () => unsubscribe();
  }, [onPendingCountChange]);

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      const matchesStatus = statusFilter === 'all' ? true : listing.status === statusFilter;
      const matchesType = typeFilter === 'all' ? true : listing.type === typeFilter;
      const matchesFeatured =
        featuredFilter === 'all'
          ? true
          : featuredFilter === 'featured'
            ? listing.featured
            : !listing.featured;
      return matchesStatus && matchesType && matchesFeatured;
    });
  }, [featuredFilter, listings, statusFilter, typeFilter]);

  const updateStatus = async (listing: CommunityListing, status: ListingStatus) => {
    if (!db || !hasRealtime) {
      toast({
        title: 'Update unavailable',
        description: 'Connect Firebase to update marketplace submissions.',
        variant: 'error'
      });
      return;
    }

    try {
      await setDoc(
        doc(db, 'community_marketplace', listing.id),
        { status },
        { merge: true }
      );
      toast({
        title: `Listing ${status === 'approved' ? 'approved' : status === 'hidden' ? 'hidden' : 'queued'}`,
        description: `${listing.title} moderation updated.`,
        variant: 'success'
      });
    } catch (err) {
      toast({
        title: 'Moderation failed',
        description: err instanceof Error ? err.message : 'Unable to update listing status.',
        variant: 'error'
      });
    }
  };

  const toggleFeatured = async (listing: CommunityListing, nextFeatured: boolean) => {
    if (!db || !hasRealtime) {
      toast({
        title: 'Feature unavailable',
        description: 'Connect Firebase to change featured state.',
        variant: 'error'
      });
      return;
    }

    if (listing.status !== 'approved') {
      toast({
        title: 'Approval required',
        description: 'Approve the listing before featuring it.',
        variant: 'error'
      });
      return;
    }

    try {
      await setDoc(
        doc(db, 'community_marketplace', listing.id),
        { featured: nextFeatured },
        { merge: true }
      );
      toast({
        title: nextFeatured ? 'Listing featured' : 'Listing unfeatured',
        description: `${listing.title} visibility updated.`,
        variant: 'success'
      });
    } catch (err) {
      toast({
        title: 'Feature update failed',
        description: err instanceof Error ? err.message : 'Unable to update featured state.',
        variant: 'error'
      });
    }
  };

  const deleteListing = async (listing: CommunityListing) => {
    if (!db || !hasRealtime) {
      toast({
        title: 'Delete unavailable',
        description: 'Connect Firebase to delete submissions.',
        variant: 'error'
      });
      return;
    }

    try {
      await deleteDoc(doc(db, 'community_marketplace', listing.id));
      toast({
        title: 'Listing deleted',
        description: `${listing.title} removed from the marketplace.`,
        variant: 'success'
      });
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unable to delete listing.',
        variant: 'error'
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Roadmaps & marketplace</h3>
          <p className="text-sm text-gray-500">
            Approve community-created roadmaps, control which offers are featured, and hide low-quality listings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="w-44"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
            className="w-44"
          >
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            value={featuredFilter}
            onChange={(event) => setFeaturedFilter(event.target.value as typeof featuredFilter)}
            className="w-48"
          >
            {featuredOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Creator</TableHead>
            <TableHead>Listing</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Featured</TableHead>
            <TableHead>Signals</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-sm text-gray-500">
                Loading marketplace submissions...
              </TableCell>
            </TableRow>
          )}

          {!loading && filteredListings.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-sm text-gray-500">
                No listings match these filters.
              </TableCell>
            </TableRow>
          )}

          {!loading &&
            filteredListings.map((listing) => (
              <TableRow key={listing.id}>
                <TableCell className="max-w-[160px]">
                  <div className="space-y-1">
                    <p className="truncate font-medium text-gray-900">{listing.creatorName}</p>
                    {listing.creatorEmail && (
                      <p className="truncate text-xs text-gray-500">{listing.creatorEmail}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-[240px]">
                  <p className="truncate font-medium text-gray-900">{listing.title}</p>
                  <p className="truncate text-xs text-gray-500">{listing.summary}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{listing.type === 'roadmap' ? 'Roadmap' : 'Marketplace'}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      listing.status === 'approved'
                        ? 'success'
                        : listing.status === 'pending'
                          ? 'default'
                          : 'outline'
                    }
                  >
                    {listing.status === 'approved'
                      ? 'Approved'
                      : listing.status === 'pending'
                        ? 'Pending'
                        : 'Hidden'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={listing.featured ? 'success' : 'outline'}>
                    {listing.featured ? 'Featured' : 'Not featured'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="space-y-1 text-xs text-gray-500">
                    <p>Likes: {listing.likes.toLocaleString()}</p>
                    <p>Submissions: {listing.submissions.toLocaleString()}</p>
                    {listing.category && <p>Category: {listing.category}</p>}
                  </div>
                </TableCell>
                <TableCell>{formatDate(listing.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={listing.status === 'approved'}
                      onClick={() => void updateStatus(listing, 'approved')}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className={listing.featured ? 'border-amber-200 text-amber-600' : undefined}
                      onClick={() => void toggleFeatured(listing, !listing.featured)}
                    >
                      {listing.featured ? 'Unfeature' : 'Feature'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void updateStatus(listing, listing.status === 'hidden' ? 'pending' : 'hidden')}
                    >
                      {listing.status === 'hidden' ? 'Unhide' : 'Hide'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => void deleteListing(listing)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default MarketplaceModeration;
