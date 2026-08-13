import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

class BillingUnavailableError extends Error {
  readonly code = "billing_unavailable";
}

type Consumer = {
  id: string;
  ownerUserId: string;
  requestId: string;
};

function idempotencyKey(consumer: Consumer) {
  return `api:${consumer.id}:${consumer.ownerUserId}:${consumer.requestId}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isMatchingLedgerRow(
  row: Record<string, unknown> | undefined,
  consumer: Consumer,
  key: string,
) {
  return Boolean(
    row &&
    String(row.user_id) === consumer.ownerUserId &&
    row.api_consumer_id === consumer.id &&
    Number(row.amount) === -1 &&
    row.type === "spend" &&
    row.related_type === "api_request" &&
    row.related_id === key &&
    row.api_request_idempotency_key === key,
  );
}

async function reserveRequestCredit(
  database: PGlite,
  consumer: Consumer,
): Promise<{ balance: number; exhausted: boolean }> {
  const key = idempotencyKey(consumer);
  await database.exec("begin");

  try {
    const legacy = await database.query<{ id: number }>(
      `select id
       from public.credit_transactions
       where related_type = 'api_request'
         and related_id = $1
         and api_request_idempotency_key is null
       limit 2`,
      [consumer.requestId],
    );
    if (legacy.rows.length > 0) throw new BillingUnavailableError();

    const claim = await database.query<{ id: number }>(
      `insert into public.credit_transactions
        (
          user_id,
          amount,
          type,
          description,
          related_id,
          related_type,
          api_consumer_id,
          api_request_idempotency_key
        )
       values ($1, -1, 'spend', $2, $2, 'api_request', $3, $2)
       on conflict (
         related_type,
         api_consumer_id,
         user_id,
         api_request_idempotency_key
       )
         where related_type = 'api_request'
           and api_consumer_id is not null
           and api_request_idempotency_key is not null
       do nothing
       returning id`,
      [consumer.ownerUserId, key, consumer.id],
    );

    if (claim.rows.length === 0) {
      const duplicate = await database.query<Record<string, unknown>>(
        `select
           id,
           user_id,
           api_consumer_id,
           amount,
           type,
           related_id,
           related_type,
           api_request_idempotency_key
         from public.credit_transactions
         where related_type = 'api_request'
           and api_request_idempotency_key = $1
         limit 2`,
        [key],
      );
      if (
        duplicate.rows.length !== 1 ||
        !isMatchingLedgerRow(duplicate.rows[0], consumer, key)
      ) {
        throw new BillingUnavailableError();
      }

      const profile = await database.query<{ credits: number }>(
        `select credits from public.profiles where user_id = $1 limit 1`,
        [consumer.ownerUserId],
      );
      const balance = Number(profile.rows[0]?.credits);
      if (
        profile.rows.length !== 1 ||
        !Number.isInteger(balance) ||
        balance < 0
      ) {
        throw new BillingUnavailableError();
      }

      await database.exec("commit");
      return { balance, exhausted: false };
    }

    const decremented = await database.query<{ credits: number }>(
      `update public.profiles
       set credits = credits - 1
       where user_id = $1 and credits > 0
       returning credits`,
      [consumer.ownerUserId],
    );
    if (decremented.rows.length !== 1) {
      throw new BillingUnavailableError();
    }

    const balance = Number(decremented.rows[0]?.credits);
    if (!Number.isInteger(balance) || balance < 0) {
      throw new BillingUnavailableError();
    }

    await database.exec("commit");
    return { balance, exhausted: false };
  } catch (error) {
    await database.exec("rollback");
    throw error;
  }
}

async function expectBillingUnavailable(
  operation: Promise<unknown>,
  label: string,
) {
  try {
    await operation;
  } catch (error) {
    assert(
      error instanceof BillingUnavailableError &&
        error.code === "billing_unavailable",
      `${label} returned an unexpected error: ${String(error)}`,
    );
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function main() {
  const database = new PGlite();
  try {
    await database.exec(`
      create table public.profiles (
        user_id text primary key,
        credits integer not null default 0
      );
      create table public.credit_transactions (
        id bigint generated always as identity primary key,
        user_id text not null,
        amount integer not null,
        type text not null,
        description text,
        related_id text,
        related_type text,
        metadata jsonb not null default '{}'::jsonb
      );
      insert into public.profiles (user_id, credits)
      values ('owner-a', 1), ('owner-b', 1), ('owner-malformed', 2);
    `);

    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260813150000_api_request_idempotency_scope.sql",
    );
    await database.exec(readFileSync(migrationPath, "utf8"));

    const consumerA: Consumer = {
      id: "consumer-a",
      ownerUserId: "owner-a",
      requestId: "shared-request-1",
    };
    const consumerB: Consumer = {
      id: "consumer-b",
      ownerUserId: "owner-b",
      requestId: "shared-request-1",
    };
    const malformedConsumer: Consumer = {
      id: "consumer-malformed",
      ownerUserId: "owner-malformed",
      requestId: "malformed-request-1",
    };

    assert(
      (await reserveRequestCredit(database, consumerA)).balance === 0,
      "consumer A was not charged once",
    );
    assert(
      (await reserveRequestCredit(database, consumerB)).balance === 0,
      "consumer B was not charged independently",
    );
    const retry = await reserveRequestCredit(database, consumerA);
    assert(retry.balance === 0 && !retry.exhausted, "exact retry was not free");

    assert(
      (
        await database.query<{ entries: number }>(
          `select count(*)::integer as entries
           from public.credit_transactions
           where related_type = 'api_request'`,
        )
      ).rows[0]?.entries === 2,
      "same request ID did not produce exactly two scoped ledger rows",
    );

    assert(
      (
        await database.query<{ credits: number }>(
          `select credits from public.profiles where user_id in ('owner-a', 'owner-b') order by user_id`,
        )
      ).rows.every((row) => Number(row.credits) === 0),
      "retry changed a charged owner's balance",
    );

    await reserveRequestCredit(database, malformedConsumer);
    await database.query(
      `update public.credit_transactions
       set related_id = 'malformed-related-id'
       where api_request_idempotency_key = $1`,
      [idempotencyKey(malformedConsumer)],
    );
    await expectBillingUnavailable(
      reserveRequestCredit(database, malformedConsumer),
      "malformed duplicate",
    );

    const mismatchedConsumer: Consumer = {
      id: "consumer-mismatch",
      ownerUserId: "owner-malformed",
      requestId: "mismatched-request-1",
    };
    await reserveRequestCredit(database, mismatchedConsumer);
    await database.query(
      `update public.credit_transactions
       set api_consumer_id = 'different-consumer'
       where api_request_idempotency_key = $1`,
      [idempotencyKey(mismatchedConsumer)],
    );
    await expectBillingUnavailable(
      reserveRequestCredit(database, mismatchedConsumer),
      "mismatched duplicate",
    );

    const malformedState = await database.query<{
      credits: number;
      entries: number;
    }>(`
      select
        (select credits from public.profiles where user_id = 'owner-malformed') as credits,
        (select count(*)::integer from public.credit_transactions where user_id = 'owner-malformed') as entries
    `);
    assert(
      Number(malformedState.rows[0]?.credits) === 0 &&
        malformedState.rows[0]?.entries === 2,
      "malformed duplicate changed balance or ledger count",
    );

    process.stdout.write(
      "scoped API idempotency charges isolated; exact retry ignored; malformed/mismatched duplicates rejected\n",
    );
  } finally {
    await database.close();
  }
}

void main();
