import { renderHook, act } from '@testing-library/react-native';
import {
  computeRevealCount,
  useStaggeredReveal,
} from '../packages/core/src/hooks/useStaggeredReveal';

describe('computeRevealCount', () => {
  it('shows the first item immediately then one more per step', () => {
    expect(computeRevealCount(0, 5, 200)).toBe(1);
    expect(computeRevealCount(199, 5, 200)).toBe(1);
    expect(computeRevealCount(200, 5, 200)).toBe(2);
    expect(computeRevealCount(600, 5, 200)).toBe(4);
  });

  it('never exceeds the total and handles edge cases', () => {
    expect(computeRevealCount(10_000, 3, 200)).toBe(3);
    expect(computeRevealCount(100, 0, 200)).toBe(0);
    expect(computeRevealCount(-1, 5, 200)).toBe(0);
    expect(computeRevealCount(100, 5, 0)).toBe(5); // no delay → all at once
  });
});

describe('useStaggeredReveal', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reveals all items at once when disabled', () => {
    const { result } = renderHook(() => useStaggeredReveal(4, { enabled: false }));
    expect(result.current).toBe(4);
  });

  it('ramps from 1 to total as time advances', () => {
    const { result } = renderHook(() => useStaggeredReveal(3, { stepMs: 100, enabled: true }));
    expect(result.current).toBe(1);
    act(() => { jest.advanceTimersByTime(100); });
    expect(result.current).toBe(2);
    act(() => { jest.advanceTimersByTime(100); });
    expect(result.current).toBe(3);
    // Caps at total and stops.
    act(() => { jest.advanceTimersByTime(500); });
    expect(result.current).toBe(3);
  });

  it('handles a single-item plan without a timer', () => {
    const { result } = renderHook(() => useStaggeredReveal(1, { stepMs: 100 }));
    expect(result.current).toBe(1);
  });
});
