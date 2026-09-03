import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl, type GetAuthToken } from "./productApi";
import type {
  OpportunityHomeResponse,
  OpportunityIntentView,
  OpportunityJourneyMutationResult,
  OpportunityJourneyReadResult,
  OpportunityJourneyState,
  OpportunityJourneyView,
  OpportunityPublicStage,
  QueuedOpportunityJourneyWrite,
} from "../types/opportunityJourney";

const DEFAULT_TIMEOUT_MS = 15_000;
const SNAPSHOT_PREFIX = "opportunity-journey:snapshot:v1";
const QUEUE_KEY = "opportunity-journey:write-queue:v1";

export interface OpportunityJourneyErrorBody {
  code?: string;
  message?: string;
  currentJourney?: OpportunityJourneyView["journey"];
  [key: string]: unknown;
}

export class OpportunityJourneyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: OpportunityJourneyErrorBody,
  ) {
    super(message);
    this.name = "OpportunityJourneyApiError";
  }
}

function snapshotKey(userId: string, resource: string): string {
  return `${SNAPSHOT_PREFIX}:${userId}:${resource}`;
}

function boundedLimit(value = 3): number {
  return Math.min(Math.max(Math.trunc(value || 3), 1), 5);
}

async function tokenWithTimeout(
  getAuthToken: GetAuthToken,
  timeoutMs: number,
): Promise<string> {
  const token = await Promise.race([
    getAuthToken(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  if (!token) throw new Error("A current authentication token is required.");
  return token;
}

async function request<T>(
  path: string,
  options: RequestInit,
  getAuthToken: GetAuthToken,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = await tokenWithTimeout(getAuthToken, timeoutMs);
    const hasBody = options.body !== undefined && options.body !== null;
    const response = await fetch(
      `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`,
      {
        ...options,
        headers: {
          Accept: "application/json",
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...(options.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
        signal: options.signal ?? controller.signal,
      },
    );

    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => ({}))) as OpportunityJourneyErrorBody;
      throw new OpportunityJourneyApiError(
        typeof body.message === "string"
          ? body.message
          : `Opportunity journey request failed with ${response.status}`,
        response.status,
        body,
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function readSnapshot<T>(
  userId: string,
  resource: string,
): Promise<T | null> {
  const raw = await AsyncStorage.getItem(snapshotKey(userId, resource));
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { data?: T }).data ?? null;
  } catch {
    return null;
  }
}

async function writeSnapshot<T>(
  userId: string,
  resource: string,
  data: T,
): Promise<void> {
  await AsyncStorage.setItem(
    snapshotKey(userId, resource),
    JSON.stringify({ savedAt: new Date().toISOString(), data }),
  );
}

export async function clearOpportunityJourneySnapshots(
  userId: string,
): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const prefix = `${SNAPSHOT_PREFIX}:${userId}:`;
  const matching = keys.filter((key) => key.startsWith(prefix));
  if (matching.length > 0) await AsyncStorage.multiRemove(matching);
}

async function readQueue(): Promise<QueuedOpportunityJourneyWrite[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const values = JSON.parse(raw) as unknown;
    return Array.isArray(values)
      ? (values as QueuedOpportunityJourneyWrite[])
      : [];
  } catch {
    return [];
  }
}

async function writeQueue(
  values: QueuedOpportunityJourneyWrite[],
): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(values));
}

