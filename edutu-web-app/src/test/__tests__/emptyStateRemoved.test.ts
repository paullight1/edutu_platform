import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A deleted primitive that comes back is a decoy the next screen adopts, so
// its absence is asserted rather than trusted. Its nine variants rendered a
// 32px glyph in a tinted circle and had no representation at all for offline,
// locked, permission-denied or a stale-cache refresh failure.
describe('the legacy EmptyState primitive', () => {
  it('no longer exists', () => {
    expect(existsSync(resolve(__dirname, '../../components/ui/EmptyState.tsx'))).toBe(false);
  });
});
