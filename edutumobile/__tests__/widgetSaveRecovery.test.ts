import { saveOpportunityFromWidget } from '../packages/core/src/services/bookmarks';
jest.mock('@react-native-async-storage/async-storage', () => ({
  removeItem: jest.fn().mockResolvedValue(undefined),
}));
const response = (status: number) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ saved: true }) }) as Response;

beforeEach(() => { jest.useFakeTimers(); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it.each([502, 503, 504])('recovers a transient HTTP %i without asking the user to tap Save again', async status => {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce(response(status)).mockResolvedValueOnce(response(201));
  const save = saveOpportunityFromWidget('user-a', 'opportunity-a', async () => 'token');
  await jest.runAllTimersAsync();
  await expect(save).resolves.toBeUndefined();
});
it('refreshes a rejected Clerk token before retrying the idempotent save', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) =>
    response((init?.headers as any).Authorization === 'Bearer fresh' ? 201 : 401));
  const getToken = async (options?: { skipCache?: boolean }) => options?.skipCache ? 'fresh' : 'expired';
  const save = saveOpportunityFromWidget('user-a', 'opportunity-a', getToken);
  await jest.runAllTimersAsync();
  await expect(save).resolves.toBeUndefined();
});
it('recovers when the first token is not ready after a cold launch', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(response(201));
  let tokenReady = false;
  const save = saveOpportunityFromWidget('user-a', 'opportunity-a', async () => {
    if (!tokenReady) { tokenReady = true; return null; }
    return 'token';
  });
  await jest.runAllTimersAsync();
  await expect(save).resolves.toBeUndefined();
});
it('recovers a dropped response safely because saving is an upsert, not a toggle', async () => {
  const stored = new Set<string>(); let dropResponse = true;
  jest.spyOn(global, 'fetch').mockImplementation(async url => {
    stored.add(String(url));
    if (dropResponse) { dropResponse = false; throw new TypeError('Network request failed'); }
    return response(201);
  });
  const save = saveOpportunityFromWidget('user-a', 'opportunity-a', async () => 'token');
  await jest.runAllTimersAsync();
  await expect(save).resolves.toBeUndefined();
  expect(stored.size).toBe(1);
});
it('never reports success when the server keeps failing and does not retry indefinitely', async () => {
  let requests = 0;
  jest.spyOn(global, 'fetch').mockImplementation(async () => { requests++; return response(503); });
  const outcome = saveOpportunityFromWidget('user-a', 'opportunity-a', async () => 'token').catch(error => error);
  await jest.runAllTimersAsync();
  expect(await outcome).toBeInstanceOf(Error);
  expect(requests).toBe(2);
});
it('does not retry permanent permission errors', async () => {
  let requests = 0;
  jest.spyOn(global, 'fetch').mockImplementation(async () => { requests++; return response(403); });
  const outcome = saveOpportunityFromWidget('user-a', 'opportunity-a', async () => 'token').catch(error => error);
  await jest.runAllTimersAsync();
  expect(await outcome).toBeInstanceOf(Error);
  expect(requests).toBe(1);
});

it('stops retrying when the Save screen is dismissed or its account changes', async () => {
  const controller = new AbortController(); let requests = 0;
  jest.spyOn(global, 'fetch').mockImplementation(async () => { requests++; controller.abort(); throw new TypeError('cancelled'); });
  const outcome = saveOpportunityFromWidget('user-a', 'opportunity-a', async () => 'token', controller.signal).catch(error => error);
  await jest.runAllTimersAsync();
  expect(await outcome).toBeInstanceOf(Error);
  expect(requests).toBe(1);
});

it('keeps a timeout even when the screen supplies its own cancellation signal', async () => {
  let requests = 0;
  jest.spyOn(global, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    requests++;
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const outcome = saveOpportunityFromWidget('user-a', 'opportunity-a', async () => 'token', new AbortController().signal).catch(error => error);
  await jest.runAllTimersAsync();
  expect(await outcome).toBeInstanceOf(Error);
  expect(requests).toBe(2);
});
