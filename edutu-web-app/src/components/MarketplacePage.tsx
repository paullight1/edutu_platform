import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Loader2,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import {
  fetchMarketplaceListings,
  type MarketplaceListing,
} from "../services/marketplace";

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "mentorship", label: "Mentorship" },
  { value: "career", label: "Career" },
  { value: "course", label: "Courses" },
  { value: "event", label: "Events" },
  { value: "resource", label: "Resources" },
];

function ratingLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const normalized = value > 5 ? value / 10 : value;
  return normalized.toFixed(1);
}

function priceLabel(listing: MarketplaceListing) {
  return listing.price > 0 ? `${listing.price.toLocaleString()} credits` : "Free";
}

function MarketplaceCard({
  listing,
  embedded,
}: {
  listing: MarketplaceListing;
  embedded: boolean;
}) {
  const rating = ratingLabel(listing.rating);
  const detailPath = embedded
    ? `/app/marketplace/${listing.id}`
    : `/marketplace/${listing.id}`;

  return (
    <article className="group overflow-hidden rounded-[24px] border border-subtle bg-surface-layer shadow-soft transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-elevated">
      <Link to={detailPath} className="block h-full no-underline">
        <div className="relative h-40 overflow-hidden bg-gradient-to-br from-brand/10 via-surface-elevated to-success/10">
          {listing.imageUrl ? (
            <img
              src={listing.imageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-brand/60">
              <BookOpen size={44} strokeWidth={1.5} aria-hidden="true" />
            </div>
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-surface-layer/95 px-2.5 py-1 text-xs font-semibold capitalize text-text-secondary shadow-sm backdrop-blur">
              {listing.category}
            </span>
            {listing.isFeatured ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                <Sparkles size={12} aria-hidden="true" /> Featured
              </span>
            ) : null}
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="line-clamp-2 font-display text-lg font-semibold leading-6 tracking-tight text-text-primary">
                {listing.title}
              </h2>
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted">
                <BadgeCheck size={14} className="text-brand" aria-hidden="true" />
                {listing.sellerName}
                <span className="sr-only">verified creator</span>
              </p>
            </div>
            <span className="shrink-0 rounded-xl bg-brand/10 px-2.5 py-1.5 text-xs font-bold text-brand">
              {priceLabel(listing)}
            </span>
          </div>

          {listing.description ? (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-text-secondary">
              {listing.description}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Users size={14} aria-hidden="true" />
              {listing.enrollmentCount.toLocaleString()} enrolled
            </span>
            {rating ? (
              <span className="inline-flex items-center gap-1.5">
                <Star size={14} aria-hidden="true" />
                {rating}
                {listing.reviewCount > 0
                  ? ` (${listing.reviewCount.toLocaleString()})`
                  : ""}
              </span>
            ) : null}
            {listing.soldOut ? (
              <span className="font-bold text-danger">Full</span>
            ) : listing.remainingCapacity !== null ? (
              <span>{listing.remainingCapacity} spots left</span>
            ) : null}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-subtle pt-4">
            <span className="text-xs font-semibold capitalize text-text-muted">
              {listing.type}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-brand">
              View details <ArrowRight size={15} aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function MarketplaceContent({ embedded }: { embedded: boolean }) {
  const requestRef = useRef(0);
  const [items, setItems] = useState<MarketplaceListing[]>([]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [category, setCategory] = useState("");
  const [type, setType] = useState<"" | "free" | "paid" | "credit" | "course">("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    void fetchMarketplaceListings({
      ...(deferredQuery ? { q: deferredQuery } : {}),
      ...(category ? { category } : {}),
      ...(type ? { type } : {}),
      limit: 18,
    })
      .then((page) => {
        if (requestRef.current !== requestId) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch((caught) => {
        if (requestRef.current !== requestId) return;
        setItems([]);
        setCursor(null);
        setHasMore(false);
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load the marketplace.",
        );
      })
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false);
      });
  }, [category, deferredQuery, type]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchMarketplaceListings({
        ...(deferredQuery ? { q: deferredQuery } : {}),
        ...(category ? { category } : {}),
        ...(type ? { type } : {}),
        cursor,
        limit: 18,
      });
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load more listings.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      {!embedded ? (
        <Seo
          title="Edutu Marketplace — Learn from verified creators"
          description="Browse reviewed mentorship, courses and career resources from approved Edutu creators."
          path="/marketplace"
        />
      ) : null}

      <section className="overflow-hidden rounded-[28px] border border-subtle bg-surface-layer p-6 shadow-soft sm:p-8 lg:p-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-brand">
            <ShoppingBag size={14} aria-hidden="true" /> Marketplace
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            Practical help from reviewed Edutu creators
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
            Explore mentorship, courses and application resources. Listings only
            appear here after review, and seller approval is rechecked whenever
            the catalogue is loaded.
          </p>
        </div>

        <div className="mt-7 grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_170px]">
          <label className="relative">
            <span className="sr-only">Search marketplace</span>
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search skills, creators or resources"
              className="h-11 w-full rounded-xl border border-subtle bg-surface-body pl-10 pr-3 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>
          <label>
            <span className="sr-only">Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11 w-full rounded-xl border border-subtle bg-surface-body px-3 text-sm font-semibold text-text-secondary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Listing type</span>
            <select
              value={type}
              onChange={(event) =>
                setType(
                  event.target.value as
                    | ""
                    | "free"
                    | "paid"
                    | "credit"
                    | "course",
                )
              }
              className="h-11 w-full rounded-xl border border-subtle bg-surface-body px-3 text-sm font-semibold text-text-secondary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              <option value="">All types</option>
              <option value="free">Free</option>
              <option value="paid">Paid</option>
              <option value="credit">Credits</option>
              <option value="course">Course</option>
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <div className="mt-5 flex items-start justify-between gap-4 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setCategory((value) => `${value}`);
              setQuery((value) => `${value} `);
              queueMicrotask(() => setQuery((value) => value.trimEnd()));
            }}
            className="shrink-0 font-bold underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading marketplace listings">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-[360px] animate-pulse rounded-[24px] border border-subtle bg-surface-layer"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-subtle bg-surface-layer px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <ShoppingBag size={23} aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-text-primary">
            No reviewed listings match yet
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-text-muted">
            Try a broader search or check back as approved creators publish new
            resources. Edutu does not fill this catalogue with placeholder listings.
          </p>
          <Link
            to="/mentor"
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-subtle px-4 py-2.5 text-sm font-bold text-text-secondary no-underline transition hover:border-brand/30 hover:text-brand"
          >
            Become a creator <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((listing) => (
              <MarketplaceCard
                key={listing.id}
                listing={listing}
                embedded={embedded}
              />
            ))}
          </div>
          {hasMore ? (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : null}
                Load more
              </button>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

export default function MarketplacePage({ embedded = false }: { embedded?: boolean }) {
  const content = <MarketplaceContent embedded={embedded} />;
  return embedded ? content : <PublicEditorialShell>{content}</PublicEditorialShell>;
}
