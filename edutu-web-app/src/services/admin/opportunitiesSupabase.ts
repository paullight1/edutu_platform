import type { AdminOpportunity } from '../../types/adminOpportunity';
import logger from '../../lib/logger';

type CreatePayload = Omit<AdminOpportunity, 'id' | 'createdAt' | 'updatedAt'>;

const unavailable = () => {
  throw new Error('Admin opportunity management is not connected to a canonical backend route yet.');
};

export async function listOpportunities(): Promise<AdminOpportunity[]> {
  if (import.meta.env.DEV) {
    logger.debug('Admin opportunity management is unconfigured; returning an empty development list.');
    return [];
  }
  unavailable();
}

export async function createOpportunity(_payload: CreatePayload) {
  unavailable();
}

export async function updateOpportunity(_id: string, _payload: Partial<CreatePayload>) {
  unavailable();
}

export async function deleteOpportunity(_id: string) {
  unavailable();
}
