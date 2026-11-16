import { DURATION, getMotion, STAGGER_MS, staggerDelay } from '../motion';

describe('motion', () => {
  describe('staggerDelay', () => {
    it('offsets each item so a list reads as arriving, not flashing', () => {
      expect(staggerDelay(0)).toBe(0);
      expect(staggerDelay(3)).toBe(3 * STAGGER_MS);
    });

    it('caps the offset so a long list does not crawl', () => {
      expect(staggerDelay(40)).toBe(staggerDelay(9));
    });
  });

  describe('getMotion(false)', () => {
    const motion = getMotion(false);

    it('exposes the real durations', () => {
      expect(motion.duration.base).toBe(DURATION.base);
    });

    it('permits ambient loops', () => {
      expect(motion.allowLoop).toBe(true);
    });
  });

  describe('getMotion(true) — reduced motion', () => {
    const motion = getMotion(true);

    it('zeroes every duration so timings resolve instantly', () => {
      // This is the property that makes honoring the preference the default:
      // a component can call withTiming(…, motion.duration.base) unconditionally
      // and still be correct for a motion-sensitive user.
      Object.values(motion.duration).forEach((d) => expect(d).toBe(0));
    });

    it('forbids ambient loops', () => {
      // A permanently breathing scene is the worst offender for motion
      // sensitivity, so every Tier 1 scene gates its loop on this.
      expect(motion.allowLoop).toBe(false);
    });

    it('collapses the stagger so lists appear at once', () => {
      expect(motion.stagger(5)).toBe(0);
    });

    it('makes springs settle without visible travel', () => {
      expect(motion.spring.gentle.damping).toBeGreaterThanOrEqual(100);
    });

    it('reports itself as reduced', () => {
      expect(motion.reduced).toBe(true);
    });
  });
});
