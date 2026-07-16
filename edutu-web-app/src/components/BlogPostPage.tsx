import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Calendar, Clock } from 'lucide-react';
import PublicHeader from './PublicHeader';
import SiteFooter from './SiteFooter';
import Seo from './Seo';
import {
  fetchPostBySlug,
  fetchPublishedPosts,
  agedPublishDate,
  relativeDateLabel,
  readingTime,
  type BlogPost,
} from '../services/blog';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

const FALLBACK_COVER = 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1600&q=80';

const RelatedCard: React.FC<{ post: BlogPost }> = ({ post }) => (
  <Link
    to={`/blog/${post.slug}`}
    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-layer no-underline shadow-soft transition-all hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
  >
    <div className="overflow-hidden">
      <img
        src={post.coverImage ?? FALLBACK_COVER}
        alt={post.title}
        loading="lazy"
        className="h-40 w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
      />
    </div>
    <div className="flex flex-1 flex-col p-5">
      <span className="mb-2 text-xs font-medium text-text-muted">
        {relativeDateLabel(agedPublishDate(post))}
      </span>
      <h3 className="mb-2 line-clamp-2 font-display text-base font-semibold tracking-tight text-text-primary transition-colors group-hover:text-brand">
        {post.title}
      </h3>
      <span className="mt-auto text-xs text-text-muted">{readingTime(post.content)}</span>
    </div>
  </Link>
);

