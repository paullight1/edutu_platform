import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addApplication, getApplications } from './applications';
import { productApiRequest } from './productApi';

vi.mock('./productApi', async (original) => ({
  ...(await original<typeof import('./productApi')>()),
  productApiRequest: vi.fn(),
}));
const opportunity = {
  id: 'opp-1',
  title: 'Fellowship',
  category: 'Scholarships',
};

describe('application persistence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves the server status when opening an already submitted application', async () => {
    vi.mocked(productApiRequest).mockResolvedValue({
      id: 'app-1',
      opportunity_id: 'opp-1',
      status: 'submitted',
    });
    expect(
      await addApplication('user-1', opportunity, { status: 'draft' }, 'token'),
    ).toMatchObject({ id: 'app-1', status: 'submitted' });
  });

  it('does not invent a saved application when the server returns no record', async () => {
    vi.mocked(productApiRequest).mockResolvedValue(null);
    await expect(
      addApplication('user-1', opportunity, {}, 'token'),
    ).rejects.toThrow();
  });

  it('reports a missing session instead of pretending the account has no applications', async () => {
    await expect(getApplications('user-1', null)).rejects.toThrow();
    expect(productApiRequest).not.toHaveBeenCalled();
  });
});
