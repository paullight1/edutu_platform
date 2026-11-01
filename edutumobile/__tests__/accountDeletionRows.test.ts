import { deleteUserRows } from '../supabase/functions/delete-account/rows';
import { toSafeUUID } from '../packages/core/src/utils/auth';

test('deletes raw and derived identities from text fields and uses UUID for UUID fields', async () => {
  const user = 'user_delete_test';
  const safe = toSafeUUID(user);
  const records: Record<string, { type: 'text' | 'uuid'; ids: string[] }> = {
    goals: { type: 'text', ids: [user, safe, 'user_other'] },
    flashcard_decks: { type: 'uuid', ids: [safe, toSafeUUID('user_other')] },
    ai_documents: { type: 'text', ids: [user, 'user_other'] },
  };
  const db = { from: (table: string) => ({ delete: () => ({ eq: async (_column: string, value: string) => {
    const entry = records[table];
    if (table === 'creator-applications') return { error: { code: 'PGRST205' } };
    if (!entry) return { error: null };
    if (entry.type === 'uuid' && !/^[0-9a-f-]{36}$/i.test(value)) return { error: { code: '22P02', message: `invalid input syntax for type uuid: "${value}"` } };
    entry.ids = entry.ids.filter(id => id !== value);
    return { error: null };
  } }) }) };
  await deleteUserRows(db, user);
  expect(records.goals.ids).toEqual(['user_other']);
  expect(records.flashcard_decks.ids).toEqual([toSafeUUID('user_other')]);
  expect(records.ai_documents.ids).toEqual(['user_other']);
});

test('does not report success when a current data table is missing', async () => {
  const db = { from: () => ({ delete: () => ({ eq: async () => ({ error: { code: 'PGRST205' } }) }) }) };
  await expect(deleteUserRows(db, 'user_delete_test')).rejects.toMatchObject({ code: 'PGRST205' });
});

test('does not blindly delete financial records or shared group and listing parents', async () => {
  const tables: string[] = [];
  const db = { from: (table: string) => {
    tables.push(table);
    return { delete: () => ({ eq: async () => ({ error: null }) }) };
  } };
  await deleteUserRows(db, 'user_delete_test');
  for (const table of ['payment_transactions', 'billing_transactions', 'credit_purchases', 'community_groups', 'marketplace_listings']) {
    expect(tables).not.toContain(table);
  }
});
