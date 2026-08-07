import { Injectable } from "@nestjs/common";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { notificationPushTokens } from "../db/schema";
import type { RegisterPushTokenDto } from "./dto/notification.dto";

export const PUSH_TOKEN_STORE = Symbol("PUSH_TOKEN_STORE");

export interface PushTokenStore {
  claim(userId: string, token: string, dto: RegisterPushTokenDto): Promise<any>;
  listForUsers(
    userIds: string[],
  ): Promise<Array<typeof notificationPushTokens.$inferSelect>>;
  deleteByIds(ids: string[]): Promise<void>;
}

@Injectable()
export class DrizzlePushTokenStore implements PushTokenStore {
  listForUsers(userIds: string[]) {
    if (!userIds.length) return Promise.resolve([]);
    return db
      .select()
      .from(notificationPushTokens)
      .where(inArray(notificationPushTokens.userId, userIds));
  }

  async deleteByIds(ids: string[]) {
    if (!ids.length) return;
    await db
      .delete(notificationPushTokens)
      .where(inArray(notificationPushTokens.id, ids));
  }

  claim(userId: string, token: string, dto: RegisterPushTokenDto) {
    const provider = dto.provider || "expo";
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`push-token:${provider}:${token}`}))`,
      );
      // A physical device token belongs to the account currently registering
      // it. Account switches must not leave the old owner ringable.
      await tx
        .delete(notificationPushTokens)
        .where(
          and(
            eq(notificationPushTokens.provider, provider),
            eq(notificationPushTokens.token, token),
            ne(notificationPushTokens.userId, userId),
          ),
        );
      const [existing] = await tx
        .select()
        .from(notificationPushTokens)
        .where(
          and(
            eq(notificationPushTokens.userId, userId),
            eq(notificationPushTokens.token, token),
          ),
        )
        .limit(1);
      if (existing) {
        const [updated] = await tx
          .update(notificationPushTokens)
          .set({
            provider,
            device: dto.device || existing.device || {},
            lastSeenAt: new Date(),
          })
          .where(eq(notificationPushTokens.id, existing.id))
          .returning();
        return updated;
      }
      const [created] = await tx
        .insert(notificationPushTokens)
        .values({
          userId,
          provider,
          token,
          device: dto.device || {},
          lastSeenAt: new Date(),
        })
        .returning();
      return created;
    });
  }
}
