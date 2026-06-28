import {
  categorizeOpportunity,
  matchesOpportunityCategory,
} from '../packages/core/src/services/opportunityCategorization';

describe('opportunity categorization', () => {
  it('classifies scholarships from scraped funding language', () => {
    expect(categorizeOpportunity({
      title: 'Mastercard Foundation Scholars Program',
      category: 'Education',
      description: 'Fully funded tuition, stipend, and living support for African students.',
      tags: ['study abroad'],
    })).toBe('scholarships');
  });

  it('classifies careers from internships and jobs', () => {
    expect(categorizeOpportunity({
      title: 'Product Design Internship',
      category: 'Opportunity',
      description: 'A paid intern role for early-career designers.',
    })).toBe('careers');
  });

  it('classifies leadership opportunities', () => {
    expect(categorizeOpportunity({
      title: 'Youth Ambassador Fellowship',
      description: 'A leadership and mentorship program for community changemakers.',
    })).toBe('leadership');
  });

  it('classifies global programs when no stronger category wins', () => {
    expect(categorizeOpportunity({
      title: 'International Youth Summit',
      description: 'A global exchange program for students and young professionals.',
    })).toBe('global_programs');
  });

  it('honors stored canonical categories from ingestion', () => {
    expect(categorizeOpportunity({
      canonical_category: 'careers',
      title: 'Scholarship operations assistant',
    })).toBe('careers');
  });

  it('matches category filters using the canonical classifier', () => {
    const opportunity = {
      title: 'Women in Tech Scholarship',
      category: 'Grant',
      description: 'Funding and mentorship for software engineering students.',
    };

    expect(matchesOpportunityCategory(opportunity, 'scholarships')).toBe(true);
    expect(matchesOpportunityCategory(opportunity, 'careers')).toBe(false);
  });
});
