import { describe, expect, it } from 'vitest';
import { EMPTY_SCENES } from '../empty';
import type { FlowKey } from '../types';

const FLOWS: FlowKey[] = [
  'home',
  'discovery',
  'saved',
  'applied',
  'goals',
  'coach',
  'wallet',
  'community',
];

describe('per-flow empty scenes', () => {
  it('covers all eight flows', () => {
    expect(Object.keys(EMPTY_SCENES).sort()).toEqual([...FLOWS].sort());
  });

  it('renders every empty state at full volume — these invite, they do not warn', () => {
    for (const flow of FLOWS) {
      expect(EMPTY_SCENES[flow].volume).toBe('invite');
    }
  });

  it('speaks in the owning flow hue so an empty Goals screen matches the theme pack', () => {
    for (const flow of FLOWS) {
      expect(EMPTY_SCENES[flow].hue).toBe('flow');
    }
  });

  it('shares one stage size across the family', () => {
    for (const flow of FLOWS) {
      expect(EMPTY_SCENES[flow].viewBox).toEqual([240, 180]);
    }
  });

  it('gives every scene something drawn and something moving', () => {
    for (const flow of FLOWS) {
      const scene = EMPTY_SCENES[flow];
      expect(scene.layers.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(scene.layers)).toContain('"anim"');
    }
  });

  it('gives every scene decorative warmth, since invites keep their decor', () => {
    for (const flow of FLOWS) {
      expect(JSON.stringify(EMPTY_SCENES[flow].layers)).toContain('"decor"');
    }
  });
});
