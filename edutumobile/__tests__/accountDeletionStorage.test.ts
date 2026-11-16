import { removeUserStorage } from '../supabase/functions/delete-account/storage';
import { toSafeUUID } from '../packages/core/src/utils/auth';
import { toSafeUUID as edgeSafeUUID } from '../supabase/functions/_shared/user-id';

type Entry = { name: string; id: string | null };

test('Edge Function identity mapping matches the mobile uploader', () => {
  for (const id of ['user_test123', 'user_other', 'a2a0f217-655b-4ddf-9fb2-65877b367281']) {
    expect(edgeSafeUUID(id)).toBe(toSafeUUID(id));
  }
});

function fakeStorage(initial: Record<string, string[]>) {
  const objects = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, new Set(v)]));
  return {
    objects,
    storage: {
      from(bucket: string) {
        return {
          async list(prefix: string, options: { limit?: number; offset?: number } = {}) {
            const entries = new Map<string, Entry>();
            for (const path of objects[bucket] ?? []) {
              if (!path.startsWith(prefix + '/')) continue;
              const rest = path.slice(prefix.length + 1);
              const [name, ...nested] = rest.split('/');
              entries.set(name, { name, id: nested.length ? null : 'object-id' });
            }
            const all = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
            const offset = options.offset ?? 0;
            return { data: all.slice(offset, offset + (options.limit ?? 100)), error: null };
          },
          async remove(paths: string[]) {
            paths.forEach(path => objects[bucket]?.delete(path));
            return { data: paths, error: null };
          },
        };
      },
    },
  };
}

test('removes only the authenticated user’s creator KYC and document files, including nested and paginated objects', async () => {
  const user = 'user_test123';
  const safe = toSafeUUID(user);
  const other = toSafeUUID('user_other');
  const many = Array.from({ length: 1002 }, (_, i) => `${user}/file-${String(i).padStart(4, '0')}.pdf`);
  const db = fakeStorage({
    'ai-documents': [...many, `${user}/nested/file.pdf`, 'user_other/keep.pdf'],
    'cv-files': [`${user}/cv.pdf`, 'user_other/keep.pdf'],
    'creator-applications': [`kyc/${safe}/identity.jpg`, `kyc/${safe}/nested/identity2.jpg`, `kyc/${other}/keep.jpg`],
    'creator-proofs': [`${safe}/2026-01-01/proof.pdf`, `${other}/keep.pdf`],
    'community-assets': [`resources/${safe}/asset.jpg`, `resources/${other}/keep.jpg`],
  });
  await removeUserStorage(db, user);
  expect([...db.objects['ai-documents']]).toEqual(['user_other/keep.pdf']);
  expect([...db.objects['creator-applications']]).toEqual([`kyc/${other}/keep.jpg`]);
  expect([...db.objects['cv-files']]).toEqual(['user_other/keep.pdf']);
  expect([...db.objects['creator-proofs']]).toEqual([`${other}/keep.pdf`]);
  expect([...db.objects['community-assets']]).toEqual([`resources/${other}/keep.jpg`]);
});

test('propagates a storage listing failure so deletion cannot report success', async () => {
  const db = { storage: { from: () => ({ list: async () => ({ data: null, error: new Error('unavailable') }) }) } };
  await expect(removeUserStorage(db, 'user_test123')).rejects.toThrow('unavailable');
});
