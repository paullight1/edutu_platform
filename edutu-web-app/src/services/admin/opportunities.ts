// Mock service to replace Firebase admin opportunities functionality
import type { AdminOpportunity, OpportunityStatus } from '../../types/adminOpportunity';
import { 
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp 
} from '../../lib/firebaseMock';

type CreatePayload = Omit<AdminOpportunity, 'id' | 'createdAt' | 'updatedAt'>;

const normalizeStatus = (value: unknown): OpportunityStatus => {
  if (value === 'draft' || value === 'published' || value === 'archived') {
    return value;
  }
  return 'draft';
};

export async function listOpportunities(): Promise<AdminOpportunity[]> {
  // Using mock implementation for now
  console.log('Listing admin opportunities (using mock implementation)');
  // Return mock data for now
  return [
    {
      id: '1',
      title: 'Mock Scholarship Opportunity',
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
  // Using mock implementation for now
  console.log('Creating opportunity (using mock implementation):', payload);
  // Create mock ID
  return {
    ...payload,
    id: `mock-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export async function updateOpportunity(id: string, payload: Partial<CreatePayload>) {
  // Using mock implementation for now
  console.log('Updating opportunity (using mock implementation):', id, payload);
  return {
    ...payload,
    id,
    updatedAt: new Date().toISOString()
  } as AdminOpportunity;  // Type assertion since partial payload
}

export async function deleteOpportunity(id: string) {
  // Using mock implementation for now
  console.log('Deleting opportunity (using mock implementation):', id);
  return { success: true };
}

export function listenToOpportunities(
  options: any,
  handlers: {
    onNext: (opportunities: any[]) => void;
    onError?: (error: Error) => void;
  }
) {
  // Using mock implementation for now
  console.log('Listening to opportunities (using mock implementation)');

  // Simulate real-time updates with mock data
  setTimeout(() => {
    handlers.onNext([
      {
        id: '1',
        title: 'Mock Scholarship Opportunity',
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
    ]);
  }, 0);

  // Return a mock unsubscribe function
  return {
    unsubscribe: () => {}
  };
}