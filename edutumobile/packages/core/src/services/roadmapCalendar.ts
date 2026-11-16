import { AIGeneratedRoadmap } from './aiRoadmapGenerator';

// Turns a generated roadmap into a standards-compliant iCalendar (.ics) string:
// one all-day event per milestone plus submission-target and hard-deadline events,
// each with a one-day-before display alarm so the calendar reminds the user.
//
// Pure and deterministic given `now` — the platform-specific file write / share
// lives in the mobile `lib/roadmapCalendar` wrapper so this stays unit-testable.

export interface RoadmapCalendarOptions {
  /** DTSTAMP source; defaults to current time. Pass a fixed date in tests. */
  now?: Date;
  /** Prefix for the shareable filename (no extension). */
  filenameBase?: string;
}

export interface RoadmapCalendarExport {
  filename: string;
  contentType: 'text/calendar';
  ics: string;
  eventCount: number;
}

function icsEscape(text: string): string {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// 'YYYY-MM-DD' (or ISO) → 'YYYYMMDD' for all-day VALUE=DATE fields.
function toIcsDate(dateStr: string): string {
  return String(dateStr).replace(/-/g, '').slice(0, 8);
}

// UTC basic format 'YYYYMMDDTHHMMSSZ' for DTSTAMP.
function toIcsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function slugify(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'roadmap';
}

function isValidDate(dateStr?: string | null): dateStr is string {
  if (!dateStr) return false;
  const parsed = new Date(dateStr);
  return !Number.isNaN(parsed.getTime());
}

interface PlanEvent {
  uid: string;
  date: string;
  summary: string;
  description?: string;
}

function buildEvents(roadmap: AIGeneratedRoadmap, slug: string): PlanEvent[] {
  const events: PlanEvent[] = [];
  const seenDates = new Set<string>();

  roadmap.milestones.forEach((milestone, index) => {
    if (!isValidDate(milestone.date)) return;
    events.push({
      uid: `${slug}-milestone-${milestone.id || index}@edutu`,
      date: milestone.date,
      summary: `🎯 ${milestone.title}`,
      description: milestone.description,
    });
    seenDates.add(toIcsDate(milestone.date));
  });

  if (isValidDate(roadmap.submissionTargetDate)) {
    events.push({
      uid: `${slug}-submit@edutu`,
      date: roadmap.submissionTargetDate,
      summary: '📤 Target: submit your application',
      description: roadmap.winningStrategy,
    });
  }

  // Only add a separate deadline event if it is not already the submission day.
  if (
    isValidDate(roadmap.deadline) &&
    toIcsDate(roadmap.deadline) !== toIcsDate(roadmap.submissionTargetDate)
  ) {
    events.push({
      uid: `${slug}-deadline@edutu`,
      date: roadmap.deadline,
      summary: '⏰ Application deadline',
    });
  }

  return events;
}

export function buildRoadmapIcs(
  roadmap: AIGeneratedRoadmap,
  opportunityTitle: string,
  options: RoadmapCalendarOptions = {},
): RoadmapCalendarExport {
  const now = options.now ?? new Date();
  const slug = slugify(options.filenameBase || opportunityTitle);
  const stamp = toIcsStamp(now);
  const events = buildEvents(roadmap, slug);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Edutu//Roadmap Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(opportunityTitle)} — Edutu Roadmap`,
  ];

  for (const event of events) {
    const dateValue = toIcsDate(event.date);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateValue}`,
      `SUMMARY:${icsEscape(event.summary)}`,
    );
    if (event.description) {
      lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
    }
    // One-day-before display reminder so the calendar nudges the user.
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(event.summary)}`,
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  return {
    filename: `${slug}-roadmap.ics`,
    contentType: 'text/calendar',
    ics: lines.join('\r\n'),
    eventCount: events.length,
  };
}
