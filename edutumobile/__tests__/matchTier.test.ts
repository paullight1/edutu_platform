import { getMatchTier, MATCH_TIER_KEY } from '@edutu/core/src/utils/matchTier';

test('tier boundaries', () => {
  expect(getMatchTier(80)).toBe('excellent');
  expect(getMatchTier(79)).toBe('strong');
  expect(getMatchTier(60)).toBe('strong');
  expect(getMatchTier(40)).toBe('good');
  expect(getMatchTier(39)).toBe('fair');
});

test('key map total', () => {
  expect(MATCH_TIER_KEY.excellent).toBe('fitExcellent');
  expect(MATCH_TIER_KEY.fair).toBe('fitWorthALook');
});
