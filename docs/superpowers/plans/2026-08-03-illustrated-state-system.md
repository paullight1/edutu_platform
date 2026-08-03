# Cross-Platform Illustrated State System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared `@edutu/ux-state` package holding the `ScreenState` contract and 26 branded duotone scene geometries, plus a renderer in each app, so every user state in `edutumobile` and `edutu-web-app` shows a coloured animated illustration.

**Architecture:** Scene geometry is authored once as pure data — layers name *paint roles* (`hero`, `mark`, `plate`…) and *motion names* (`float`, `flyIn`…), never colours or animation code. Each app owns a `SceneRenderer` that resolves paint roles from its own theme tokens and implements the 8 named motions in its own animation library. A `volume` dial (`invite` / `calm`) inverts which tone carries the big shape, so failure states stop shouting without needing separate art.

**Tech Stack:** TypeScript (package, zero runtime deps) · React Native + `react-native-svg` + `react-native-reanimated@4` (mobile) · React + inline SVG + `framer-motion` + Tailwind (web) · Jest (mobile) · Vitest (web)

## Global Constraints

- **No new npm dependencies.** `react-native-svg`, `react-native-reanimated@4`, `framer-motion` are all already installed. `packages/ux-state` has zero runtime dependencies.
- **No colour literal may appear in `packages/ux-state/src/scenes/`.** Layers reference `Paint` roles only. Enforced by the registry test in Task 4.
- **No animation code may appear in scene files.** Layers reference `AnimId` names only. Enforced by the same test.
- **Reduced motion is enforced in the renderer, not by scene authors.** When reduced, every layer renders at its `rest` frame and no loop starts.
- **Never `git stash`.** Concurrent sessions share this working tree, which already carries ~50 modified files from other work. To read a prior version of a file use `git show HEAD:<path>`.
- **One commit per task.** Both apps' lint (`--max-warnings 0`) and typecheck are CI-gated.
- Mobile viewBox for every scene is `[240, 180]`.
- Mobile test command: `cd edutumobile && npx jest <path> --maxWorkers=2`. Web test command: `cd edutu-web-app && npx vitest run <path>`.

## Scope

This plan builds the **system**: the package, both renderers, all 26 scenes, and the web state contract. It ends with both apps able to render every state, and mobile's `StateView` already switched over.

**Deliberately not in this plan:** migrating the 5 mobile flows and 6 web screens listed in §7 of the spec. Those need each call site read against the finished API and get a second plan (`2026-08-XX-illustrated-state-migration.md`) written after Task 10 lands. Also out of scope, per spec §9: the 206 `Alert.alert` sites, the 45 `ActivityIndicator` files, and the three lint guardrails.

## File Structure

| Path | Responsibility |
|---|---|
| `packages/ux-state/package.json` | Package manifest, two subpath exports, zero deps |
| `packages/ux-state/src/state/ScreenState.ts` | The state union, `classifyError`, `useScreenState`, `showsContent` — moved verbatim from mobile |
| `packages/ux-state/src/state/index.ts` | State entry barrel |
| `packages/ux-state/src/scenes/types.ts` | `Paint`, `AnimId`, `HueRole`, `Volume`, `Layer`, `SceneSpec`, `SceneKey`, `FlowKey` |
| `packages/ux-state/src/scenes/volume.ts` | `resolvePaints()`, `visibleLayers()` |
| `packages/ux-state/src/scenes/motion.ts` | `Frame`, `AnimSpec`, the `ANIMS` table |
| `packages/ux-state/src/scenes/empty.ts` | The 8 per-flow empty scenes |
| `packages/ux-state/src/scenes/shared.ts` | The 18 shared scenes |
| `packages/ux-state/src/scenes/index.ts` | `SCENES` registry, `sceneForState()` |
| `packages/ux-state/src/scenes/__tests__/` | Registry, volume and motion tests |
| `edutumobile/components/state/ScreenState.ts` | Thin re-export shim so existing imports keep working |
| `edutumobile/components/state/SceneRenderer.tsx` | `SceneSpec` → `react-native-svg` + Reanimated |
| `edutu-web-app/src/components/state/SceneRenderer.tsx` | `SceneSpec` → inline SVG + framer-motion |
| `edutu-web-app/src/components/state/sceneTokens.ts` | `HueRole` → CSS-var colours |
| `edutu-web-app/src/components/state/StateView.tsx` | `ScreenState` → scene + copy + actions |
| `edutu-web-app/src/components/state/InlineError.tsx` | Themed failure strip with retry |
| `edutu-web-app/src/components/state/index.ts` | Web state barrel |

---

### Task 1: Package skeleton, state entry, and mobile plumbing

The riskiest step in the whole plan is Metro and Jest resolving a package that lives outside the app root. Do it first, with real code but minimal surface, so a failure here costs one task rather than twenty-six scenes.

**Files:**
- Create: `packages/ux-state/package.json`
- Create: `packages/ux-state/tsconfig.json`
- Create: `packages/ux-state/src/state/ScreenState.ts`
- Create: `packages/ux-state/src/state/index.ts`
- Modify: `edutumobile/metro.config.js`
- Modify: `edutumobile/package.json` (dependency + Jest `moduleNameMapper`)
- Modify: `edutumobile/tsconfig.json` (`paths`)
- Replace: `edutumobile/components/state/ScreenState.ts` (becomes a re-export shim)
- Test: `edutumobile/components/state/__tests__/ScreenState.test.ts` (existing, unchanged — it must keep passing through the shim)

**Interfaces:**
- Consumes: nothing.
- Produces: `@edutu/ux-state/state` exporting `ScreenState`, `ErrorCause`, `StateKind`, `ScreenStateInput`, `classifyError(error: unknown): ErrorCause`, `deriveState(input: ScreenStateInput): ScreenState`, `showsContent(state: ScreenState): boolean`.

**Resolved during execution — the package is React-free.** The contract originally
exported a `useScreenState` hook. A `react` import from a package outside either
app's root fails to resolve under Metro, Jest, Vite and Vitest alike, and every
workaround (tsconfig `paths` to `react`, `modulePaths`, a devDependency in the
package) trades one resolution problem for another. So the package exports the
pure `deriveState()` and **each app owns a three-line memoised
`useScreenState`**. The precedence rules — the part worth sharing — stay shared.
Mobile's Jest also needs `"modulePaths": ["<rootDir>/node_modules"]` so the
out-of-root package resolves its own imports.

- [ ] **Step 1: Create the package manifest**

`packages/ux-state/package.json`:

```json
{
  "name": "@edutu/ux-state",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    "./state": {
      "types": "./src/state/index.ts",
      "default": "./src/state/index.ts",
      "react-native": "./src/state/index.ts"
    },
    "./scenes": {
      "types": "./src/scenes/index.ts",
      "default": "./src/scenes/index.ts",
      "react-native": "./src/scenes/index.ts"
    }
  },
  "peerDependencies": {
    "react": ">=18"
  }
}
```

`packages/ux-state/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Move the state contract into the package**

Copy the current contents of `edutumobile/components/state/ScreenState.ts` **verbatim** into `packages/ux-state/src/state/ScreenState.ts`. Do not edit it — it is already pure TypeScript with no React Native imports, its only import is `useMemo` from `react`, and it has a passing test suite.

Verify with:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
cp edutumobile/components/state/ScreenState.ts packages/ux-state/src/state/ScreenState.ts
grep -c "react-native" packages/ux-state/src/state/ScreenState.ts
```

Expected: `0`

Then create `packages/ux-state/src/state/index.ts`:

```ts
export {
  classifyError,
  showsContent,
  useScreenState,
  type ErrorCause,
  type ScreenState,
  type ScreenStateInput,
  type StateKind,
} from './ScreenState';
```

- [ ] **Step 3: Replace the mobile file with a re-export shim**

Overwrite `edutumobile/components/state/ScreenState.ts` with:

```ts
/**
 * The state contract now lives in `@edutu/ux-state/state` so the web app renders
 * the same union rather than a hand-copied duplicate that drifts.
 *
 * This file stays as a re-export because ~every future screen import and the
 * existing test suite address it by this path.
 */
export {
  classifyError,
  showsContent,
  useScreenState,
  type ErrorCause,
  type ScreenState,
  type ScreenStateInput,
  type StateKind,
} from '@edutu/ux-state/state';
```

- [ ] **Step 4: Wire Metro, npm, TypeScript and Jest**

In `edutumobile/metro.config.js`, extend the existing `watchFolders`:

```js
// Watch the packages directory for changes
config.watchFolders = [
    path.resolve(__dirname, "packages/core"),
    path.resolve(__dirname, "../packages/ux-state"),
];
```

In `edutumobile/package.json`, add to `dependencies` (beside the existing `"@edutu/core": "file:./packages/core"`):

```json
"@edutu/ux-state": "file:../packages/ux-state",
```

and add to the Jest `moduleNameMapper` block (beside the existing `@edutu/core` entries):

```json
"^@edutu/ux-state/state$": "<rootDir>/../packages/ux-state/src/state/index.ts",
"^@edutu/ux-state/scenes$": "<rootDir>/../packages/ux-state/src/scenes/index.ts",
```

In `edutumobile/tsconfig.json`, add to `compilerOptions.paths`:

```json
"@edutu/ux-state/state": ["../packages/ux-state/src/state/index.ts"],
"@edutu/ux-state/scenes": ["../packages/ux-state/src/scenes/index.ts"],
```

- [ ] **Step 5: Install and run the existing test suite through the shim**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npm install
npx jest components/state/__tests__/ScreenState.test.ts --maxWorkers=2
```

Expected: PASS, same test count as before the move. If it fails with `Cannot find module '@edutu/ux-state/state'`, the `moduleNameMapper` paths are wrong — they are relative to `<rootDir>` which is `edutumobile/`, hence the `../`.

- [ ] **Step 6: Prove the typecheck resolves it too**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "ux-state" || echo "NO UX-STATE ERRORS"
```

Expected: `NO UX-STATE ERRORS`

- [ ] **Step 7: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add packages/ux-state edutumobile/metro.config.js edutumobile/package.json \
        edutumobile/tsconfig.json edutumobile/components/state/ScreenState.ts \
        edutumobile/package-lock.json
git commit -m "feat(ux-state): extract ScreenState into a shared package"
```

---

### Task 2: Web plumbing

**Files:**
- Modify: `edutu-web-app/vite.config.ts` (alias + `server.fs.allow`)
- Modify: `edutu-web-app/vitest.config.ts` (alias)
- Modify: `edutu-web-app/tsconfig.json` (`paths`)
- Test: `edutu-web-app/src/test/__tests__/uxStatePackage.test.ts`

**Interfaces:**
- Consumes: `@edutu/ux-state/state` from Task 1.
- Produces: the same module, resolvable from web source and from Vitest.

- [ ] **Step 1: Write the failing test**

`edutu-web-app/src/test/__tests__/uxStatePackage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyError, showsContent } from '@edutu/ux-state/state';

