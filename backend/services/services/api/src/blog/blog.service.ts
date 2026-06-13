import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq, desc, asc, like, and, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  blogPosts,
  blogComments,
  type BlogPost,
  type BlogComment,
} from "../db/schema";
import {
  CreateBlogPostDto,
  UpdateBlogPostDto,
  CreateCommentDto,
} from "./blog.dto";

const BLOG_IMAGES_BUCKET = process.env.BLOG_IMAGES_BUCKET || "blog-images";

interface BlogUploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
}

@Injectable()
export class BlogService {
  private readonly supabase: SupabaseClient | null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    this.supabase =
      url && key
        ? createClient(url, key, { auth: { persistSession: false } })
        : null;
  }

  async uploadImage(
    file: BlogUploadFile,
  ): Promise<{ url: string; path: string }> {
    if (!file) {
      throw new BadRequestException("Image file is required");
    }

    if (!this.supabase) {
      throw new BadRequestException("Image uploads are not configured");
    }

    if (!file.mimetype?.startsWith("image/")) {
      throw new BadRequestException("Only image uploads are supported");
    }

    await this.ensureBucket();

    const extension = this.extensionFromMime(file.mimetype, file.originalname);
    const path = `${randomUUID()}.${extension}`;
    const { error } = await this.supabase.storage
      .from(BLOG_IMAGES_BUCKET)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
        cacheControl: "31536000",
      });

    if (error) {
      throw error;
    }

    const { data } = this.supabase.storage
      .from(BLOG_IMAGES_BUCKET)
      .getPublicUrl(path);

    return {
      url: data.publicUrl,
      path,
    };
  }

  async findAll(params?: {
    status?: "draft" | "published" | "archived" | "all";
    category?: string;
    tag?: string;
    featured?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<BlogPost[]> {
    const {
      status = "published",
      category,
      tag,
      featured,
      limit = 20,
      offset = 0,
    } = params || {};

    const conditions: SQL[] = [];

    if (status && status !== "all") {
      conditions.push(eq(blogPosts.status, status));
    }

    if (category) {
      conditions.push(eq(blogPosts.category, category));
    }

    if (tag) {
      conditions.push(like(blogPosts.tags, `%${tag}%`));
    }

    if (featured) {
      conditions.push(eq(blogPosts.featured, true));
    }

    try {
      const posts = await db
        .select()
        .from(blogPosts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(
          status && status !== "all"
            ? desc(blogPosts.publishedAt)
            : desc(blogPosts.updatedAt),
        )
        .limit(limit)
        .offset(offset);

      return posts;
    } catch {
      return [];
    }
  }

  async findOne(id: string): Promise<BlogPost> {
    const posts = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.id, id))
      .limit(1);

    if (posts.length === 0) {
      throw new NotFoundException(`Blog post with ID ${id} not found`);
    }

    // Increment views
    await db
      .update(blogPosts)
      .set({ views: (posts[0].views || 0) + 1 })
      .where(eq(blogPosts.id, id));

    const updated = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.id, id))
      .limit(1);
    return updated[0];
  }

  async findOneBySlug(slug: string): Promise<BlogPost> {
    const posts = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.slug, slug))
      .limit(1);

    if (posts.length === 0) {
      throw new NotFoundException(`Blog post with slug ${slug} not found`);
    }

    // Increment views
    await db
      .update(blogPosts)
      .set({ views: (posts[0].views || 0) + 1 })
      .where(eq(blogPosts.slug, slug));

    const updated = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.slug, slug))
      .limit(1);
    return updated[0];
  }

  async create(data: CreateBlogPostDto): Promise<BlogPost> {
    const posts = await db
      .insert(blogPosts)
      .values({
        ...data,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
        tags: data.tags || [],
      })
      .returning();

    return posts[0];
  }

  async update(id: string, data: UpdateBlogPostDto): Promise<BlogPost> {
    const posts = await db
      .update(blogPosts)
      .set({
        ...data,
        updatedAt: new Date(),
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
      })
      .where(eq(blogPosts.id, id))
      .returning();

    if (posts.length === 0) {
      throw new NotFoundException(`Blog post with ID ${id} not found`);
    }

    return posts[0];
  }

  async delete(id: string): Promise<void> {
    const result = await db.delete(blogPosts).where(eq(blogPosts.id, id));

    if (result.rowCount === 0) {
      throw new NotFoundException(`Blog post with ID ${id} not found`);
    }
  }

  async getComments(postId: string): Promise<BlogComment[]> {
    const comments = await db
      .select()
      .from(blogComments)
      .where(
        and(
          eq(blogComments.postId, postId),
          eq(blogComments.status, "approved"),
        ),
      )
      .orderBy(asc(blogComments.createdAt));

    return comments;
  }

  async addComment(data: CreateCommentDto): Promise<BlogComment> {
    const comments = await db.insert(blogComments).values(data).returning();

    return comments[0];
  }

  async moderateComment(
    commentId: string,
    status: "approved" | "rejected",
  ): Promise<BlogComment> {
    const comments = await db
      .update(blogComments)
      .set({ status, updatedAt: new Date() })
      .where(eq(blogComments.id, commentId))
      .returning();

    if (comments.length === 0) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    return comments[0];
  }

  async likePost(postId: string): Promise<BlogPost> {
    const result = await db
      .update(blogPosts)
      .set({ likes: sql`${blogPosts.likes} + 1` })
      .where(eq(blogPosts.id, postId))
      .returning();

    if (result.length === 0) {
      throw new NotFoundException(`Blog post with ID ${postId} not found`);
    }

    return result[0];
  }

  async getCategories(): Promise<{ category: string; count: number }[]> {
    try {
      const results = await db
        .select({
          category: blogPosts.category,
          count: sql<number>`count(*)`,
        })
        .from(blogPosts)
        .where(eq(blogPosts.status, "published"))
        .groupBy(blogPosts.category);

      return results
        .filter((r) => r.category !== null)
        .map((r) => ({ category: r.category!, count: r.count }));
    } catch {
      return [];
    }
  }

  private async ensureBucket(): Promise<void> {
    if (!this.supabase) {
      return;
    }

    const { data: buckets, error } = await this.supabase.storage.listBuckets();
    if (error) throw error;

    if (buckets?.some((bucket) => bucket.name === BLOG_IMAGES_BUCKET)) {
      return;
    }

    const { error: createError } = await this.supabase.storage.createBucket(
      BLOG_IMAGES_BUCKET,
      {
        public: true,
      },
    );

    if (createError) {
      throw createError;
    }
  }

  private extensionFromMime(mimeType: string, originalName?: string): string {
    const fallback = originalName?.split(".").pop()?.toLowerCase() || "png";

    switch (mimeType) {
      case "image/jpeg":
        return "jpg";
      case "image/png":
        return "png";
      case "image/webp":
        return "webp";
      case "image/gif":
        return "gif";
      case "image/svg+xml":
        return "svg";
      default:
        return fallback;
    }
  }
}
