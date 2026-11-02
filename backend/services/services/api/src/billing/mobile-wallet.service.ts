import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { toDatabaseUserId } from "../common/user-id";

@Injectable()
export class MobileWalletService {
  async wallet(authId: string) {
    if (!authId) throw new UnauthorizedException();
    const id = toDatabaseUserId(authId);
    const profile =
      await db.execute(sql`select credits, login_streak from public.profiles
      where user_id::text in (${authId}, ${id})
      order by (user_id::text = ${authId}) desc limit 1`);
    if (!profile.rows[0]) throw new NotFoundException("Profile not found");
    const history =
      await db.execute(sql`select id, type, amount, description, created_at
      from public.credit_transactions where user_id in (${authId}, ${id})
      order by created_at desc, id desc limit 50`);
    return {
      credits: Number(profile.rows[0].credits),
      loginStreak: Number(profile.rows[0].login_streak ?? 0),
      transactions: history.rows,
    };
  }

  async claim(authId: string, reason: string) {
    if (!authId) throw new UnauthorizedException();
    if (
      !["DAILY_LOGIN", "PROFILE_COMPLETE", "COMPLETE_GOAL"].includes(reason)
    ) {
      throw new BadRequestException(
        "This reward requires a verified domain event",
      );
    }
    const id = toDatabaseUserId(authId);
    return db.transaction(async (tx) => {
      // Serialize claims per account; balance and ledger commit together.
      const result = await tx.execute(sql`select p.user_id::text as user_id,
        coalesce(p.login_streak, 0) as streak, to_jsonb(p) as profile,
        (p.last_daily_credit_at > now() - interval '24 hours') as already_claimed,
        (p.last_daily_credit_at > now() - interval '48 hours') as continues_streak
        from public.profiles p where p.user_id::text in (${authId}, ${id})
        order by (p.user_id::text = ${authId}) desc limit 1 for update`);
      const row = result.rows[0];
      if (!row) throw new NotFoundException("Profile not found");
      const owner = String(row.user_id);
      let streak = Number(row.streak);
      let earned = 5;
      if (reason === "DAILY_LOGIN") {
        if (row.already_claimed) return { earned: 0, streak };
        streak = row.continues_streak ? streak + 1 : 1;
        earned = 1 + (streak % 7 === 0 ? 2 : 0);
      } else {
        const prior =
          await tx.execute(sql`select id from public.credit_transactions
          where user_id in (${authId}, ${id}) and type = 'reward'
          and description = ${"engagement:" + reason}
          and (${reason} = 'PROFILE_COMPLETE' or created_at > now() - interval '24 hours') limit 1`);
        if (prior.rows.length) return { earned: 0, streak };
        if (reason === "PROFILE_COMPLETE") {
          const p = row.profile as Record<string, unknown>;
          if (
            ![p.full_name, p.country, p.school, p.major].every(
              (v) => typeof v === "string" && v.trim(),
            ) ||
            !Array.isArray(p.interests) ||
            !p.interests.length
          ) {
            return { earned: 0, streak };
          }
        } else {
          const evidence = await tx.execute(sql`select id from public.goals
            where user_id::text in (${authId}, ${id}) and status = 'completed'
            and completed_at > now() - interval '24 hours' limit 1`);
          if (!evidence.rows.length) return { earned: 0, streak };
        }
      }
      if (reason === "DAILY_LOGIN") {
        await tx.execute(sql`update public.profiles set credits = credits + ${earned},
          login_streak = ${streak}, last_daily_credit_at = now()
          where user_id::text = ${owner}`);
      } else {
        await tx.execute(
          sql`update public.profiles set credits = credits + ${earned} where user_id::text = ${owner}`,
        );
      }
      await tx.execute(sql`insert into public.credit_transactions (user_id, amount, type, description)
        values (${owner}, ${earned}, 'reward', ${reason === "DAILY_LOGIN" ? "Daily login" : "engagement:" + reason})`);
      return { earned, streak };
    });
  }
}
