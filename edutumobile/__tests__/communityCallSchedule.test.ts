import { getInitialScheduledDate, mergeLocalDate, mergeLocalTime } from '../features/community-calls/schedule';

describe('community call scheduling date helpers', () => {
  it('starts with a future whole-hour local value', () => {
    const now = new Date(2026, 7, 6, 10, 35, 24, 500);
    const scheduled = getInitialScheduledDate(now);

    expect(scheduled.getTime()).toBeGreaterThan(now.getTime());
    expect(scheduled.getMinutes()).toBe(0);
    expect(scheduled.getSeconds()).toBe(0);
    expect(scheduled.getMilliseconds()).toBe(0);
  });

  it('changes the calendar date without losing local wall-clock time', () => {
    const current = new Date(2026, 7, 6, 18, 45);
    const selected = new Date(2026, 7, 12, 0, 0);

    expect(mergeLocalDate(current, selected)).toEqual(new Date(2026, 7, 12, 18, 45));
  });

  it('changes local wall-clock time without losing the selected date', () => {
    const current = new Date(2026, 7, 12, 18, 45);
    const selected = new Date(2026, 0, 1, 9, 15);

    expect(mergeLocalTime(current, selected)).toEqual(new Date(2026, 7, 12, 9, 15));
  });
});
