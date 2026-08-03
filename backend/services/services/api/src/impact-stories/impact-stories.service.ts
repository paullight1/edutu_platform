import { Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { impactStories, type ImpactStory } from "../db/schema";
import type {
  CreateImpactStoryDto,
  UpdateImpactStoryDto,
} from "./impact-stories.dto";

@Injectable()
export class ImpactStoriesService {
  /** Public listing — published rows only, in admin-defined order. */
  async findPublished(): Promise<ImpactStory[]> {
    return db
      .select()
      .from(impactStories)
      .where(eq(impactStories.status, "published"))
      .orderBy(asc(impactStories.sortOrder), asc(impactStories.createdAt));
  }

  /** Admin listing — every row, including drafts. */
  async findAll(): Promise<ImpactStory[]> {
    return db
      .select()
      .from(impactStories)
      .orderBy(asc(impactStories.sortOrder), asc(impactStories.createdAt));
  }

  async findBySlug(slug: string, includeDrafts = false): Promise<ImpactStory> {
    const where = includeDrafts
      ? eq(impactStories.slug, slug)
      : and(
          eq(impactStories.slug, slug),
          eq(impactStories.status, "published"),
        );

    const [row] = await db.select().from(impactStories).where(where).limit(1);
    if (!row) throw new NotFoundException(`Story "${slug}" not found`);
    return row;
  }

  async create(dto: CreateImpactStoryDto): Promise<ImpactStory> {
    const [row] = await db.insert(impactStories).values(dto).returning();
    return row;
  }

  async update(id: string, dto: UpdateImpactStoryDto): Promise<ImpactStory> {
    const [row] = await db
      .update(impactStories)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(impactStories.id, id))
      .returning();

    if (!row) throw new NotFoundException(`Story ${id} not found`);
    return row;
  }

  async remove(id: string): Promise<{ id: string }> {
    const [row] = await db
      .delete(impactStories)
      .where(eq(impactStories.id, id))
      .returning({ id: impactStories.id });

    if (!row) throw new NotFoundException(`Story ${id} not found`);
    return row;
  }
}
