/**
 * The UX state system.
 *
 * One contract (`ScreenState`), one renderer (`StateView`), one feedback façade
 * (`lib/feedback.ts` → `FeedbackProvider`), and one illustration set drawn from
 * shared geometry in `@edutu/ux-state/scenes`. Screens import from here and
 * nowhere else in this directory.
 *
 * The former three-tier split (hero scene / composed scene / glyph tile) is
 * gone: it left roughly fifteen states rendering as a glyph in a tinted circle.
 * `IconTile` and `StateScene` were deleted with it rather than deprecated — a
 * dead primitive left in place is a decoy the next screen adopts.
 *
 * Replaces: `components/ui/EmptyState.tsx`, `components/ui/LottieState.tsx` and
 * `components/ui/LottieRefresh.tsx`, which are removed once their remaining
 * call sites are migrated.
 */

export {
  useScreenState,
  classifyError,
  showsContent,
  type ScreenState,
  type ScreenStateInput,
  type StateKind,
  type ErrorCause,
} from './ScreenState';

export { StateView, type StateViewProps } from './StateView';
export { SceneRenderer, hueTokensFrom, type SceneRendererProps } from './SceneRenderer';
export { sceneForState, SCENES, type FlowKey, type SceneKey } from '@edutu/ux-state/scenes';
export { InlineError, type InlineErrorProps } from './InlineError';
export { ConfirmSheet, type ConfirmSheetProps } from './ConfirmSheet';
export { FeedbackProvider } from './FeedbackProvider';

export {
  useStateTokens,
  useTokensForState,
  hueForState,
  stateStage,
  stateLayout,
  stateType,
  type StateHue,
  type StateTokens,
} from './stateTokens';

export * from './illustrations';
