import { sql, type SQL } from "drizzle-orm";

export const CREDIT_PACK_LEDGER_RELATED_TYPE = "credit_pack" as const;

type CreditPurchaseLedgerInput = {
  userId: string;
  credits: number;
  description: string;
  reference: string;
  relatedType: typeof CREDIT_PACK_LEDGER_RELATED_TYPE | "api_credit_purchase";
};

export function buildCreditPurchaseLedgerInsert(
  input: CreditPurchaseLedgerInput,
): SQL {
  if (input.relatedType === CREDIT_PACK_LEDGER_RELATED_TYPE) {
    return sql`
      insert into credit_transactions
        (user_id, amount, type, description, related_id, related_type)
      values
        (${input.userId}, ${input.credits}, 'purchase',
         ${input.description}, ${input.reference}, 'credit_pack')
      on conflict (related_type, related_id)
        where related_id is not null
          and related_type = 'credit_pack'
      do nothing
      returning id
    `;
  }

  return sql`
    insert into credit_transactions
      (user_id, amount, type, description, related_id, related_type)
    values
      (${input.userId}, ${input.credits}, 'purchase',
       ${input.description}, ${input.reference}, 'api_credit_purchase')
    on conflict (related_type, related_id)
      where related_id is not null
        and related_type in ('api_request', 'api_credit_purchase')
    do nothing
    returning id
  `;
}

export function buildCreditPurchaseProfileUpdate(input: {
  userId: string;
  credits: number;
}): SQL {
  return sql`
    update profiles set credits = credits + ${input.credits}, updated_at = now()
    where user_id = ${input.userId}
  `;
}

type CreditLedgerTransaction = {
  execute(statement: SQL): Promise<{ rows?: unknown[] }>;
};

export async function recordCreditPurchaseInTransaction(
  transaction: CreditLedgerTransaction,
  input: CreditPurchaseLedgerInput,
): Promise<boolean> {
  await transaction.execute(
    sql`select set_config('app.credit_op', 'on', true)`,
  );
  const inserted = await transaction.execute(
    buildCreditPurchaseLedgerInsert(input),
  );
  if ((inserted.rows ?? []).length === 0) return false;

  await transaction.execute(
    buildCreditPurchaseProfileUpdate({
      userId: input.userId,
      credits: input.credits,
    }),
  );
  return true;
}
