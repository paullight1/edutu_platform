import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Calendar, Clock, User, Search, ChevronRight, BookOpen, TrendingUp, Lightbulb } from 'lucide-react';
import PublicHeader from './PublicHeader';
import {
  fetchPublishedPosts,
  formatPostDate,
  readingTime,
  type BlogPost,
} from '../services/blog';

const BlogPage: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const [searchQuery, setSearchQuery] = useState('');
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
        (post.category ?? '').toLowerCase().includes(query)
      );
    });
  }, [posts, searchQuery]);

  const featuredPost = useMemo(
    () => posts.find((p) => p.featured) ?? null,
    [posts],
  );

  const showFeatured = featuredPost && searchQuery === '';
  const gridPosts = filteredPosts.filter(
    (post) => !showFeatured || post.id !== featuredPost?.id,
  );

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
      <PublicHeader fixed />

      <main className="pt-[120px] pb-[96px] px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto">
          {/* Hero */}
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
              From the Blog
            </span>
            <h1 className="mt-4 font-display text-3xl md:text-4xl font-semibold tracking-tight text-text-primary">
              Insights &amp; <span className="text-brand">Resources</span>
            </h1>
            <p className="mt-4 text-lg max-w-2xl mx-auto text-text-secondary">
              Expert advice, success stories, and guides to help you unlock global opportunities.
            </p>
          </motion.div>

          {/* Search */}
          <div className="flex flex-col md:flex-row gap-4 mb-10">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles..."
                className="w-full pl-12 pr-4 py-3 rounded-xl outline-none border border-subtle bg-surface-elevated text-text-primary placeholder:text-text-muted transition-colors focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/20"
              />
            </div>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-64 rounded-2xl border border-subtle bg-surface-layer animate-pulse"
                />
              ))}
            </div>
          )}

          {/* Featured Post */}
          {!loading && showFeatured && featuredPost && (
            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-12"
            >
              <Link
                to={`/blog/${featuredPost.slug}`}
                className="block no-underline p-8 rounded-2xl border border-subtle bg-surface-layer shadow-soft transition-all hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
              >
                {featuredPost.coverImage && (
                  <div className="mb-6 overflow-hidden rounded-xl">
                    <img
                      src={featuredPost.coverImage}
                      alt={featuredPost.title}
                      loading="lazy"
                      className="h-56 w-full object-cover"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand/10 text-brand">
                    <BookOpen size={12} /> Featured
                  </span>
                  {featuredPost.category && (
                    <span className="text-xs font-medium text-text-muted capitalize">{featuredPost.category}</span>
                  )}
                </div>
                <h2 className="font-display text-xl md:text-2xl font-semibold tracking-tight mb-3 text-text-primary">
                  {featuredPost.title}
                </h2>
                {featuredPost.excerpt && (
                  <p className="text-base leading-[1.6] mb-6 text-text-secondary">
                    {featuredPost.excerpt}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-text-muted">
                  <span className="inline-flex items-center gap-2">
                    <User size={14} />{featuredPost.authorName}
                  </span>
                  {formatPostDate(featuredPost.publishedAt) && (
                    <span className="inline-flex items-center gap-2">
                      <Calendar size={14} />{formatPostDate(featuredPost.publishedAt)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-2">
                    <Clock size={14} />{readingTime(featuredPost.content)}
                  </span>
                </div>
              </Link>
            </motion.div>
          )}

          {/* Blog Grid */}
          {!loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {gridPosts.map((post, index) => (
                <motion.article
                  key={post.id}
                  initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                >
                  <Link
                    to={`/blog/${post.slug}`}
                    className="group flex h-full flex-col rounded-2xl no-underline overflow-hidden border border-subtle bg-surface-layer shadow-soft transition-all hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
                  >
                    {post.coverImage && (
                      <img
                        src={post.coverImage}
                        alt={post.title}
                        loading="lazy"
                        className="h-40 w-full object-cover"
                      />
                    )}
                    <div className="flex flex-1 flex-col p-6">
                      {post.category && (
                        <div className="flex items-center gap-2 mb-3">
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-brand/10 text-brand capitalize">
                            {post.category}
                          </span>
                        </div>
                      )}
                      <h3 className="font-display text-lg font-semibold tracking-tight mb-2 line-clamp-2 text-text-primary">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="text-sm leading-[1.6] mb-4 line-clamp-3 text-text-secondary">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="mt-auto flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <User size={12} className="text-text-muted" />
                            <span className="text-xs text-text-muted">{post.authorName}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock size={12} className="text-text-muted" />
                            <span className="text-xs text-text-muted">{readingTime(post.content)}</span>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-brand transition-transform group-hover:translate-x-1" />
                      </div>
                    </div>
                  </Link>
                </motion.article>
              ))}
            </div>
          )}

          {/* Empty / error state */}
          {!loading && gridPosts.length === 0 && !showFeatured && (
            <div className="text-center py-16">
              <Lightbulb size={48} className="mx-auto mb-4 text-text-muted" />
              <h3 className="font-display text-xl font-semibold tracking-tight mb-2 text-text-primary">
                {error
                  ? 'Unable to load articles'
                  : searchQuery
                    ? 'No articles found'
                    : 'No articles yet'}
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
            className="relative overflow-hidden mt-16 p-10 rounded-3xl text-center bg-brand shadow-elevated"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 50% 0%, rgb(var(--color-brand-300) / 0.35), transparent 60%)',
              }}
            />
            <div className="relative z-10">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <TrendingUp size={28} className="text-white" />
              </div>
              <h2 className="font-display text-2xl font-semibold tracking-tight mb-2 text-white">Stay Ahead of the Curve</h2>
              <p className="text-white/80 mb-6 max-w-lg mx-auto">
                Get weekly insights on scholarships, fellowships, and career opportunities delivered to your inbox.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 px-4 py-3 rounded-xl outline-none text-sm bg-white/15 border border-white/30 text-white placeholder:text-white/70 focus-visible:ring-2 focus-visible:ring-white/40"
                />
                <button
                  className="px-6 py-3 rounded-xl text-sm font-semibold text-brand bg-white transition-all hover:-translate-y-0.5 hover:bg-white/90"
                >
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
