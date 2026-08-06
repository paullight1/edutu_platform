import { renderHook } from '@testing-library/react-native';
import { classifyError, showsContent, useScreenState } from '../ScreenState';

describe('classifyError', () => {
  it('maps auth statuses so an expired session gets its own recovery', () => {
    expect(classifyError({ status: 401 })).toBe('auth');
    expect(classifyError({ status: 403 })).toBe('auth');
    expect(classifyError({ response: { status: 401 } })).toBe('auth');
  });

  it('maps 404 to notFound rather than a generic failure', () => {
    expect(classifyError({ status: 404 })).toBe('notFound');
  });

  it('maps 5xx to server', () => {
    expect(classifyError({ status: 500 })).toBe('server');
    expect(classifyError({ statusCode: 503 })).toBe('server');
  });

  it('reads timeouts and aborts out of the message', () => {
    expect(classifyError(new Error('Request timed out'))).toBe('timeout');
    expect(classifyError(new Error('The operation was aborted'))).toBe('timeout');
  });

  it('reads network failures out of the message', () => {
    expect(classifyError(new Error('Network request failed'))).toBe('network');
    expect(classifyError(new Error('fetch failed'))).toBe('network');
  });

  it('falls back to server for anything unrecognised', () => {
    expect(classifyError(new Error('¯\\_(ツ)_/¯'))).toBe('server');
    expect(classifyError(null)).toBe('server');
  });
});

describe('useScreenState', () => {
  const run = (input: Parameters<typeof useScreenState>[0]) =>
    renderHook(() => useScreenState(input)).result.current;

  it('reports loading only while there is nothing to show', () => {
    expect(run({ loading: true, data: [] })).toEqual({ kind: 'loading' });
  });

  it('keeps content on screen while refreshing', () => {
    // A refresh must never blank out what the user is already reading.
    expect(run({ refreshing: true, data: [1] })).toEqual({ kind: 'refreshing' });
  });

  it('distinguishes a first-run empty from a filtered empty', () => {
    expect(run({ data: [] })).toEqual({ kind: 'empty', reason: 'firstRun' });
    expect(run({ data: [], filtersActive: true })).toEqual({
      kind: 'empty',
      reason: 'filtered',
    });
  });

  it('prefers stale content over an error screen', () => {
    const state = run({ data: [1], error: new Error('boom'), staleAt: 1000 });
    expect(state).toEqual({ kind: 'partial', staleAt: 1000 });
  });

  it('treats a network error as offline, not as a generic error', () => {
    expect(run({ data: [], error: new Error('Network request failed') })).toEqual({
      kind: 'offline',
    });
  });

  it('surfaces the error cause when there is nothing cached', () => {
    expect(run({ data: [], error: { status: 404 } })).toEqual({
      kind: 'error',
      cause: 'notFound',
    });
  });

  it('lets a gate outrank an error, since retrying is not a recovery path', () => {
    expect(run({ data: [], error: { status: 500 }, locked: 'pro' })).toEqual({
      kind: 'locked',
      reason: 'pro',
    });
  });

  it('surfaces a denied permission over everything else', () => {
    expect(run({ data: [], denied: 'notifications' })).toEqual({
      kind: 'denied',
      permission: 'notifications',
    });
  });

  it('treats an empty object as empty, not as ready', () => {
    expect(run({ data: {} })).toEqual({ kind: 'empty', reason: 'firstRun' });
  });

  it('reports ready when there is data and no problem', () => {
    expect(run({ data: [1, 2] })).toEqual({ kind: 'ready' });
  });
});

describe('showsContent', () => {
  it('is true for the states where the screen renders its own content', () => {
    expect(showsContent({ kind: 'ready' })).toBe(true);
    expect(showsContent({ kind: 'refreshing' })).toBe(true);
    expect(showsContent({ kind: 'partial', staleAt: 0 })).toBe(true);
  });

  it('is false for the states StateView owns', () => {
    expect(showsContent({ kind: 'loading' })).toBe(false);
    expect(showsContent({ kind: 'empty', reason: 'firstRun' })).toBe(false);
    expect(showsContent({ kind: 'offline' })).toBe(false);
  });
});
