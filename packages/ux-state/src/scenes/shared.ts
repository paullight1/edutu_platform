import type { Layer, SceneSpec } from './types';

/**
 * The eighteen scenes every flow shares.
 *
 * All are `calm` except `success`: the soft tone carries the shape and the
 * saturated hue survives only as a small marker. See `volume.ts` for why.
 *
 * They use the same grammar as the empty set — a plate low in the frame, one
 * hero object near (120, 76) — so a user who has learned to read an empty state
 * reads an error state the same way.
 */

const plate = (y = 118, h = 42): Layer => ({
  t: 'rect',
  x: 44,
  y,
  w: 152,
  h,
  r: 18,
  fill: 'plate',
});

/** Shared padlock body, so the three gate scenes are unmistakably one idea. */
const padlock = (): Layer[] => [
  { t: 'path', d: 'M102 64v-9a18 18 0 0 1 36 0v9', stroke: 'hero', sw: 12, cap: 'round' },
  { t: 'rect', x: 84, y: 62, w: 72, h: 58, r: 16, fill: 'hero' },
  { t: 'circle', cx: 120, cy: 86, r: 7, fill: 'mark' },
  { t: 'rect', x: 117, y: 90, w: 6, h: 14, r: 3, fill: 'mark' },
];

/**
 * Shared "permission off" tile, so the four denied scenes are one idea.
 *
 * The slash is the constant; only the glyph under it changes. A user who has
 * been asked for notifications recognises the camera prompt instantly.
 */
const deniedTile = (glyph: Layer[]): Layer[] => [
  plate(),
  { t: 'rect', x: 76, y: 40, w: 88, h: 76, r: 22, fill: 'hero' },
  ...glyph,
  {
    t: 'group',
    anim: 'shiver',
    origin: [120, 78],
    children: [{ t: 'path', d: 'M88 50l64 58', stroke: 'mark', sw: 9, cap: 'round' }],
  },
];

const loading: SceneSpec = {
  viewBox: [240, 180],
  hue: 'neutral',
  volume: 'calm',
  layers: [
    plate(),
    { t: 'rect', x: 68, y: 46, w: 104, h: 66, r: 18, fill: 'hero' },
    {
      t: 'group',
      anim: 'blip',
      origin: [120, 72],
      children: [{ t: 'rect', x: 84, y: 66, w: 72, h: 10, r: 5, fill: 'mark', op: 0.5 }],
    },
    {
      t: 'group',
      anim: 'blip',
      origin: [120, 90],
      children: [{ t: 'rect', x: 84, y: 86, w: 46, h: 10, r: 5, fill: 'mark', op: 0.35 }],
    },
    {
      t: 'group',
      anim: 'scan',
      origin: [120, 79],
      children: [{ t: 'rect', x: 114, y: 46, w: 12, h: 66, fill: 'mark', op: 0.3 }],
    },
  ],
};

const refreshing: SceneSpec = {
  viewBox: [240, 180],
  hue: 'neutral',
  volume: 'calm',
  layers: [
    plate(),
    { t: 'circle', cx: 120, cy: 76, r: 44, fill: 'hero' },
    {
      t: 'group',
      anim: 'orbit',
      origin: [120, 76],
      children: [
        { t: 'path', d: 'M120 46a30 30 0 1 1-26 15', stroke: 'mark', sw: 10, cap: 'round' },
        { t: 'path', d: 'M120 34v24l-18-12z', fill: 'mark' },
      ],
    },
  ],
};

const partial: SceneSpec = {
  viewBox: [240, 180],
  hue: 'neutral',
  volume: 'calm',
  layers: [
    plate(),
    { t: 'rect', x: 64, y: 44, w: 108, h: 72, r: 20, fill: 'hero' },
    { t: 'rect', x: 82, y: 68, w: 72, h: 9, r: 4, fill: 'mark', op: 0.75 },
    { t: 'rect', x: 82, y: 86, w: 46, h: 9, r: 4, fill: 'mark', op: 0.45 },
    {
      t: 'group',
      anim: 'blip',
      origin: [176, 52],
      children: [
        { t: 'circle', cx: 176, cy: 52, r: 19, fill: 'mark' },
        { t: 'path', d: 'M176 42v10l7 5', stroke: 'hero', sw: 5, cap: 'round', join: 'round' },
      ],
    },
  ],
};

