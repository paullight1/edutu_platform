import AsyncStorage from '@react-native-async-storage/async-storage';
import { toByteArray } from 'base64-js';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com';
const LEGACY_QUEUE_KEY = 'edutu_signal_queue:v1';
const MAX_QUEUE_LENGTH = 500;
const MAX_ATTEMPTS = 8;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 100;

type TokenProvider = () => Promise<string | null | undefined>;
type QueueSession = { userId: string; getToken: TokenProvider };
type QueuedSignal = {
  id: string;
  signal: Record<string, unknown>;
  queuedAt: number;
  attempts: number;
};

let session: QueueSession | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const flushing = new Set<string>();
let storageWork: Promise<unknown> = Promise.resolve();

// Serialize read/modify/write operations so an enqueue during a request cannot
// be overwritten when that request acknowledges its earlier batch.
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = storageWork.then(work);
  storageWork = next.catch(() => undefined);
  return next;
}

function queueKey(userId: string): string {
  return `edutu_signal_queue:v2:${encodeURIComponent(userId)}`;
}

async function loadQueue(userId: string): Promise<QueuedSignal[]> {
  const raw = await AsyncStorage.getItem(queueKey(userId));
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) =>
      typeof entry?.id === 'string' && entry.attempts < MAX_ATTEMPTS &&
      Date.now() - entry.queuedAt < MAX_AGE_MS) : [];
  } catch {
    return [];
  }
}

async function saveQueue(userId: string, queue: QueuedSignal[]): Promise<void> {
  if (queue.length) await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
  else await AsyncStorage.removeItem(queueKey(userId));
}

// This is a local account-matching check, never an authorization decision.
// The API still verifies the token. Refuse delivery if Clerk has switched
// identities while a captured getToken callback was awaiting a refresh.
function tokenSubject(token: string): string | null {
  try {
    const segment = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = toByteArray(segment.padEnd(Math.ceil(segment.length / 4) * 4, '='));
    const json = decodeURIComponent(Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''));
    const claims = JSON.parse(json);
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

export function setSignalQueueSession(userId: string | null, getToken?: TokenProvider): void {
  session = userId && getToken ? { userId, getToken } : null;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  // Old entries have no provable owner; never migrate them to the next login.
  void serialize(() => AsyncStorage.removeItem(LEGACY_QUEUE_KEY)).catch(() => undefined);
}

function scheduleFlush(owner: QueueSession, delay = 1500): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushOwner(owner);
  }, delay);
}

export async function enqueueSignal(
  signal: Record<string, unknown>,
  getAuthToken?: TokenProvider,
  userId?: string,
): Promise<void> {
  const owner = userId && getAuthToken ? { userId, getToken: getAuthToken } : session;
  if (!owner) return; // Guest events must not become a future user's activity.
  try {
    await serialize(async () => {
      const queue = await loadQueue(owner.userId);
      queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, signal, queuedAt: Date.now(), attempts: 0 });
      await saveQueue(owner.userId, queue.slice(-MAX_QUEUE_LENGTH));
    });
    scheduleFlush(owner);
  } catch { /* Advisory analytics must not break the caller. */ }
}

async function flushOwner(owner: QueueSession): Promise<void> {
  if (flushing.has(owner.userId)) return;
  flushing.add(owner.userId);
  try {
    const batch = await serialize(async () => (await loadQueue(owner.userId)).slice(0, BATCH_LIMIT));
    if (!batch.length) return;
    const token = await owner.getToken();
    if (!token || tokenSubject(token) !== owner.userId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    let acknowledged = false;
    try {
      const response = await fetch(`${API_BASE_URL}/opportunities/signals/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ signals: batch.map((entry) => entry.signal) }),
        signal: controller.signal,
      });
      acknowledged = response.ok || response.status === 400 || response.status === 422;
    } catch { /* Keep the batch for a subsequent authenticated retry. */ }
    finally { clearTimeout(timer); }
    const ids = new Set(batch.map((entry) => entry.id));
    const remaining = await serialize(async () => {
      const latest = await loadQueue(owner.userId);
      const next = latest.flatMap((entry) => !ids.has(entry.id) ? [entry]
        : acknowledged ? [] : [{ ...entry, attempts: entry.attempts + 1 }]);
      await saveQueue(owner.userId, next);
      return next.length;
    });
    if (acknowledged && remaining) scheduleFlush(owner, 250);
  } catch { /* Storage/auth errors leave owned entries available for retry. */ }
  finally { flushing.delete(owner.userId); }
}

export async function flushSignalQueue(): Promise<void> {
  if (session) await flushOwner(session);
}

export async function clearSignalQueue(userId: string): Promise<void> {
  await serialize(() => AsyncStorage.removeItem(queueKey(userId)));
}
