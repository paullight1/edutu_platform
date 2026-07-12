import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Durable, batched delivery for behavioral signals.
 *
 * Signals used to be one fire-and-forget fetch each: any auth hiccup, offline
 * window, or app kill silently dropped them — and the recommendation engine
 * learns only from what actually lands. This queue persists every signal to
 * AsyncStorage, coalesces bursts (impression beacons emit one entry per card)
 * into a single POST /opportunities/signals/batch, and retries with the queue
 * surviving restarts.
 *
 * Retention is deliberately short (24h): behavioral signals lose value fast,
 * and a short window bounds the odd case of a queued signal outliving the
 * session that produced it.
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com';
const QUEUE_KEY = 'edutu_signal_queue:v1';
const MAX_QUEUE_LENGTH = 500;
const MAX_ATTEMPTS = 8;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FLUSH_DEBOUNCE_MS = 1500;
const BATCH_LIMIT = 100;

type QueuedSignal = {
  signal: Record<string, unknown>;
  queuedAt: number;
  attempts: number;
};

type TokenProvider = () => Promise<string | null | undefined>;

let tokenProvider: TokenProvider | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

async function loadQueue(): Promise<QueuedSignal[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedSignal[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedSignal[]): Promise<void> {
  try {
    if (queue.length === 0) {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } else {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
  } catch {
    // Storage failures degrade to fire-and-forget — never break the caller.
  }
}

function isDeliverable(entry: QueuedSignal, now: number): boolean {
  return entry.attempts < MAX_ATTEMPTS && now - entry.queuedAt < MAX_AGE_MS;
}

function scheduleFlush(delayMs = FLUSH_DEBOUNCE_MS): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushSignalQueue();
  }, delayMs);
}

/**
 * Persists a signal and schedules a (debounced) batch flush. The most recent
 * token provider wins — signals always post under the current session.
 */
export async function enqueueSignal(
  signal: Record<string, unknown>,
  getAuthToken?: TokenProvider,
): Promise<void> {
  if (getAuthToken) {
    tokenProvider = getAuthToken;
  }

  const queue = await loadQueue();
  queue.push({ signal, queuedAt: Date.now(), attempts: 0 });
  while (queue.length > MAX_QUEUE_LENGTH) {
    queue.shift();
  }
  await saveQueue(queue);
  scheduleFlush();
}

/**
 * Attempts delivery of everything queued. Safe to call from app-foreground /
 * connectivity-restored hooks; concurrent calls collapse into one flush.
 */
export async function flushSignalQueue(getAuthToken?: TokenProvider): Promise<void> {
  if (getAuthToken) {
    tokenProvider = getAuthToken;
  }
  if (flushing || !API_BASE_URL || !tokenProvider) return;
  flushing = true;

  try {
    const now = Date.now();
    const queue = (await loadQueue()).filter((entry) => isDeliverable(entry, now));
    if (queue.length === 0) {
      await saveQueue(queue);
      return;
    }

    const token = await tokenProvider();
    if (!token) {
      // No session right now (mid-refresh, signed out). Keep the queue; the
      // next enqueue/foreground flush retries with a fresh token.
      await saveQueue(queue);
      return;
    }

    const batch = queue.slice(0, BATCH_LIMIT);
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/opportunities/signals/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ signals: batch.map((entry) => entry.signal) }),
      });
    } catch {
      // Network failure: count the attempt and retry later.
      batch.forEach((entry) => {
        entry.attempts += 1;
      });
      await saveQueue(queue);
      return;
    }

    if (response.ok) {
      const remaining = queue.slice(batch.length);
      await saveQueue(remaining);
      if (remaining.length > 0) scheduleFlush(250);
      return;
    }

    if (response.status === 400 || response.status === 422) {
      // The server rejected the payload itself — retrying the same batch
      // would wedge the queue forever. Drop it and keep the rest moving.
      await saveQueue(queue.slice(batch.length));
      return;
    }

    // Auth/5xx: keep everything, count the attempt.
    batch.forEach((entry) => {
      entry.attempts += 1;
    });
    await saveQueue(queue);
  } finally {
    flushing = false;
  }
}

/** Drops all queued signals (e.g. on sign-out). */
export async function clearSignalQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    // Ignore.
  }
}
