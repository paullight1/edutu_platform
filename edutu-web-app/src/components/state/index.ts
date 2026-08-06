/**
 * The web UX state system.
 *
 * One contract (`ScreenState`, shared with the mobile app), one renderer
 * (`StateView`), and one illustration set drawn from shared geometry in
 * `@edutu/ux-state/scenes`. Screens import from here and nowhere else in this
 * directory.
 *
 * Replaces `components/ui/EmptyState.tsx`, which is deleted once its five
 * remaining call sites are migrated.
 */

export { StateView, type StateViewProps } from './StateView';
export { InlineError, type InlineErrorProps } from './InlineError';
export { SceneRenderer, type SceneRendererProps } from './SceneRenderer';
export { hueTokens } from './sceneTokens';
export { useScreenState } from './useScreenState';

export {
  classifyError,
  deriveState,
  showsContent,
  type ErrorCause,
  type ScreenState,
  type ScreenStateInput,
} from '@edutu/ux-state/state';

export { SCENES, sceneForState, type FlowKey, type SceneKey } from '@edutu/ux-state/scenes';
