import { v4 as uuidv4 } from 'uuid';

export interface TestOpportunity {
  id: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  organization: string;
  location: string;
  isRemote: boolean;
  deadline: Date;
  applicationUrl: string;
  sourceUrl: string;
  status: string;
  isFeatured: boolean;
  qualityScore: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT: Omit<TestOpportunity, 'id'> = {
  title: 'Mastercard Foundation Scholarship at University of Cape Town',
  summary: 'Fully funded scholarship for African students at UCT.',
  description: 'The Mastercard Foundation Scholars Program provides comprehensive scholarships to academically talented yet economically disadvantaged young people from Sub-Saharan Africa.',
  category: 'Scholarship',
  organization: 'Mastercard Foundation',
  location: 'Cape Town, South Africa',
  isRemote: false,
  deadline: new Date('2026-09-30'),
  applicationUrl: 'https://mastercardfdn.org/uct/apply',
  sourceUrl: 'https://mastercardfdn.org/uct/scholars',
  status: 'active',
  isFeatured: true,
  qualityScore: 90,
  tags: ['Scholarship', 'Africa', 'Fully Funded'],
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-05-01'),
};

export function buildOpportunity(overrides?: Partial<TestOpportunity>): TestOpportunity {
  return { id: uuidv4(), ...DEFAULT, ...overrides };
}

export async function createOpportunity(overrides?: Partial<TestOpportunity>): Promise<TestOpportunity> {
  return buildOpportunity(overrides);
}

export function nigerianScholarshipPreset(): TestOpportunity {
  return buildOpportunity({
    title: 'NNPC/TotalEnergies National Merit Scholarship 2026',
    summary: 'Annual scholarship for Nigerian undergraduates.',
    organization: 'NNPC/TotalEnergies',
    location: 'Nigeria',
    category: 'Scholarship',
    tags: ['Scholarship', 'Nigeria', 'Undergraduate', 'STEM'],
  });
}

export function africanTechFellowshipPreset(): TestOpportunity {
  return buildOpportunity({
    title: 'Andela Technical Leadership Program 2026',
    summary: '6-month career accelerator for African technologists.',
    organization: 'Andela',
    location: 'Remote (Africa)',
    isRemote: true,
    category: 'Fellowship',
    tags: ['Fellowship', 'Tech', 'Africa', 'Remote'],
    isFeatured: false,
  });
}

export function expiredOpportunityPreset(): TestOpportunity {
  return buildOpportunity({
    title: 'Chevron Nigeria University Scholarship 2025',
    status: 'expired',
    deadline: new Date('2025-06-30'),
    updatedAt: new Date('2025-07-01'),
  });
}
