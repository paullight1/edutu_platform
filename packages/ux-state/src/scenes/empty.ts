import type { FlowKey, Layer, SceneSpec } from './types';

/**
 * The eight first-run empty scenes.
 *
 * Composition grammar shared by the whole family, so eight separate drawings
 * still read as one set:
 *   · a `plate` slab low in the frame, which gives every scene the same ground
 *   · one hero object centred near (120, 74)
 *   · `mark` used only for detail *inside* the hero object
 *   · two or three decorative plate circles, dropped automatically when calm
 *
 * Every scene says "here is what will live here", never "you have nothing".
 * That distinction is the whole job: an empty state is the first thing a new
 * user sees on most screens, and a picture of absence teaches them the app is
 * broken rather than that they have not started yet.
 */

const plate = (y = 116, h = 44): Layer => ({
  t: 'rect',
  x: 44,
  y,
  w: 152,
  h,
  r: 18,
  fill: 'plate',
});

/** Home — the feed that is about to exist, fanned and waiting. */
const home: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(),
    {
      t: 'group',
      rotate: -9,
      origin: [120, 80],
      children: [{ t: 'rect', x: 74, y: 40, w: 92, h: 72, r: 20, fill: 'mark', op: 0.5 }],
    },
    {
      t: 'group',
      rotate: 8,
      origin: [120, 80],
      children: [{ t: 'rect', x: 74, y: 40, w: 92, h: 72, r: 20, fill: 'mark', op: 0.8 }],
    },
    {
      t: 'group',
      anim: 'float',
      origin: [120, 76],
      children: [
        { t: 'rect', x: 74, y: 40, w: 92, h: 72, r: 20, fill: 'hero' },
        { t: 'rect', x: 90, y: 62, w: 52, h: 8, r: 4, fill: 'plate' },
        { t: 'rect', x: 90, y: 78, w: 34, h: 8, r: 4, fill: 'plate', op: 0.6 },
      ],
    },
    {
      t: 'group',
      anim: 'blip',
      origin: [180, 44],
      children: [
        { t: 'path', d: 'M180 32l4.5 11 11 4.5-11 4.5-4.5 11-4.5-11-11-4.5 11-4.5z', fill: 'hero' },
      ],
    },
    { t: 'circle', cx: 54, cy: 54, r: 8, fill: 'plate', decor: true },
    { t: 'circle', cx: 192, cy: 92, r: 11, fill: 'plate', decor: true },
  ],
};

/** Discovery — a radar sweeping. We are looking, not failing to find. */
const discovery: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(126, 34),
    {
      t: 'group',
      anim: 'pulse',
      origin: [120, 76],
      children: [{ t: 'circle', cx: 120, cy: 76, r: 58, stroke: 'hero', sw: 4, op: 0.5 }],
    },
    { t: 'circle', cx: 120, cy: 76, r: 46, fill: 'hero' },
    { t: 'circle', cx: 120, cy: 76, r: 30, fill: 'plate', op: 0.35 },
    {
      t: 'group',
      anim: 'orbit',
      origin: [120, 76],
      children: [{ t: 'path', d: 'M120 76l24-28-9 37z', fill: 'mark' }],
    },
    { t: 'circle', cx: 120, cy: 76, r: 6, fill: 'mark' },
    { t: 'circle', cx: 52, cy: 50, r: 7, fill: 'plate', decor: true },
    { t: 'circle', cx: 196, cy: 60, r: 10, fill: 'plate', decor: true },
  ],
};

/**
 * Saved — an open slot with a card mid-flight toward it.
 *
 * The idea the scene has to carry is that saving is a shelf you build, not a
 * feature you failed to use. Its rest pose leaves the card above the slot, so a
 * static frame still reads as "about to be saved" rather than as loss.
 */
const saved: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    { t: 'rect', x: 40, y: 98, w: 160, h: 58, r: 20, fill: 'plate' },
    {
      t: 'group',
      anim: 'pulse',
      origin: [120, 127],
      children: [{ t: 'rect', x: 58, y: 112, w: 124, h: 30, r: 12, fill: 'hero', op: 0.25 }],
    },
    {
      t: 'group',
      anim: 'flyIn',
      origin: [120, 68],
      children: [
        { t: 'rect', x: 76, y: 34, w: 88, h: 66, r: 18, fill: 'hero' },
        { t: 'rect', x: 92, y: 56, w: 48, h: 8, r: 4, fill: 'mark', op: 0.85 },
        { t: 'rect', x: 92, y: 72, w: 30, h: 8, r: 4, fill: 'mark', op: 0.55 },
        { t: 'path', d: 'M148 34h8a8 8 0 0 1 8 8v26l-12-8-12 8V42a8 8 0 0 1 8-8z', fill: 'plate' },
      ],
    },
    { t: 'circle', cx: 54, cy: 56, r: 9, fill: 'plate', decor: true },
    { t: 'circle', cx: 192, cy: 76, r: 13, fill: 'plate', decor: true },
  ],
};

