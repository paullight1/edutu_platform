import AsyncStorage from '@react-native-async-storage/async-storage';

/** One device-local read cursor per group. The server remains the source of
 * messages; this cursor only records where this device last viewed a room. */
export const LAST_READ_KEY = 'edutu:discussions:lastRead';

export type GroupReadMap = Record<string, string>;

export async function readGroupReadMap(): Promise<GroupReadMap> {
  try {
    const raw = await AsyncStorage.getItem(LAST_READ_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, value]) => typeof value === 'string',
      ),
    ) as GroupReadMap;
  } catch {
    return {};
  }
}

export async function markGroupRead(groupId: string, at: string): Promise<void> {
  if (!groupId || !at) return;
  try {
    const map = await readGroupReadMap();
    map[groupId] = at;
    await AsyncStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
  } catch {
    // A read cursor is best-effort; never interrupt the chat for storage IO.
  }
}

export function isAfterCursor(value: string | null | undefined, cursor?: string): boolean {
  if (!value) return false;
  if (!cursor) return true;
  const valueTime = Date.parse(value);
  const cursorTime = Date.parse(cursor);
  return Number.isFinite(valueTime) && Number.isFinite(cursorTime)
    ? valueTime > cursorTime
    : value !== cursor;
}
