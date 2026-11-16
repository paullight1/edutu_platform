export function mergeLocalDate(current: Date, selected: Date): Date {
  return new Date(
    selected.getFullYear(),
    selected.getMonth(),
    selected.getDate(),
    current.getHours(),
    current.getMinutes(),
    0,
    0,
  );
}

export function mergeLocalTime(current: Date, selected: Date): Date {
  return new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate(),
    selected.getHours(),
    selected.getMinutes(),
    0,
    0,
  );
}

export function getInitialScheduledDate(now = new Date()): Date {
  const nextHour = new Date(now.getTime() + 60 * 60_000);
  nextHour.setMinutes(0, 0, 0);
  return nextHour;
}
