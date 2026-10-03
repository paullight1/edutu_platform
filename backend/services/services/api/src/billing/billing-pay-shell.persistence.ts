import { Inject, Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import { toDatabaseUserId } from "../common/user-id";

export const BILLING_PAY_SHELL_DATABASE = Symbol("BILLING_PAY_SHELL_DATABASE");
export type PayShellRecord = {
  userId: string;
  environment: string;
  intentId: string | null;
  destination: "checkout" | "result" | "account";
  checkoutUrl: string | null;
  expiresAt: Date;
};
export type PayShellDatabase = {
  execute(query: SQL): Promise<{ rows?: any[] }>;
};

@Injectable()
export class BillingPayShellPersistence {
  constructor(
    @Inject(BILLING_PAY_SHELL_DATABASE)
    private readonly database: PayShellDatabase,
  ) {}

  async ready(): Promise<boolean> {
    try {
      const result = await this.database.execute(sql`
        select to_regclass('public.billing_pay_shell_codes') is not null
          and to_regclass('public.billing_pay_shell_sessions') is not null as ready
      `);
      if (result.rows?.[0]?.ready !== true) return false;
      // Probe the actual columns/permissions, not only migration table names.
      await this.database.execute(
        sql`select code_hash, environment, user_id, intent_id, destination, checkout_url, consumed_at, expires_at from billing_pay_shell_codes limit 0`,
      );
      await this.database.execute(
        sql`select session_hash, environment, user_id, intent_id, destination, checkout_url, revoked_at, expires_at from billing_pay_shell_sessions limit 0`,
      );
      return true;
    } catch {
      return false;
    }
  }

  async issue(input: PayShellRecord & { codeHash: string }): Promise<void> {
    await this.database.execute(sql`
      insert into billing_pay_shell_codes
        (code_hash, environment, user_id, intent_id, destination, checkout_url, expires_at)
      values (${input.codeHash}, ${input.environment}, ${input.userId}, ${input.intentId}::uuid,
        ${input.destination}, ${input.checkoutUrl}, ${input.expiresAt})
    `);
  }

  // The UPDATE locks the matching row; consuming and minting are one statement.
  // Failed session insertion rolls back consumption. Concurrent callers cannot
  // exchange the same code, even across API replicas.
  async exchange(
    codeHash: string,
    sessionHash: string,
    expiresAt: Date,
    now: Date,
    environment: string,
  ): Promise<PayShellRecord | null> {
    const result = await this.database.execute(sql`
      with consumed as (
        update billing_pay_shell_codes set consumed_at = ${now}
        where code_hash = ${codeHash} and environment = ${environment} and consumed_at is null and expires_at > ${now}
        returning user_id, environment, intent_id, destination, checkout_url
      )
      insert into billing_pay_shell_sessions
        (session_hash, environment, user_id, intent_id, destination, checkout_url, expires_at)
      select ${sessionHash}, environment, user_id, intent_id, destination, checkout_url, ${expiresAt}
      from consumed
      returning user_id, environment, intent_id, destination, checkout_url, expires_at
    `);
    return this.map(result.rows?.[0]);
  }

  async session(
    sessionHash: string,
    now: Date,
  ): Promise<PayShellRecord | null> {
    const result = await this.database.execute(sql`
      select user_id, environment, intent_id, destination, checkout_url, expires_at
      from billing_pay_shell_sessions
      where session_hash = ${sessionHash} and expires_at > ${now} and revoked_at is null
      limit 1
    `);
    return this.map(result.rows?.[0]);
  }

  async account(userId: string, environment: string) {
    const databaseUserId = toDatabaseUserId(userId);
    const result = await this.database.execute(sql`
      select case when provider = 'bachs' then 'bachs'
                  when provider_store = 'PLAY_STORE' then 'play_store'
                  when provider_store = 'APP_STORE' then 'app_store' end as provider,
             case when current_period_end <= now() then 'expired'
                  when status in ('past_due', 'billing_issue', 'grace_period') then 'past_due'
                  when status in ('cancelled', 'canceled') then 'cancelled'
                  when status = 'active' then 'active' else 'expired' end as status,
             current_period_end as paid_through, 'recurring' as renewal_mode,
             id::text as support_reference
      from billing_provider_subscriptions
      where user_id in (${userId}, ${databaseUserId}) and environment = ${environment}
        and (provider = 'bachs' or provider_store in ('APP_STORE', 'PLAY_STORE'))
      union all
      select 'one_time_pass',
             case when revoked_at is not null or status <> 'active' then 'cancelled'
                  when valid_from > now() or valid_until <= now() then 'expired' else 'active' end,
             valid_until, 'one_time', id::text
      from billing_entitlement_grants
      where user_id in (${userId}, ${databaseUserId}) and environment = ${environment}
        and source_kind <> 'subscription' and provider in ('bachs', 'paystack')
      union all
      select 'credits', 'active', null::timestamptz, 'one_time', id::text
      from billing_checkout_intents
      where user_id = ${userId} and environment = ${environment} and status = 'fulfilled'
        and product_snapshot->>'fulfillmentKind' in ('credits', 'credit_pack')
      limit 100
    `);
    return (result.rows ?? [])
      .filter((row) => row.provider)
      .map((row) => ({
        provider: String(row.provider),
        status: String(row.status),
        ...(row.paid_through
          ? { paidThrough: new Date(row.paid_through).toISOString() }
          : {}),
        renewalMode: String(row.renewal_mode),
        supportReference: String(row.support_reference),
      }));
  }

  private map(row: any): PayShellRecord | null {
    return row
      ? {
          userId: String(row.user_id),
          environment: String(row.environment),
          intentId: row.intent_id ? String(row.intent_id) : null,
          destination: row.destination,
          checkoutUrl: row.checkout_url ?? null,
          expiresAt: new Date(row.expires_at),
        }
      : null;
  }
}