/**
 * A funnel with a single drop under it. The filter worked; it just caught
 * nothing. Nothing in this scene says "error", which is the entire point of
 * separating it from the failure set.
 */
const emptyFiltered: SceneSpec = {
  viewBox: [240, 180],
  hue: 'neutral',
  volume: 'calm',
  layers: [
    plate(134, 22),
    { t: 'path', d: 'M62 42h116l-42 46v36l-32-16V88z', fill: 'hero' },
    {
      t: 'group',
      anim: 'blip',
      origin: [120, 126],
      children: [{ t: 'circle', cx: 120, cy: 126, r: 7, fill: 'mark' }],
    },
  ],
};

const errorNetwork: SceneSpec = {
  viewBox: [240, 180],
  hue: 'danger',
  volume: 'calm',
  layers: [
    plate(),
    { t: 'rect', x: 58, y: 60, w: 54, h: 44, r: 14, fill: 'hero' },
    { t: 'rect', x: 128, y: 60, w: 54, h: 44, r: 14, fill: 'hero' },
    {
      t: 'group',
      anim: 'shiver',
      origin: [120, 82],
      children: [
        { t: 'path', d: 'M116 66l-8 14 10 5-8 15', stroke: 'mark', sw: 6, cap: 'round', join: 'round' },
      ],
    },
  ],
};

const errorAuth: SceneSpec = {
  viewBox: [240, 180],
  hue: 'danger',
  volume: 'calm',
  layers: [
    plate(),
    { t: 'rect', x: 64, y: 44, w: 108, h: 72, r: 20, fill: 'hero' },
    { t: 'circle', cx: 100, cy: 72, r: 14, fill: 'mark' },
    { t: 'path', d: 'M82 104a18 18 0 0 1 36 0z', fill: 'mark' },
    { t: 'rect', x: 128, y: 66, w: 32, h: 8, r: 4, fill: 'mark', op: 0.55 },
    { t: 'rect', x: 128, y: 82, w: 22, h: 8, r: 4, fill: 'mark', op: 0.35 },
    {
      t: 'group',
      anim: 'blip',
      origin: [176, 52],
      children: [
        { t: 'circle', cx: 176, cy: 52, r: 19, fill: 'mark' },
        { t: 'path', d: 'M170 46l12 12M182 46l-12 12', stroke: 'hero', sw: 5, cap: 'round' },
      ],
    },
  ],
};

const errorNotFound: SceneSpec = {
  viewBox: [240, 180],
  hue: 'danger',
  volume: 'calm',
  layers: [
    plate(),
    { t: 'rect', x: 62, y: 38, w: 88, h: 78, r: 18, fill: 'hero' },
    { t: 'rect', x: 78, y: 60, w: 50, h: 8, r: 4, fill: 'mark', op: 0.5 },
    { t: 'rect', x: 78, y: 76, w: 32, h: 8, r: 4, fill: 'mark', op: 0.3 },
    {
      t: 'group',
      anim: 'float',
      origin: [154, 96],
      children: [
        { t: 'circle', cx: 154, cy: 92, r: 28, fill: 'plate' },
        { t: 'circle', cx: 154, cy: 92, r: 28, stroke: 'mark', sw: 7 },
        { t: 'path', d: 'M174 112l16 16', stroke: 'mark', sw: 9, cap: 'round' },
      ],
    },
  ],
};

