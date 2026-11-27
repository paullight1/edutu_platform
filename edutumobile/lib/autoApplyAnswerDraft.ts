import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const draftLifetime = 7 * 24 * 60 * 60 * 1000;
type AnswerDraft = { version: number; answer: string; expiresAt: number };
const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
let pending: Promise<unknown> = Promise.resolve();

function run<T>(owner: string | null, attemptId: string | undefined, operation: (key: string) => Promise<T>) {
  if (Platform.OS === 'web' || !owner || !attemptId ||
      !/^[a-z0-9_-]+$/i.test(owner) || !/^[a-z0-9_-]+$/i.test(attemptId)) {
    return Promise.resolve(undefined);
  }
  const key = 'edutu.autoApply.answer.' + owner + '.' + attemptId;
  const next = pending.then(() => operation(key)).catch(() => undefined);
  pending = next;
  return next;
}

async function read(key: string): Promise<AnswerDraft | undefined> {
  const raw = await SecureStore.getItemAsync(key, options);
  if (!raw) return;
  let draft: Partial<AnswerDraft> | null = null;
  try { draft = JSON.parse(raw); } catch { /* Remove unreadable local data. */ }
  if (draft && typeof draft.answer === 'string' && draft.answer.length <= 4000 &&
      typeof draft.version === 'number' && Number.isSafeInteger(draft.version) && draft.version > 0 &&
      typeof draft.expiresAt === 'number' && draft.expiresAt > Date.now()) return draft as AnswerDraft;
  await SecureStore.deleteItemAsync(key, options);
}

export function readAutoApplyAnswer(owner: string | null, attemptId: string | undefined, version: number) {
  return run(owner, attemptId, async key => {
    const draft = await read(key);
    if (draft?.version === version) return draft.answer;
    if (draft && draft.version < version) await SecureStore.deleteItemAsync(key, options);
  });
}

export function writeAutoApplyAnswer(owner: string | null, attemptId: string | undefined, version: number, answer: string) {
  return run(owner, attemptId, async key => {
    const draft = await read(key);
    if (draft && draft.version > version) return;
    if (!answer.trim()) {
      if (draft) await SecureStore.deleteItemAsync(key, options);
    } else if (answer.length <= 4000) {
      await SecureStore.setItemAsync(key, JSON.stringify({ version, answer, expiresAt: Date.now() + draftLifetime }), options);
    }
  });
}

export function clearAutoApplyAnswer(owner: string | null, attemptId: string | undefined, throughVersion: number) {
  return run(owner, attemptId, async key => {
    const draft = await read(key);
    if (draft && draft.version <= throughVersion) await SecureStore.deleteItemAsync(key, options);
  });
}
