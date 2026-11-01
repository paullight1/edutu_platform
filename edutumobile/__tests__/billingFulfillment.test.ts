import { createPurchaseFulfillmentCheck, hasRestoredServerEntitlement } from '../packages/core/src/services/billingFulfillment';
import { toSafeUUID } from '../packages/core/src/utils/auth';

type Row = { status: string; expires_at: string | null };
const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
function setup(rows: Record<string, Row> = {}) {
  let error: Error | null = null;
  const supabase = { from: jest.fn(() => {
    let tier = '';
    const query = {
      select: jest.fn(() => query),
      eq: jest.fn((key, value) => { if (key === 'feature_key') tier = value; return query; }),
      maybeSingle: jest.fn(async () => ({ data: rows[tier] ?? null, error })),
    };
    return query;
  }) };
  return { rows, supabase: supabase as any, fail: () => { error = new Error('offline'); } };
}

it('does not confirm a Pro upgrade from an existing Lite grant; waits for Pro', async () => {
  const { rows, supabase } = setup({ lite: { status: 'active', expires_at: future(7) } });
  const check = await createPurchaseFulfillmentCheck(supabase, 'user_A', 'pro');
  await expect(check()).resolves.toBe(false);
  rows.pro = { status: 'active', expires_at: future(30) };
  await expect(check()).resolves.toBe(true);
});

it('requires an extension for a renewal rather than accepting the old active grant', async () => {
  const { rows, supabase } = setup({ pro: { status: 'active', expires_at: future(7) } });
  const check = await createPurchaseFulfillmentCheck(supabase, 'user_A', 'pro');
  await expect(check()).resolves.toBe(false);
  rows.pro.expires_at = future(37);
  await expect(check()).resolves.toBe(true);
});

it.each(['revoked', 'expired'])('does not confirm a %s grant', async (status) => {
  const { rows, supabase } = setup();
  const check = await createPurchaseFulfillmentCheck(supabase, 'user_A', 'scholar');
  rows.scholar = { status, expires_at: future(30) };
  await expect(check()).resolves.toBe(false);
});

it('fails closed when the pre-purchase snapshot cannot be read', async () => {
  const { supabase, fail } = setup();
  fail();
  await expect(createPurchaseFulfillmentCheck(supabase, 'user_A', 'pro')).rejects.toThrow('offline');
});

it('does not treat invalid or past expiry as fulfillment', async () => {
  const { rows, supabase } = setup();
  const check = await createPurchaseFulfillmentCheck(supabase, 'user_A', 'pro');
  rows.pro = { status: 'active', expires_at: 'invalid' };
  await expect(check()).resolves.toBe(false);
  rows.pro.expires_at = new Date(0).toISOString();
  await expect(check()).resolves.toBe(false);
});

it('accepts an existing active server grant when restoring a matching entitlement', async () => {
  const { supabase } = setup({ pro: { status: 'active', expires_at: future(7) } });
  await expect(hasRestoredServerEntitlement(supabase, 'user_A', ['pro'])).resolves.toBe(true);
  await expect(hasRestoredServerEntitlement(supabase, 'user_A', ['lite'])).resolves.toBe(false);
});

it('does not confirm an expired or unrelated restored entitlement', async () => {
  const { supabase } = setup({ pro: { status: 'active', expires_at: new Date(0).toISOString() } });
  await expect(hasRestoredServerEntitlement(supabase, 'user_A', ['pro', 'unknown'])).resolves.toBe(false);
});

it('finds a server grant stored under the account’s derived UUID', async () => {
  let queriedUser = '';
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn((key, value) => { if (key === 'user_id') queriedUser = value; return query; }),
    maybeSingle: jest.fn(async () => ({
      data: queriedUser === toSafeUUID('user_A') ? { status: 'active', expires_at: future(7) } : null,
      error: null,
    })),
  };
  await expect(hasRestoredServerEntitlement({ from: () => query } as any, 'user_A', ['pro'])).resolves.toBe(true);
});

it('waits for every restored paid tier to be reflected by the server', async () => {
  const { rows, supabase } = setup({ lite: { status: 'active', expires_at: future(7) } });
  await expect(hasRestoredServerEntitlement(supabase, 'user_A', ['lite', 'pro'])).resolves.toBe(false);
  rows.pro = { status: 'active', expires_at: future(7) };
  await expect(hasRestoredServerEntitlement(supabase, 'user_A', ['lite', 'pro'])).resolves.toBe(true);
});
