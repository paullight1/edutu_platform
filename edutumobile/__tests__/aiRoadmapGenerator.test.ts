import {
  generateRoadmapFromOpportunity,
  mergeRoadmapEnrichment,
  generateRoadmap,
} from '../packages/core/src/services/aiRoadmapGenerator';
import type { Opportunity } from '../packages/core/src/types/opportunity';

function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'opp-1',
    title: 'Chevening Scholarship',
    organization: 'UK Government',
    category: 'Scholarships',
    deadline: '2026-11-01',
    location: 'United Kingdom',
    description: 'A fully funded UK scholarship.',
    requirements: [],
    benefits: [],
    applicationProcess: [],
    match: 90,
    ...overrides,
  } as Opportunity;
}

describe('aiRoadmapGenerator', () => {
  const startDate = new Date('2026-07-05T00:00:00.000Z');

  it('builds a deterministic roadmap with stable milestone ids', () => {
    const roadmap = generateRoadmapFromOpportunity(makeOpportunity(), startDate);
    expect(roadmap.milestones.map((m) => m.id)).toEqual([
      'milestone-1',
      'milestone-2',
      'milestone-3',
      'milestone-4',
      'milestone-5',
    ]);
    expect(roadmap.summary).toContain('Chevening Scholarship');
  });

  it('merges AI enrichment onto the scaffold without disturbing scheduling', () => {
    const roadmap = generateRoadmapFromOpportunity(makeOpportunity(), startDate);
    const originalDate = roadmap.milestones[0].date;

    const merged = mergeRoadmapEnrichment(roadmap, {
      summary: 'AI summary',
      winningStrategy: 'AI strategy',
      supportActions: ['Ask an alumnus to review your essay'],
      milestones: [
        { id: 'milestone-1', title: 'Nail the criteria', description: 'Study what the panel rewards.' },
      ],
      generatedBy: 'ai',
    });

    expect(merged.summary).toBe('AI summary');
    expect(merged.winningStrategy).toBe('AI strategy');
    expect(merged.supportActions).toEqual(['Ask an alumnus to review your essay']);
    // Enriched milestone gets new copy but keeps its computed date.
    expect(merged.milestones[0].title).toBe('Nail the criteria');
    expect(merged.milestones[0].description).toBe('Study what the panel rewards.');
    expect(merged.milestones[0].date).toBe(originalDate);
    // Unreferenced milestones are untouched.
    expect(merged.milestones[1]).toEqual(roadmap.milestones[1]);
  });

  it('returns the heuristic roadmap unchanged when null enrichment is merged', () => {
    const roadmap = generateRoadmapFromOpportunity(makeOpportunity(), startDate);
    expect(mergeRoadmapEnrichment(roadmap, null)).toBe(roadmap);
  });

  it('generateRoadmap enriches via the backend when it responds', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: 'Backend summary',
        winningStrategy: 'Backend strategy',
        milestones: [{ id: 'milestone-3', title: 'Craft your story', description: 'Lead with measurable impact.' }],
        supportActions: [],
        generatedBy: 'ai',
      }),
    });
    global.fetch = fetchMock as never;

    const roadmap = await generateRoadmap(makeOpportunity(), { startDate });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/roadmaps/ai/opportunity-plan'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(roadmap.summary).toBe('Backend summary');
    expect(roadmap.milestones[2].description).toBe('Lead with measurable impact.');
  });

  it('generateRoadmap falls back to the heuristic when the backend fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as never;

    const heuristic = generateRoadmapFromOpportunity(makeOpportunity(), startDate);
    const roadmap = await generateRoadmap(makeOpportunity(), { startDate });

    expect(roadmap.summary).toBe(heuristic.summary);
    expect(roadmap.milestones.map((m) => m.title)).toEqual(heuristic.milestones.map((m) => m.title));
  });
});
