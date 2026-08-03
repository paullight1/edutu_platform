import { describe, expect, it } from 'vitest';
import { classifyError, deriveState, showsContent } from '@edutu/ux-state/state';

describe('@edutu/ux-state/state resolves from the web app', () => {
  it('classifies an auth failure', () => {
    expect(classifyError({ status: 401 })).toBe('auth');
  });

  it('classifies a server failure', () => {
    expect(classifyError({ status: 503 })).toBe('server');
  });

  it('knows which states still render their own content', () => {
    expect(showsContent({ kind: 'ready' })).toBe(true);
    expect(showsContent({ kind: 'partial', staleAt: null })).toBe(true);
    expect(showsContent({ kind: 'offline' })).toBe(false);
  });

  it('derives the same precedence the mobile app uses', () => {
    // A gate outranks an error: retrying a request you are not allowed to make
    // is not a recovery path.
    expect(deriveState({ locked: 'pro', error: new Error('boom') })).toEqual({
      kind: 'locked',
      reason: 'pro',
    });
    // Cached content plus a failed refresh beats a bare error — showing
    // something beats showing nothing.
    expect(deriveState({ data: [1], error: new Error('boom'), staleAt: 5 })).toEqual({
      kind: 'partial',
      staleAt: 5,
    });
    expect(deriveState({ data: [], filtersActive: true })).toEqual({
      kind: 'empty',
      reason: 'filtered',
    });
  });
});