export function createOpportunityJourneyIdempotencyKey(prefix: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

export async function queueOpportunityJourneyWrite(
  input: Omit<QueuedOpportunityJourneyWrite, "id" | "createdAt" | "attempts">,
): Promise<QueuedOpportunityJourneyWrite> {
  const queue = await readQueue();
  const existing = queue.find(
    (item) =>
      item.userId === input.userId &&
      item.idempotencyKey === input.idempotencyKey,
  );
  if (existing) return existing;

  const created: QueuedOpportunityJourneyWrite = {
    ...input,
    id: createOpportunityJourneyIdempotencyKey("queued-write"),
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await writeQueue([...queue, created]);
  return created;
}

export async function listQueuedOpportunityJourneyWrites(
  userId?: string,
): Promise<QueuedOpportunityJourneyWrite[]> {
  const queue = await readQueue();
  return userId ? queue.filter((item) => item.userId === userId) : queue;
}

function shouldQueue(error: unknown): boolean {
  return (
    !(error instanceof OpportunityJourneyApiError) ||
    error.status >= 500 ||
    error.status === 408
  );
}

async function mutateWithQueue<T>(input: {
  userId: string;
  path: string;
  method: "POST" | "PUT" | "PATCH";
  body: Record<string, unknown>;
  idempotencyKey: string;
  expectedVersion?: number;
  getAuthToken: GetAuthToken;
}): Promise<OpportunityJourneyMutationResult<T>> {
  try {
    const data = await request<T>(
      input.path,
      {
        method: input.method,
        body: JSON.stringify(input.body),
        ...(input.method === "PUT"
          ? { headers: { "Idempotency-Key": input.idempotencyKey } }
          : {}),
      },
      input.getAuthToken,
    );
    await clearOpportunityJourneySnapshots(input.userId);
    return { data, queued: false, idempotencyKey: input.idempotencyKey };
  } catch (error) {
    if (!shouldQueue(error)) throw error;
    await queueOpportunityJourneyWrite({
      userId: input.userId,
      path: input.path,
      method: input.method,
      body: input.body,
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
    });
    await clearOpportunityJourneySnapshots(input.userId);
    return { data: null, queued: true, idempotencyKey: input.idempotencyKey };
  }
}

export async function replayOpportunityJourneyWrites(
  userId: string,
  getAuthToken: GetAuthToken,
): Promise<{
  completed: string[];
  remaining: QueuedOpportunityJourneyWrite[];
}> {
  const queue = await readQueue();
  const completed: string[] = [];
  const remaining: QueuedOpportunityJourneyWrite[] = [];

  for (const item of queue) {
    if (item.userId !== userId) {
      remaining.push(item);
      continue;
    }
    try {
      await request(
        item.path,
        {
          method: item.method,
          body: JSON.stringify(item.body),
          ...(item.method === "PUT"
            ? { headers: { "Idempotency-Key": item.idempotencyKey } }
            : {}),
        },
        getAuthToken,
      );
      completed.push(item.id);
    } catch (error) {
      if (!shouldQueue(error)) {
        completed.push(item.id);
        continue;
      }
      remaining.push({ ...item, attempts: item.attempts + 1 });
    }
  }

  await writeQueue(remaining);
  if (completed.length > 0) await clearOpportunityJourneySnapshots(userId);
  return { completed, remaining };
}

async function readWithSnapshot<T>(input: {
  userId: string;
  resource: string;
  path: string;
  getAuthToken: GetAuthToken;
}): Promise<OpportunityJourneyReadResult<T>> {
  try {
    const data = await request<T>(input.path, {}, input.getAuthToken);
    await writeSnapshot(input.userId, input.resource, data);
    return { data, isStale: false, source: "network" };
  } catch {
    const cached = await readSnapshot<T>(input.userId, input.resource);
    return cached
      ? { data: cached, isStale: true, source: "snapshot" }
      : { data: null, isStale: false, source: "none" };
  }
}

export function getOpportunityHome(input: {
  userId: string;
  getAuthToken: GetAuthToken;
  recommendationLimit?: number;
}) {
  const limit = boundedLimit(input.recommendationLimit);
  return readWithSnapshot<OpportunityHomeResponse>({
    userId: input.userId,
    resource: `home:${limit}`,
    path: `/me/opportunity-home?recommendationLimit=${limit}`,
    getAuthToken: input.getAuthToken,
  });
}

export function listOpportunityJourneys(input: {
  userId: string;
  stage: OpportunityPublicStage;
  getAuthToken: GetAuthToken;
}) {
  return readWithSnapshot<OpportunityJourneyView[]>({
    userId: input.userId,
    resource: `stage:${input.stage}`,
    path: `/me/opportunity-journeys?stage=${encodeURIComponent(input.stage)}`,
    getAuthToken: input.getAuthToken,
  });
}

export function getOpportunityJourney(input: {
  userId: string;
  journeyId: string;
  getAuthToken: GetAuthToken;
}) {
  return readWithSnapshot<OpportunityJourneyView>({
    userId: input.userId,
    resource: `journey:${input.journeyId}`,
    path: `/me/opportunity-journeys/${encodeURIComponent(input.journeyId)}`,
    getAuthToken: input.getAuthToken,
  });
}

export function saveOpportunityIntent(input: {
  userId: string;
  intent: Omit<OpportunityIntentView, "id" | "persisted" | "source">;
  idempotencyKey: string;
  getAuthToken: GetAuthToken;
}) {
  return mutateWithQueue<OpportunityIntentView>({
    userId: input.userId,
    path: "/me/opportunity-intent",
    method: "PUT",
    body: input.intent,
    idempotencyKey: input.idempotencyKey,
    getAuthToken: input.getAuthToken,
  });
}

export function createOpportunityJourney(input: {
  userId: string;
  opportunityId: string;
  action: "shortlist" | "pursue";
  priority?: "primary" | "secondary";
  idempotencyKey: string;
  getAuthToken: GetAuthToken;
}) {
  const body = {
    opportunityId: input.opportunityId,
    action: input.action,
    ...(input.priority ? { priority: input.priority } : {}),
    idempotencyKey: input.idempotencyKey,
  };
  return mutateWithQueue<OpportunityJourneyView>({
    userId: input.userId,
    path: "/me/opportunity-journeys",
    method: "POST",
    body,
    idempotencyKey: input.idempotencyKey,
    getAuthToken: input.getAuthToken,
  });
}

function journeyMutation(input: {
  userId: string;
  journeyId: string;
  suffix: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  idempotencyKey: string;
  expectedVersion: number;
  getAuthToken: GetAuthToken;
}) {
  return mutateWithQueue<OpportunityJourneyView>({
    userId: input.userId,
    path: `/me/opportunity-journeys/${encodeURIComponent(input.journeyId)}/${input.suffix}`,
    method: input.method,
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    expectedVersion: input.expectedVersion,
    getAuthToken: input.getAuthToken,
  });
}

export function transitionOpportunityJourney(input: {
  userId: string;
  journeyId: string;
  state: OpportunityJourneyState;
  expectedVersion: number;
  idempotencyKey: string;
  getAuthToken: GetAuthToken;
}) {
  return journeyMutation({
    ...input,
    suffix: "transition",
    method: "PATCH",
    body: {
      state: input.state,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export function updateOpportunityJourneyTask(input: {
  userId: string;
  journeyId: string;
  taskId: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  expectedVersion: number;
  idempotencyKey: string;
  getAuthToken: GetAuthToken;
}) {
  return mutateWithQueue<OpportunityJourneyView>({
    userId: input.userId,
    path: `/me/opportunity-journeys/${encodeURIComponent(input.journeyId)}/tasks/${encodeURIComponent(input.taskId)}`,
    method: "PATCH",
    body: {
      status: input.status,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
    },
    idempotencyKey: input.idempotencyKey,
    expectedVersion: input.expectedVersion,
    getAuthToken: input.getAuthToken,
  });
}

export function markOpportunityApplicationOpened(input: {
  userId: string;
  journeyId: string;
  expectedVersion: number;
  idempotencyKey: string;
  getAuthToken: GetAuthToken;
}) {
  return journeyMutation({
    ...input,
    suffix: "application-opened",
    method: "POST",
    body: {
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export function confirmOpportunityApplication(input: {
  userId: string;
  journeyId: string;
  expectedVersion: number;
  idempotencyKey: string;
  getAuthToken: GetAuthToken;
}) {
  return journeyMutation({
    ...input,
    suffix: "application-confirmed",
    method: "POST",
    body: {
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export function recordOpportunityJourneyOutcome(input: {
  userId: string;
  journeyId: string;
  outcome: "offer" | "rejected" | "withdrawn" | "no_response" | "expired";
  expectedVersion: number;
  idempotencyKey: string;
  getAuthToken: GetAuthToken;
}) {
  return journeyMutation({
    ...input,
    suffix: "outcome",
    method: "POST",
    body: {
      outcome: input.outcome,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
    },
  });
}
