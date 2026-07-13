import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Search, ChevronRight, ChevronLeft, TrendingUp, Lightbulb } from 'lucide-react';
import PublicHeader from './PublicHeader';
import Seo from './Seo';
import {
  fetchPublishedPosts,
  formatPostDate,
  readingTime,
  type BlogPost,
} from '../services/blog';

const PAGE_SIZE = 6;

/** Turn a slug-style tag into a readable chip label ("ai-coach" → "AI Coach"). */
function prettyTag(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => (word.toLowerCase() === 'ai' ? 'AI' : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function topicLabel(post: BlogPost): string | null {
  if (post.tags && post.tags.length > 0) return prettyTag(post.tags[0]);
  if (post.category) return prettyTag(post.category);
  return null;
}

const AuthorAvatar: React.FC<{ name: string; src: string | null; size?: number }> = ({
  name,
  src,
  size = 36,
}) => {
  const initial = name.trim().charAt(0).toUpperCase() || 'E';
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        className="rounded-full object-cover shrink-0 ring-2 ring-surface-body"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-brand/15 font-semibold text-brand"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
};

const TopicChip: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold capitalize text-brand">
    {label}
  </span>
);

const BlogPage: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const [searchQuery, setSearchQuery] = useState('');
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetchPublishedPosts({ limit: 60, signal: controller.signal })
      .then((rows) => setPosts(rows))
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load blog posts:', err);
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
      const excerpt = post.excerpt ?? '';
      return (
        post.title.toLowerCase().includes(query) ||
        excerpt.toLowerCase().includes(query) ||
        (post.category ?? '').toLowerCase().includes(query) ||
        (post.tags ?? []).some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [posts, searchQuery]);

  const featuredPost = useMemo(() => posts.find((p) => p.featured) ?? null, [posts]);

  const showFeatured = Boolean(featuredPost) && searchQuery === '';
  const gridPosts = useMemo(
    () => filteredPosts.filter((post) => !showFeatured || post.id !== featuredPost?.id),
    [filteredPosts, showFeatured, featuredPost],
  );

  const totalPages = Math.max(1, Math.ceil(gridPosts.length / PAGE_SIZE));
  // Search or data changes can shrink the list under the current page.
  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);
  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const pagedPosts = gridPosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const goToPage = (next: number) => {
    setPage(next);
    if (gridRef.current) {
      const top = gridRef.current.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  };

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
      <PublicHeader fixed />

      <Seo
        title="Blog — Edutu"
        description="Founder notes, success stories, and guides to help every young African discover and win life-changing opportunities."
        path="/blog"
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
              Insights &amp; <span className="text-brand">Resources</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-text-secondary md:text-lg">
              Founder notes, success stories, and guides to help you unlock global opportunities.
            </p>
          </motion.div>
        </section>

        <div className="mx-auto max-w-[1200px] px-4 pt-12 sm:px-6">
          {/* Search */}
          <div className="mb-12 flex justify-center">
            <div className="relative w-full max-w-xl">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles..."
                className="w-full rounded-xl border border-subtle bg-surface-elevated py-3 pl-12 pr-4 text-text-primary outline-none transition-colors placeholder:text-text-muted focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/20"
              />
            </div>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-80 animate-pulse rounded-2xl border border-subtle bg-surface-layer" />
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
                    src={featuredPost.coverImage ?? 'https://www.edutu.org/backgrounds/dark-hero.jpg'}
                    alt={featuredPost.title}
                    loading="lazy"
                    className="h-64 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] lg:h-[380px]"
                  />
                </div>
                <div className="lg:col-span-7">
                  <div className="mb-4 flex items-center gap-3">
                    {formatPostDate(featuredPost.publishedAt) && (
                      <span className="text-sm font-medium text-text-muted">
                        {formatPostDate(featuredPost.publishedAt)}
                      </span>
                    )}
                    {topicLabel(featuredPost) && <TopicChip label={topicLabel(featuredPost)!} />}
                  </div>
                  <h2 className="font-display text-3xl font-semibold tracking-tight text-text-primary transition-colors group-hover:text-brand md:text-4xl">
                    {featuredPost.title}
                  </h2>
                  {featuredPost.excerpt && (
                    <p className="mt-4 line-clamp-4 text-base leading-relaxed text-text-secondary md:text-lg">
                      {featuredPost.excerpt}
                    </p>
                  )}
                  <div className="mt-6 flex items-center gap-3">
                    <AuthorAvatar name={featuredPost.authorName} src={featuredPost.authorAvatar} size={44} />
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{featuredPost.authorName}</div>
                      <div className="text-xs text-text-muted">{readingTime(featuredPost.content)}</div>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          )}

          {/* Blog grid */}
          {!loading && pagedPosts.length > 0 && (
            <div ref={gridRef} className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
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
                        src={post.coverImage ?? 'https://www.edutu.org/backgrounds/dark-hero.jpg'}
                        alt={post.title}
                        loading="lazy"
                        className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <div className="mb-3 flex items-center gap-3">
                        {formatPostDate(post.publishedAt) && (
                          <span className="text-xs font-medium text-text-muted">
                            {formatPostDate(post.publishedAt)}
                          </span>
                        )}
                        {topicLabel(post) && <TopicChip label={topicLabel(post)!} />}
                      </div>
                      <h3 className="mb-2 line-clamp-2 font-display text-lg font-semibold tracking-tight text-text-primary transition-colors group-hover:text-brand">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="mb-5 line-clamp-2 text-sm leading-[1.6] text-text-secondary">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="mt-auto flex items-center gap-3">
                        <AuthorAvatar name={post.authorName} src={post.authorAvatar} size={34} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-text-primary">{post.authorName}</div>
                          <div className="text-xs text-text-muted">{readingTime(post.content)}</div>
                        </div>
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
          {!loading && totalPages > 1 && (
            <div className="mt-14 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(Math.max(1, page - 1))}
                disabled={page === 1}
                aria-label="Previous page"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-subtle text-text-secondary transition-colors hover:border-brand/50 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={18} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => goToPage(n)}
                  aria-label={`Page ${n}`}
                  aria-current={n === page ? 'page' : undefined}
                  className={
                    n === page
                      ? 'flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-soft'
                      : 'flex h-10 w-10 items-center justify-center rounded-full border border-subtle text-sm font-semibold text-text-secondary transition-colors hover:border-brand/50 hover:text-brand'
                  }
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => goToPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                aria-label="Next page"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-subtle text-text-secondary transition-colors hover:border-brand/50 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* Empty / error state */}
          {!loading && gridPosts.length === 0 && !showFeatured && (
            <div className="py-16 text-center">
              <Lightbulb size={48} className="mx-auto mb-4 text-text-muted" />
              <h3 className="mb-2 font-display text-xl font-semibold tracking-tight text-text-primary">
                {error ? 'Unable to load articles' : searchQuery ? 'No articles found' : 'No articles yet'}
              </h3>
              <p className="text-text-muted">
                {error
                  ? 'Please try again in a moment.'
                  : searchQuery
                    ? 'Try a different search term or category.'
                    : 'Check back soon for new insights and resources.'}
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
                background: 'radial-gradient(circle at 50% 0%, rgb(var(--color-brand-300) / 0.35), transparent 60%)',
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
                Get weekly insights on scholarships, fellowships, and career opportunities delivered to your inbox.
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
    </div>
  );
};

export default BlogPage;
