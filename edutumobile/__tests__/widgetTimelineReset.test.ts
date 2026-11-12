jest.mock('@expo/ui/swift-ui', () => ({}));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({}));
jest.mock('expo-widgets', () => ({
  createWidget: () => ({ updateSnapshot: jest.fn(), updateTimeline: jest.fn() }),
}));

const modules = [
  ['OpportunityWidget', require('../widgets/OpportunityWidget.ios')],
  ['DeadlineWidget', require('../widgets/DeadlineWidget.ios')],
  ['TrendingWidget', require('../widgets/TrendingWidget.ios')],
  ['TrendingSpotlightWidget', require('../widgets/TrendingSpotlightWidget.ios')],
  ['TrendingGridWidget', require('../widgets/TrendingGridWidget.ios')],
  ['TrendingTickerWidget', require('../widgets/TrendingTickerWidget.ios')],
  ['TrendingThumbListWidget', require('../widgets/TrendingThumbListWidget.ios')],
] as const;

it.each(modules)('%s clears its snapshot when its timeline is reset', (name, module) => {
  const native = module.default;
  native.updateSnapshot.mockClear();
  module[`update${name}Timeline`]([]);
  expect(native.updateSnapshot).toHaveBeenCalledTimes(1);
  expect(native.updateSnapshot.mock.calls[0][0].items ?? []).toEqual([]);
});

it('Next Step schedules expiry and replaces the entire timeline on sign-out', () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 10, 12, 12));
  try {
    const module = require('../widgets/NextStepWidget.ios');
    const native = module.default;
    module.updateNextStepWidget({ state: 'ready', items: [{ title: 'Review your statement', deadline: '2026-11-13T12:00:00', deepLink: 'edutu://my-plan/a' }, { title: 'Prepare your CV', deadline: 'Rolling', deepLink: 'edutu://my-plan/b' }] });
    const entries = native.updateTimeline.mock.calls[0][0];
    expect(entries).toHaveLength(15);
    expect(entries[0].props.items).toHaveLength(2);
    expect(entries[2].props.items.map((item: { title: string }) => item.title)).toEqual(['Prepare your CV']);
    module.updateNextStepWidget({ state: 'signed_out', items: [] });
    expect(native.updateSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'signed_out', items: [] }));
  } finally { jest.useRealTimers(); }
});
