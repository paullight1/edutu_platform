const mockRequest = jest.fn();

jest.mock('../packages/core/src/services/productApi', () => ({
  requestProductApi: (...args: unknown[]) => mockRequest(...args),
}));

const { fetchSavedOpportunities } = require('../packages/core/src/services/bookmarks');

/**
 * Builds a minimal Supabase stub whose `.select('*').in(...)` resolves to `rows`.
 * Records the selected columns so we can assert we never re-introduce an
 * explicit column list (schema drift there is what blanked the screen).
 */
function makeSupabase(rows: any[], selectSpy?: jest.Mock) {
  return {
    from: () => ({
      select: (cols: string) => {
        selectSpy?.(cols);
        return {
          in: async () => ({ data: rows, error: null }),
          eq: () => ({ limit: async () => ({ data: [], error: null }) }),
          order: async () => ({ data: rows, error: null }),
        };
      },
    }),
  } as any;
}

const OPP_ID = '11111111-1111-4111-8111-111111111111';

describe('saved opportunities hydration', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('hydrates from Supabase when the API returns bookmarks with no opportunity details', async () => {
    // Reproduces the production bug: the API answered with bookmark rows whose
    // hydration failed, so there is no nested `opportunity`.
    mockRequest.mockResolvedValue([
      { id: 'bm-1', opportunity_id: OPP_ID, user_id: 'u1', created_at: '2026-01-01' },
    ]);

    const supabase = makeSupabase([
      {
        id: OPP_ID,
        title: 'Naija Coke Summership Program 2026',
        organization: 'Coca-Cola Nigeria',
        category: 'careers',
        location: 'Nigeria',
        deadline: '2026-09-01',
        image_url: 'https://img.test/coke.png',
        quality_score: 68,
      },
    ]);

    const saved = await fetchSavedOpportunities(supabase, 'user_1');

    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe('Naija Coke Summership Program 2026');
    expect(saved[0].organization).toBe('Coca-Cola Nigeria');
    expect(saved[0].deadline).toBe('2026-09-01');
    expect(saved[0].image).toBe('https://img.test/coke.png');
    // No stored match_score column — falls back to quality_score.
    expect(saved[0].match_score).toBe(68);
  });

  it('never falls back to the bookmark row itself for opportunity fields', async () => {
    // The old code did `row.opportunity || row`, so a bookmark row's own shape
    // masqueraded as an opportunity and produced silent undefined titles.
    // The bookmark row carries its own unrelated `title`/`category` columns.
    // Old code (`row.opportunity || row`) would surface these as if they were
    // the opportunity's; they must never leak through.
    mockRequest.mockResolvedValue([
      {
        id: 'bm-2',
        opportunity_id: OPP_ID,
        user_id: 'u1',
        title: 'BOOKMARK ROW TITLE',
        category: 'BOOKMARK ROW CATEGORY',
      },
    ]);

    // Supabase finds nothing, so details legitimately stay undefined rather
    // than being invented from the bookmark row.
    const saved = await fetchSavedOpportunities(makeSupabase([]), 'user_1');

    expect(saved).toHaveLength(1);
    expect(saved[0].opportunity_id).toBe(OPP_ID);
    expect(saved[0].title).toBeUndefined();
    expect(saved[0].category).toBeUndefined();
  });

  it('uses the API payload directly when it already carries a hydrated opportunity', async () => {
    mockRequest.mockResolvedValue([
      {
        id: 'bm-3',
        opportunity_id: OPP_ID,
        opportunity: { id: OPP_ID, title: 'Already Hydrated', organization: 'Org' },
      },
    ]);

    const selectSpy = jest.fn();
    const saved = await fetchSavedOpportunities(makeSupabase([], selectSpy), 'user_1');

    expect(saved[0].title).toBe('Already Hydrated');
    // Nothing was missing, so we must not issue a repair query.
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it('hydrates with select(*) so a renamed column cannot error the whole query', async () => {
    mockRequest.mockResolvedValue([
      { id: 'bm-4', opportunity_id: OPP_ID, user_id: 'u1' },
    ]);

    const selectSpy = jest.fn();
    await fetchSavedOpportunities(
      makeSupabase([{ id: OPP_ID, title: 'X' }], selectSpy),
      'user_1',
    );

    expect(selectSpy).toHaveBeenCalledWith('*');
  });
});
