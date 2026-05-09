export type OpportunityStatus = 'draft' | 'published' | 'expired';

export interface AdminOpportunity {
  id: string;
  title: string;
  category: string;
  description: string;
  eligibility: string;
  link: string;
  deadline: string | null;
  tags: string[];
  status: OpportunityStatus;
  createdAt?: string;
  updatedAt?: string;
}