const errorServer: SceneSpec = {
  viewBox: [240, 180],
  hue: 'danger',
  volume: 'calm',
  layers: [
    plate(),
    { t: 'rect', x: 58, y: 46, w: 124, h: 32, r: 12, fill: 'hero' },
    { t: 'rect', x: 58, y: 84, w: 124, h: 32, r: 12, fill: 'hero' },
    { t: 'circle', cx: 72, cy: 62, r: 6, fill: 'mark' },
    { t: 'circle', cx: 72, cy: 100, r: 6, fill: 'mark' },
    { t: 'rect', x: 88, y: 58, w: 40, h: 8, r: 4, fill: 'mark', op: 0.45 },
    { t: 'rect', x: 88, y: 96, w: 40, h: 8, r: 4, fill: 'mark', op: 0.45 },
    {
      t: 'group',
      anim: 'shiver',
      origin: [156, 80],
      children: [
        { t: 'path', d: 'M158 40l-10 24 14 8-12 26', stroke: 'mark', sw: 6, cap: 'round', join: 'round' },
      ],
    },
  ],
};

const errorTimeout: SceneSpec = {
  viewBox: [240, 180],
  hue: 'danger',
  volume: 'calm',
  layers: [
    plate(),
    { t: 'circle', cx: 120, cy: 76, r: 46, fill: 'hero' },
    { t: 'circle', cx: 120, cy: 76, r: 34, fill: 'plate', op: 0.3 },
    { t: 'path', d: 'M120 76h22', stroke: 'mark', sw: 6, cap: 'round' },
    {
      t: 'group',
      anim: 'orbit',
      origin: [120, 76],
      children: [{ t: 'path', d: 'M120 76V48', stroke: 'mark', sw: 7, cap: 'round' }],
    },
    { t: 'circle', cx: 120, cy: 76, r: 5, fill: 'mark' },
  ],
};

const offline: SceneSpec = {
  viewBox: [240, 180],
  hue: 'offline',
  volume: 'calm',
  layers: [
    plate(),
    { t: 'circle', cx: 98, cy: 82, r: 22, fill: 'hero' },
    { t: 'circle', cx: 126, cy: 68, r: 28, fill: 'hero' },
    { t: 'circle', cx: 152, cy: 84, r: 20, fill: 'hero' },
    { t: 'rect', x: 98, y: 84, w: 54, h: 22, r: 11, fill: 'hero' },
    {
      t: 'group',
      anim: 'shiver',
      origin: [120, 82],
      children: [{ t: 'path', d: 'M90 54l60 58', stroke: 'mark', sw: 9, cap: 'round' }],
    },
  ],
};

const lockedPro: SceneSpec = {
  viewBox: [240, 180],
  hue: 'locked',
  volume: 'calm',
  layers: [
    plate(),
    ...padlock(),
    {
      t: 'group',
      anim: 'blip',
      origin: [180, 52],
      children: [{ t: 'path', d: 'M180 38l5 12 12 5-12 5-5 12-5-12-12-5 12-5z', fill: 'mark' }],
    },
  ],
};

const lockedGuest: SceneSpec = {
  viewBox: [240, 180],
  hue: 'locked',
  volume: 'calm',
  layers: [
    plate(),
    ...padlock(),
    {
      t: 'group',
      anim: 'float',
      origin: [180, 60],
      children: [
        { t: 'circle', cx: 180, cy: 48, r: 13, fill: 'mark' },
        { t: 'path', d: 'M162 76a18 18 0 0 1 36 0z', fill: 'mark' },
      ],
    },
  ],
};

const lockedModule: SceneSpec = {
  viewBox: [240, 180],
  hue: 'locked',
  volume: 'calm',
  layers: [
    plate(),
    ...padlock(),
    {
      t: 'group',
      anim: 'blip',
      origin: [180, 52],
      children: [
        { t: 'rect', x: 164, y: 36, w: 14, h: 14, r: 4, fill: 'mark' },
        { t: 'rect', x: 182, y: 36, w: 14, h: 14, r: 4, fill: 'mark', op: 0.6 },
        { t: 'rect', x: 164, y: 54, w: 14, h: 14, r: 4, fill: 'mark', op: 0.6 },
        { t: 'rect', x: 182, y: 54, w: 14, h: 14, r: 4, fill: 'mark', op: 0.3 },
      ],
    },
  ],
};

