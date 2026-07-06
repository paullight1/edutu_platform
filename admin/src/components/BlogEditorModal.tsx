import { useState } from 'react';
import { X, Save, Clock, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { backendFetchJson } from '../lib/backend';
import RichTextEditor from './RichTextEditor';
import {
  type BlogPost,
  type BlogStatus,
  createUniqueSlug,
} from '../types/blog';

// authorId must be a UUID (backend zod contract). Fall back to the nil UUID for
// the local-admin bypass, where there is no Supabase auth user — sending the
// old "admin" string failed validation with a 400.
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface BlogEditorModalProps {
  /** The post being edited, or null when creating a new one. */
  post: BlogPost | null;
  /** Slugs already in use, so new posts get a unique one. */
  existingSlugs: Set<string>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const { url } = await backendFetchJson<{ url: string; path: string }>(
    '/blog/upload-image',
    { method: 'POST', body: formData },
  );
  return url;
}

export default function BlogEditorModal({
  post,
  existingSlugs,
  onClose,
  onSaved,
}: BlogEditorModalProps) {
  const isEditing = Boolean(post);
  const [title, setTitle] = useState(post?.title ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [content, setContent] = useState(post?.content ?? '');
  const [tags, setTags] = useState(post?.tags?.join(', ') ?? '');
  const [coverImage, setCoverImage] = useState<string | null>(
    post?.coverImage ?? null,
  );
  const [status, setStatus] = useState<BlogStatus>(post?.status ?? 'draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCoverUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        setCoverImage(await uploadImage(file));
      } catch (uploadError) {
        console.error('Error uploading cover image:', uploadError);
        setError('Could not upload the cover image. Please try again.');
      }
    };
    input.click();
  };

  const handleSave = async () => {
    setError(null);

    if (!title.trim()) {
      setError('Please enter a title.');
      return;
    }
    if (!content.trim()) {
      setError('Please add some content before saving.');
      return;
    }

    setSaving(true);
    try {
      const slug =
        isEditing && post?.slug
          ? post.slug
          : createUniqueSlug(title, existingSlugs);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const authorName =
        post?.authorName ||
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email ||
        'Admin';
      const avatar = post?.authorAvatar || user?.user_metadata?.avatar_url;
      const authorId =
        post?.authorId || (user?.id && UUID_RE.test(user.id) ? user.id : NIL_UUID);
      const publishedAt =
        status === 'published'
          ? post?.publishedAt || new Date().toISOString()
          : undefined;
      const parsedTags = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      const finalExcerpt = (excerpt.trim() || title.trim().slice(0, 147) + '...').slice(0, 500);

      // Only send optional URL fields when they are actually URLs — the backend
      // rejects `null`/empty for `.url().optional()`.
      const optionalUrls = {
        ...(coverImage ? { coverImage } : {}),
        ...(avatar ? { authorAvatar: avatar } : {}),
      };

      if (isEditing && post) {
        await backendFetchJson(`/blog/${post.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            slug,
            content,
            excerpt: finalExcerpt,
            status,
            tags: parsedTags,
            category: post.category || 'general',
            featured: post.featured ?? false,
            authorName,
            ...(publishedAt ? { publishedAt } : {}),
            ...optionalUrls,
          }),
        });
      } else {
        await backendFetchJson('/blog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            slug,
            content,
            excerpt: finalExcerpt,
            status,
            tags: parsedTags,
            category: 'general',
            featured: false,
            authorId,
            authorName,
            ...(publishedAt ? { publishedAt } : {}),
            ...optionalUrls,
          }),
        });
      }

      await onSaved();
      onClose();
    } catch (saveError) {
      console.error('Error saving post:', saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Error saving post. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '1200px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            background: 'var(--bg-secondary)',
            zIndex: 2,
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>
            {isEditing ? 'Edit Post' : 'Create New Post'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
            }}
            aria-label="Close editor"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          <input
            type="text"
            placeholder="Post title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: '100%',
              fontSize: '28px',
              fontWeight: 700,
              border: 'none',
              borderBottom: '2px solid var(--border-light)',
              background: 'transparent',
              padding: '12px 0',
              color: 'var(--text-primary)',
              outline: 'none',
              marginBottom: '20px',
            }}
          />

          {/* Cover image */}
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '12px',
              }}
            >
              <button
                onClick={handleCoverUpload}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <ImageIcon size={16} />
                {coverImage ? 'Change cover image' : 'Add cover image'}
              </button>
              {coverImage && (
                <button
                  onClick={() => setCoverImage(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--danger)',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Remove
                </button>
              )}
            </div>
            {coverImage && (
              <img
                src={coverImage}
                alt="Cover"
                style={{
                  width: '100%',
                  maxHeight: '300px',
                  objectFit: 'cover',
                  borderRadius: '12px',
                }}
              />
            )}
          </div>

          {/* Excerpt */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Excerpt</label>
            <textarea
              placeholder="Brief summary of the post..."
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              maxLength={500}
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: '15px',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Rich text */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Content</label>
            <div
              style={{
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                overflow: 'hidden',
              }}
            >
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder="Write your post..."
                onImageUpload={uploadImage}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label style={labelStyle}>Tags (comma separated)</label>
            <input
              type="text"
              placeholder="e.g., scholarships, education, tips"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: '15px',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '20px 24px',
            borderTop: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            bottom: 0,
            background: 'var(--bg-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
              Status:
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BlogStatus)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
              }}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {saving ? (
                <Clock size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}
              {saving ? 'Saving...' : 'Save post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  fontSize: '14px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
} as const;
