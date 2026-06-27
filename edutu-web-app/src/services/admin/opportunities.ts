import type { AdminOpportunity, OpportunityStatus } from '../../types/adminOpportunity';
import logger from '../../lib/logger';

type CreatePayload = Omit<AdminOpportunity, 'id' | 'createdAt' | 'updatedAt'>;

const normalizeStatus = (value: unknown): OpportunityStatus => {
  if (value === 'draft' || value === 'published' || value === 'archived') {
    return value;
  }
  return 'draft';
};

const unavailable = () => {
  throw new Error('Admin opportunities service is not connected. Use the Supabase-backed admin service instead.');
};

export async function listOpportunities(): Promise<AdminOpportunity[]> {
  if (import.meta.env.DEV) {
    logger.debug('Legacy admin opportunities service skipped; returning an empty development list.');
    return [];
  }
  unavailable();
}

export async function createOpportunity(payload: CreatePayload) {
  if (import.meta.env.DEV) {
    return {
      ...payload,
      id: `local-${Date.now()}`,
      status: normalizeStatus(payload.status),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  unavailable();
}

export async function updateOpportunity(id: string, payload: Partial<CreatePayload>) {
  if (import.meta.env.DEV) {
    return {
      ...payload,
      id,
      status: payload.status ? normalizeStatus(payload.status) : undefined,
      updatedAt: new Date().toISOString()
    } as AdminOpportunity;
  }
  unavailable();
}

export async function deleteOpportunity(_id: string) {
  if (import.meta.env.DEV) {
    return { success: true };
  }
  unavailable();
}

export function listenToOpportunities(
  _options: unknown,
  handlers: {
    onNext: (opportunities: AdminOpportunity[]) => void;
    onError?: (error: Error) => void;
  }
) {
  if (import.meta.env.DEV) {
    window.setTimeout(() => handlers.onNext([]), 0);
    return { unsubscribe: () => {} };
  }

  const error = new Error('Admin opportunities realtime service is not connected.');
  handlers.onError?.(error);
  return { unsubscribe: () => {} };
}
