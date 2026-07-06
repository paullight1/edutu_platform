import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Calendar, Clock, User } from 'lucide-react';
import PublicHeader from './PublicHeader';
import {
  fetchPostBySlug,
  formatPostDate,
  readingTime,
  type BlogPost,
} from '../services/blog';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const reduceMotion = useReducedMotion();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (!slug) {
      setState('not-found');
      return;
    }
    const controller = new AbortController();
    setState('loading');
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

  useEffect(() => {
    if (post) {
      const previous = document.title;
      document.title = `${post.title} — Edutu Blog`;
      return () => {
        document.title = previous;
      };
    }
  }, [post]);

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-body font-body text-text-primary">
      <PublicHeader fixed />

      {/* Scoped styling for admin-authored HTML content */}
      <style>{`
        .blog-content { font-size: 1.05rem; line-height: 1.75; color: rgb(var(--text-secondary)); }
        .blog-content > * + * { margin-top: 1.15em; }
        .blog-content h2 { font-size: 1.6rem; font-weight: 600; line-height: 1.3; margin-top: 2em; color: rgb(var(--text-primary)); }
        .blog-content h3 { font-size: 1.3rem; font-weight: 600; line-height: 1.35; margin-top: 1.6em; color: rgb(var(--text-primary)); }
        .blog-content a { color: rgb(var(--color-brand-600)); text-decoration: underline; text-underline-offset: 2px; }
        .blog-content ul, .blog-content ol { padding-left: 1.4em; }
        .blog-content ul { list-style: disc; }
        .blog-content ol { list-style: decimal; }
        .blog-content li + li { margin-top: 0.4em; }
        .blog-content blockquote { border-left: 3px solid rgb(var(--color-brand-600) / 0.5); padding-left: 1em; font-style: italic; color: rgb(var(--text-muted)); }
        .blog-content img { border-radius: 0.75rem; max-width: 100%; height: auto; }
        .blog-content pre { background: rgb(var(--surface-elevated)); padding: 1em; border-radius: 0.75rem; overflow-x: auto; }
        .blog-content code { font-family: ui-monospace, monospace; font-size: 0.9em; }
      `}</style>

      <main className="pt-[104px] pb-[96px] px-4 sm:px-6">
        <article className="max-w-[760px] mx-auto">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm font-medium text-text-muted no-underline transition-colors hover:text-brand"
          >
            <ArrowLeft size={16} /> Back to Blog
          </Link>

          {state === 'loading' && (
            <div className="mt-8 space-y-4">
              <div className="h-8 w-3/4 rounded-lg bg-surface-layer animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-surface-layer animate-pulse" />
              <div className="h-64 w-full rounded-2xl bg-surface-layer animate-pulse" />
            </div>
          )}

          {(state === 'not-found' || state === 'error') && (
            <div className="mt-16 text-center">
              <h1 className="font-display text-2xl font-semibold tracking-tight mb-2 text-text-primary">
                {state === 'not-found' ? 'Article not found' : 'Unable to load article'}
              </h1>
              <p className="text-text-muted mb-6">
                {state === 'not-found'
                  ? "This post may have been moved or unpublished."
                  : 'Please try again in a moment.'}
              </p>
              <Link
                to="/blog"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand no-underline transition-all hover:-translate-y-0.5"
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
              {post.category && (
                <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-brand/10 text-brand capitalize">
                  {post.category}
                </span>
              )}
              <h1 className="mt-4 font-display text-3xl md:text-4xl font-semibold tracking-tight text-text-primary">
                {post.title}
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-text-muted">
                <span className="inline-flex items-center gap-2">
                  <User size={14} />{post.authorName}
                </span>
                {formatPostDate(post.publishedAt) && (
                  <span className="inline-flex items-center gap-2">
                    <Calendar size={14} />{formatPostDate(post.publishedAt)}
                  </span>
                )}
                <span className="inline-flex items-center gap-2">
                  <Clock size={14} />{readingTime(post.content)}
                </span>
              </div>

              {post.coverImage && (
                <div className="mt-8 overflow-hidden rounded-2xl">
                  <img
                    src={post.coverImage}
                    alt={post.title}
                    className="w-full object-cover"
                  />
                </div>
              )}

              <div
                className="blog-content mt-8"
                // Content is authored by admins in the trusted rich-text editor.
                dangerouslySetInnerHTML={{ __html: post.content }}
              />

              {post.tags && post.tags.length > 0 && (
                <div className="mt-10 flex flex-wrap gap-2 border-t border-subtle pt-6">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-surface-elevated text-text-muted"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </article>
      </main>
    </div>
  );
};

export default BlogPostPage;
