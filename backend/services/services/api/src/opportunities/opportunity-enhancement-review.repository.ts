import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { opportunities } from "../db/schema";

export type OpportunityEnhancementPersistencePayload = Partial<
  typeof opportunities.$inferInsert
>;

@Injectable()
export class OpportunityEnhancementReviewRepository {
  async apply(
    id: string,
    expectedUpdatedAt: string,
    payload: OpportunityEnhancementPersistencePayload,
  ): Promise<boolean> {
    const expectedVersion = new Date(expectedUpdatedAt);
    if (Number.isNaN(expectedVersion.getTime())) return false;

    const updated = await db
      .update(opportunities)
      .set({ ...payload, updatedAt: new Date() })
      .where(
        and(
          eq(opportunities.id, id),
          eq(opportunities.updatedAt, expectedVersion),
        ),
      )
      .returning({ id: opportunities.id })
      .execute();

    return updated.length > 0;
  }
}
