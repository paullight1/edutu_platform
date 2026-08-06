import { describe, expect, it } from 'vitest';
import { SCENES, sceneForState } from '../index';
import { ANIMS } from '../motion';
import { ANIM_IDS, PAINTS, type Layer, type SceneKey } from '../types';

const ALL_KEYS: SceneKey[] = [
  'emptyHome',
  'emptyDiscovery',
  'emptySaved',
  'emptyApplied',
  'emptyGoals',
  'emptyCoach',
  'emptyWallet',
  'emptyCommunity',
  'loading',
  'refreshing',
  'partial',
  'emptyFiltered',
  'errorNetwork',
  'errorAuth',
  'errorNotFound',
  'errorServer',
  'errorTimeout',
  'offline',
  'lockedPro',
  'lockedGuest',
  'lockedModule',
  'deniedNotifications',
  'deniedCamera',
  'deniedCalendar',
  'deniedPhotos',
  'success',
];

function walk(layers: Layer[], visit: (layer: Layer) => void): void {
  for (const layer of layers) {
    visit(layer);
    if (layer.t === 'group') walk(layer.children, visit);
  }
}

describe('the scene registry', () => {
  it('has all 26 scenes and no extras', () => {
    expect(Object.keys(SCENES).sort()).toEqual([...ALL_KEYS].sort());
    expect(ALL_KEYS).toHaveLength(26);
  });

  // This is the test that keeps the package honest. A colour literal or a
  // bespoke animation in a scene file fails here rather than in review.
  it('never lets a raw colour into a scene — only paint roles', () => {
    for (const key of ALL_KEYS) {
      walk(SCENES[key].layers, (layer) => {
        if (layer.t === 'group') return;
        if (layer.fill !== undefined) expect(PAINTS).toContain(layer.fill);
        if (layer.stroke !== undefined) expect(PAINTS).toContain(layer.stroke);
      });
    }
  });

  it('never lets a bespoke animation into a scene — only motion names', () => {
    for (const key of ALL_KEYS) {
      walk(SCENES[key].layers, (layer) => {
        if (layer.anim !== undefined) {
          expect(ANIM_IDS).toContain(layer.anim);
          expect(ANIMS[layer.anim]).toBeDefined();
        }
      });
    }
  });

  it('gives every scene the same stage and at least one drawn layer', () => {
    for (const key of ALL_KEYS) {
      expect(SCENES[key].viewBox).toEqual([240, 180]);
      expect(SCENES[key].layers.length).toBeGreaterThan(0);
    }
  });

  it('keeps every failure and gate state calm, and every invitation loud', () => {
    const invite: SceneKey[] = [
      'emptyHome',
      'emptyDiscovery',
      'emptySaved',
      'emptyApplied',
      'emptyGoals',
      'emptyCoach',
      'emptyWallet',
      'emptyCommunity',
      'success',
    ];
    for (const key of ALL_KEYS) {
      expect(SCENES[key].volume).toBe(invite.includes(key) ? 'invite' : 'calm');
    }
  });

  it('never paints a filtered-empty in the danger hue', () => {
    // A search that matched nothing is not a failure, and borrowing the error
    // hue teaches users to read their own filter as the app being broken.
    expect(SCENES.emptyFiltered.hue).toBe('neutral');
  });

  it('gives every scene at least one animated layer', () => {
    for (const key of ALL_KEYS) {
      let animated = false;
      walk(SCENES[key].layers, (layer) => {
        if (layer.anim) animated = true;
      });
      expect(animated, `${key} has no motion`).toBe(true);
    }
  });
});

describe('sceneForState', () => {
  it('picks the owning flow scene for a first-run empty', () => {
    expect(sceneForState({ kind: 'empty', reason: 'firstRun' }, 'saved')).toBe('emptySaved');
    expect(sceneForState({ kind: 'empty', reason: 'firstRun' }, 'goals')).toBe('emptyGoals');
  });

  it('uses the one shared scene for a filtered empty, whatever the flow', () => {
    expect(sceneForState({ kind: 'empty', reason: 'filtered' }, 'saved')).toBe('emptyFiltered');
    expect(sceneForState({ kind: 'empty', reason: 'filtered' }, 'wallet')).toBe('emptyFiltered');
  });

  it('maps each error cause to its own scene', () => {
    expect(sceneForState({ kind: 'error', cause: 'auth' }, 'home')).toBe('errorAuth');
    expect(sceneForState({ kind: 'error', cause: 'notFound' }, 'home')).toBe('errorNotFound');
    expect(sceneForState({ kind: 'error', cause: 'timeout' }, 'home')).toBe('errorTimeout');
    expect(sceneForState({ kind: 'error', cause: 'server' }, 'home')).toBe('errorServer');
    expect(sceneForState({ kind: 'error', cause: 'network' }, 'home')).toBe('errorNetwork');
  });

  it('maps gates and permissions', () => {
    expect(sceneForState({ kind: 'locked', reason: 'pro' }, 'home')).toBe('lockedPro');
    expect(sceneForState({ kind: 'locked', reason: 'guest' }, 'home')).toBe('lockedGuest');
    expect(sceneForState({ kind: 'locked', reason: 'module' }, 'home')).toBe('lockedModule');
    expect(sceneForState({ kind: 'denied', permission: 'camera' }, 'home')).toBe('deniedCamera');
    expect(sceneForState({ kind: 'denied', permission: 'photos' }, 'home')).toBe('deniedPhotos');
  });

  it('falls back to loading for a ready screen rather than throwing', () => {
    expect(sceneForState({ kind: 'ready' }, 'home')).toBe('loading');
  });
});
