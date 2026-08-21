import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  CheckCircle2,
  Loader2,
  MapPin,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import {
  enrollMarketplaceListing,
  fetchMarketplaceListing,
  getMarketplaceEnrollments,
  type MarketplaceEnrollment,
  type MarketplaceListing,
} from "../services/marketplace";

function ratingLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return (value > 5 ? value / 10 : value).toFixed(1);
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function MarketplaceDetailContent({ embedded }: { embedded: boolean }) {
  const { id } = useParams<{ id: string }>();
  const { isSignedIn, getToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [enrollment, setEnrollment] = useState<MarketplaceEnrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const nextListing = await fetchMarketplaceListing(id);
      setListing(nextListing);
      if (isSignedIn) {
        const token = await getToken().catch(() => null);
        if (token) {
          const enrollments = await getMarketplaceEnrollments(token).catch(
            () => [],
          );
          setEnrollment(
            enrollments.find((item) => item.listingId === id) ?? null,
          );
        }
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load this marketplace listing.",
      );
    } finally {
      setLoading(false);
    }
  }, [getToken, id, isSignedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  const enroll = async () => {
    if (!listing || enrolling) return;
    if (!isSignedIn) {
      navigate("/auth?mode=sign-in", {
        state: {
          from: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          },
        },
      });
      return;
    }

    setEnrolling(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session has expired. Sign in again.");
      const result = await enrollMarketplaceListing(listing.id, token);
      setEnrollment(result);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to complete enrollment.",
      );
    } finally {
      setEnrolling(false);
    }
  };

  const backPath = embedded ? "/app/marketplace" : "/marketplace";

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="h-[520px] animate-pulse rounded-[28px] border border-subtle bg-surface-layer" />
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12 text-center sm:px-6">
        <div className="rounded-[28px] border border-subtle bg-surface-layer p-10">
          <h1 className="font-display text-2xl font-semibold text-text-primary">
            Listing unavailable
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            {error ||
              "This listing may have been unpublished or its creator is no longer approved."}
          </p>
          <Link
            to={backPath}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white no-underline"
          >
            <ArrowLeft size={15} aria-hidden="true" /> Back to marketplace
          </Link>
        </div>
      </main>
    );
  }

  const rating = ratingLabel(listing.rating);
  const eventDate = formatDate(listing.eventDate);
  const actionDisabled = Boolean(enrollment) || listing.soldOut || enrolling;
  const actionLabel = enrollment
    ? "Enrolled"
    : listing.soldOut
      ? "Listing full"
      : listing.price > 0
        ? `Enroll for ${listing.price.toLocaleString()} credits`
        : "Enroll free";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      {!embedded ? (
        <Seo
          title={`${listing.title} — Edutu Marketplace`}
          description={
            listing.description ||
            `Learn with ${listing.sellerName}, a verified Edutu creator.`
          }
          path={`/marketplace/${listing.id}`}
          image={listing.imageUrl}
        />
      ) : null}

      <Link
        to={backPath}
        className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-text-muted no-underline transition hover:text-brand"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Marketplace
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <article className="overflow-hidden rounded-[28px] border border-subtle bg-surface-layer shadow-soft">
          <div className="h-64 bg-gradient-to-br from-brand/10 via-surface-elevated to-success/10 sm:h-80">
            {listing.imageUrl ? (
              <img
                src={listing.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-brand/50">
                <ShieldCheck size={64} strokeWidth={1.25} aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-brand/10 px-3 py-1.5 capitalize text-brand">
                {listing.category}
              </span>
              <span className="rounded-full bg-surface-elevated px-3 py-1.5 capitalize text-text-secondary">
                {listing.type}
              </span>
            </div>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-text-primary">
              {listing.title}
            </h1>
            <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-text-secondary">
              <BadgeCheck size={17} className="text-brand" aria-hidden="true" />
              {listing.sellerName}
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                Verified creator
              </span>
            </p>
            {listing.description ? (
              <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-text-secondary sm:text-base">
                {listing.description}
              </p>
            ) : null}

            {listing.tags?.length ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {listing.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-lg border border-subtle bg-surface-body px-2.5 py-1 text-xs font-semibold text-text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </article>

        <aside className="h-fit rounded-[28px] border border-subtle bg-surface-layer p-6 shadow-soft lg:sticky lg:top-24">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
                Access
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-text-primary">
                {listing.price > 0
                  ? `${listing.price.toLocaleString()} credits`
                  : "Free"}
              </p>
            </div>
            {rating ? (
              <div className="inline-flex items-center gap-1 rounded-xl bg-warning/10 px-2.5 py-1.5 text-sm font-bold text-warning">
                <Star size={15} aria-hidden="true" /> {rating}
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-3 border-y border-subtle py-5 text-sm text-text-secondary">
            <p className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2">
                <Users size={16} className="text-brand" aria-hidden="true" />
                Enrolled
              </span>
              <strong className="text-text-primary">
                {listing.enrollmentCount.toLocaleString()}
              </strong>
            </p>
            {listing.remainingCapacity !== null ? (
              <p className="flex items-center justify-between gap-4">
                <span>Spots remaining</span>
                <strong className={listing.soldOut ? "text-danger" : "text-text-primary"}>
                  {listing.remainingCapacity}
                </strong>
              </p>
            ) : null}
            {eventDate ? (
              <p className="flex items-start gap-2">
                <Calendar size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                <span>{eventDate}</span>
              </p>
            ) : null}
            {listing.eventLocation ? (
              <p className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                <span>{listing.eventLocation}</span>
              </p>
            ) : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void enroll()}
            disabled={actionDisabled}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enrolling ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : enrollment ? (
              <CheckCircle2 size={17} aria-hidden="true" />
            ) : null}
            {actionLabel}
          </button>

          <div className="mt-4 rounded-xl bg-surface-elevated p-3 text-xs leading-5 text-text-muted">
            <p className="inline-flex items-center gap-1.5 font-bold text-text-secondary">
              <ShieldCheck size={14} className="text-brand" aria-hidden="true" />
              Reviewed marketplace
            </p>
            <p className="mt-1">
              Public listings require admin review and an actively approved
              creator. Paid enrollment and credit transfers are committed in one
              server-side transaction.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default function MarketplaceDetailPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const content = <MarketplaceDetailContent embedded={embedded} />;
  return embedded ? content : <PublicEditorialShell>{content}</PublicEditorialShell>;
}
