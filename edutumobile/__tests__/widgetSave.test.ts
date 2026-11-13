import { saveOpportunityFromWidget } from '../packages/core/src/services/bookmarks';
import { requestProductApi } from '../packages/core/src/services/productApi';
jest.mock('../packages/core/src/services/productApi', () => ({ ...jest.requireActual('../packages/core/src/services/productApi'), requestProductApi: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({ removeItem: jest.fn().mockResolvedValue(undefined) }));
const api = requestProductApi as jest.Mock;
const getToken = jest.fn().mockResolvedValue('session');
beforeEach(() => jest.clearAllMocks());
it('saves through the authenticated backend with a POST, never a toggle', async () => {
  api.mockResolvedValue({ saved: true });
  await saveOpportunityFromWidget('user-a', 'opportunity-a', getToken);
  expect(api).toHaveBeenCalledWith('/me/opportunities/opportunity-a/bookmark', { method: 'POST' }, getToken, 12000, { throwOnError: true, forceRefreshToken: false });
});
it('does not report success when offline or unauthenticated', async () => {
  api.mockResolvedValue(null);
  await expect(saveOpportunityFromWidget('user-a', 'opportunity-a', getToken)).rejects.toThrow();
});
it('rejects missing identity or item before making a request', async () => {
  await expect(saveOpportunityFromWidget('', 'opportunity-a', getToken)).rejects.toThrow();
  await expect(saveOpportunityFromWidget('user-a', '', getToken)).rejects.toThrow();
  expect(api).not.toHaveBeenCalled();
});