const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const reduceMotion = useReducedMotion();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [related, setRelated] = useState<BlogPost[]>([]);

  useEffect(() => {
    if (!slug) {
      setState('not-found');
      return;
    }
    const controller = new AbortController();
    setState('loading');
    window.scrollTo({ top: 0, behavior: 'auto' });
    fetchPostBySlug(slug, { signal: controller.signal })
      .then((data) => {
        setPost(data);
        setState('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.message === 'NOT_FOUND') {
          setState('not-found');
        } else {
          console.error('Failed to load blog post:', err);
          setState('error');
        }
      });
    return () => controller.abort();
  }, [slug]);

  // Pull a few other posts for the "More articles" navigation below.
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    fetchPublishedPosts({ limit: 7, signal: controller.signal })
      .then((rows) => setRelated(rows.filter((p) => p.slug !== slug).slice(0, 3)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [slug]);

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
      <PublicHeader fixed />

      {/* Scoped styling for admin-authored HTML content. Larger, more readable
          body copy with headings kept in proportion (was oversized vs. body). */}
      <style>{`
        .blog-content { font-size: 1.0625rem; line-height: 1.8; color: rgb(var(--text-secondary)); }
        .blog-content > * + * { margin-top: 1.25em; }
        .blog-content h2 { font-size: 1.3rem; font-weight: 700; line-height: 1.3; margin-top: 1.9em; letter-spacing: -0.01em; color: rgb(var(--text-primary)); }
        .blog-content h3 { font-size: 1.125rem; font-weight: 700; line-height: 1.4; margin-top: 1.6em; color: rgb(var(--text-primary)); }
        .blog-content a { color: rgb(var(--color-brand-600)); text-decoration: underline; text-underline-offset: 2px; }
        .blog-content ul, .blog-content ol { padding-left: 1.4em; }
        .blog-content ul { list-style: disc; }
        .blog-content ol { list-style: decimal; }
        .blog-content li + li { margin-top: 0.4em; }
        .blog-content blockquote { margin-top: 1.6em; border-left: 3px solid rgb(var(--color-brand-600) / 0.55); padding: 0.2em 0 0.2em 1.1em; font-size: 1.1875rem; font-style: italic; line-height: 1.6; color: rgb(var(--text-primary)); }
        .blog-content img { border-radius: 0.75rem; max-width: 100%; height: auto; }
        .blog-content pre { background: rgb(var(--surface-elevated)); padding: 1em; border-radius: 0.75rem; overflow-x: auto; }
        .blog-content code { font-family: ui-monospace, monospace; font-size: 0.9em; }
        @media (min-width: 768px) {
          .blog-content { font-size: 1.1875rem; line-height: 1.85; }
          .blog-content > * + * { margin-top: 1.4em; }
          .blog-content h2 { font-size: 1.55rem; margin-top: 2.1em; }
          .blog-content h3 { font-size: 1.3rem; }
          .blog-content blockquote { font-size: 1.375rem; padding-left: 1.3em; }
        }
      `}</style>

      <main className="px-4 pb-[96px] pt-[104px] sm:px-6">
        <article className="mx-auto max-w-[720px]">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm font-medium text-text-muted no-underline transition-colors hover:text-brand"
          >
            <ArrowLeft size={16} /> Back to Blog
          </Link>

          {state === 'loading' && (
            <div className="mt-8 space-y-4">
              <div className="h-8 w-3/4 animate-pulse rounded-lg bg-surface-layer" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-layer" />
              <div className="h-64 w-full animate-pulse rounded-2xl bg-surface-layer" />
            </div>
          )}

          {(state === 'not-found' || state === 'error') && (
            <div className="mt-16 text-center">
              <h1 className="mb-2 font-display text-2xl font-semibold tracking-tight text-text-primary">
                {state === 'not-found' ? 'Article not found' : 'Unable to load article'}
              </h1>
              <p className="mb-6 text-text-muted">
                {state === 'not-found'
                  ? 'This post may have been moved or unpublished.'
                  : 'Please try again in a moment.'}
              </p>
              <Link
                to="/blog"
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white no-underline transition-all hover:-translate-y-0.5"
              >
                Browse all articles
              </Link>
            </div>
          )}

          {state === 'ready' && post && (
            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mt-8"
            >
              <Seo
                title={`${post.title} — Edutu Blog`}
                description={post.excerpt ?? `${post.title} — insights from the Edutu team.`}
                path={`/blog/${post.slug}`}
                image={post.coverImage}
                type="article"
                jsonLd={{
                  '@context': 'https://schema.org',
                  '@type': 'BlogPosting',
                  headline: post.title,
                  description: post.excerpt ?? '',
                  ...(post.coverImage ? { image: [post.coverImage] } : {}),
                  ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
                  ...(post.updatedAt || post.publishedAt
                    ? { dateModified: post.updatedAt ?? post.publishedAt }
                    : {}),
                  author: { '@type': 'Organization', name: 'Edutu' },
                  publisher: {
                    '@type': 'Organization',
                    name: 'Edutu',
                    logo: {
                      '@type': 'ImageObject',
                      url: 'https://www.edutu.org/icons/icon-512x512.png',
                    },
                  },
                  mainEntityOfPage: {
                    '@type': 'WebPage',
                    '@id': `https://www.edutu.org/blog/${post.slug}`,
                  },
                }}
              />

              <h1 className="font-display text-[1.75rem] font-semibold leading-[1.2] tracking-tight text-text-primary text-balance md:text-[2.375rem] md:leading-[1.15]">
                {post.title}
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-text-muted">
                <span className="inline-flex items-center gap-2">
                  <Calendar size={14} />
                  {relativeDateLabel(agedPublishDate(post))}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Clock size={14} />
                  {readingTime(post.content)}
                </span>
              </div>

              {post.coverImage && (
                <div className="mt-8 overflow-hidden rounded-2xl">
                  <img
                    src={post.coverImage}
                    alt={post.title}
                    className="h-64 w-full object-cover md:h-[420px]"
                  />
                </div>
              )}

              <div
                className="blog-content mt-8"
                // Content is authored by admins in the trusted rich-text editor.
                dangerouslySetInnerHTML={{ __html: post.content }}
              />
            </motion.div>
          )}
        </article>

        {/* More articles — quick navigation to other posts */}
        {state === 'ready' && related.length > 0 && (
          <section className="mx-auto mt-20 max-w-[1120px] border-t border-subtle pt-12">
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
                More articles
              </h2>
              <Link to="/blog" className="text-sm font-semibold text-brand no-underline hover:underline">
                View all
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <RelatedCard key={p.id} post={p} />
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
};

export default BlogPostPage;
