/**
 * The UX state system.
 *
 * One contract (`ScreenState`), one renderer (`StateView`), one feedback façade
 * (`lib/feedback.ts` → `FeedbackProvider`), and a three-tier illustration set.
 * Screens import from here and nowhere else in this directory.
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

export { StateView, type StateViewProps, type StateTier } from './StateView';
export { StateScene, type StateSceneProps, type SceneArrangement } from './StateScene';
export { IconTile, type IconTileProps } from './IconTile';
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
