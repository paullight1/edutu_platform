// Mock service to replace Firebase admin opportunities functionality
import type { AdminOpportunity, OpportunityStatus } from '../../types/adminOpportunity';
import { supabase } from '../../lib/supabaseClient';

type CreatePayload = Omit<AdminOpportunity, 'id' | 'createdAt' | 'updatedAt'>;

const normalizeStatus = (value: unknown): OpportunityStatus => {
  if (value === 'draft' || value === 'published' || value === 'archived') {
    return value;
  }
  return 'draft';
};

export async function listOpportunities(): Promise<AdminOpportunity[]> {
  // TODO: Replace with actual Supabase implementation when schema is ready
  console.log('Listing admin opportunities (using mock implementation)');
  // Return mock data for now
  return [
    {
      id: '1',
      title: 'Scholarship Opportunity Mock',
      description: 'This is a mock scholarship opportunity for testing purposes',
      category: 'Education',
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      location: 'Remote',
      sponsor: 'Mock Organization',
      amount: 'Full Coverage',
      status: 'published',
      tags: ['scholarship', 'education'],
      requirements: ['Must be enrolled in university'],
      applicationUrl: 'https://example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
}

export async function createOpportunity(payload: CreatePayload) {
  // TODO: Replace with actual Supabase implementation when schema is ready
  console.log('Creating opportunity:', payload);
  // Create mock ID
  return {
    ...payload,
    id: `mock-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export async function updateOpportunity(id: string, payload: Partial<CreatePayload>) {
  // TODO: Replace with actual Supabase implementation when schema is ready
  console.log('Updating opportunity:', id, payload);
  return {
    ...payload,
    id,
    updatedAt: new Date().toISOString()
  } as AdminOpportunity;  // Type assertion since partial payload
}

export async function deleteOpportunity(id: string) {
  // TODO: Replace with actual Supabase implementation when schema is ready
  console.log('Deleting opportunity:', id);
  return { success: true };
}