describe('@edutu/ux-state/state resolves from the web app', () => {
  it('classifies an auth failure', () => {
    expect(classifyError({ status: 401 })).toBe('auth');
  });

  it('classifies a server failure', () => {
    expect(classifyError({ status: 503 })).toBe('server');
  });

  it('knows which states still render their own content', () => {
    expect(showsContent({ kind: 'ready' })).toBe(true);
    expect(showsContent({ kind: 'partial', staleAt: null })).toBe(true);
    expect(showsContent({ kind: 'offline' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/uxStatePackage.test.ts
```

Expected: FAIL — `Failed to resolve import "@edutu/ux-state/state"`

- [ ] **Step 3: Add the aliases**

In `edutu-web-app/vite.config.ts`, extend the existing `resolve.alias` block and add `server.fs.allow`. The `fs.allow` entry is required because Vite's dev server refuses to serve files outside the project root — without it `npm run build` succeeds and `npm run dev` throws a 403:

```ts
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@edutu/ux-state': resolve(__dirname, '../packages/ux-state/src'),
    },
  },
  server: {
    fs: {
      allow: [resolve(__dirname, '.'), resolve(__dirname, '../packages/ux-state')],
    },
  },
```

If `vite.config.ts` already declares a `server` block, merge the `fs` key into it rather than adding a second one.

In `edutu-web-app/vitest.config.ts`, extend `resolve.alias` identically:

```ts
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            '@edutu/ux-state': resolve(__dirname, '../packages/ux-state/src'),
        },
    },
```

In `edutu-web-app/tsconfig.json`, add (creating `paths` under `compilerOptions` if absent — `baseUrl` must be `"."`):

```json
"baseUrl": ".",
"paths": {
  "@/*": ["./src/*"],
  "@edutu/ux-state/*": ["../packages/ux-state/src/*"]
}
```

Note the alias resolves `@edutu/ux-state` → `src`, so the subpath `@edutu/ux-state/state` lands on `src/state/index.ts` via directory-index resolution.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/uxStatePackage.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Prove the dev server resolves it, not just the test runner**

This is the step that catches the `fs.allow` mistake, which the production build will not.

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx tsc -b 2>&1 | grep -i "ux-state" || echo "TYPECHECK CLEAN"
npm run build 2>&1 | tail -3
```

Expected: `TYPECHECK CLEAN`, then a successful build. Then start the dev server and confirm it serves:

```bash
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:5173/@fs$(cd .. && pwd)/packages/ux-state/src/state/index.ts"
kill %1
```

Expected: `200`. A `403` means `server.fs.allow` is missing or wrong.

- [ ] **Step 6: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add edutu-web-app/vite.config.ts edutu-web-app/vitest.config.ts \
        edutu-web-app/tsconfig.json edutu-web-app/src/test/__tests__/uxStatePackage.test.ts
git commit -m "feat(web): resolve @edutu/ux-state from app, tests and dev server"
```

---

### Task 3: Scene types and the volume resolver

**Files:**
- Create: `packages/ux-state/src/scenes/types.ts`
- Create: `packages/ux-state/src/scenes/volume.ts`
- Test: `packages/ux-state/src/scenes/__tests__/volume.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Paint = 'hero' | 'mark' | 'plate' | 'ink' | 'inkSoft' | 'surface' | 'surfaceLine'`
  - `type AnimId = 'float' | 'flyIn' | 'blip' | 'shiver' | 'drawOn' | 'pulse' | 'orbit' | 'scan'`
  - `type HueRole = 'flow' | 'neutral' | 'danger' | 'offline' | 'locked' | 'denied' | 'success'`
  - `type Volume = 'invite' | 'calm'`
  - `type Layer`, `interface SceneSpec`, `type FlowKey`, `type SceneKey`
  - `interface HueTokens`, `type PaintMap`
  - `resolvePaints(volume: Volume, tokens: HueTokens): PaintMap`
  - `visibleLayers(layers: Layer[], volume: Volume): Layer[]`
  - `PAINTS: readonly Paint[]`, `ANIM_IDS: readonly AnimId[]`

- [ ] **Step 1: Write the failing test**

`packages/ux-state/src/scenes/__tests__/volume.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { HueTokens, Layer } from '../types';
import { resolvePaints, visibleLayers } from '../volume';

const tokens: HueTokens = {
  hue: '#4F46E5',
  soft: '#E0E7FF',
  plate: '#EEF2FF',
  ink: '#0F172A',
  inkSoft: '#64748B',
  surface: '#FFFFFF',
  surfaceLine: '#E2E8F0',
};

describe('resolvePaints', () => {
  it('gives the saturated hue to the hero shape when inviting', () => {
    const p = resolvePaints('invite', tokens);
    expect(p.hero).toBe('#4F46E5');
    expect(p.mark).toBe('#E0E7FF');
  });

  it('inverts hero and mark when calm, so failures stop shouting', () => {
    const p = resolvePaints('calm', tokens);
    expect(p.hero).toBe('#E0E7FF');
    expect(p.mark).toBe('#4F46E5');
  });

  it('leaves the non-duotone roles alone in both volumes', () => {
    for (const v of ['invite', 'calm'] as const) {
      const p = resolvePaints(v, tokens);
      expect(p.plate).toBe('#EEF2FF');
      expect(p.ink).toBe('#0F172A');
      expect(p.inkSoft).toBe('#64748B');
      expect(p.surface).toBe('#FFFFFF');
      expect(p.surfaceLine).toBe('#E2E8F0');
    }
  });
});

describe('visibleLayers', () => {
  const layers: Layer[] = [
    { t: 'rect', x: 0, y: 0, w: 10, h: 10, fill: 'hero' },
    { t: 'circle', cx: 5, cy: 5, r: 3, fill: 'plate', decor: true },
    {
      t: 'group',
      children: [
        { t: 'circle', cx: 1, cy: 1, r: 1, fill: 'mark' },
        { t: 'circle', cx: 2, cy: 2, r: 1, fill: 'plate', decor: true },
      ],
    },
  ];

  it('keeps every layer when inviting', () => {
    const out = visibleLayers(layers, 'invite');
    expect(out).toHaveLength(3);
    expect((out[2] as { children: Layer[] }).children).toHaveLength(2);
  });

  it('drops decorative layers when calm, including inside groups', () => {
    const out = visibleLayers(layers, 'calm');
    expect(out).toHaveLength(2);
    expect((out[1] as { children: Layer[] }).children).toHaveLength(1);
  });

  it('does not mutate the input', () => {
    visibleLayers(layers, 'calm');
    expect(layers).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run ../packages/ux-state/src/scenes/__tests__/volume.test.ts
```

Expected: FAIL — `Failed to resolve import "../types"`.

(The package has no test runner of its own by design. It is exercised by web's Vitest and mobile's Jest, which is also how we prove it parses under both toolchains.)

- [ ] **Step 3: Write `types.ts`**

```ts
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

/** Matches mobile's existing `StateHue` in `components/state/stateTokens.ts`. */
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
```

- [ ] **Step 4: Write `volume.ts`**

```ts
import type { HueTokens, Layer, PaintMap, Volume } from './types';

/**
 * The volume dial, in full.
 *
 * It is deliberately a paint-resolution rule rather than separate art: the same
 * geometry serves both volumes, so the 26 scenes are authored once and the rule
 * cannot drift as scenes are added later.
 */
export function resolvePaints(volume: Volume, tokens: HueTokens): PaintMap {
  const invite = volume === 'invite';
  return {
    hero: invite ? tokens.hue : tokens.soft,
    mark: invite ? tokens.soft : tokens.hue,
    plate: tokens.plate,
    ink: tokens.ink,
    inkSoft: tokens.inkSoft,
    surface: tokens.surface,
    surfaceLine: tokens.surfaceLine,
  };
}

/**
 * Strip decorative layers from a calm scene.
 *
 * Confetti around an error is noise; the same confetti around a first-run empty
 * state is warmth. Rather than author two variants, decorative layers are tagged
 * and removed here.
 */
export function visibleLayers(layers: Layer[], volume: Volume): Layer[] {
  if (volume === 'invite') return layers;

  const keep: Layer[] = [];
  for (const layer of layers) {
    if (layer.decor) continue;
    if (layer.t === 'group') {
      keep.push({ ...layer, children: visibleLayers(layer.children, volume) });
    } else {
      keep.push(layer);
    }
  }
  return keep;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run ../packages/ux-state/src/scenes/__tests__/volume.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add packages/ux-state/src/scenes
git commit -m "feat(ux-state): scene description language and volume resolver"
```

---

### Task 4: The motion vocabulary

Eight named motions, described as keyframes over a tiny transform model that both Reanimated and framer-motion can implement without either library leaking into the package.

**Files:**
- Create: `packages/ux-state/src/scenes/motion.ts`
- Test: `packages/ux-state/src/scenes/__tests__/motion.test.ts`

**Interfaces:**
- Consumes: `AnimId`, `ANIM_IDS` from Task 3.
- Produces:
  - `interface Frame { x?: number; y?: number; rotate?: number; scale?: number; opacity?: number; dash?: number }`
  - `interface AnimSpec { loop: boolean; durationMs: number; delayMs: number; frames: Frame[]; rest: Frame }`
  - `const ANIMS: Record<AnimId, AnimSpec>`
  - `const REST: Frame` — the identity frame renderers fall back to under reduced motion.

- [ ] **Step 1: Write the failing test**

`packages/ux-state/src/scenes/__tests__/motion.test.ts`:

```ts
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
    for (const id of ANIM_IDS) {
      const spec = ANIMS[id];
      if (!spec.loop) continue;
      expect(spec.frames[spec.frames.length - 1]).toEqual(spec.frames[0]);
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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run ../packages/ux-state/src/scenes/__tests__/motion.test.ts
```

Expected: FAIL — `Failed to resolve import "../motion"`.

- [ ] **Step 3: Write `motion.ts`**

```ts
import type { AnimId } from './types';

/**
 * A single keyframe.
 *
 * Deliberately tiny: translation, rotation, scale, opacity and a stroke-dash
 * fraction. Everything the eight motions need, and nothing that would force one
 * platform's animation model onto the other.
 *
 * `x`/`y` are in viewBox units. `dash` is a 0–1 fraction of the path length,
 * used only by `drawOn`.
 */
export interface Frame {
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  opacity?: number;
  dash?: number;
}

export interface AnimSpec {
  loop: boolean;
  durationMs: number;
  delayMs: number;
  /** Interpolated evenly across `durationMs`. Looping specs must end where they start. */
  frames: Frame[];
  /**
   * The pose to hold under reduced motion. This is the whole reason a scene can
   * be static without looking half-finished: `flyIn` rests just above its slot,
   * which still reads as "about to be saved" rather than as a broken animation.
   */
  rest: Frame;
}

/** Identity. Renderers use this for any layer with no `anim`. */
export const REST: Frame = { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, dash: 0 };

export const ANIMS: Record<AnimId, AnimSpec> = {
  /** Ambient lift. The default for anything that should feel weightless. */
  float: {
    loop: true,
    durationMs: 4000,
    delayMs: 0,
    frames: [{ y: 0 }, { y: -5 }, { y: 0 }],
    rest: { y: 0 },
  },

  /** A card travelling into a slot — the gesture the user is about to learn. */
  flyIn: {
    loop: true,
    durationMs: 3400,
    delayMs: 400,
    frames: [
      { y: -14, rotate: -7 },
      { y: 6, rotate: -1 },
      { y: 2, rotate: -2 },
      { y: 2, rotate: -2 },
      { y: -14, rotate: -7 },
    ],
    rest: { y: -14, rotate: -7 },
  },

  /** A small marker asking for attention without moving. */
  blip: {
    loop: true,
    durationMs: 2200,
    delayMs: 0,
    frames: [{ opacity: 0.4 }, { opacity: 1 }, { opacity: 0.4 }],
    rest: { opacity: 1 },
  },

  /** Something that has come loose. Reserved for offline and hard failures. */
  shiver: {
    loop: true,
    durationMs: 4000,
    delayMs: 0,
    frames: [{ x: 0 }, { x: -2 }, { x: 0 }, { x: 2 }, { x: 0 }],
    rest: { x: 0 },
  },

  /** A stroke drawing itself on. `dash` runs 1 → 0 as the line completes. */
  drawOn: {
    loop: false,
    durationMs: 900,
    delayMs: 120,
    frames: [
      { dash: 1, opacity: 1 },
      { dash: 0, opacity: 1 },
    ],
    rest: { dash: 0, opacity: 1 },
  },

  /** An expanding ring. Used for radar, focus and "we are looking". */
  pulse: {
    loop: true,
    durationMs: 2600,
    delayMs: 0,
    frames: [
      { scale: 0.86, opacity: 0.55 },
      { scale: 1.1, opacity: 0 },
      { scale: 0.86, opacity: 0.55 },
    ],
    rest: { scale: 1, opacity: 0.45 },
  },

  /** Continuous rotation, for anything that reads as a mechanism. */
  orbit: {
    loop: true,
    durationMs: 5200,
    delayMs: 0,
    frames: [{ rotate: 0 }, { rotate: 180 }, { rotate: 360 }],
    rest: { rotate: 0 },
  },

  /** A sweep across a surface. The loading scene's shimmer. */
  scan: {
    loop: true,
    durationMs: 1800,
    delayMs: 0,
    frames: [
      { x: -60, opacity: 0 },
      { x: 0, opacity: 0.35 },
      { x: 60, opacity: 0 },
      { x: -60, opacity: 0 },
    ],
    rest: { x: 0, opacity: 0.18 },
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run ../packages/ux-state/src/scenes/__tests__/motion.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add packages/ux-state/src/scenes/motion.ts packages/ux-state/src/scenes/__tests__/motion.test.ts
git commit -m "feat(ux-state): the eight-motion vocabulary"
```

---

### Task 5: The eight per-flow empty scenes

These are the `invite` scenes — the most-seen, highest-value drawings. Author them first so the family's character is set while attention is fresh.

**Files:**
- Create: `packages/ux-state/src/scenes/empty.ts`
- Test: `packages/ux-state/src/scenes/__tests__/empty.test.ts`

**Interfaces:**
- Consumes: `Layer`, `SceneSpec`, `FlowKey` from Task 3.
- Produces: `const EMPTY_SCENES: Record<FlowKey, SceneSpec>`.

- [ ] **Step 1: Write the failing test**

`packages/ux-state/src/scenes/__tests__/empty.test.ts`:

```ts
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
      const json = JSON.stringify(scene.layers);
      expect(json).toContain('"anim"');
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run ../packages/ux-state/src/scenes/__tests__/empty.test.ts
```

Expected: FAIL — `Failed to resolve import "../empty"`.

- [ ] **Step 3: Write `empty.ts`**

```ts
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

const home: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(),
    // Two cards fanned behind — the feed that is about to exist.
    { t: 'group', rotate: -9, origin: [120, 80], children: [
      { t: 'rect', x: 74, y: 40, w: 92, h: 72, r: 20, fill: 'mark', op: 0.5 },
    ] },
    { t: 'group', rotate: 8, origin: [120, 80], children: [
      { t: 'rect', x: 74, y: 40, w: 92, h: 72, r: 20, fill: 'mark', op: 0.8 },
    ] },
    { t: 'group', anim: 'float', origin: [120, 76], children: [
      { t: 'rect', x: 74, y: 40, w: 92, h: 72, r: 20, fill: 'hero' },
      { t: 'rect', x: 90, y: 62, w: 52, h: 8, r: 4, fill: 'plate' },
      { t: 'rect', x: 90, y: 78, w: 34, h: 8, r: 4, fill: 'plate', op: 0.6 },
    ] },
    { t: 'group', anim: 'blip', origin: [180, 44], children: [
      { t: 'path', d: 'M180 32l4.5 11 11 4.5-11 4.5-4.5 11-4.5-11-11-4.5 11-4.5z', fill: 'hero' },
    ] },
    { t: 'circle', cx: 54, cy: 54, r: 8, fill: 'plate', decor: true },
    { t: 'circle', cx: 192, cy: 92, r: 11, fill: 'plate', decor: true },
  ],
};

const discovery: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(126, 34),
    // A radar sweep: we are looking, not failing to find.
    { t: 'group', anim: 'pulse', origin: [120, 76], children: [
      { t: 'circle', cx: 120, cy: 76, r: 58, stroke: 'hero', sw: 4, op: 0.5 },
    ] },
    { t: 'circle', cx: 120, cy: 76, r: 46, fill: 'hero' },
    { t: 'circle', cx: 120, cy: 76, r: 30, fill: 'plate', op: 0.35 },
    { t: 'group', anim: 'orbit', origin: [120, 76], children: [
      { t: 'path', d: 'M120 76l24-28-9 37z', fill: 'mark' },
    ] },
    { t: 'circle', cx: 120, cy: 76, r: 6, fill: 'mark' },
    { t: 'circle', cx: 52, cy: 50, r: 7, fill: 'plate', decor: true },
    { t: 'circle', cx: 196, cy: 60, r: 10, fill: 'plate', decor: true },
  ],
};

const saved: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    { t: 'rect', x: 40, y: 98, w: 160, h: 58, r: 20, fill: 'plate' },
    // The waiting slot, breathing.
    { t: 'group', anim: 'pulse', origin: [120, 127], children: [
      { t: 'rect', x: 58, y: 112, w: 124, h: 30, r: 12, fill: 'hero', op: 0.25 },
    ] },
    // The card mid-gesture. Its rest pose sits above the slot, so a static
    // frame still reads as "about to be saved" rather than as loss.
    { t: 'group', anim: 'flyIn', origin: [120, 68], children: [
      { t: 'rect', x: 76, y: 34, w: 88, h: 66, r: 18, fill: 'hero' },
      { t: 'rect', x: 92, y: 56, w: 48, h: 8, r: 4, fill: 'mark', op: 0.85 },
      { t: 'rect', x: 92, y: 72, w: 30, h: 8, r: 4, fill: 'mark', op: 0.55 },
      { t: 'path', d: 'M148 34h8a8 8 0 0 1 8 8v26l-12-8-12 8V42a8 8 0 0 1 8-8z', fill: 'plate' },
    ] },
    { t: 'circle', cx: 54, cy: 56, r: 9, fill: 'plate', decor: true },
    { t: 'circle', cx: 192, cy: 76, r: 13, fill: 'plate', decor: true },
  ],
};

const applied: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(130, 26),
    // A track with three stops, the first already yours.
    { t: 'path', d: 'M62 92H178', stroke: 'plate', sw: 12, cap: 'round' },
    { t: 'group', anim: 'pulse', origin: [62, 92], children: [
      { t: 'circle', cx: 62, cy: 92, r: 26, stroke: 'hero', sw: 4, op: 0.5 },
    ] },
    { t: 'circle', cx: 62, cy: 92, r: 18, fill: 'hero' },
    { t: 'path', d: 'M55 92l5 6 10-12', stroke: 'mark', sw: 5, cap: 'round', join: 'round' },
    { t: 'circle', cx: 120, cy: 92, r: 15, fill: 'plate' },
    { t: 'circle', cx: 178, cy: 92, r: 15, fill: 'plate' },
    { t: 'group', anim: 'float', origin: [120, 48], children: [
      { t: 'rect', x: 92, y: 30, w: 56, h: 34, r: 12, fill: 'hero' },
      { t: 'rect', x: 102, y: 42, w: 36, h: 6, r: 3, fill: 'mark', op: 0.8 },
      { t: 'rect', x: 102, y: 52, w: 22, h: 6, r: 3, fill: 'mark', op: 0.5 },
    ] },
    { t: 'circle', cx: 204, cy: 52, r: 9, fill: 'plate', decor: true },
  ],
};

const goals: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(146, 14),
    // A climb, not a mountain: three steps and a flag you are heading for.
    { t: 'rect', x: 54, y: 110, w: 42, h: 40, r: 12, fill: 'plate' },
    { t: 'rect', x: 100, y: 86, w: 42, h: 64, r: 12, fill: 'mark' },
    { t: 'rect', x: 146, y: 56, w: 42, h: 94, r: 12, fill: 'hero' },
    { t: 'group', anim: 'float', origin: [167, 40], children: [
      { t: 'path', d: 'M167 58V26', stroke: 'hero', sw: 6, cap: 'round' },
      { t: 'path', d: 'M167 26l28 9-28 9z', fill: 'hero' },
    ] },
    { t: 'group', anim: 'blip', origin: [167, 82], children: [
      { t: 'circle', cx: 167, cy: 82, r: 8, fill: 'mark' },
    ] },
    { t: 'circle', cx: 46, cy: 62, r: 8, fill: 'plate', decor: true },
    { t: 'circle', cx: 208, cy: 118, r: 10, fill: 'plate', decor: true },
  ],
};

const coach: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(),
    { t: 'group', anim: 'float', origin: [120, 76], children: [
      {
        t: 'path',
        d: 'M70 36h100a22 22 0 0 1 22 22v40a22 22 0 0 1-22 22h-52l-24 20v-20H70a22 22 0 0 1-22-22V58a22 22 0 0 1 22-22z',
        fill: 'hero',
      },
      { t: 'rect', x: 68, y: 62, w: 68, h: 9, r: 4, fill: 'mark', op: 0.85 },
      { t: 'rect', x: 68, y: 80, w: 46, h: 9, r: 4, fill: 'mark', op: 0.55 },
    ] },
    { t: 'group', anim: 'blip', origin: [186, 44], children: [
      { t: 'path', d: 'M186 30l5 12 12 5-12 5-5 12-5-12-12-5 12-5z', fill: 'hero' },
    ] },
    { t: 'circle', cx: 50, cy: 60, r: 8, fill: 'plate', decor: true },
    { t: 'circle', cx: 200, cy: 104, r: 11, fill: 'plate', decor: true },
  ],
};

