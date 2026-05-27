import { describe, expect, it } from 'vitest';
import { getRoadmapTemplateById, roadmapTemplates } from './roadmapTemplates';

describe('roadmapTemplates', () => {
  it('provides actionable guidance, resources, and reminder metadata for every template', () => {
    expect(roadmapTemplates.length).toBeGreaterThan(0);

    for (const template of roadmapTemplates) {
      expect(template.outcomes.length).toBeGreaterThan(0);
      expect(template.calendarTitle).toContain(' ');
      expect(template.reminderCadence).toContain('reminder');
      expect(template.milestonesPlan.length).toBeGreaterThan(0);
      expect(template.milestonesPlan.some((milestone) => milestone.resources.some((resource) => resource.url.startsWith('https://')))).toBe(true);
    }
  });

  it('finds a template by id for detail navigation', () => {
    expect(getRoadmapTemplateById('python-course')?.title).toBe('Complete Python Programming Course');
    expect(getRoadmapTemplateById('missing-template')).toBeUndefined();
  });
});
