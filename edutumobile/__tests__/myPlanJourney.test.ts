import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestProductApi } from '../packages/core/src/services/productApi';
import { listOpportunityJourneys, mutateOpportunityJourney, OpportunityJourneyApiError } from '../packages/core/src/services/opportunityJourney';
jest.mock('../packages/core/src/services/productApi', () => ({ requestProductApi: jest.fn(), getApiBaseUrl: () => 'https://api.example.test' }));
const request = jest.mocked(requestProductApi);
const input = { userId: 'member', stage: 'pursuing' as const, getAuthToken: async () => 'token' };

beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); });

it('reuses only the current account and stage snapshot after a network failure', async () => {
  request.mockResolvedValueOnce([{ journey: { id: 'one' } }]);
  expect((await listOpportunityJourneys(input)).source).toBe('network');
  request.mockResolvedValue(null);
  expect((await listOpportunityJourneys(input)).source).toBe('snapshot');
  expect((await listOpportunityJourneys({ ...input, userId: 'someone-else' })).data).toBeNull();
  expect((await listOpportunityJourneys({ ...input, stage: 'applied' })).data).toBeNull();
});

it('keeps fresh network data usable even if snapshot storage fails', async () => {
  request.mockResolvedValue([{ journey: { id: 'fresh' } }]);
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));
  const result = await listOpportunityJourneys(input);
  expect(result.source).toBe('network');
  expect(result.data?.[0].journey.id).toBe('fresh');
});

it('surfaces a version conflict and sends the original retry key to the backend', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 409, json: async () => ({ code: 'JOURNEY_VERSION_CONFLICT', message: 'This plan changed on another device. Refresh and retry.' }) } as Response);
  try {
    await expect(mutateOpportunityJourney({ getAuthToken: input.getAuthToken, journeyId: 'journey-one', action: 'transition', body: { state: 'interview', expectedVersion: 2, idempotencyKey: 'original-request' } })).rejects.toBeInstanceOf(OpportunityJourneyApiError);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ state: 'interview', expectedVersion: 2, idempotencyKey: 'original-request' });
  } finally { fetchMock.mockRestore(); }
});

it('does not send a write without an authenticated token', async () => {
  const fetchMock = jest.spyOn(global, 'fetch');
  try {
    await expect(mutateOpportunityJourney({ getAuthToken: async () => null, body: { opportunityId: 'one', action: 'pursue', idempotencyKey: 'signed-out-request' } })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  } finally { fetchMock.mockRestore(); }
});