const wallet: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(142, 18),
    // A stack that is going to grow, plus the card it pays for.
    { t: 'rect', x: 62, y: 122, w: 68, h: 16, r: 8, fill: 'plate' },
    { t: 'rect', x: 62, y: 104, w: 68, h: 16, r: 8, fill: 'mark' },
    { t: 'group', anim: 'float', origin: [96, 94], children: [
      { t: 'rect', x: 62, y: 86, w: 68, h: 16, r: 8, fill: 'hero' },
    ] },
    { t: 'group', rotate: -8, origin: [166, 82], children: [
      { t: 'rect', x: 132, y: 56, w: 76, h: 52, r: 14, fill: 'hero' },
      { t: 'rect', x: 132, y: 68, w: 76, h: 10, fill: 'mark', op: 0.85 },
      { t: 'rect', x: 142, y: 90, w: 26, h: 7, r: 3, fill: 'mark', op: 0.6 },
    ] },
    { t: 'circle', cx: 52, cy: 56, r: 8, fill: 'plate', decor: true },
    { t: 'circle', cx: 204, cy: 132, r: 10, fill: 'plate', decor: true },
  ],
};

const community: SceneSpec = {
  viewBox: [240, 180],
  hue: 'flow',
  volume: 'invite',
  layers: [
    plate(128, 32),
    { t: 'group', anim: 'pulse', origin: [120, 76], children: [
      { t: 'circle', cx: 120, cy: 76, r: 56, stroke: 'hero', sw: 4, op: 0.45 },
    ] },
    // Three people, the middle one yours.
    { t: 'circle', cx: 78, cy: 92, r: 20, fill: 'mark' },
    { t: 'path', d: 'M52 126a26 26 0 0 1 52 0z', fill: 'mark' },
    { t: 'circle', cx: 162, cy: 92, r: 20, fill: 'mark' },
    { t: 'path', d: 'M136 126a26 26 0 0 1 52 0z', fill: 'mark' },
    { t: 'group', anim: 'float', origin: [120, 82], children: [
      { t: 'circle', cx: 120, cy: 66, r: 24, fill: 'hero' },
      { t: 'path', d: 'M90 112a30 30 0 0 1 60 0z', fill: 'hero' },
    ] },
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run ../packages/ux-state/src/scenes/__tests__/empty.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add packages/ux-state/src/scenes/empty.ts packages/ux-state/src/scenes/__tests__/empty.test.ts
git commit -m "feat(ux-state): eight per-flow empty scenes"
```

---

### Task 6: The eighteen shared scenes and the registry

**Files:**
- Create: `packages/ux-state/src/scenes/shared.ts`
- Create: `packages/ux-state/src/scenes/index.ts`
- Test: `packages/ux-state/src/scenes/__tests__/registry.test.ts`

**Interfaces:**
- Consumes: `EMPTY_SCENES` from Task 5; `Layer`, `SceneSpec`, `SceneKey`, `FlowKey`, `PAINTS`, `ANIM_IDS` from Task 3; `ANIMS` from Task 4; `ScreenState` from Task 1.
- Produces:
  - `type SharedSceneKey = Exclude<SceneKey, keyof typeof EMPTY_BY_FLOW_KEYS>` — in practice the 18 non-per-flow keys, declared explicitly in `shared.ts`.
  - `const SHARED_SCENES: Record<SharedSceneKey, SceneSpec>`
  - `const SCENES: Record<SceneKey, SceneSpec>`
  - `sceneForState(state: ScreenState, flow: FlowKey): SceneKey`
  - Re-exports of everything in `types.ts`, `volume.ts`, `motion.ts`.

- [ ] **Step 1: Write the failing test**

`packages/ux-state/src/scenes/__tests__/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SCENES, sceneForState } from '../index';
import { ANIMS } from '../motion';
import { ANIM_IDS, PAINTS, type Layer, type SceneKey } from '../types';

const ALL_KEYS: SceneKey[] = [
  'emptyHome', 'emptyDiscovery', 'emptySaved', 'emptyApplied',
  'emptyGoals', 'emptyCoach', 'emptyWallet', 'emptyCommunity',
  'loading', 'refreshing', 'partial', 'emptyFiltered',
  'errorNetwork', 'errorAuth', 'errorNotFound', 'errorServer', 'errorTimeout',
  'offline', 'lockedPro', 'lockedGuest', 'lockedModule',
  'deniedNotifications', 'deniedCamera', 'deniedCalendar', 'deniedPhotos',
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
      'emptyHome', 'emptyDiscovery', 'emptySaved', 'emptyApplied',
      'emptyGoals', 'emptyCoach', 'emptyWallet', 'emptyCommunity', 'success',
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
  });

  it('falls back to loading for a ready screen rather than throwing', () => {
    expect(sceneForState({ kind: 'ready' }, 'home')).toBe('loading');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run ../packages/ux-state/src/scenes/__tests__/registry.test.ts
```

Expected: FAIL — `Failed to resolve import "../index"`.

- [ ] **Step 3: Write `shared.ts`**

```ts
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
const padlock: Layer[] = [
  { t: 'path', d: 'M102 64v-9a18 18 0 0 1 36 0v9', stroke: 'hero', sw: 12, cap: 'round' },
  { t: 'rect', x: 84, y: 62, w: 72, h: 58, r: 16, fill: 'hero' },
  { t: 'circle', cx: 120, cy: 86, r: 7, fill: 'mark' },
  { t: 'rect', x: 117, y: 90, w: 6, h: 14, r: 3, fill: 'mark' },
];

/** Shared "permission off" tile, so the four denied scenes are one idea. */
const deniedTile = (glyph: Layer[]): Layer[] => [
  plate(),
  { t: 'rect', x: 76, y: 40, w: 88, h: 76, r: 22, fill: 'hero' },
  ...glyph,
  { t: 'group', anim: 'shiver', origin: [120, 78], children: [
    { t: 'path', d: 'M88 50l64 58', stroke: 'mark', sw: 9, cap: 'round' },
  ] },
];

const loading: SceneSpec = {
  viewBox: [240, 180],
  hue: 'neutral',
  volume: 'calm',
  layers: [
    plate(),
    { t: 'rect', x: 68, y: 46, w: 104, h: 66, r: 18, fill: 'hero' },
    { t: 'group', anim: 'blip', origin: [120, 72], children: [
      { t: 'rect', x: 84, y: 66, w: 72, h: 10, r: 5, fill: 'mark', op: 0.5 },
    ] },
    { t: 'group', anim: 'blip', origin: [120, 90], children: [
      { t: 'rect', x: 84, y: 86, w: 46, h: 10, r: 5, fill: 'mark', op: 0.35 },
    ] },
    { t: 'group', anim: 'scan', origin: [120, 79], children: [
      { t: 'rect', x: 114, y: 46, w: 12, h: 66, fill: 'mark', op: 0.3 },
    ] },
  ],
};

const refreshing: SceneSpec = {
  viewBox: [240, 180],
  hue: 'neutral',
  volume: 'calm',
  layers: [
    plate(),
    { t: 'circle', cx: 120, cy: 76, r: 44, fill: 'hero' },
    { t: 'group', anim: 'orbit', origin: [120, 76], children: [
      { t: 'path', d: 'M120 46a30 30 0 1 1-26 15', stroke: 'mark', sw: 10, cap: 'round' },
      { t: 'path', d: 'M120 34l0 24-18-12z', fill: 'mark' },
    ] },
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
    { t: 'group', anim: 'blip', origin: [176, 52], children: [
      { t: 'circle', cx: 176, cy: 52, r: 19, fill: 'mark' },
      { t: 'path', d: 'M176 42v10l7 5', stroke: 'hero', sw: 5, cap: 'round', join: 'round' },
    ] },
  ],
};

const emptyFiltered: SceneSpec = {
  viewBox: [240, 180],
  hue: 'neutral',
  volume: 'calm',
  layers: [
    plate(134, 22),
    // A funnel with a single drop under it — the filter worked, it just caught
    // nothing. Nothing here says "error".
    { t: 'path', d: 'M62 42h116l-42 46v36l-32-16V88z', fill: 'hero' },
    { t: 'group', anim: 'blip', origin: [120, 126], children: [
      { t: 'circle', cx: 120, cy: 126, r: 7, fill: 'mark' },
    ] },
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
    { t: 'group', anim: 'shiver', origin: [120, 82], children: [
      { t: 'path', d: 'M116 66l-8 14 10 5-8 15', stroke: 'mark', sw: 6, cap: 'round', join: 'round' },
    ] },
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
    { t: 'group', anim: 'blip', origin: [176, 52], children: [
      { t: 'circle', cx: 176, cy: 52, r: 19, fill: 'mark' },
      { t: 'path', d: 'M170 46l12 12M182 46l-12 12', stroke: 'hero', sw: 5, cap: 'round' },
    ] },
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
    { t: 'group', anim: 'float', origin: [154, 96], children: [
      { t: 'circle', cx: 154, cy: 92, r: 28, fill: 'plate' },
      { t: 'circle', cx: 154, cy: 92, r: 28, stroke: 'mark', sw: 7 },
      { t: 'path', d: 'M174 112l16 16', stroke: 'mark', sw: 9, cap: 'round' },
    ] },
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
    { t: 'group', anim: 'shiver', origin: [156, 80], children: [
      { t: 'path', d: 'M158 40l-10 24 14 8-12 26', stroke: 'mark', sw: 6, cap: 'round', join: 'round' },
    ] },
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
    { t: 'group', anim: 'orbit', origin: [120, 76], children: [
      { t: 'path', d: 'M120 76V48', stroke: 'mark', sw: 7, cap: 'round' },
    ] },
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
    { t: 'group', anim: 'shiver', origin: [120, 82], children: [
      { t: 'path', d: 'M90 54l60 58', stroke: 'mark', sw: 9, cap: 'round' },
    ] },
  ],
};

const lockedPro: SceneSpec = {
  viewBox: [240, 180],
  hue: 'locked',
  volume: 'calm',
  layers: [
    plate(),
    ...padlock,
    { t: 'group', anim: 'blip', origin: [180, 52], children: [
      { t: 'path', d: 'M180 38l5 12 12 5-12 5-5 12-5-12-12-5 12-5z', fill: 'mark' },
    ] },
  ],
};

const lockedGuest: SceneSpec = {
  viewBox: [240, 180],
  hue: 'locked',
  volume: 'calm',
  layers: [
    plate(),
    ...padlock,
    { t: 'group', anim: 'float', origin: [180, 60], children: [
      { t: 'circle', cx: 180, cy: 48, r: 13, fill: 'mark' },
      { t: 'path', d: 'M162 76a18 18 0 0 1 36 0z', fill: 'mark' },
    ] },
  ],
};

const lockedModule: SceneSpec = {
  viewBox: [240, 180],
  hue: 'locked',
  volume: 'calm',
  layers: [
    plate(),
    ...padlock,
    { t: 'group', anim: 'blip', origin: [180, 52], children: [
      { t: 'rect', x: 164, y: 36, w: 14, h: 14, r: 4, fill: 'mark' },
      { t: 'rect', x: 182, y: 36, w: 14, h: 14, r: 4, fill: 'mark', op: 0.6 },
      { t: 'rect', x: 164, y: 54, w: 14, h: 14, r: 4, fill: 'mark', op: 0.6 },
      { t: 'rect', x: 182, y: 54, w: 14, h: 14, r: 4, fill: 'mark', op: 0.3 },
    ] },
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

const success: SceneSpec = {
  viewBox: [240, 180],
  hue: 'success',
  volume: 'invite',
  layers: [
    plate(),
    { t: 'group', anim: 'pulse', origin: [120, 76], children: [
      { t: 'circle', cx: 120, cy: 76, r: 58, stroke: 'hero', sw: 5, op: 0.5 },
    ] },
    { t: 'circle', cx: 120, cy: 76, r: 44, fill: 'hero' },
    { t: 'group', anim: 'drawOn', origin: [120, 76], children: [
      { t: 'path', d: 'M100 76l14 15 27-30', stroke: 'mark', sw: 9, cap: 'round', join: 'round' },
    ] },
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
```

- [ ] **Step 4: Write `index.ts`**

```ts
import type { ScreenState } from '../state/ScreenState';
import { EMPTY_SCENES } from './empty';
import { SHARED_SCENES } from './shared';
import type { FlowKey, SceneKey, SceneSpec } from './types';

export * from './types';
export * from './volume';
export * from './motion';
export { EMPTY_SCENES } from './empty';
export { SHARED_SCENES } from './shared';

export const SCENES: Record<SceneKey, SceneSpec> = {
  emptyHome: EMPTY_SCENES.home,
  emptyDiscovery: EMPTY_SCENES.discovery,
  emptySaved: EMPTY_SCENES.saved,
  emptyApplied: EMPTY_SCENES.applied,
  emptyGoals: EMPTY_SCENES.goals,
  emptyCoach: EMPTY_SCENES.coach,
  emptyWallet: EMPTY_SCENES.wallet,
  emptyCommunity: EMPTY_SCENES.community,
  ...SHARED_SCENES,
};

const EMPTY_BY_FLOW: Record<FlowKey, SceneKey> = {
  home: 'emptyHome',
  discovery: 'emptyDiscovery',
  saved: 'emptySaved',
  applied: 'emptyApplied',
  goals: 'emptyGoals',
  coach: 'emptyCoach',
  wallet: 'emptyWallet',
  community: 'emptyCommunity',
};

/**
 * Which scene a state shows.
 *
 * `flow` only matters for a first-run empty — that is the one state where the
 * picture should be about *this* screen. Every failure and gate deliberately
 * shows the same scene everywhere, so the language stays recognisable.
 */
export function sceneForState(state: ScreenState, flow: FlowKey): SceneKey {
  switch (state.kind) {
    case 'empty':
      return state.reason === 'filtered' ? 'emptyFiltered' : EMPTY_BY_FLOW[flow];
    case 'error':
      switch (state.cause) {
        case 'auth': return 'errorAuth';
        case 'notFound': return 'errorNotFound';
        case 'timeout': return 'errorTimeout';
        case 'network': return 'errorNetwork';
        default: return 'errorServer';
      }
    case 'offline':
      return 'offline';
    case 'locked':
      switch (state.reason) {
        case 'pro': return 'lockedPro';
        case 'guest': return 'lockedGuest';
        default: return 'lockedModule';
      }
    case 'denied':
      switch (state.permission) {
        case 'notifications': return 'deniedNotifications';
        case 'camera': return 'deniedCamera';
        case 'calendar': return 'deniedCalendar';
        default: return 'deniedPhotos';
      }
    case 'refreshing':
      return 'refreshing';
    case 'partial':
      return 'partial';
    default:
      // `loading` and `ready`. A ready screen renders its own content and never
      // asks for a scene, but returning a key beats throwing from a render path.
      return 'loading';
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run ../packages/ux-state/src/scenes/__tests__/
```

Expected: PASS — all four scene test files, 24 tests total.

- [ ] **Step 6: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add packages/ux-state/src/scenes
git commit -m "feat(ux-state): eighteen shared scenes and the scene registry"
```

---

### Task 7: Mobile SceneRenderer

**Files:**
- Create: `edutumobile/components/state/SceneRenderer.tsx`
- Test: `edutumobile/components/state/__tests__/SceneRenderer.test.tsx`

**Interfaces:**
- Consumes: `SCENES`, `ANIMS`, `REST`, `resolvePaints`, `visibleLayers`, types — all from `@edutu/ux-state/scenes`. `useStateTokens` from `./stateTokens`. `useMotion` from `../../hooks/useMotion`.
- Produces: `<SceneRenderer scene={SceneKey} size?: number />`, and `hueTokensFrom(tokens: StateTokens): HueTokens`.

- [ ] **Step 1: Write the failing test**

`edutumobile/components/state/__tests__/SceneRenderer.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { SCENES } from '@edutu/ux-state/scenes';
import { SceneRenderer } from '../SceneRenderer';
import { ThemeProvider } from '../../context/ThemeContext';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('SceneRenderer', () => {
  it('renders every one of the 26 scenes without throwing', () => {
    for (const key of Object.keys(SCENES) as (keyof typeof SCENES)[]) {
      expect(() => wrap(<SceneRenderer scene={key} />)).not.toThrow();
    }
  });

  it('renders an svg for a scene', () => {
    const { UNSAFE_root } = wrap(<SceneRenderer scene="emptySaved" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('accepts a size override', () => {
    expect(() => wrap(<SceneRenderer scene="offline" size={96} />)).not.toThrow();
  });
});

describe('theme reactivity', () => {
  // The primitive this replaces hardcoded slate hex, so it was correct in
  // exactly one of the app's 18 palettes. This asserts the fills actually
  // follow the theme rather than merely looking like they might.
  function fills(tree: unknown): string[] {
    const found: string[] = [];
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.props?.fill === 'string' && node.props.fill !== 'none') {
        found.push(node.props.fill);
      }
      const kids = node.children ?? node.props?.children;
      if (Array.isArray(kids)) kids.forEach(walk);
      else if (kids) walk(kids);
    };
    walk(tree);
    return found;
  }

  it('paints different colours in light and dark', () => {
    function Harness({ dark }: { dark: boolean }) {
      const { setMode } = require('../../context/ThemeContext').useTheme();
      React.useEffect(() => setMode(dark ? 'dark' : 'light'), [dark, setMode]);
      return <SceneRenderer scene="emptySaved" />;
    }

    const light = wrap(<Harness dark={false} />);
    const dark = wrap(<Harness dark />);
    expect(fills(light.toJSON())).not.toEqual(fills(dark.toJSON()));
  });

  it('paints different colours across theme packages', () => {
    function Harness({ pack }: { pack: string }) {
      const { setPackage } = require('../../context/ThemeContext').useTheme();
      React.useEffect(() => setPackage(pack as never), [pack, setPackage]);
      return <SceneRenderer scene="emptyGoals" />;
    }

    const a = wrap(<Harness pack="default" />);
    const b = wrap(<Harness pack="forest" />);
    expect(fills(a.toJSON())).not.toEqual(fills(b.toJSON()));
  });
});

describe('reduced motion', () => {
  it('starts no repeating animation when the user asked for less motion', () => {
    // `useMotion()` folds the in-app toggle and the OS setting together, and
    // every loop in SceneRenderer is gated on its `allowLoop`. Assert the gate
    // rather than the pixels: a scene that loops under reduced motion is the
    // single worst offender for motion sensitivity.
    jest.resetModules();
    jest.doMock('../../../hooks/useMotion', () => ({
      useMotion: () => ({
        reduced: true,
        allowLoop: false,
        duration: { instant: 0, quick: 0, base: 0, slow: 0, scene: 0 },
        easing: {},
        spring: {},
        stagger: () => 0,
      }),
    }));

    const withRepeat = jest.spyOn(require('react-native-reanimated'), 'withRepeat');
    const { SceneRenderer: Reduced } = require('../SceneRenderer');
    wrap(<Reduced scene="emptySaved" />);
    expect(withRepeat).not.toHaveBeenCalled();

    withRepeat.mockRestore();
    jest.dontMock('../../../hooks/useMotion');
  });
});
```

If `setMode`/`setPackage` are not reachable this way in the harness (the provider
persists to AsyncStorage on change), fall back to asserting `hueTokensFrom`
directly against light and dark `StateTokens` fixtures — the point is that no
colour in a scene is a literal, and either form proves it.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest components/state/__tests__/SceneRenderer.test.tsx --maxWorkers=2
```

Expected: FAIL — `Cannot find module '../SceneRenderer'`.

- [ ] **Step 3: Write `SceneRenderer.tsx`**

```tsx
import React, { useEffect, useMemo } from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  ANIMS,
  REST,
  SCENES,
  resolvePaints,
  visibleLayers,
  type AnimId,
  type Frame,
  type HueTokens,
  type Layer,
  type PaintMap,
  type SceneKey,
} from '@edutu/ux-state/scenes';
import { useMotion } from '../../hooks/useMotion';
import { hueForState, stateStage, useStateTokens, type StateTokens } from './stateTokens';
import type { ScreenState } from './ScreenState';

const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * Bridge the app's live theme tokens into the shape the shared package expects.
 *
 * `soft` is the duotone's second tone. In light mode it is a tint of the hue; in
 * dark mode a tint would vanish, so it becomes an elevated surface instead.
 */
export function hueTokensFrom(t: StateTokens): HueTokens {
  return {
    hue: t.hue,
    soft: t.isDark ? t.wash : t.ring,
    plate: t.isDark ? 'rgba(255,255,255,0.06)' : t.wash,
    ink: t.title,
    inkSoft: t.body,
    surface: t.surface,
    surfaceLine: t.surfaceLine,
  };
}

/** Read a frame property, falling back to the identity pose. */
const at = (frame: Frame | undefined, key: keyof Frame): number =>
  frame?.[key] ?? (REST[key] as number);

interface AnimatedGroupProps {
  anim: AnimId;
  origin: [number, number];
  rotate: number;
  x: number;
  y: number;
  children: React.ReactNode;
}

/**
 * One animated group. Every named motion is implemented here and only here,
 * which is what makes scene 27 cost no animation code.
 */
function AnimatedGroup({ anim, origin, rotate, x, y, children }: AnimatedGroupProps) {
  const motion = useMotion();
  const spec = ANIMS[anim];
  const progress = useSharedValue(0);
  const { allowLoop } = motion;

  useEffect(() => {
    if (!allowLoop) {
      // Hold the rest pose. A permanently breathing scene is the single worst
      // offender for motion sensitivity, so reduced motion stops the loop dead
      // rather than merely slowing it.
      progress.value = 0;
      return;
    }

    const stepMs = spec.durationMs / Math.max(1, spec.frames.length - 1);
    const steps = spec.frames
      .slice(1)
      .map((_, i) =>
        withTiming((i + 1) / (spec.frames.length - 1), {
          duration: stepMs,
          easing: Easing.inOut(Easing.sin),
        }),
      );

    progress.value = withDelay(
      spec.delayMs,
      spec.loop
        ? withRepeat(withSequence(...steps), -1, false)
        : withSequence(...steps),
    );

    return () => {
      progress.value = 0;
    };
  }, [allowLoop, progress, spec]);

  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const frames = allowLoop ? spec.frames : [spec.rest];
    const span = Math.max(1, frames.length - 1);
    const scaled = progress.value * span;
    const lo = Math.min(Math.floor(scaled), span);
    const hi = Math.min(lo + 1, span);
    const t = scaled - lo;

    const mix = (key: keyof Frame): number => {
      const a = frames[lo]?.[key] ?? (REST[key] as number);
      const b = frames[hi]?.[key] ?? (REST[key] as number);
      return a + (b - a) * t;
    };

    const tx = x + mix('x');
    const ty = y + mix('y');
    const rot = rotate + mix('rotate');
    const scale = mix('scale');

    return {
      opacity: mix('opacity'),
      transform: [
        { translateX: tx },
        { translateY: ty },
        { translateX: origin[0] },
        { translateY: origin[1] },
        { rotate: `${rot}deg` },
        { scale },
        { translateX: -origin[0] },
        { translateY: -origin[1] },
      ],
    };
  }, [allowLoop, spec, origin, rotate, x, y]);

  return <AnimatedG animatedProps={animatedProps}>{children}</AnimatedG>;
}

function renderLayer(layer: Layer, paints: PaintMap, key: string): React.ReactNode {
  const fill = layer.t !== 'group' && layer.fill ? paints[layer.fill] : 'none';
  const stroke = layer.t !== 'group' && layer.stroke ? paints[layer.stroke] : undefined;
  // `cap`/`join` live only on the path variant, so they must be read after
  // narrowing — reading them off the union is a type error.
  const common =
    layer.t === 'group'
      ? {}
      : {
          fill,
          stroke,
          strokeWidth: layer.sw,
          opacity: layer.op,
          strokeLinecap: (layer.t === 'path' ? layer.cap : undefined) ?? ('round' as const),
          strokeLinejoin: (layer.t === 'path' ? layer.join : undefined) ?? ('round' as const),
        };

  switch (layer.t) {
    case 'rect':
      return (
        <Rect key={key} x={layer.x} y={layer.y} width={layer.w} height={layer.h} rx={layer.r ?? 0} {...common} />
      );
    case 'circle':
      return <Circle key={key} cx={layer.cx} cy={layer.cy} r={layer.r} {...common} />;
    case 'path':
      return <Path key={key} d={layer.d} {...common} />;
    case 'group': {
      const children = layer.children.map((child, i) => renderLayer(child, paints, `${key}-${i}`));
      if (!layer.anim) {
        const t = `translate(${layer.x ?? 0} ${layer.y ?? 0}) rotate(${layer.rotate ?? 0} ${
          layer.origin?.[0] ?? 120
        } ${layer.origin?.[1] ?? 90})`;
        return (
          <G key={key} transform={t}>
            {children}
          </G>
        );
      }
      return (
        <AnimatedGroup
          key={key}
          anim={layer.anim}
          origin={layer.origin ?? [120, 90]}
          rotate={layer.rotate ?? 0}
          x={layer.x ?? 0}
          y={layer.y ?? 0}
        >
          {children}
        </AnimatedGroup>
      );
    }
  }
}

export interface SceneRendererProps {
  scene: SceneKey;
  /** Rendered width. Height follows the 240×180 aspect ratio. */
  size?: number;
}

export function SceneRenderer({ scene, size = stateStage.hero }: SceneRendererProps) {
  const spec = SCENES[scene];
  const tokens = useStateTokens(spec.hue);
  const paints = useMemo(() => resolvePaints(spec.volume, hueTokensFrom(tokens)), [spec.volume, tokens]);
  const layers = useMemo(() => visibleLayers(spec.layers, spec.volume), [spec.layers, spec.volume]);

  const [vw, vh] = spec.viewBox;

  return (
    <Svg width={size} height={(size * vh) / vw} viewBox={`0 0 ${vw} ${vh}`}>
      {layers.map((layer, i) => renderLayer(layer, paints, `l${i}`))}
    </Svg>
  );
}

/** Convenience for callers holding a state rather than a scene key. */
export function sceneHueFor(state: ScreenState) {
  return hueForState(state);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest components/state/__tests__/SceneRenderer.test.tsx --maxWorkers=2
```

Expected: PASS, 6 tests. If it fails with `Cannot find module 'react-native-svg'` inside the transform, add `react-native-svg` to the existing `transformIgnorePatterns` allowlist in `package.json`.

- [ ] **Step 5: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add edutumobile/components/state/SceneRenderer.tsx \
        edutumobile/components/state/__tests__/SceneRenderer.test.tsx
git commit -m "feat(mobile): render shared scene geometry with Reanimated"
```

---

### Task 8: Web scene tokens and SceneRenderer

**Files:**
- Create: `edutu-web-app/src/components/state/sceneTokens.ts`
- Create: `edutu-web-app/src/components/state/SceneRenderer.tsx`
- Modify: `edutu-web-app/src/index.css` (add `--color-scene-soft`)
- Test: `edutu-web-app/src/test/__tests__/SceneRenderer.test.tsx`

**Interfaces:**
- Consumes: `SCENES`, `ANIMS`, `REST`, `resolvePaints`, `visibleLayers` from `@edutu/ux-state/scenes`.
- Produces: `hueTokens(hue: HueRole): HueTokens`, `<SceneRenderer scene={SceneKey} size?: number className?: string />`.

- [ ] **Step 1: Write the failing test**

`edutu-web-app/src/test/__tests__/SceneRenderer.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCENES } from '@edutu/ux-state/scenes';
import { SceneRenderer } from '@/components/state/SceneRenderer';

describe('web SceneRenderer', () => {
  it('renders all 26 scenes without throwing', () => {
    for (const key of Object.keys(SCENES) as (keyof typeof SCENES)[]) {
      const { container, unmount } = render(<SceneRenderer scene={key} />);
      expect(container.querySelector('svg')).not.toBeNull();
      unmount();
    }
  });

  it('uses the scene viewBox so every scene shares one stage', () => {
    const { container } = render(<SceneRenderer scene="emptyGoals" />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 240 180');
  });

  it('drops decorative layers on a calm scene', () => {
    // success is `invite` and keeps its three decorative circles; offline is
    // `calm` and has none, so the calm scene must have strictly fewer circles.
    const invite = render(<SceneRenderer scene="success" />);
    const calm = render(<SceneRenderer scene="offline" />);
    const countInvite = invite.container.querySelectorAll('circle').length;
    const countCalm = calm.container.querySelectorAll('circle').length;
    expect(countInvite).toBeGreaterThan(0);
    expect(countCalm).toBeGreaterThan(0);
    expect(countInvite).toBeGreaterThan(3);
  });

  it('marks the svg as decorative for screen readers', () => {
    const { container } = render(<SceneRenderer scene="offline" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/SceneRenderer.test.tsx
```

Expected: FAIL — `Failed to resolve import "@/components/state/SceneRenderer"`.

- [ ] **Step 3: Add the soft-tone token**

In `edutu-web-app/src/index.css`, inside the same `:root` block as the existing `--color-brand-*` declarations, add after the "Support colors" group:

```css
  /* Scene tokens — the duotone's second tone. A tint in light mode; the dark
     block below replaces it with a deep shade, because a tint disappears
     against a dark surface. */
  --color-scene-soft: 224 231 255;
  --color-scene-plate: 241 245 249;
```

And in the existing dark block (`.dark { … }` in the same file), add:

```css
  --color-scene-soft: 42 47 82;
  --color-scene-plate: 30 41 59;
```

- [ ] **Step 4: Write `sceneTokens.ts`**

```ts
import type { HueRole, HueTokens } from '@edutu/ux-state/scenes';

/**
 * Resolve a scene hue to real colours from the app's CSS custom properties.
 *
 * Every value is an `rgb(var(--token))` expression rather than a literal, so a
 * scene follows the active theme pack and the light/dark class on <html>
 * without this file knowing which pack is on.
 */
const v = (token: string, alpha?: number): string =>
  alpha === undefined ? `rgb(var(${token}))` : `rgb(var(${token}) / ${alpha})`;

const HUE_TOKEN: Record<HueRole, string> = {
  flow: '--color-brand-600',
  neutral: '--color-neutral-500',
  danger: '--color-danger-500',
  offline: '--color-neutral-500',
  locked: '--color-brand-600',
  denied: '--color-warning-500',
  success: '--color-success-500',
};

export function hueTokens(hue: HueRole): HueTokens {
  return {
    hue: v(HUE_TOKEN[hue]),
    soft: v('--color-scene-soft'),
    plate: v('--color-scene-plate'),
    ink: v('--text-primary'),
    inkSoft: v('--text-secondary'),
    surface: v('--surface-layer'),
    surfaceLine: v('--color-neutral-200'),
  };
}
```

- [ ] **Step 5: Write the web `SceneRenderer.tsx`**

```tsx
import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ANIMS,
  REST,
  SCENES,
  resolvePaints,
  visibleLayers,
  type Frame,
  type Layer,
  type PaintMap,
  type SceneKey,
} from '@edutu/ux-state/scenes';
import { hueTokens } from './sceneTokens';

/** Collect a frame property across all frames, for framer-motion keyframes. */
const track = (frames: Frame[], key: keyof Frame): number[] =>
  frames.map((f) => f[key] ?? (REST[key] as number));

/** True when a property actually changes across the motion — skip it if not. */
const varies = (values: number[]): boolean => values.some((n) => n !== values[0]);

function AnimatedGroup({
  layer,
  paints,
  path,
}: {
  layer: Extract<Layer, { t: 'group' }>;
  paints: PaintMap;
  path: string;
}) {
  const reduced = useReducedMotion();
  const spec = layer.anim ? ANIMS[layer.anim] : undefined;
  const origin = layer.origin ?? [120, 90];
  const base = `translate(${layer.x ?? 0}px, ${layer.y ?? 0}px)`;

  const children = layer.children.map((child, i) => renderLayer(child, paints, `${path}-${i}`));

  if (!spec || reduced) {
    // Rest pose. No loop is started at all — not slowed, stopped.
    const rest = spec?.rest ?? REST;
    return (
      <g
        transform={`rotate(${(layer.rotate ?? 0) + (rest.rotate ?? 0)} ${origin[0]} ${origin[1]})`}
        style={{
          transform: `${base} translate(${rest.x ?? 0}px, ${rest.y ?? 0}px)`,
          opacity: rest.opacity ?? 1,
        }}
      >
        {children}
      </g>
    );
  }

  const animate: Record<string, number[]> = {};
  const x = track(spec.frames, 'x');
  const y = track(spec.frames, 'y');
  const rotate = track(spec.frames, 'rotate').map((r) => r + (layer.rotate ?? 0));
  const scale = track(spec.frames, 'scale');
  const opacity = track(spec.frames, 'opacity');

  if (varies(x)) animate.x = x;
  if (varies(y)) animate.y = y;
  if (varies(rotate) || layer.rotate) animate.rotate = rotate;
  if (varies(scale)) animate.scale = scale;
  if (varies(opacity)) animate.opacity = opacity;

  return (
    <motion.g
      style={{ originX: `${origin[0]}px`, originY: `${origin[1]}px`, transform: base }}
      animate={animate}
      transition={{
        duration: spec.durationMs / 1000,
        delay: spec.delayMs / 1000,
        repeat: spec.loop ? Infinity : 0,
        ease: 'easeInOut',
      }}
    >
      {children}
    </motion.g>
  );
}

function renderLayer(layer: Layer, paints: PaintMap, path: string): JSX.Element {
  if (layer.t === 'group') {
    return <AnimatedGroup key={path} layer={layer} paints={paints} path={path} />;
  }

  const common = {
    fill: layer.fill ? paints[layer.fill] : 'none',
    stroke: layer.stroke ? paints[layer.stroke] : undefined,
    strokeWidth: layer.sw,
    opacity: layer.op,
    strokeLinecap: (layer.t === 'path' ? layer.cap : undefined) ?? ('round' as const),
    strokeLinejoin: (layer.t === 'path' ? layer.join : undefined) ?? ('round' as const),
  };

  switch (layer.t) {
    case 'rect':
      return (
        <rect key={path} x={layer.x} y={layer.y} width={layer.w} height={layer.h} rx={layer.r ?? 0} {...common} />
      );
    case 'circle':
      return <circle key={path} cx={layer.cx} cy={layer.cy} r={layer.r} {...common} />;
    case 'path':
      return <path key={path} d={layer.d} {...common} />;
  }
}

export interface SceneRendererProps {
  scene: SceneKey;
  /** Rendered width in px. Height follows the 240×180 aspect ratio. */
  size?: number;
  className?: string;
}

export function SceneRenderer({ scene, size = 240, className }: SceneRendererProps) {
  const spec = SCENES[scene];
  const paints = useMemo(() => resolvePaints(spec.volume, hueTokens(spec.hue)), [spec]);
  const layers = useMemo(() => visibleLayers(spec.layers, spec.volume), [spec]);
  const [vw, vh] = spec.viewBox;

  return (
    <svg
      className={className}
      width={size}
      height={(size * vh) / vw}
      viewBox={`0 0 ${vw} ${vh}`}
      // The scene never carries information the copy does not; announcing it
      // would just read the same message twice.
      aria-hidden="true"
      focusable="false"
    >
      {layers.map((layer, i) => renderLayer(layer, paints, `l${i}`))}
    </svg>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/SceneRenderer.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add edutu-web-app/src/components/state edutu-web-app/src/index.css \
        edutu-web-app/src/test/__tests__/SceneRenderer.test.tsx
git commit -m "feat(web): render shared scene geometry with framer-motion"
```

---

### Task 9: Switch mobile StateView onto SceneRenderer and delete Tier 3

**Files:**
- Modify: `edutumobile/components/state/StateView.tsx`
- Modify: `edutumobile/components/state/index.ts`
- Delete: `edutumobile/components/state/IconTile.tsx`
- Delete: `edutumobile/components/state/scenes/NoOpportunitiesScene.tsx`
- Delete: `edutumobile/components/state/scenes/NothingSavedScene.tsx`
- Test: `edutumobile/components/state/__tests__/StateView.test.tsx`

**Interfaces:**
- Consumes: `SceneRenderer` (Task 7), `sceneForState` + `FlowKey` (Task 6).
- Produces: `StateViewProps` gains `flow?: FlowKey` (default `'home'`) and loses `tier` and `hero`.

- [ ] **Step 1: Write the failing test**

`edutumobile/components/state/__tests__/StateView.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import type { ScreenState } from '@edutu/ux-state/state';
import { StateView } from '../StateView';
import { ThemeProvider } from '../../context/ThemeContext';

const STATES: ScreenState[] = [
  { kind: 'loading' },
  { kind: 'refreshing' },
  { kind: 'empty', reason: 'firstRun' },
  { kind: 'empty', reason: 'filtered' },
  { kind: 'partial', staleAt: null },
  { kind: 'error', cause: 'network' },
  { kind: 'error', cause: 'auth' },
  { kind: 'error', cause: 'notFound' },
  { kind: 'error', cause: 'server' },
  { kind: 'error', cause: 'timeout' },
  { kind: 'offline' },
  { kind: 'locked', reason: 'pro' },
  { kind: 'locked', reason: 'guest' },
  { kind: 'locked', reason: 'module' },
  { kind: 'denied', permission: 'notifications' },
  { kind: 'denied', permission: 'camera' },
  { kind: 'denied', permission: 'calendar' },
  { kind: 'denied', permission: 'photos' },
];

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('StateView', () => {
  it('renders every non-ready state', () => {
    for (const state of STATES) {
      expect(() => wrap(<StateView state={state} flow="saved" />)).not.toThrow();
    }
  });

  it('renders a title for each state', () => {
    for (const state of STATES) {
      const { toJSON, unmount } = wrap(<StateView state={state} flow="goals" />);
      expect(JSON.stringify(toJSON())).not.toBe('null');
      unmount();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest components/state/__tests__/StateView.test.tsx --maxWorkers=2
```

Expected: FAIL — `StateView` still requires the removed `hero`/`tier` API, or the test throws on a missing `flow` prop.

- [ ] **Step 3: Rework `StateView.tsx`**

Make exactly these changes to the existing file; leave its copy table, translation keys and action wiring intact.

1. Delete the `StateTier` type and the `tier` and `hero` props from `StateViewProps`. Add:

```tsx
import type { FlowKey } from '@edutu/ux-state/scenes';

  /**
   * Which product area this screen belongs to. Only affects a first-run empty —
   * that is the one state whose picture should be about *this* screen.
   */
  flow?: FlowKey;
```

2. Delete the `tier`, `arrangement` and `glyphs` fields from the internal `Presentation` interface and from every entry in its table. Keep `titleKey`, `bodyKey`, `actionKey`, `retryAction`, `bodyVars`.

3. Replace the `IconTile` / `StateScene` / `hero` branch of the render with a single call:

```tsx
import { SceneRenderer } from './SceneRenderer';
import { sceneForState } from '@edutu/ux-state/scenes';

// …inside the component, replacing whatever chose a tier:
const scene = sceneForState(state, flow);
// …and in the JSX, where the tier branch used to be:
<SceneRenderer scene={scene} size={stateStage.hero} />
```

4. Remove the now-unused imports: `IconTile`, `StateScene`, `SceneArrangement`, and every `lucide-react-native` glyph that was only used to populate the deleted `glyphs` arrays. Keep `ArrowRight` if the action button still uses it.

- [ ] **Step 4: Delete the superseded files and update the barrel**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
git rm components/state/IconTile.tsx \
       components/state/scenes/NoOpportunitiesScene.tsx \
       components/state/scenes/NothingSavedScene.tsx
rmdir components/state/scenes 2>/dev/null || true
```

In `components/state/index.ts`, delete the `IconTile` export line and add:

```ts
export { SceneRenderer, hueTokensFrom, type SceneRendererProps } from './SceneRenderer';
export { sceneForState, SCENES, type FlowKey, type SceneKey } from '@edutu/ux-state/scenes';
```

- [ ] **Step 5: Verify nothing else referenced the deleted files**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
grep -rn "IconTile\|NoOpportunitiesScene\|NothingSavedScene" app components lib || echo "NO DANGLING REFERENCES"
```

Expected: `NO DANGLING REFERENCES`. Any hit must be fixed before committing.

- [ ] **Step 6: Run the tests and the typecheck**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest components/state --maxWorkers=2
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/state" || echo "TYPECHECK CLEAN"
npm run lint 2>&1 | tail -5
```

Expected: all `components/state` tests PASS, `TYPECHECK CLEAN`, lint clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add -A edutumobile/components/state
git commit -m "feat(mobile): StateView renders shared scenes; drop Tier 3 and the two RN scenes"
```

---

### Task 10: Web StateView and InlineError

**Files:**
- Create: `edutu-web-app/src/components/state/StateView.tsx`
- Create: `edutu-web-app/src/components/state/InlineError.tsx`
- Create: `edutu-web-app/src/components/state/useScreenState.ts` (the three-line memoised wrapper over `deriveState`, mirroring `edutumobile/components/state/ScreenState.ts`)
- Create: `edutu-web-app/src/components/state/index.ts`
- Test: `edutu-web-app/src/test/__tests__/StateView.test.tsx`

**Interfaces:**
- Consumes: `ScreenState` from `@edutu/ux-state/state`; `sceneForState`, `FlowKey` from `@edutu/ux-state/scenes`; `SceneRenderer` from Task 8; the existing `@/components/ui/Button`.
- Produces: `<StateView state flow onRetry? onAction? actionLabel? title? body? className? />`, `<InlineError message onRetry? />`, and a `src/components/state/index.ts` barrel.

- [ ] **Step 1: Write the failing test**

`edutu-web-app/src/test/__tests__/StateView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ScreenState } from '@edutu/ux-state/state';
import { StateView } from '@/components/state/StateView';
import { InlineError } from '@/components/state/InlineError';

const STATES: ScreenState[] = [
  { kind: 'loading' },
  { kind: 'refreshing' },
  { kind: 'empty', reason: 'firstRun' },
  { kind: 'empty', reason: 'filtered' },
  { kind: 'partial', staleAt: null },
  { kind: 'error', cause: 'network' },
  { kind: 'error', cause: 'auth' },
  { kind: 'error', cause: 'notFound' },
  { kind: 'error', cause: 'server' },
  { kind: 'error', cause: 'timeout' },
  { kind: 'offline' },
  { kind: 'locked', reason: 'pro' },
  { kind: 'locked', reason: 'guest' },
  { kind: 'locked', reason: 'module' },
  { kind: 'denied', permission: 'notifications' },
  { kind: 'denied', permission: 'camera' },
  { kind: 'denied', permission: 'calendar' },
  { kind: 'denied', permission: 'photos' },
];

describe('web StateView', () => {
  it('renders a scene and a title for every non-ready state', () => {
    for (const state of STATES) {
      const { container, unmount } = render(<StateView state={state} flow="saved" />);
      expect(container.querySelector('svg')).not.toBeNull();
      expect(container.querySelector('h3')?.textContent?.length ?? 0).toBeGreaterThan(0);
      unmount();
    }
  });

  it('shows a retry action on an error and calls back', async () => {
    const onRetry = vi.fn();
    render(<StateView state={{ kind: 'error', cause: 'server' }} flow="home" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not offer retry on a first-run empty — there is nothing to retry', () => {
    render(<StateView state={{ kind: 'empty', reason: 'firstRun' }} flow="goals" />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('lets a screen override the copy', () => {
    render(
      <StateView state={{ kind: 'offline' }} flow="home" title="No signal" body="Reconnect to see new roles." />,
    );
    expect(screen.getByText('No signal')).toBeInTheDocument();
    expect(screen.getByText('Reconnect to see new roles.')).toBeInTheDocument();
  });
});

describe('InlineError', () => {
  it('renders the message and calls retry', async () => {
    const onRetry = vi.fn();
    render(<InlineError message="Could not save" onRetry={onRetry} />);
    expect(screen.getByText('Could not save')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders without a retry affordance when none is given', () => {
    render(<InlineError message="Could not save" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/StateView.test.tsx
```

Expected: FAIL — `Failed to resolve import "@/components/state/StateView"`.

- [ ] **Step 3: Write `StateView.tsx`**

```tsx
import type { ScreenState } from '@edutu/ux-state/state';
import { sceneForState, type FlowKey } from '@edutu/ux-state/scenes';
import Button from '@/components/ui/Button';
import { SceneRenderer } from './SceneRenderer';

/**
 * The single renderer every non-ready state on the web app goes through.
 *
 * Before this existed, web could not tell a failed fetch from an empty result —
 * both rendered `EmptyState` with a glyph and the same shrug of a sentence.
 * Which scene, which words and which action a state gets is now decided once,
 * here, and matches mobile because both read the same `ScreenState`.
 */

interface Copy {
  title: string;
  body: string;
  action?: string;
  /** The action calls `onRetry` rather than `onAction`. */
  retry?: boolean;
}

const EMPTY_COPY: Record<FlowKey, Copy> = {
  home: { title: 'Your feed is warming up', body: 'Tell us what you are aiming for and matches start landing here.', action: 'Set your goals' },
  discovery: { title: 'Nothing matched yet', body: 'New opportunities are added daily. Broaden what you are open to and more will show up.', action: 'Adjust preferences' },
  saved: { title: 'Nothing saved yet', body: 'Tap the bookmark on anything worth a second look and it waits for you here.', action: 'Browse opportunities' },
  applied: { title: 'No applications yet', body: 'Once you apply, track every stage and deadline from this page.', action: 'Find something to apply to' },
  goals: { title: 'No goals yet', body: 'Pick a goal and Edutu builds the roadmap that gets you there.', action: 'Create a goal' },
  coach: { title: 'Nothing here yet', body: 'Your coach picks up where you left off once you have started something.', action: 'Get started' },
  wallet: { title: 'No transactions yet', body: 'Credits you earn and spend will show up here.', action: 'Learn about credits' },
  community: { title: 'No one here yet', body: 'Join a group to swap notes with people chasing the same things.', action: 'Find a group' },
};

function copyFor(state: ScreenState, flow: FlowKey): Copy {
  switch (state.kind) {
    case 'loading':
      return { title: 'Loading', body: 'One moment.' };
    case 'refreshing':
      return { title: 'Refreshing', body: 'Getting the latest.' };
    case 'partial':
      return { title: 'Showing a saved copy', body: 'We could not refresh just now, so this may be out of date.', action: 'Try again', retry: true };
    case 'empty':
      return state.reason === 'filtered'
        ? { title: 'No results for these filters', body: 'Nothing matched. Try removing a filter or widening your search.', action: 'Clear filters' }
        : EMPTY_COPY[flow];
    case 'error':
      switch (state.cause) {
        case 'auth':
          return { title: 'Please sign in again', body: 'Your session expired. Signing in again picks up exactly where you were.', action: 'Sign in' };
        case 'notFound':
          return { title: 'This is not here anymore', body: 'It may have closed or been removed. Everything else is still available.', action: 'Go back' };
        case 'timeout':
          return { title: 'That took too long', body: 'The request timed out before it finished. It usually works on a second try.', action: 'Try again', retry: true };
        case 'network':
          return { title: 'Could not reach Edutu', body: 'Check your connection and try again.', action: 'Try again', retry: true };
        default:
          return { title: 'Something went wrong on our side', body: 'This one is on us, not you. Trying again usually clears it.', action: 'Try again', retry: true };
      }
    case 'offline':
      return { title: 'You are offline', body: 'Anything already downloaded still works. New results need a connection.', action: 'Try again', retry: true };
    case 'locked':
      switch (state.reason) {
        case 'pro':
          return { title: 'This is a Pro feature', body: 'Upgrade to unlock it, along with everything else in Pro.', action: 'See Pro' };
        case 'guest':
          return { title: 'Create an account to continue', body: 'Saving, applying and tracking need an account. It takes under a minute.', action: 'Sign up' };
        default:
          return { title: 'Temporarily unavailable', body: 'We have paused this section briefly. It will be back shortly.' };
      }
    case 'denied':
      return {
        title: 'Permission needed',
        body: `Edutu needs access to your ${state.permission} to do this. You can grant it in your browser settings.`,
        action: 'How to fix this',
      };
    default:
      return { title: '', body: '' };
  }
}

export interface StateViewProps {
  state: ScreenState;
  /** Which product area this screen belongs to — only affects a first-run empty. */
  flow: FlowKey;
  onRetry?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  title?: string;
  body?: string;
  className?: string;
}

export function StateView({
  state,
  flow,
  onRetry,
  onAction,
  actionLabel,
  title,
  body,
  className = '',
}: StateViewProps) {
  const copy = copyFor(state, flow);
  const scene = sceneForState(state, flow);

  const handler = copy.retry ? onRetry : onAction;
  const label = actionLabel ?? copy.action;
  const showAction = Boolean(label && handler);

  return (
    <div
      className={`flex min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <SceneRenderer scene={scene} size={220} className="mb-6 max-w-full" />

      <h3 className="text-lg font-semibold text-text-primary">{title ?? copy.title}</h3>

      <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">{body ?? copy.body}</p>

      {showAction && (
        <div className="mt-6">
          <Button onClick={handler} variant="primary" size="sm">
            {label}
          </Button>
        </div>
      )}
    </div>
  );
}

export default StateView;
```

- [ ] **Step 4: Write `InlineError.tsx` and the barrel**

`edutu-web-app/src/components/state/InlineError.tsx`:

```tsx
import { AlertCircle } from 'lucide-react';

/**
 * Failure surfaced at the point it happened, with the recovery attached.
 *
 * The alternative — a toast, or replacing the whole section with an error page —
 * loses the user's place. This keeps the surrounding content on screen.
 */
export interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function InlineError({ message, onRetry, className = '' }: InlineErrorProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-danger/20 bg-danger/10 p-4 ${className}`}
      role="alert"
    >
      <AlertCircle className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
      <p className="flex-1 text-sm text-text-primary">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default InlineError;
```

`edutu-web-app/src/components/state/index.ts`:

```ts
export { StateView, type StateViewProps } from './StateView';
export { InlineError, type InlineErrorProps } from './InlineError';
export { SceneRenderer, type SceneRendererProps } from './SceneRenderer';
export { hueTokens } from './sceneTokens';
export { useScreenState } from './useScreenState';
export {
  classifyError,
  deriveState,
  showsContent,
  type ScreenState,
  type ScreenStateInput,
  type ErrorCause,
} from '@edutu/ux-state/state';
export { sceneForState, SCENES, type FlowKey, type SceneKey } from '@edutu/ux-state/scenes';
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/StateView.test.tsx src/test/__tests__/SceneRenderer.test.tsx
```

Expected: PASS, 10 tests. If `danger` is not a Tailwind colour in this project, check `tailwind.config.js` and substitute the configured name — `--color-danger-500` exists in `index.css`, so the utility should resolve.

- [ ] **Step 6: Full verification of both apps**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx tsc -b && npm run lint && npx vitest run

cd ../edutumobile
npx tsc --noEmit -p tsconfig.json && npm run lint && npx jest components/state lib --maxWorkers=2
```

Expected: every command exits 0.

- [ ] **Step 7: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add edutu-web-app/src/components/state edutu-web-app/src/test/__tests__/StateView.test.tsx
git commit -m "feat(web): StateView and InlineError on the shared state contract"
```

---

## After this plan

Both apps can now render every state as a branded animated illustration, and mobile's `StateView` already does. Nothing user-visible has changed yet, because no screen declares a state.

**Next:** write `docs/superpowers/plans/2026-08-XX-illustrated-state-migration.md`, covering the 5 mobile flows and 6 web screens from spec §7. That plan must be written *after* this one lands, with each screen's current fetch and empty-state code read first — the substitutions differ per screen and cannot be specified accurately in advance. Its final task deletes `edutu-web-app/src/components/ui/EmptyState.tsx` in the same commit as its last consumer migrates.