/** Applied — a track with three stops, the first already yours. */
const applied: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(130, 26),
    { t: 'path', d: 'M62 92H178', stroke: 'plate', sw: 12, cap: 'round' },
    {
      t: 'group',
      anim: 'pulse',
      origin: [62, 92],
      children: [{ t: 'circle', cx: 62, cy: 92, r: 26, stroke: 'hero', sw: 4, op: 0.5 }],
    },
    { t: 'circle', cx: 62, cy: 92, r: 18, fill: 'hero' },
    { t: 'path', d: 'M55 92l5 6 10-12', stroke: 'mark', sw: 5, cap: 'round', join: 'round' },
    { t: 'circle', cx: 120, cy: 92, r: 15, fill: 'plate' },
    { t: 'circle', cx: 178, cy: 92, r: 15, fill: 'plate' },
    {
      t: 'group',
      anim: 'float',
      origin: [120, 48],
      children: [
        { t: 'rect', x: 92, y: 30, w: 56, h: 34, r: 12, fill: 'hero' },
        { t: 'rect', x: 102, y: 42, w: 36, h: 6, r: 3, fill: 'mark', op: 0.8 },
        { t: 'rect', x: 102, y: 52, w: 22, h: 6, r: 3, fill: 'mark', op: 0.5 },
      ],
    },
    { t: 'circle', cx: 204, cy: 52, r: 9, fill: 'plate', decor: true },
    { t: 'circle', cx: 36, cy: 56, r: 7, fill: 'plate', decor: true },
  ],
};

/** Goals — a climb, not a mountain: three steps and a flag you are heading for. */
const goals: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(146, 14),
    { t: 'rect', x: 54, y: 110, w: 42, h: 40, r: 12, fill: 'plate' },
    { t: 'rect', x: 100, y: 86, w: 42, h: 64, r: 12, fill: 'mark' },
    { t: 'rect', x: 146, y: 56, w: 42, h: 94, r: 12, fill: 'hero' },
    {
      t: 'group',
      anim: 'float',
      origin: [167, 40],
      children: [
        { t: 'path', d: 'M167 58V26', stroke: 'hero', sw: 6, cap: 'round' },
        { t: 'path', d: 'M167 26l28 9-28 9z', fill: 'hero' },
      ],
    },
    {
      t: 'group',
      anim: 'blip',
      origin: [167, 82],
      children: [{ t: 'circle', cx: 167, cy: 82, r: 8, fill: 'mark' }],
    },
    { t: 'circle', cx: 46, cy: 62, r: 8, fill: 'plate', decor: true },
    { t: 'circle', cx: 208, cy: 118, r: 10, fill: 'plate', decor: true },
  ],
};

/** Coach — a bubble waiting to be spoken into. */
const coach: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(),
    {
      t: 'group',
      anim: 'float',
      origin: [120, 76],
      children: [
        {
          t: 'path',
          d: 'M70 36h100a22 22 0 0 1 22 22v40a22 22 0 0 1-22 22h-52l-24 20v-20H70a22 22 0 0 1-22-22V58a22 22 0 0 1 22-22z',
          fill: 'hero',
        },
        { t: 'rect', x: 68, y: 62, w: 68, h: 9, r: 4, fill: 'mark', op: 0.85 },
        { t: 'rect', x: 68, y: 80, w: 46, h: 9, r: 4, fill: 'mark', op: 0.55 },
      ],
    },
    {
      t: 'group',
      anim: 'blip',
      origin: [186, 44],
      children: [{ t: 'path', d: 'M186 30l5 12 12 5-12 5-5 12-5-12-12-5 12-5z', fill: 'hero' }],
    },
    { t: 'circle', cx: 50, cy: 60, r: 8, fill: 'plate', decor: true },
    { t: 'circle', cx: 200, cy: 104, r: 11, fill: 'plate', decor: true },
  ],
};

/** Wallet — a stack that is going to grow, plus the card it pays for. */
const wallet: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(142, 18),
    { t: 'rect', x: 62, y: 122, w: 68, h: 16, r: 8, fill: 'plate' },
    { t: 'rect', x: 62, y: 104, w: 68, h: 16, r: 8, fill: 'mark' },
    {
      t: 'group',
      anim: 'float',
      origin: [96, 94],
      children: [{ t: 'rect', x: 62, y: 86, w: 68, h: 16, r: 8, fill: 'hero' }],
    },
    {
      t: 'group',
      rotate: -8,
      origin: [166, 82],
      children: [
        { t: 'rect', x: 132, y: 56, w: 76, h: 52, r: 14, fill: 'hero' },
        { t: 'rect', x: 132, y: 68, w: 76, h: 10, fill: 'mark', op: 0.85 },
        { t: 'rect', x: 142, y: 90, w: 26, h: 7, r: 3, fill: 'mark', op: 0.6 },
      ],
    },
    { t: 'circle', cx: 52, cy: 56, r: 8, fill: 'plate', decor: true },
    { t: 'circle', cx: 204, cy: 132, r: 10, fill: 'plate', decor: true },
  ],
};

/** Community — three people in an arc, the middle one yours. */
const community: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(128, 32),
    {
      t: 'group',
      anim: 'pulse',
      origin: [120, 76],
      children: [{ t: 'circle', cx: 120, cy: 76, r: 56, stroke: 'hero', sw: 4, op: 0.45 }],
    },
    { t: 'circle', cx: 78, cy: 92, r: 20, fill: 'mark' },
    { t: 'path', d: 'M52 126a26 26 0 0 1 52 0z', fill: 'mark' },
    { t: 'circle', cx: 162, cy: 92, r: 20, fill: 'mark' },
    { t: 'path', d: 'M136 126a26 26 0 0 1 52 0z', fill: 'mark' },
    {
      t: 'group',
      anim: 'float',
      origin: [120, 82],
      children: [
        { t: 'circle', cx: 120, cy: 66, r: 24, fill: 'hero' },
        { t: 'path', d: 'M90 112a30 30 0 0 1 60 0z', fill: 'hero' },
      ],
    },
    { t: 'circle', cx: 46, cy: 52, r: 8, fill: 'plate', decor: true },
    { t: 'circle', cx: 202, cy: 50, r: 11, fill: 'plate', decor: true },
  ],
};

export const EMPTY_SCENES: Record<FlowKey, SceneSpec> = {
  home,
  discovery,
  saved,
  applied,
  goals,
  coach,
  wallet,
  community,
};
