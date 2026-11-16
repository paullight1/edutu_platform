import {
  parseM4aDurationSeconds,
  resolveOwnedThreadId,
  startedMinuteUnits,
} from '../supabase/functions/chat-proxy/voice-usage';

function ascii(value: string): number[] {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function uint32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function box(type: string, payload: number[]): number[] {
  return [...uint32(payload.length + 8), ...ascii(type), ...payload];
}

function m4aWithDuration(timescale: number, duration: number): Uint8Array {
  const ftyp = box('ftyp', [
    ...ascii('M4A '),
    ...uint32(0),
    ...ascii('M4A '),
    ...ascii('isom'),
  ]);
  const mvhd = box('mvhd', [
    0, 0, 0, 0,
    ...uint32(0),
    ...uint32(0),
    ...uint32(timescale),
    ...uint32(duration),
  ]);

  return new Uint8Array([...ftyp, ...box('moov', mvhd)]);
}

type ThreadRow = { id: string; user_id: string };

function fakeThreadClient(rows: ThreadRow[]) {
  return {
    from(table: string) {
      if (table !== 'chat_threads') throw new Error(`Unexpected table: ${table}`);
      let filtered = [...rows];

      const query = {
        select(_columns: string) {
          return query;
        },
        eq(column: keyof ThreadRow, value: string) {
          filtered = filtered.filter((row) => row[column] === value);
          return query;
        },
        async maybeSingle() {
          return { data: filtered[0] ?? null, error: null };
        },
      };

      return query;
    },
  };
}

describe('chat proxy voice usage', () => {
  it('parses duration from an M4A mvhd box', () => {
    expect(parseM4aDurationSeconds(m4aWithDuration(1_000, 61_000))).toBe(61);
  });

  it('rejects bytes that are not a parseable M4A container', () => {
    expect(parseM4aDurationSeconds(new Uint8Array(ascii('not an m4a')))).toBeNull();
  });

  it.each([
    [1, 1],
    [60, 1],
    [61, 2],
  ])('charges %s seconds as %s started minute(s)', (seconds, expectedUnits) => {
    expect(startedMinuteUnits(seconds)).toBe(expectedUnits);
  });

  it('resolves a supplied thread only for its authenticated owner', async () => {
    const client = fakeThreadClient([
      { id: 'thread-a', user_id: 'owner-a' },
      { id: 'thread-b', user_id: 'owner-b' },
    ]);

    await expect(resolveOwnedThreadId(client, 'thread-a', 'owner-a')).resolves.toBe('thread-a');
    await expect(resolveOwnedThreadId(client, 'thread-a', 'owner-b')).resolves.toBeNull();
    await expect(resolveOwnedThreadId(client, 'missing', 'owner-a')).resolves.toBeNull();
  });
});
