import { toSafeUUID } from '../_shared/user-id.ts';

const PAGE_SIZE = 1000;

type StorageEntry = { name: string; id: string | null };
type Bucket = {
  list: (prefix: string, options: { limit: number; offset: number; sortBy: { column: string; order: 'asc' } }) => Promise<{ data: StorageEntry[] | null; error: unknown }>;
  remove: (paths: string[]) => Promise<{ error: unknown }>;
};
type StorageClient = { storage: { from: (bucket: string) => Bucket } };

/** Delete all objects below an exact, server-derived user prefix. */
async function removePrefix(bucket: Bucket, prefix: string): Promise<void> {
  const folders = [prefix];
  while (folders.length) {
    const current = folders.pop()!;
    const objects: string[] = [];
    let offset = 0;
    for (;;) {
      const { data, error } = await bucket.list(current, {
        limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw error;
      if (!data) throw new Error('Storage listing returned no data');
      for (const entry of data) {
        if (!entry.name || entry.name === '.' || entry.name === '..' || entry.name.includes('/')) {
          throw new Error('Invalid storage object name');
        }
        const path = `${current}/${entry.name}`;
        if (entry.id === null) folders.push(path);
        else objects.push(path);
      }
      if (data.length < PAGE_SIZE) break;
      offset += data.length;
    }
    // Do not delete until all pages are listed: deleting earlier pages shifts offsets.
    for (let start = 0; start < objects.length; start += PAGE_SIZE) {
      const { error } = await bucket.remove(objects.slice(start, start + PAGE_SIZE));
      if (error) throw error;
    }
  }
}

export async function removeUserStorage(supabase: StorageClient, userId: string): Promise<void> {
  if (!userId || userId.includes('/') || userId === '.' || userId === '..') {
    throw new Error('Invalid account identifier');
  }
  const safeId = toSafeUUID(userId);
  for (const [bucket, prefix] of [
    ['ai-documents', userId],
    ['cv-files', userId],
    ['creator-applications', `kyc/${safeId}`],
    ['creator-proofs', safeId],
    ['community-assets', `resources/${safeId}`],
  ]) {
    await removePrefix(supabase.storage.from(bucket), prefix);
  }
}
