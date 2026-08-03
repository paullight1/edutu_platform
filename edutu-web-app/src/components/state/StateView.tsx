import type { ScreenState } from '@edutu/ux-state/state';
import { sceneForState, type FlowKey } from '@edutu/ux-state/scenes';
import Button from '@/components/ui/Button';
import { SceneRenderer } from './SceneRenderer';

/**
 * The single renderer every non-ready state on the web app goes through.
 *
 * Before this existed, web could not tell a failed fetch from an empty result:
 * both rendered `ui/EmptyState` with a glyph and the same shrug of a sentence,
 * and states like offline, locked and permission-denied had no representation
 * at all. Which scene, which words and which action a state gets is now decided
 * once, here, and matches mobile because both read the same `ScreenState`.
 */

interface Copy {
    title: string;
    body: string;
    action?: string;
    /** The action calls `onRetry` rather than `onAction`. */
    retry?: boolean;
}

const EMPTY_COPY: Record<FlowKey, Copy> = {
    home: {
        title: 'Your feed is warming up',
        body: 'Tell us what you are aiming for and matches start landing here.',
        action: 'Set your goals',
    },
    discovery: {
        title: 'Nothing matched yet',
        body: 'New opportunities are added daily. Broaden what you are open to and more will show up.',
        action: 'Adjust preferences',
    },
    saved: {
        title: 'Nothing saved yet',
        body: 'Tap the bookmark on anything worth a second look and it waits for you here.',
        action: 'Browse opportunities',
    },
    applied: {
        title: 'No applications yet',
        body: 'Once you apply, track every stage and deadline from this page.',
        action: 'Find something to apply to',
    },
    goals: {
        title: 'No goals yet',
        body: 'Pick a goal and Edutu builds the roadmap that gets you there.',
        action: 'Create a goal',
    },
    coach: {
        title: 'Nothing here yet',
        body: 'Your coach picks up where you left off once you have started something.',
        action: 'Get started',
    },
    wallet: {
        title: 'No transactions yet',
        body: 'Credits you earn and spend will show up here.',
        action: 'Learn about credits',
    },
    community: {
        title: 'No one here yet',
        body: 'Join a group to swap notes with people chasing the same things.',
        action: 'Find a group',
    },
};

function copyFor(state: ScreenState, flow: FlowKey): Copy {
    switch (state.kind) {
        case 'loading':
            return { title: 'Loading', body: 'One moment.' };
        case 'refreshing':
            return { title: 'Refreshing', body: 'Getting the latest.' };
        case 'partial':
            return {
                title: 'Showing a saved copy',
                body: 'We could not refresh just now, so this may be out of date.',
                action: 'Try again',
                retry: true,
            };
        case 'empty':
            // A filter that matched nothing is a normal outcome of searching,
            // not a dead end — so it gets its own words and a neutral scene
            // rather than borrowing the failure language.
            return state.reason === 'filtered'
                ? {
                      title: 'No results for these filters',
                      body: 'Nothing matched. Try removing a filter or widening your search.',
                      action: 'Clear filters',
                  }
                : EMPTY_COPY[flow];
        case 'error':
            switch (state.cause) {
                case 'auth':
                    return {
                        title: 'Please sign in again',
                        body: 'Your session expired. Signing in again picks up exactly where you were.',
                        action: 'Sign in',
                    };
                case 'notFound':
                    return {
                        title: 'This is not here anymore',
                        body: 'It may have closed or been removed. Everything else is still available.',
                        action: 'Go back',
                    };
                case 'timeout':
                    return {
                        title: 'That took too long',
                        body: 'The request timed out before it finished. It usually works on a second try.',
                        action: 'Try again',
                        retry: true,
                    };
                case 'network':
                    return {
                        title: 'Could not reach Edutu',
                        body: 'Check your connection and try again.',
                        action: 'Try again',
                        retry: true,
                    };
                default:
                    return {
                        title: 'Something went wrong on our side',
                        body: 'This one is on us, not you. Trying again usually clears it.',
                        action: 'Try again',
                        retry: true,
                    };
            }
        case 'offline':
            return {
                title: 'You are offline',
                body: 'Anything already downloaded still works. New results need a connection.',
                action: 'Try again',
                retry: true,
            };
        case 'locked':
            switch (state.reason) {
                case 'pro':
                    return {
                        title: 'This is a Pro feature',
                        body: 'Upgrade to unlock it, along with everything else in Pro.',
                        action: 'See Pro',
                    };
                case 'guest':
                    return {
                        title: 'Create an account to continue',
                        body: 'Saving, applying and tracking need an account. It takes under a minute.',
                        action: 'Sign up',
                    };
                default:
                    return {
                        title: 'Temporarily unavailable',
                        body: 'We have paused this section briefly. It will be back shortly.',
                    };
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
    /** Scene width in px. Shrink it on dense surfaces rather than dropping it. */
    sceneSize?: number;
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
    sceneSize = 220,
    className = '',
}: StateViewProps) {
    // Ready screens render their own content; refreshing keeps it on screen and
    // must never blank out what the user is reading.
    if (state.kind === 'ready' || state.kind === 'refreshing') return null;

    const copy = copyFor(state, flow);
    const scene = sceneForState(state, flow);

    const handler = copy.retry ? onRetry : (onAction ?? onRetry);
    const label = actionLabel ?? copy.action;
    const showAction = Boolean(label && handler);

    return (
        <div
            className={`flex min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center ${className}`}
            role="status"
            aria-live="polite"
        >
            <SceneRenderer scene={scene} size={sceneSize} className="mb-6 max-w-full" />

            <h3 className="text-lg font-semibold text-text-primary">{title ?? copy.title}</h3>

            <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">
                {body ?? copy.body}
            </p>

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
