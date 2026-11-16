import { describe, expect, it } from 'vitest';
import { ANIM_IDS } from '../types';
import { ANIMS, REST } from '../motion';

describe('the motion vocabulary', () => {
  it('defines every declared AnimId and nothing else', () => {
    expect(Object.keys(ANIMS).sort()).toEqual([...ANIM_IDS].sort());
  });

  it('gives every motion at least two frames, or it is not a motion', () => {
    for (const id of ANIM_IDS) {
      expect(ANIMS[id].frames.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('closes every looping motion back onto its first frame, so loops do not jump', () => {
    // Rotation is compared modulo 360: a continuous spin must END at 360 rather
    // than snap back to 0, and 360 is the same pose as 0.
    const pose = (frame: (typeof ANIMS)[keyof typeof ANIMS]['frames'][number]) => ({
      ...frame,
      rotate: frame.rotate === undefined ? undefined : ((frame.rotate % 360) + 360) % 360,
    });

    for (const id of ANIM_IDS) {
      const spec = ANIMS[id];
      if (!spec.loop) continue;
      expect(pose(spec.frames[spec.frames.length - 1])).toEqual(pose(spec.frames[0]));
    }
  });

  it('gives every motion a rest frame for reduced motion', () => {
    for (const id of ANIM_IDS) {
      expect(ANIMS[id].rest).toBeDefined();
    }
  });

  it('keeps rest poses visible — a reduced-motion user must not see an invisible scene', () => {
    for (const id of ANIM_IDS) {
      const opacity = ANIMS[id].rest.opacity;
      expect(opacity === undefined || opacity > 0).toBe(true);
    }
  });

  it('exposes an identity rest frame', () => {
    expect(REST).toEqual({ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, dash: 0 });
  });

  it('keeps durations in a range that reads as ambient, not frantic', () => {
    for (const id of ANIM_IDS) {
      expect(ANIMS[id].durationMs).toBeGreaterThanOrEqual(400);
      expect(ANIMS[id].durationMs).toBeLessThanOrEqual(6000);
    }
  });
});
