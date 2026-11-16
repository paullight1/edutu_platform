import { buildRoadmapIcs } from '../packages/core/src/services/roadmapCalendar';
import type { AIGeneratedRoadmap } from '../packages/core/src/services/aiRoadmapGenerator';

function makeRoadmap(overrides: Partial<AIGeneratedRoadmap> = {}): AIGeneratedRoadmap {
  return {
    milestones: [
      { id: 'milestone-1', title: 'Draft your SOP', description: 'Write, review; iterate.', date: '2026-07-12' },
      { id: 'milestone-2', title: 'Secure references', description: 'Ask referees early.', date: '2026-07-20' },
    ],
    dailyPlan: [],
    weeklyGoals: [],
    checklist: [],
    reminders: [],
    resources: [],
    supportActions: [],
    deadline: '2026-08-01',
    submissionTargetDate: '2026-07-28',
    daysUntilDeadline: 27,
    daysUntilSubmissionTarget: 23,
    winningStrategy: 'Lead with measurable impact.',
    summary: 'A focused plan.',
    totalWeeks: 4,
    ...overrides,
  };
}

const NOW = new Date('2026-07-05T00:00:00.000Z');

describe('buildRoadmapIcs', () => {
  it('produces a valid VCALENDAR with an event per milestone plus submit + deadline', () => {
    const result = buildRoadmapIcs(makeRoadmap(), 'Chevening Scholarship', { now: NOW });

    expect(result.ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(result.ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(result.contentType).toBe('text/calendar');
    expect(result.filename).toBe('chevening-scholarship-roadmap.ics');
    // 2 milestones + submission target + deadline = 4 events.
    expect(result.eventCount).toBe(4);
    expect((result.ics.match(/BEGIN:VEVENT/g) || []).length).toBe(4);
  });

  it('emits all-day dates and a one-day-before alarm on every event', () => {
    const { ics } = buildRoadmapIcs(makeRoadmap(), 'Chevening', { now: NOW });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260712');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260801'); // deadline
    expect((ics.match(/BEGIN:VALARM/g) || []).length).toBe(4);
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('SUMMARY:🎯 Draft your SOP');
  });

  it('escapes commas, semicolons and newlines in text fields', () => {
    const roadmap = makeRoadmap({
      milestones: [
        { id: 'm1', title: 'Prep, review; revise', description: 'Line one\nLine two', date: '2026-07-12' },
      ],
    });
    const { ics } = buildRoadmapIcs(roadmap, 'Test', { now: NOW });
    expect(ics).toContain('SUMMARY:🎯 Prep\\, review\\; revise');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
  });

  it('does not duplicate the deadline when it falls on the submission day', () => {
    const roadmap = makeRoadmap({ deadline: '2026-07-28', submissionTargetDate: '2026-07-28' });
    const result = buildRoadmapIcs(roadmap, 'Test', { now: NOW });
    // 2 milestones + submission (deadline == submission, so no separate event) = 3.
    expect(result.eventCount).toBe(3);
    expect(result.ics).not.toContain('⏰ Application deadline');
  });

  it('skips milestones with invalid dates without crashing', () => {
    const roadmap = makeRoadmap({
      milestones: [
        { id: 'm1', title: 'Valid', description: '', date: '2026-07-12' },
        { id: 'm2', title: 'Broken', description: '', date: 'not-a-date' },
      ],
    });
    const result = buildRoadmapIcs(roadmap, 'Test', { now: NOW });
    // 1 valid milestone + submit + deadline = 3.
    expect(result.eventCount).toBe(3);
    expect(result.ics).toContain('SUMMARY:🎯 Valid');
    expect(result.ics).not.toContain('Broken');
  });
});
