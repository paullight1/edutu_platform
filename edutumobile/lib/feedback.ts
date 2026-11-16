import type { SuccessKind } from '../components/ui/SuccessDialog';

/**
 * The feedback façade.
 *
 * Edutu had 193 `Alert.alert` calls across 30 files. Roughly 21 were confirms,
 * 11 destructive, and ~161 were one-button notifications — mostly errors that
 * blocked the user and offered nothing to do about it. Replacing them one by
 * one with bespoke UI per screen would have produced 193 new inconsistencies.
 *
 * So every call site instead routes through this module, and the *policy* —
 * which class of feedback earns which surface — lives in one place that can be
 * revised later without touching a single screen.
 *
 * ROUTING
 *   success   → toast, non-blocking, optional Undo
 *   failure   → inline recovery where the failure happened (see InlineError);
 *               falls back to an error toast with Retry when a call site has no
 *               anchor to render into
 *   confirm   → ConfirmSheet, returns a promise so call sites read linearly
 *   milestone → SuccessDialog, celebration, reserved for real milestones
 *
 * Deliberately callable outside React: most of these fire from inside async
 * handlers and catch blocks, and forcing every one of them through a hook is
 * what pushed the codebase to `Alert.alert` in the first place. The provider
 * registers its handlers here at mount.
 */

export interface SuccessOptions {
  message: string;
  /** Offer a reversal. The toast shows an Undo affordance while it is visible. */
  undo?: () => void;
  emoji?: string;
}

export interface FailureOptions {
  message: string;
  /** What the user can do about it. Rendered as a second line where there's room. */
  hint?: string;
  retry?: () => void;
}

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface MilestoneOptions {
  kind?: SuccessKind;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export interface FeedbackHandlers {
  success: (options: SuccessOptions) => void;
  failure: (options: FailureOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  milestone: (options: MilestoneOptions) => void;
}

let handlers: FeedbackHandlers | null = null;

/** Called by FeedbackProvider on mount. Not for use by screens. */
export function registerFeedbackHandlers(next: FeedbackHandlers | null): void {
  handlers = next;
}

/**
 * Feedback raised before the provider mounts (or in a test without one) is
 * dropped rather than thrown. A missing toast must never take down a screen,
 * and a confirm with nowhere to render resolves false — the safe answer, since
 * every destructive path in the app treats false as "do nothing".
 */
function warnUnavailable(surface: string): void {
  if (__DEV__) {
    console.warn(
      `[feedback] ${surface}() called with no FeedbackProvider mounted — dropped. ` +
        'Wrap the tree in <FeedbackProvider> (app/_layout.tsx).',
    );
  }
}

export const notify = {
  /** Routine success. Non-blocking; never interrupts what the user is doing. */
  success(options: SuccessOptions): void {
    if (!handlers) return warnUnavailable('success');
    handlers.success(options);
  },

  /**
   * An operation failed. Prefer rendering `<InlineError>` at the point of
   * failure where the screen has somewhere to put it; use this when it does
   * not (a background save, a share sheet, a fire-and-forget sync).
   */
  failure(options: FailureOptions): void {
    if (!handlers) return warnUnavailable('failure');
    handlers.failure(options);
  },

  /**
   * Ask before doing something consequential. Awaitable, so call sites read as
   * a straight line instead of the nested-callback shape `Alert.alert` forced:
   *
   *   if (!(await notify.confirm({ ... }))) return;
   *   await deleteDocument();
   */
  confirm(options: ConfirmOptions): Promise<boolean> {
    if (!handlers) {
      warnUnavailable('confirm');
      return Promise.resolve(false);
    }
    return handlers.confirm(options);
  },

  /**
   * A genuine milestone: roadmap created, application submitted, payment
   * succeeded, Pro unlocked, goal completed, CV exported.
   *
   * Nothing else. A celebration that fires on every save stops meaning
   * anything, and then there is no surface left for the moments that matter.
   */
  milestone(options: MilestoneOptions): void {
    if (!handlers) return warnUnavailable('milestone');
    handlers.milestone(options);
  },
};
