import { shouldCloseFeatureMenuOnSwipe } from '../featureMenuGesture';

describe('feature menu swipe dismissal', () => {
  it('closes on a deliberate horizontal left swipe', () => {
    expect(
      shouldCloseFeatureMenuOnSwipe({ dx: -72, dy: 8, vx: -0.6 }),
    ).toBe(true);
  });

  it('ignores short, vertical, and rightward gestures', () => {
    expect(shouldCloseFeatureMenuOnSwipe({ dx: -18, dy: 2, vx: -0.2 })).toBe(false);
    expect(shouldCloseFeatureMenuOnSwipe({ dx: -72, dy: 80, vx: -0.6 })).toBe(false);
    expect(shouldCloseFeatureMenuOnSwipe({ dx: 72, dy: 8, vx: 0.6 })).toBe(false);
  });
});
