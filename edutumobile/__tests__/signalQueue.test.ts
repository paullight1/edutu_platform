import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueueSignal, flushSignalQueue, setSignalQueueSession } from '../packages/core/src/services/signalQueue';

const token = (sub: string) => `header.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.signature`;
const signal = (query: string) => ({ signalType: 'search', details: { query } });
let fetchMock: jest.Mock;
const originalFetch = global.fetch;

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  fetchMock = jest.fn().mockResolvedValue({ ok: true });
  global.fetch = fetchMock;
  setSignalQueueSession(null);
});
afterEach(() => {
  setSignalQueueSession(null);
  jest.useRealTimers();
  global.fetch = originalFetch;
});

it('keeps offline activity with its original account across logout and login', async () => {
  setSignalQueueSession('A', async () => null);
  await enqueueSignal(signal('private A search'));
  setSignalQueueSession(null);
  setSignalQueueSession('B', async () => token('B'));
  await enqueueSignal(signal('B search'));
  await flushSignalQueue();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).signals).toEqual([signal('B search')]);
  setSignalQueueSession('A', async () => token('A'));
  await flushSignalQueue();
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).signals).toEqual([signal('private A search')]);
});

it('refuses a refreshed token belonging to a different account', async () => {
  setSignalQueueSession('A', async () => token('B'));
  await enqueueSignal(signal('A search'));
  await flushSignalQueue();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('drops legacy unowned and guest activity instead of adopting it at login', async () => {
  await AsyncStorage.setItem('edutu_signal_queue:v1', JSON.stringify([{ signal: signal('legacy') }]));
  await enqueueSignal(signal('guest'));
  setSignalQueueSession('B', async () => token('B'));
  await flushSignalQueue();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem('edutu_signal_queue:v1')).toBeNull();
});

it('preserves an enqueue that arrives while an earlier batch is being delivered', async () => {
  let finish!: (response: unknown) => void;
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => { started = resolve; });
  fetchMock.mockImplementationOnce(() => { started(); return new Promise((resolve) => { finish = resolve; }); });
  setSignalQueueSession('A', async () => token('A'));
  await enqueueSignal(signal('first'));
  const flushing = flushSignalQueue();
  await requestStarted;
  await enqueueSignal(signal('second'));
  finish({ ok: true });
  await flushing;
  await flushSignalQueue();
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).signals).toEqual([signal('second')]);
});

it('supports an explicitly owned notification event before React mounts', async () => {
  await enqueueSignal(signal('notification'), async () => token('A'), 'A');
  await jest.advanceTimersByTimeAsync(1500);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).signals).toEqual([signal('notification')]);
});

it('checks account ownership without browser atob or Buffer globals', async () => {
  const jwt = token('A');
  const originalAtob = global.atob;
  const originalBuffer = global.Buffer;
  try {
    global.atob = undefined as any;
    global.Buffer = undefined as any;
    setSignalQueueSession('A', async () => jwt);
    await enqueueSignal(signal('native'));
    await flushSignalQueue();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    global.atob = originalAtob;
    global.Buffer = originalBuffer;
  }
});
