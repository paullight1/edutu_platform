import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Search, ChevronRight, TrendingUp, Lightbulb } from "lucide-react";
import PublicHeader from "./PublicHeader";
import SiteFooter from "./SiteFooter";
import Seo from "./Seo";
import Pagination from "./ui/Pagination";
import {
  fetchPublishedPosts,
  formatPostDate,
  readingTime,
  type BlogPost,
} from "../services/blog";
import { buildPageHref, parsePageParam } from "../lib/seoPagination";

const PAGE_SIZE = 6;

/** Turn a slug-style tag into a readable chip label ("ai-coach" → "AI Coach"). */
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

const BlogPage: React.FC = () => {
  const reduceMotion = useReducedMotion();
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
    fetchPublishedPosts({ limit: 60, signal: controller.signal })
      .then((rows) => setPosts(rows))
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load blog posts:", err);
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

  const featuredPost = useMemo(
    () => posts.find((p) => p.featured) ?? null,
    [posts],
  );

  const publishedLabel = (post: BlogPost): string =>
    formatPostDate(post.publishedAt || post.createdAt);

  const showFeatured = Boolean(featuredPost) && searchQuery === "";
  const gridPosts = useMemo(
    () =>
      filteredPosts.filter(
        (post) => !showFeatured || post.id !== featuredPost?.id,
      ),
    [filteredPosts, showFeatured, featuredPost],
  );

  const totalPages = Math.max(1, Math.ceil(gridPosts.length / PAGE_SIZE));
  const requestedPage = parsePageParam(searchParams.get("page"));
  const page = parsePageParam(searchParams.get("page"), totalPages);

  useEffect(() => {
    if (loading || requestedPage === page) return;

    const nextParams = new URLSearchParams(searchParams);
    if (page <= 1) nextParams.delete("page");
    else nextParams.set("page", String(page));
    setSearchParams(nextParams, { replace: true });
  }, [loading, page, requestedPage, searchParams, setSearchParams]);

  const pagedPosts = gridPosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const goToPage = (next: number) => {
    const nextPage = parsePageParam(String(next), totalPages);
    const nextParams = new URLSearchParams(searchParams);
    if (nextPage <= 1) nextParams.delete("page");
    else nextParams.set("page", String(nextPage));
    setSearchParams(nextParams);

    if (gridRef.current) {
      const top =
        gridRef.current.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (page === 1) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("page");
    setSearchParams(nextParams, { replace: true });
  };

  const getPageHref = (next: number) =>
    buildPageHref("/blog", searchParams, next);

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
      <PublicHeader fixed />

      <Seo
        title={
          page > 1
            ? `Scholarship & Career Guides — Page ${page} | Edutu`
            : "Scholarship & Career Guides for African Students | Edutu"
        }
        description="Practical scholarship, fellowship, internship and career guides for African students, plus application advice and opportunity research from Edutu."
        path={page > 1 ? `/blog?page=${page}` : "/blog"}
        type="website"
      />

      <main className="pb-[96px]">
        {/* Header */}
        <section className="px-4 pt-[120px] sm:px-6">
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-[1200px] text-center"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
              From the Blog
            </span>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text-primary md:text-4xl">
              Scholarship, Career &amp;{" "}
              <span className="text-brand">Opportunity Guides</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-text-secondary md:text-lg">
              Practical guides and research to help African students find
              scholarships, build stronger applications, and unlock global
              opportunities.
            </p>
          </motion.div>
        </section>

        <div className="mx-auto max-w-[1200px] px-4 pt-12 sm:px-6">
          {/* Search */}
          <div className="mb-12 flex justify-center">
            <div className="relative w-full max-w-xl">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Search articles..."
                className="w-full rounded-xl border border-subtle bg-surface-elevated py-3 pl-12 pr-4 text-text-primary outline-none transition-colors placeholder:text-text-muted focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/20"
              />
            </div>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-80 animate-pulse rounded-2xl border border-subtle bg-surface-layer"
                />
              ))}
            </div>
          )}

          {/* Featured post — image left, content right */}
          {!loading && showFeatured && featuredPost && (
            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-16"
            >
              <Link
                to={`/blog/${featuredPost.slug}`}
                className="group grid items-center gap-6 no-underline lg:grid-cols-12 lg:gap-10"
              >
                <div className="overflow-hidden rounded-2xl shadow-soft lg:col-span-5">
                  <img
                    src={
                      featuredPost.coverImage ??
                      "https://www.edutu.org/backgrounds/dark-hero.jpg"
                    }
                    alt={featuredPost.title}
                    loading="lazy"
                    className="h-64 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] lg:h-[380px]"
                  />
                </div>
                <div className="lg:col-span-7">
                  <div className="mb-4 flex items-center gap-3">
                    <time
                      dateTime={
                        featuredPost.publishedAt || featuredPost.createdAt
                      }
                      className="text-sm font-medium text-text-muted"
                    >
                      {publishedLabel(featuredPost)}
                    </time>
                    {topicLabel(featuredPost) && (
                      <TopicChip label={topicLabel(featuredPost)!} />
                    )}
                  </div>
                  <h2 className="font-display text-3xl font-semibold tracking-tight text-text-primary transition-colors group-hover:text-brand md:text-4xl">
                    {featuredPost.title}
                  </h2>
                  {featuredPost.excerpt && (
                    <p className="mt-4 line-clamp-4 text-base leading-relaxed text-text-secondary md:text-lg">
                      {featuredPost.excerpt}
                    </p>
                  )}
                  <div className="mt-6 flex items-center gap-2 text-sm font-medium text-brand">
                    Read article
                    <ChevronRight
                      size={16}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </div>
                </div>
              </Link>
            </motion.div>
          )}

          {/* Blog grid */}
          {!loading && pagedPosts.length > 0 && (
            <div
              ref={gridRef}
              className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3"
            >
              {pagedPosts.map((post, index) => (
                <motion.article
                  key={post.id}
                  initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                >
                  <Link
                    to={`/blog/${post.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-layer no-underline shadow-soft transition-all hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
                  >
                    <div className="overflow-hidden">
                      <img
                        src={
                          post.coverImage ??
                          "https://www.edutu.org/backgrounds/dark-hero.jpg"
                        }
                        alt={post.title}
                        loading="lazy"
                        className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <div className="mb-3 flex items-center gap-3">
                        <time
                          dateTime={post.publishedAt || post.createdAt}
                          className="text-xs font-medium text-text-muted"
                        >
                          {publishedLabel(post)}
                        </time>
                        {topicLabel(post) && (
                          <TopicChip label={topicLabel(post)!} />
                        )}
                      </div>
                      <h3 className="mb-2 line-clamp-2 font-display text-lg font-semibold tracking-tight text-text-primary transition-colors group-hover:text-brand">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="mb-5 line-clamp-2 text-sm leading-[1.6] text-text-secondary">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="mt-auto flex items-center gap-3 border-t border-subtle pt-4">
                        <span className="text-xs font-medium text-text-muted">
                          {readingTime(post.content)}
                        </span>
                        <ChevronRight
                          size={18}
                          className="ml-auto text-brand transition-transform group-hover:translate-x-1"
                        />
                      </div>
                    </div>
                  </Link>
                </motion.article>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={goToPage}
              getPageHref={getPageHref}
              className="mt-14"
            />
          )}

          {/* Empty / error state */}
          {!loading && gridPosts.length === 0 && !showFeatured && (
            <div className="py-16 text-center">
              <Lightbulb size={48} className="mx-auto mb-4 text-text-muted" />
              <h3 className="mb-2 font-display text-xl font-semibold tracking-tight text-text-primary">
                {error
                  ? "Unable to load articles"
                  : searchQuery
                    ? "No articles found"
                    : "No articles yet"}
              </h3>
              <p className="text-text-muted">
                {error
                  ? "Please try again in a moment."
                  : searchQuery
                    ? "Try a different search term or category."
                    : "Check back soon for new insights and resources."}
              </p>
            </div>
          )}

          {/* Newsletter CTA */}
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative mt-20 overflow-hidden rounded-3xl bg-brand p-10 text-center shadow-elevated"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 50% 0%, rgb(var(--color-brand-300) / 0.35), transparent 60%)",
              }}
            />
            <div className="relative z-10">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <TrendingUp size={28} className="text-white" />
              </div>
              <h2 className="mb-2 font-display text-2xl font-semibold tracking-tight text-white">
                Stay Ahead of the Curve
              </h2>
              <p className="mx-auto mb-6 max-w-lg text-white/80">
                Get weekly insights on scholarships, fellowships, and career
                opportunities delivered to your inbox.
              </p>
              <div className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 rounded-xl border border-white/30 bg-white/15 px-4 py-3 text-sm text-white outline-none placeholder:text-white/70 focus-visible:ring-2 focus-visible:ring-white/40"
                />
                <button className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand transition-all hover:-translate-y-0.5 hover:bg-white/90">
                  Subscribe
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default BlogPage;
