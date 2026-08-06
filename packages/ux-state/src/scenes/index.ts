import type { ScreenState } from '../state/ScreenState';
import { EMPTY_SCENES } from './empty';
import { SHARED_SCENES } from './shared';
import type { FlowKey, SceneKey, SceneSpec } from './types';

export * from './types';
export * from './volume';
export * from './motion';
export { EMPTY_SCENES } from './empty';
export { SHARED_SCENES, type SharedSceneKey } from './shared';

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
 * shows the same scene everywhere, so the language stays recognisable: a user
 * who meets one locked screen should recognise the next one instantly.
 */
export function sceneForState(state: ScreenState, flow: FlowKey): SceneKey {
  switch (state.kind) {
    case 'empty':
      return state.reason === 'filtered' ? 'emptyFiltered' : EMPTY_BY_FLOW[flow];
    case 'error':
      switch (state.cause) {
        case 'auth':
          return 'errorAuth';
        case 'notFound':
          return 'errorNotFound';
        case 'timeout':
          return 'errorTimeout';
        case 'network':
          return 'errorNetwork';
        default:
          return 'errorServer';
      }
    case 'offline':
      return 'offline';
    case 'locked':
      switch (state.reason) {
        case 'pro':
          return 'lockedPro';
        case 'guest':
          return 'lockedGuest';
        default:
          return 'lockedModule';
      }
    case 'denied':
      switch (state.permission) {
        case 'notifications':
          return 'deniedNotifications';
        case 'camera':
          return 'deniedCamera';
        case 'calendar':
          return 'deniedCalendar';
        default:
          return 'deniedPhotos';
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
