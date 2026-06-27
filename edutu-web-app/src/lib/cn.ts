export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassDictionary
  | ClassValue[];

export interface ClassDictionary {
  [key: string]: unknown;
}

// Best-effort Tailwind conflict resolution: utilities that share a leading
// prefix (px-, py-, p-, m-, mx-, text-, bg-, w-, h-, rounded-, border, font-,
// gap-, ...) collapse so the last occurrence wins. Bare/ambiguous utilities
// are preserved verbatim and deduplicated.
const CONFLICT_PREFIXES = [
  'px', 'py', 'p',
  'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'pt', 'pr', 'pb', 'pl', 'm',
  'min-w', 'min-h', 'max-w', 'max-h', 'w', 'h',
  'gap-x', 'gap-y', 'gap',
  'rounded', 'border', 'text', 'bg', 'font',
  'grid-cols', 'col-span', 'col-start', 'col-end',
  'row-span', 'row-start', 'row-end',
  'order', 'z', 'inset', 'top', 'right', 'bottom', 'left',
  'space-x', 'space-y',
  'opacity', 'shadow', 'blur', 'duration', 'delay', 'animate',
  'leading', 'tracking',
];

function conflictKeyFor(token: string): string | undefined {
  for (const prefix of CONFLICT_PREFIXES) {
    if (token === prefix) return undefined;
    if (token.startsWith(prefix + '-')) return prefix;
  }
  return undefined;
}

function pushTokens(value: ClassValue, out: string[]): void {
  if (typeof value === 'string') {
    for (const part of value.split(/\s+/)) {
      if (part) out.push(part);
    }
    return;
  }
  if (typeof value === 'number') {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) pushTokens(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    const dict = value as ClassDictionary;
    for (const key of Object.keys(dict)) {
      if (dict[key]) {
        for (const part of key.split(/\s+/)) {
          if (part) out.push(part);
        }
      }
    }
  }
}

export function cn(...inputs: ClassValue[]): string {
  const tokens: string[] = [];
  for (const input of inputs) pushTokens(input, tokens);

  const result: string[] = [];
  const winnerIndexByKey = new Map<string, number>();
  const seen = new Set<string>();

  for (const token of tokens) {
    const key = conflictKeyFor(token);

    if (key !== undefined) {
      const prevIndex = winnerIndexByKey.get(key);
      if (prevIndex !== undefined) {
        result.splice(prevIndex, 1);
        for (const [k, idx] of winnerIndexByKey) {
          if (idx > prevIndex) winnerIndexByKey.set(k, idx - 1);
        }
      }
      winnerIndexByKey.set(key, result.length);
      result.push(token);
    } else if (!seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }

  return result.join(' ');
}
