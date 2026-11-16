import { loadLegacyPlan } from '../lib/myPlan';
import { requestProductApi } from '../packages/core/src/services/productApi';

jest.mock('../packages/core/src/services/productApi', () => ({ requestProductApi: jest.fn() }));
const request = jest.mocked(requestProductApi);

describe('My Plan existing records', () => {
  it('separates preparation, confirmed applications and outcomes without duplicating bookmarks', async () => {
    request.mockImplementation(async (path) => path.includes('bookmarks') ? [
      { opportunity_id: 'saved', opportunity: { title: 'Saved scholarship' } },
      { opportunity_id: 'draft', opportunity: { title: 'Already pursuing' } },
    ] : [
      { id: '1', opportunity_id: 'draft', status: 'draft', opportunity: { title: 'Preparing' } },
      { id: '2', opportunity_id: 'opened', status: 'application_opened', opportunity: { title: 'Opened only' } },
      { id: '3', opportunity_id: 'submitted', status: 'submitted', opportunity: { title: 'Submitted' } },
      { id: '4', opportunity_id: 'offer', status: 'offer', opportunity: { title: 'Offer' } },
    ]);
    const items = await loadLegacyPlan(async () => 'token');
    expect(items.map((item) => [item.opportunityId, item.stage])).toEqual([
      ['draft', 'pursuing'], ['opened', 'pursuing'], ['submitted', 'applied'], ['offer', 'outcome'], ['saved', 'discover'],
    ]);
  });

  it('reports a failed read instead of claiming the user has no opportunities', async () => {
    request.mockResolvedValue(null);
    await expect(loadLegacyPlan(async () => 'token')).rejects.toThrow();
  });
});
