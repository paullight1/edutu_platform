import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ChevronRight,
  Lightbulb,
  Search,
  TrendingUp,
} from "lucide-react";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import Pagination from "./ui/Pagination";
import {
  fetchAllPublishedPosts,
  formatPostDate,
  readingTime,
  type BlogPost,
} from "../services/blog";
import { buildPageHref, parsePageParam } from "../lib/seoPagination";
import { getDefaultSeoImage, toAbsoluteUrl } from "../lib/publicSite";

const PAGE_SIZE = 12;

function prettyTag(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) =>
      word.toLowerCase() === "ai"
        ? "AI"
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function topicLabel(post: BlogPost): string | null {
  if (post.tags && post.tags.length > 0) return prettyTag(post.tags[0]);
  if (post.category) return prettyTag(post.category);
  return null;
}

const TopicChip: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold capitalize text-brand">
    {label}
  </span>
);

function BlogCard({ post, index }: { post: BlogPost; index: number }) {
  const topic = topicLabel(post);
  const published = formatPostDate(post.publishedAt || post.createdAt);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.035, 0.2) }}
      className="h-full"
    >
      <Link
        to={`/blog/${post.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-layer no-underline shadow-soft transition-all hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <div className="aspect-[16/9] overflow-hidden bg-surface-elevated">
          <img
            src={
              post.coverImage ??
              "https://www.edutu.org/backgrounds/dark-hero.jpg"
            }
            alt={post.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        </div>
        <div className="flex flex-1 flex-col p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            {published ? (
              <time
                dateTime={post.publishedAt || post.createdAt}
                className="text-xs font-medium text-text-muted"
              >
                {published}
              </time>
            ) : null}
            {topic ? <TopicChip label={topic} /> : null}
          </div>
          <h2 className="line-clamp-2 font-display text-xl font-semibold tracking-tight text-text-primary transition-colors group-hover:text-brand">
            {post.title}
          </h2>
          {post.excerpt ? (
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-text-secondary">
              {post.excerpt}
            </p>
          ) : null}
          <div className="mt-auto flex items-center gap-3 border-t border-subtle pt-4 text-xs font-medium text-text-muted">
            <span>{readingTime(post.content)}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-brand">
              Read guide
              <ChevronRight
                size={16}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1"
              />
            </span>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}

const BlogPage: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    fetchAllPublishedPosts({ signal: controller.signal })
      .then(setPosts)
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load blog posts:", loadError);
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const filteredPosts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return posts;

    return posts.filter((post) => {
      const excerpt = post.excerpt ?? "";
      return (
        post.title.toLowerCase().includes(query) ||
        excerpt.toLowerCase().includes(query) ||
        (post.category ?? "").toLowerCase().includes(query) ||
        (post.tags ?? []).some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [posts, searchQuery]);

  const requestedPage = parsePageParam(searchParams.get("page"));
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE));
  const page = parsePageParam(String(requestedPage), totalPages);
  const canonicalPath = page > 1 ? `/blog?page=${page}` : "/blog";
  const pageItems = useMemo(
    () =>
      filteredPosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredPosts, page],
  );
  const featuredPost =
    page === 1 && !searchQuery.trim()
      ? (pageItems.find((post) => post.featured) ?? null)
      : null;
  const gridPosts = featuredPost
    ? pageItems.filter((post) => post.id !== featuredPost.id)
    : pageItems;

  const getPageHref = useCallback(
    (targetPage: number) =>
      buildPageHref("/blog", searchParams, targetPage),
    [searchParams],
  );

  useEffect(() => {
    if (loading || requestedPage === page) return;
    navigate(getPageHref(page), { replace: true });
  }, [getPageHref, loading, navigate, page, requestedPage]);

  const goToPage = useCallback(
    (targetPage: number) => {
      navigate(getPageHref(targetPage));
      const top = gridRef.current
        ? gridRef.current.getBoundingClientRect().top + window.scrollY - 100
        : 0;
      window.scrollTo({
        top,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    },
    [getPageHref, navigate, reduceMotion],
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (!searchParams.has("page")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const seoDescription =
    "Practical scholarship, fellowship, internship and career guides for African students, plus application advice and opportunity research from Edutu.";
  const seoTitle = `Scholarship & Career Guides for African Students${
    page > 1 ? ` — Page ${page}` : ""
  } | Edutu`;
  const seoJsonLd = useMemo(
    () => [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: seoTitle,
        description: seoDescription,
        url: toAbsoluteUrl(canonicalPath),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: pageItems.length,
          itemListElement: pageItems.map((post, index) => ({
            "@type": "ListItem",
            position: (page - 1) * PAGE_SIZE + index + 1,
            name: post.title,
            url: toAbsoluteUrl(`/blog/${post.slug}`),
          })),
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: toAbsoluteUrl("/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: page > 1 ? `Blog — Page ${page}` : "Blog",
            item: toAbsoluteUrl(canonicalPath),
          },
        ],
      },
    ],
    [canonicalPath, page, pageItems, seoTitle],
  );

  return (
    <div className="bg-surface-body">
      <Seo
        title={seoTitle}
        description={seoDescription}
        path={canonicalPath}
        image={getDefaultSeoImage()}
        type="website"
        jsonLd={seoJsonLd}
      />
      <PublicEditorialShell mainClassName="max-w-[1200px] pb-24 pt-10 sm:pt-14">
        <section className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
            Edutu editorial
          </p>
          <h1 className="mx-auto mt-3 max-w-4xl font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl lg:text-5xl">
            Scholarship, career and{" ""}
            <span className="text-brand">opportunity guides</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
            Practical research to help African students find opportunities,
            prepare stronger applications and make informed career decisions.
          </p>
          {page > 1 ? (
            <p className="mt-3 text-sm font-semibold text-text-muted">
              Page {page} of {totalPages}
            </p>
          ) : null}
        </section>

        <div className="mx-auto mt-10 max-w-xl">
          <label htmlFor="blog-search" className="sr-only">
            Search Edutu guides
          </label>
          <div className="relative">
            <Search
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              id="blog-search"
              type="search"
              value={searchQuery}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search guides by topic..."
              className="h-12 w-full rounded-xl border border-subtle bg-surface-layer pl-12 pr-4 text-text-primary shadow-soft outline-none transition placeholder:text-text-muted focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/20"
            />
          </div>
        </div>

        <div ref={gridRef} className="scroll-mt-24 pt-12">
          {loading ? (
            <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-96 animate-pulse rounded-2xl border border-subtle bg-surface-layer"
                />
              ))}
            </div>
          ) : null}

          {!loading && featuredPost ? (
            <motion.article
              initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-14 overflow-hidden rounded-3xl border border-subtle bg-surface-layer shadow-elevated"
            >
              <Link
                to={`/blog/${featuredPost.slug}`}
                className="group grid no-underline lg:grid-cols-12"
              >
                <div className="min-h-64 overflow-hidden bg-surface-elevated lg:col-span-5 lg:min-h-[390px]">
                  <img
                    src={
                      featuredPost.coverImage ??
                      "https://www.edutu.org/backgrounds/dark-hero.jpg"
                    }
                    alt={featuredPost.title}
                    loading="eager"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="flex flex-col justify-center p-7 sm:p-10 lg:col-span-7">
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-brand">
                      Featured guide
                    </span>
                    {topicLabel(featuredPost) ? (
                      <TopicChip label={topicLabel(featuredPost)!} />
                    ) : null}
                  </div>
                  <h2 className="font-display text-3xl font-semibold tracking-tight text-text-primary transition-colors group-hover:text-brand sm:text-4xl">
                    {featuredPost.title}
                  </h2>
                  {featuredPost.excerpt ? (
                    <p className="mt-4 text-base leading-7 text-text-secondary sm:text-lg">
                      {featuredPost.excerpt}
                    </p>
                  ) : null}
                  <span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-brand">
                    Read featured guide
                    <ArrowRight
                      size={17}
                      aria-hidden="true"
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </span>
                </div>
              </Link>
            </motion.article>
          ) : null}

          {!loading && gridPosts.length > 0 ? (
            <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
              {gridPosts.map((post, index) => (
                <BlogCard key={post.id} post={post} index={index} />
              ))}
            </div>
          ) : null}

          {!loading && pageItems.length === 0 ? (
            <section className="rounded-3xl border border-subtle bg-surface-layer px-6 py-16 text-center shadow-soft">
              <Lightbulb
                size={46}
                aria-hidden="true"
                className="mx-auto mb-4 text-text-muted"
              />
              <h2 className="font-display text-2xl font-semibold text-text-primary">
                {error
                  ? "Guides are temporarily unavailable"
                  : searchQuery
                    ? "No guides match this search"
                    : "No guides are published on this page"}
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-text-secondary">
                {error
                  ? "Please retry in a moment or browse current opportunities."
                  : searchQuery
                    ? "Try a broader topic, scholarship name or career keyword."
                    : "Return to the first page to see the latest Edutu guidance."}
              </p>
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => handleSearchChange("")}
                  className="mt-6 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Clear search
                </button>
              ) : null}
            </section>
          ) : null}

          {!loading && !searchQuery.trim() ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={goToPage}
              getPageHref={getPageHref}
              className="mt-12"
            />
          ) : null}
        </div>

        <section className="relative mt-20 overflow-hidden rounded-3xl bg-brand px-6 py-12 text-center text-white shadow-elevated sm:px-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 0%, rgb(var(--color-brand-300) / 0.38), transparent 62%)",
            }}
          />
          <div className="relative mx-auto max-w-2xl">
            <TrendingUp size={30} aria-hidden="true" className="mx-auto" />
            <h2 className="mt-4 font-display text-2xl font-semibold sm:text-3xl">
              Put the guidance into action
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/85">
              Browse current scholarships, internships, fellowships, grants and
              programmes, then confirm every application on the official source.
            </p>
            <Link
              to="/opportunities"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand no-underline transition hover:-translate-y-0.5"
            >
              Browse opportunities
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </PublicEditorialShell>
    </div>
  );
};

export default BlogPage;