const deniedNotifications: SceneSpec = {
  viewBox: [240, 180],
  hue: 'denied',
  volume: 'calm',
  layers: deniedTile([
    { t: 'path', d: 'M120 54a18 18 0 0 1 18 18v14l7 9H95l7-9V72a18 18 0 0 1 18-18z', fill: 'mark' },
    { t: 'path', d: 'M112 100a8 8 0 0 0 16 0z', fill: 'mark' },
  ]),
};

const deniedCamera: SceneSpec = {
  viewBox: [240, 180],
  hue: 'denied',
  volume: 'calm',
  layers: deniedTile([
    { t: 'rect', x: 92, y: 64, w: 56, h: 40, r: 10, fill: 'mark' },
    { t: 'path', d: 'M108 64l5-8h14l5 8z', fill: 'mark' },
    { t: 'circle', cx: 120, cy: 84, r: 11, fill: 'hero' },
  ]),
};

const deniedCalendar: SceneSpec = {
  viewBox: [240, 180],
  hue: 'denied',
  volume: 'calm',
  layers: deniedTile([
    { t: 'rect', x: 92, y: 60, w: 56, h: 46, r: 9, fill: 'mark' },
    { t: 'rect', x: 92, y: 60, w: 56, h: 13, r: 6, fill: 'hero', op: 0.5 },
    { t: 'circle', cx: 106, cy: 88, r: 5, fill: 'hero' },
    { t: 'circle', cx: 122, cy: 88, r: 5, fill: 'hero' },
  ]),
};

const deniedPhotos: SceneSpec = {
  viewBox: [240, 180],
  hue: 'denied',
  volume: 'calm',
  layers: deniedTile([
    { t: 'rect', x: 92, y: 62, w: 56, h: 42, r: 9, fill: 'mark' },
    { t: 'circle', cx: 108, cy: 76, r: 6, fill: 'hero' },
    { t: 'path', d: 'M96 100l18-18 14 14 8-7 12 11z', fill: 'hero' },
  ]),
};

/** The one shared scene that invites. A win should look like a win. */
const success: SceneSpec = {
  viewBox: [240, 180],
  hue: 'success',
  volume: 'invite',
  layers: [
    plate(),
    {
      t: 'group',
      anim: 'pulse',
      origin: [120, 76],
      children: [{ t: 'circle', cx: 120, cy: 76, r: 58, stroke: 'hero', sw: 5, op: 0.5 }],
    },
    { t: 'circle', cx: 120, cy: 76, r: 44, fill: 'hero' },
    {
      t: 'group',
      anim: 'drawOn',
      origin: [120, 76],
      children: [
        { t: 'path', d: 'M100 76l14 15 27-30', stroke: 'mark', sw: 9, cap: 'round', join: 'round' },
      ],
    },
    { t: 'circle', cx: 52, cy: 48, r: 8, fill: 'plate', decor: true },
    { t: 'circle', cx: 196, cy: 52, r: 11, fill: 'plate', decor: true },
    { t: 'circle', cx: 190, cy: 122, r: 7, fill: 'plate', decor: true },
  ],
};

/** The 18 keys that are not owned by a single flow. */
export type SharedSceneKey =
  | 'loading'
  | 'refreshing'
  | 'partial'
  | 'emptyFiltered'
  | 'errorNetwork'
  | 'errorAuth'
  | 'errorNotFound'
  | 'errorServer'
  | 'errorTimeout'
  | 'offline'
  | 'lockedPro'
  | 'lockedGuest'
  | 'lockedModule'
  | 'deniedNotifications'
  | 'deniedCamera'
  | 'deniedCalendar'
  | 'deniedPhotos'
  | 'success';

// NOT `as const` — that would widen `viewBox` to a readonly tuple, which is not
// assignable to `SceneSpec['viewBox']` when this object is spread into `SCENES`.
export const SHARED_SCENES: Record<SharedSceneKey, SceneSpec> = {
  loading,
  refreshing,
  partial,
  emptyFiltered,
  errorNetwork,
  errorAuth,
  errorNotFound,
  errorServer,
  errorTimeout,
  offline,
  lockedPro,
  lockedGuest,
  lockedModule,
  deniedNotifications,
  deniedCamera,
  deniedCalendar,
  deniedPhotos,
  success,
};
