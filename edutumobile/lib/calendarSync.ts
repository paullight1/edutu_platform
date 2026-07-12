import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import type { AIGeneratedRoadmap } from '../packages/core/src/services/aiRoadmapGenerator';

const EDUTU_CALENDAR_TITLE = 'Edutu Opportunities';

export interface CalendarSyncResult {
  ok: boolean;
  eventCount: number;
  /** Human-readable reason when ok is false (permission denied, etc.). */
  reason?: string;
  eventIds: string[];
}

async function ensurePermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

/** Find or create a dedicated Edutu calendar so events are grouped and removable. */
async function getEdutuCalendarId(): Promise<string> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((cal) => cal.title === EDUTU_CALENDAR_TITLE && cal.allowsModifications);
  if (existing) return existing.id;

  if (Platform.OS === 'ios') {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    return Calendar.createCalendarAsync({
      title: EDUTU_CALENDAR_TITLE,
      color: '#6366F1',
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultCalendar.source.id,
      source: defaultCalendar.source,
      name: EDUTU_CALENDAR_TITLE,
      ownerAccount: 'personal',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  }

  const writable = calendars.find((cal) => cal.allowsModifications);
  if (writable) return writable.id;
  throw new Error('No writable calendar found');
}

/** All-day event at local noon avoids timezone edge-flips to the previous day. */
function atLocalNoon(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0);
}

/**
 * Generic variant for agent-created plans/goals: one all-day event per dated
 * milestone, plus an optional deadline event. Same Edutu calendar + alarms
 * as roadmap sync.
 */
export async function syncMilestonesToCalendar(
  planTitle: string,
  milestones: Array<{ title: string; dueDate?: string | null }>,
  deadline?: string | null,
): Promise<CalendarSyncResult> {
  try {
    const granted = await ensurePermission();
    if (!granted) {
      return { ok: false, eventCount: 0, reason: 'Calendar permission was not granted.', eventIds: [] };
    }

    const calendarId = await getEdutuCalendarId();
    const eventIds: string[] = [];
    const seen = new Set<string>();

    const events = [
      ...milestones
        .filter((milestone) => milestone.dueDate)
        .map((milestone) => ({
          title: `🎯 ${milestone.title}`,
          date: milestone.dueDate as string,
          notes: planTitle,
        })),
      ...(deadline
        ? [{ title: `⏰ DEADLINE: ${planTitle}`, date: deadline, notes: 'Official deadline. Submit before this date!' }]
        : []),
    ];

    for (const event of events) {
      const key = `${event.date}|${event.title}`;
      if (seen.has(key) || !event.date) continue;
      seen.add(key);
      const start = atLocalNoon(event.date);
      const id = await Calendar.createEventAsync(calendarId, {
        title: event.title,
        notes: event.notes,
        startDate: start,
        endDate: new Date(start.getTime() + 60 * 60 * 1000),
        allDay: true,
        alarms: [{ relativeOffset: -9 * 60 }],
      });
      eventIds.push(id);
    }

    return { ok: true, eventCount: eventIds.length, eventIds };
  } catch (error) {
    return {
      ok: false,
      eventCount: 0,
      reason: error instanceof Error ? error.message : 'Calendar sync failed',
      eventIds: [],
    };
  }
}

/**
 * Writes the roadmap's key dates to the device calendar: one event per
 * milestone plus the submission target and the official deadline.
 */
export async function syncRoadmapToCalendar(
  opportunityTitle: string,
  roadmap: AIGeneratedRoadmap,
): Promise<CalendarSyncResult> {
  try {
    const granted = await ensurePermission();
    if (!granted) {
      return { ok: false, eventCount: 0, reason: 'Calendar permission was not granted.', eventIds: [] };
    }

    const calendarId = await getEdutuCalendarId();
    const eventIds: string[] = [];

    const events: Array<{ title: string; date: string; notes: string }> = [
      ...roadmap.milestones.map((milestone) => ({
        title: `🎯 ${milestone.title}`,
        date: milestone.date,
        notes: `${opportunityTitle}\n\n${milestone.description || ''}`,
      })),
      {
        title: `🚀 Submit: ${opportunityTitle}`,
        date: roadmap.submissionTargetDate,
        notes: `Target submission date (buffer before the official deadline).\n\n${roadmap.winningStrategy}`,
      },
      {
        title: `⏰ DEADLINE: ${opportunityTitle}`,
        date: roadmap.deadline,
        notes: 'Official application deadline. Submit before this date!',
      },
    ];

    // De-dupe identical date+title pairs (submission target can equal deadline).
    const seen = new Set<string>();
    for (const event of events) {
      const key = `${event.date}|${event.title}`;
      if (seen.has(key) || !event.date) continue;
      seen.add(key);

      const start = atLocalNoon(event.date);
      const id = await Calendar.createEventAsync(calendarId, {
        title: event.title,
        notes: event.notes,
        startDate: start,
        endDate: new Date(start.getTime() + 60 * 60 * 1000),
        allDay: true,
        alarms: [{ relativeOffset: -9 * 60 }], // 9 AM-ish reminder on the day
      });
      eventIds.push(id);
    }

    return { ok: true, eventCount: eventIds.length, eventIds };
  } catch (error) {
    return {
      ok: false,
      eventCount: 0,
      reason: error instanceof Error ? error.message : 'Calendar sync failed.',
      eventIds: [],
    };
  }
}
