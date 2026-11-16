type Mp4Box = {
  dataStart: number;
  end: number;
  type: string;
};

const AUDIO_MP4_BRANDS = new Set(['M4A ', 'M4B ', 'isom', 'iso2', 'mp41', 'mp42', 'qt  ']);

function uint32(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  return (
    (bytes[offset] * 0x1000000) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string | null {
  if (offset < 0 || offset + length > bytes.length) return null;
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readBoxes(bytes: Uint8Array, start: number, end: number): Mp4Box[] | null {
  const boxes: Mp4Box[] = [];
  let offset = start;

  while (offset < end) {
    if (offset + 8 > end) return null;
    const size32 = uint32(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (size32 === null || type === null) return null;

    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      const high = uint32(bytes, offset + 8);
      const low = uint32(bytes, offset + 12);
      if (high === null || low === null) return null;
      size = high * 0x100000000 + low;
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }

    if (!Number.isSafeInteger(size) || size < headerSize || offset + size > end) return null;
    boxes.push({ type, dataStart: offset + headerSize, end: offset + size });
    offset += size;
  }

  return offset === end ? boxes : null;
}

function hasAudioMp4Brand(bytes: Uint8Array, ftyp: Mp4Box): boolean {
  if (ftyp.end - ftyp.dataStart < 8 || (ftyp.end - ftyp.dataStart) % 4 !== 0) return false;

  const majorBrand = ascii(bytes, ftyp.dataStart, 4);
  if (majorBrand && AUDIO_MP4_BRANDS.has(majorBrand)) return true;

  for (let offset = ftyp.dataStart + 8; offset + 4 <= ftyp.end; offset += 4) {
    const compatibleBrand = ascii(bytes, offset, 4);
    if (compatibleBrand && AUDIO_MP4_BRANDS.has(compatibleBrand)) return true;
  }
  return false;
}

function readMvhdDuration(bytes: Uint8Array, mvhd: Mp4Box): number | null {
  const version = bytes[mvhd.dataStart];
  let timescaleOffset: number;
  let durationOffset: number;
  let duration: number | null;

  if (version === 0) {
    timescaleOffset = mvhd.dataStart + 12;
    durationOffset = mvhd.dataStart + 16;
    duration = uint32(bytes, durationOffset);
  } else if (version === 1) {
    timescaleOffset = mvhd.dataStart + 20;
    durationOffset = mvhd.dataStart + 24;
    const high = uint32(bytes, durationOffset);
    const low = uint32(bytes, durationOffset + 4);
    duration = high === null || low === null ? null : high * 0x100000000 + low;
  } else {
    return null;
  }

  const timescale = uint32(bytes, timescaleOffset);
  if (
    timescale === null ||
    duration === null ||
    timescale <= 0 ||
    duration <= 0 ||
    !Number.isSafeInteger(duration)
  ) {
    return null;
  }

  const seconds = duration / timescale;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function parseM4aDurationSeconds(bytes: Uint8Array): number | null {
  const topLevel = readBoxes(bytes, 0, bytes.length);
  if (!topLevel?.length) return null;

  const ftyp = topLevel.find((box) => box.type === 'ftyp');
  const moov = topLevel.find((box) => box.type === 'moov');
  if (!ftyp || !moov || !hasAudioMp4Brand(bytes, ftyp)) return null;

  const movieBoxes = readBoxes(bytes, moov.dataStart, moov.end);
  const mvhd = movieBoxes?.find((box) => box.type === 'mvhd');
  return mvhd ? readMvhdDuration(bytes, mvhd) : null;
}

export function startedMinuteUnits(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new RangeError('Voice duration must be a positive finite number');
  }

  const units = Math.ceil(seconds / 60);
  if (units > 120) throw new RangeError('Voice duration exceeds the metering limit');
  return units;
}

type OwnedThreadResult = {
  data: { id?: unknown } | null;
  error: { message?: string } | null;
};

type OwnedThreadClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): PromiseLike<OwnedThreadResult>;
        };
      };
    };
  };
};

export async function resolveOwnedThreadId(
  supabase: OwnedThreadClient,
  threadId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('chat_threads')
    .select('id')
    .eq('id', threadId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve chat thread: ${error.message || 'Unknown error'}`);
  return typeof data?.id === 'string' ? data.id : null;
}
