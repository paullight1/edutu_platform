/**
 * The scene description language.
 *
 * Two hard rules make this package worth having, and both are structural rather
 * than a matter of discipline:
 *
 *  1. A layer names a PAINT ROLE, never a colour. Colours are resolved by each
 *     app from its own tokens, which is what makes mobile's 18 palettes and
 *     web's light/dark correct by construction instead of by inspection.
 *  2. A layer names a MOTION, never an animation. Each app implements the eight
 *     motions once, so scene 27 costs no animation code.
 *
 * Both rules are enforced by the registry test, not by review.
 */

/** Paint roles. `hero` and `mark` swap by volume — see `volume.ts`. */
export type Paint = 'hero' | 'mark' | 'plate' | 'ink' | 'inkSoft' | 'surface' | 'surfaceLine';

export const PAINTS: readonly Paint[] = [
  'hero',
  'mark',
  'plate',
  'ink',
  'inkSoft',
  'surface',
  'surfaceLine',
];

/** The motion vocabulary. Implemented once per platform, never in a scene. */
export type AnimId = 'float' | 'flyIn' | 'blip' | 'shiver' | 'drawOn' | 'pulse' | 'orbit' | 'scan';

export const ANIM_IDS: readonly AnimId[] = [
  'float',
  'flyIn',
  'blip',
  'shiver',
  'drawOn',
  'pulse',
  'orbit',
  'scan',
];

/** Mirrors mobile's existing `StateHue` in `components/state/stateTokens.ts`. */
export type HueRole = 'flow' | 'neutral' | 'danger' | 'offline' | 'locked' | 'denied' | 'success';

/**
 * `invite` fills the hero shape with the saturated hue — used where we want the
 * user to act. `calm` inverts it so the soft tone carries the shape and
 * saturation survives only as a small marker: a saturated slab filling the
 * screen on every failure reads as the app being angry at the user, and failures
 * are seen far more often than empty states.
 */
export type Volume = 'invite' | 'calm';

interface Paintable {
  fill?: Paint;
  stroke?: Paint;
  /** Stroke width in viewBox units. */
  sw?: number;
  /** Opacity 0–1. */
  op?: number;
  anim?: AnimId;
  /** Decorative only — dropped entirely when the scene is `calm`. */
  decor?: true;
}

export type Layer =
  | ({ t: 'rect'; x: number; y: number; w: number; h: number; r?: number } & Paintable)
  | ({ t: 'circle'; cx: number; cy: number; r: number } & Paintable)
  | ({ t: 'path'; d: string; cap?: 'round' | 'butt'; join?: 'round' | 'miter' } & Paintable)
  | {
      t: 'group';
      children: Layer[];
      anim?: AnimId;
      /** Transform origin in viewBox units. Defaults to the viewBox centre. */
      origin?: [number, number];
      /** Static rotation in degrees, applied before any animation. */
      rotate?: number;
      x?: number;
      y?: number;
      decor?: true;
    };

export interface SceneSpec {
  viewBox: [number, number];
  hue: HueRole;
  volume: Volume;
  layers: Layer[];
}

/** The eight product areas that own a first-run empty scene. */
export type FlowKey =
  | 'home'
  | 'discovery'
  | 'saved'
  | 'applied'
  | 'goals'
  | 'coach'
  | 'wallet'
  | 'community';

export type SceneKey =
  | 'emptyHome'
  | 'emptyDiscovery'
  | 'emptySaved'
  | 'emptyApplied'
  | 'emptyGoals'
  | 'emptyCoach'
  | 'emptyWallet'
  | 'emptyCommunity'
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

/** What an app must supply to paint a scene. Every value is a resolved colour. */
export interface HueTokens {
  /** The one saturated colour. */
  hue: string;
  /** Its soft partner — a tint in light mode, a deep shade in dark. */
  soft: string;
  /** The base plate the scene sits on. */
  plate: string;
  ink: string;
  inkSoft: string;
  surface: string;
  surfaceLine: string;
}

export type PaintMap = Record<Paint, string>;
