import { getProductApiToken, type ClerkTokenGetter } from "../lib/clerkToken";
import { productApiRequest } from "./productApi";

/**
 * Durable, batched delivery for behavioral signals (web twin of the mobile
 * signalQueue). Signals persist to localStorage, coalesce into one
 * POST /opportunities/signals/batch, and retry on the next flush trigger
 * (enqueue, tab regaining connectivity, interval) — an auth hiccup or a
 * closed tab no longer silently drops what the recommendation engine most
 * needs to learn from.
 */

const QUEUE_KEY = "edutu:signalQueue:v1";
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

let tokenGetter: ClerkTokenGetter | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let listenersBound = false;

function loadQueue(): QueuedSignal[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedSignal[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedSignal[]): void {
  try {
    if (queue.length === 0) {
      window.localStorage.removeItem(QUEUE_KEY);
    } else {
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
  } catch {
    // Storage full/blocked: degrade to fire-and-forget.
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

function bindListenersOnce(): void {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("online", () => scheduleFlush(500));
}

/** Persists a signal and schedules a (debounced) batch flush. */
export function enqueueSignal(
  signal: Record<string, unknown>,
  getToken?: ClerkTokenGetter,
): void {
  if (getToken) tokenGetter = getToken;
  bindListenersOnce();

  const queue = loadQueue();
  queue.push({ signal, queuedAt: Date.now(), attempts: 0 });
  while (queue.length > MAX_QUEUE_LENGTH) queue.shift();
  saveQueue(queue);
  scheduleFlush();
}

/** Attempts delivery of everything queued; concurrent calls collapse. */
export async function flushSignalQueue(getToken?: ClerkTokenGetter): Promise<void> {
  if (getToken) tokenGetter = getToken;
  if (flushing || !tokenGetter) return;
  flushing = true;

  try {
    const now = Date.now();
    const queue = loadQueue().filter((entry) => isDeliverable(entry, now));
    if (queue.length === 0) {
      saveQueue(queue);
      return;
    }

    const token = await getProductApiToken(tokenGetter);
    if (!token) {
      saveQueue(queue);
      return;
    }

    const batch = queue.slice(0, BATCH_LIMIT);
    try {
      await productApiRequest<unknown>("/opportunities/signals/batch", token, {
        method: "POST",
        body: JSON.stringify({ signals: batch.map((entry) => entry.signal) }),
      });
      const remaining = queue.slice(batch.length);
      saveQueue(remaining);
      if (remaining.length > 0) scheduleFlush(250);
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 400 || status === 422) {
        // Invalid payload would wedge the queue forever — drop the batch.
        saveQueue(queue.slice(batch.length));
      } else {
        batch.forEach((entry) => {
          entry.attempts += 1;
        });
        saveQueue(queue);
      }
    }
  } finally {
    flushing = false;
  }
}

/** Drops all queued signals (e.g. on sign-out). */
export function clearSignalQueue(): void {
  try {
    window.localStorage.removeItem(QUEUE_KEY);
  } catch {
    // Ignore.
  }
}
