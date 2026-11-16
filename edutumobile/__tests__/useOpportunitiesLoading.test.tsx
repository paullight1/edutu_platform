import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useOpportunities } from '../packages/core/src/hooks/useOpportunities';
import { fetchOpportunities, getCachedOpportunitiesSnapshot } from '../packages/core/src/services/opportunities';
import type { Opportunity } from '../packages/core/src/types/opportunity';

jest.mock('../packages/core/src/services/opportunities', () => ({
  fetchOpportunities: jest.fn(),
  getCachedOpportunitiesSnapshot: jest.fn(),
}));
jest.mock('../packages/core/src/services/dismissedOpportunities', () => ({
  getDismissedOpportunityIds: async () => [],
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const row = (id: string) => ({ id, title: id } as Opportunity);
const mockFetch = jest.mocked(fetchOpportunities);
const mockCached = jest.mocked(getCachedOpportunitiesSnapshot);

describe('opportunity loading lifecycle', () => {
  const supabase = {} as never;
  beforeEach(() => {
    jest.clearAllMocks();
    mockCached.mockResolvedValue([]);
    mockFetch.mockResolvedValue([row('fresh')]);
  });

  it('does not replace a fast network result with a late disk snapshot', async () => {
    const disk = deferred<Opportunity[]>();
    mockCached.mockReturnValue(disk.promise);
    const { result } = renderHook(() => useOpportunities({ supabase, userId: 'user-1' }));
    await waitFor(() => expect(result.current.data[0]?.id).toBe('fresh'));
    await act(async () => { disk.resolve([row('old')]); });
    expect(result.current.data[0].id).toBe('fresh');
  });

  it('keeps cached content visible while pull-to-refresh waits for fresh data', async () => {
    const { result } = renderHook(() => useOpportunities({ supabase, userId: 'user-1' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const network = deferred<Opportunity[]>();
    mockFetch.mockReturnValue(network.promise);
    mockCached.mockResolvedValue([row('old')]);
    await act(async () => { result.current.refresh(); });
    expect(result.current.loading).toBe(true);
    expect(result.current.data[0].id).toBe('fresh');
    await act(async () => { network.resolve([row('updated')]); });
    expect(result.current.data[0].id).toBe('updated');
    expect(result.current.loading).toBe(false);
  });

  it('clears the previous account feed before hydrating the next account', async () => {
    const { result, rerender } = renderHook(
      ({ userId }) => useOpportunities({ supabase, userId }),
      { initialProps: { userId: 'user-1' } },
    );
    await waitFor(() => expect(result.current.data[0]?.id).toBe('fresh'));
    const network = deferred<Opportunity[]>();
    mockFetch.mockReturnValue(network.promise);
    mockCached.mockResolvedValue([row('second-account-cache')]);
    rerender({ userId: 'user-2' });
    expect(result.current.data).toEqual([]);
    await waitFor(() => expect(result.current.data[0]?.id).toBe('second-account-cache'));
    await act(async () => { network.resolve([row('second-account-fresh')]); });
    expect(result.current.data[0].id).toBe('second-account-fresh');
  });

  it('only bypasses the short request cache for an explicit refresh', async () => {
    const { result } = renderHook(() => useOpportunities({ supabase, userId: 'user-1' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { result.current.refresh(); });
    expect(mockFetch).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }));
    await act(async () => { result.current.noteDismissed('dismissed'); });
    expect(mockFetch).toHaveBeenLastCalledWith(expect.objectContaining({
      force: false, excludeOpportunityIds: ['dismissed'],
    }));
  });
});
