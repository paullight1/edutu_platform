export type BlogStatus = 'draft' | 'published' | 'archived';

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  coverImage: string | null;
  status: BlogStatus;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  tags: string[] | null;
  featured: boolean;
  views: number;
  likes: number;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createUniqueSlug(title: string, existingSlugs: Set<string>): string {
  const base = slugify(title) || 'post';
  let slug = base;
  let suffix = 2;

  while (existingSlugs.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}
