import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { sceneForState, type FlowKey } from '@edutu/ux-state/scenes';
import { useMotion } from '../../hooks/useMotion';
import { haptics } from '../../lib/haptics';
import { SceneRenderer } from './SceneRenderer';
import type { ScreenState } from './ScreenState';
import { hueForState, stateLayout, stateStage, stateType, useStateTokens } from './stateTokens';

/**
 * The single renderer every non-ready state goes through.
 *
 * This file is where the app's state design actually lives. Screens declare a
 * `ScreenState` and hand it here; which scene appears, in which hue, with which
 * copy and which action, is decided once — so changing how the app handles, say,
 * an expired session is a change to one switch rather than a sweep of 56 files.
 *
 * Illustration: every state renders a drawn, animated scene from
 * `@edutu/ux-state/scenes` — the same geometry the web app draws. There is no
 * tier system any more; the earlier three-tier split left roughly fifteen
 * states as a glyph in a tinted circle, which is the thing this work exists to
 * remove. Dense surfaces pass a smaller `size` instead.
 */

export interface StateViewProps {
  state: ScreenState;
  /**
   * Which product area this screen belongs to. Only affects a first-run empty —
   * that is the one state whose picture should be about *this* screen.
   */
  flow?: FlowKey;
  /** Primary recovery. Wired to the action button when the state has one. */
  onRetry?: () => void;
  /** Overrides the default action for empty/locked/denied states. */
  onAction?: () => void;
  /** Replaces the default action label. */
  actionLabel?: string;
  /** Overrides the default copy. Pass when a screen can be more specific. */
  title?: string;
  body?: string;
  /** Scene width. Drop it on dense surfaces rather than dropping the scene. */
  sceneSize?: number;
  /** Rendered instead of the default action button. */
  action?: React.ReactNode;
  /** Renders inside a flexed container. Off for states inside a scroll view. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface Presentation {
  titleKey: string;
  bodyKey: string;
  actionKey?: string;
  /** Action calls onRetry rather than onAction. */
  retryAction?: boolean;
  bodyVars?: Record<string, string>;
}

function presentationFor(state: ScreenState): Presentation {
  switch (state.kind) {
    case 'empty':
      return state.reason === 'firstRun'
        ? {
            titleKey: 'screenState.emptyFirstRun.title',
            bodyKey: 'screenState.emptyFirstRun.body',
            actionKey: 'screenState.emptyFirstRun.action',
          }
        : {
            // A filter that matched nothing is a normal outcome of searching,
            // not a dead end. Its scene is neutral-hued for the same reason:
            // dressing it as a failure makes users distrust their own query.
            titleKey: 'screenState.emptyFiltered.title',
            bodyKey: 'screenState.emptyFiltered.body',
            actionKey: 'screenState.emptyFiltered.action',
          };

    case 'offline':
      return {
        titleKey: 'screenState.offline.title',
        bodyKey: 'screenState.offline.body',
        actionKey: 'screenState.offline.action',
        retryAction: true,
      };

    case 'error': {
      const byCause: Record<typeof state.cause, Presentation> = {
        network: {
          titleKey: 'screenState.error.network.title',
          bodyKey: 'screenState.error.network.body',
          actionKey: 'actions.tryAgain',
          retryAction: true,
        },
        auth: {
          titleKey: 'screenState.error.auth.title',
          bodyKey: 'screenState.error.auth.body',
          actionKey: 'screenState.error.auth.action',
        },
        notFound: {
          titleKey: 'screenState.error.notFound.title',
          bodyKey: 'screenState.error.notFound.body',
          actionKey: 'screenState.error.notFound.action',
        },
        server: {
          titleKey: 'screenState.error.server.title',
          bodyKey: 'screenState.error.server.body',
          actionKey: 'actions.tryAgain',
          retryAction: true,
        },
        timeout: {
          titleKey: 'screenState.error.timeout.title',
          bodyKey: 'screenState.error.timeout.body',
          actionKey: 'actions.tryAgain',
          retryAction: true,
        },
      };
      return byCause[state.cause];
    }

    case 'locked': {
      const byReason: Record<typeof state.reason, Presentation> = {
        pro: {
          titleKey: 'screenState.locked.pro.title',
          bodyKey: 'screenState.locked.pro.body',
          actionKey: 'screenState.locked.pro.action',
        },
        guest: {
          titleKey: 'screenState.locked.guest.title',
          bodyKey: 'screenState.locked.guest.body',
          actionKey: 'screenState.locked.guest.action',
        },
        module: {
          titleKey: 'screenState.locked.module.title',
          bodyKey: 'screenState.locked.module.body',
        },
      };
      return byReason[state.reason];
    }

    case 'denied':
      return {
        titleKey: `screenState.denied.${state.permission}.title`,
        bodyKey: `screenState.denied.${state.permission}.body`,
        actionKey: 'screenState.denied.action',
      };

    case 'partial':
      return {
        titleKey: 'screenState.partial.title',
        bodyKey: 'screenState.partial.body',
        actionKey: 'screenState.partial.action',
        retryAction: true,
      };

    default:
      return {
        titleKey: 'screenState.loading.title',
        bodyKey: 'screenState.loading.body',
      };
  }
}

export function StateView({
  state,
  flow = 'home',
  onRetry,
  onAction,
  actionLabel,
  title,
  body,
  sceneSize = stateStage.hero,
  action,
  fill = true,
  style,
}: StateViewProps) {
  const { t } = useTranslation('common');
  const motion = useMotion();
  const hue = hueForState(state);
  const tokens = useStateTokens(hue);

  // Refreshing and ready are the screen's own business — it keeps rendering
  // content and drives its own RefreshControl.
  if (state.kind === 'refreshing' || state.kind === 'ready') return null;

  const p = presentationFor(state);
  const scene = sceneForState(state, flow);

  const displayTitle = title ?? t(p.titleKey);
  const displayBody =
    body ??
    t(p.bodyKey, state.kind === 'partial' ? { when: relativeTime(state.staleAt) } : undefined);

  const handler = p.retryAction ? onRetry : (onAction ?? onRetry);
  const label = actionLabel ?? (p.actionKey ? t(p.actionKey) : undefined);
  const showAction = Boolean(!action && handler && label);

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.base)}
      style={[fill ? styles.fill : styles.block, style]}
      accessibilityLiveRegion="polite"
    >
      <SceneRenderer scene={scene} size={sceneSize} />

      <Text
        style={[stateType.title, styles.title, { color: tokens.title }]}
        maxFontSizeMultiplier={1.4}
      >
        {displayTitle}
      </Text>

      <Text
        style={[stateType.body, styles.body, { color: tokens.body }]}
        maxFontSizeMultiplier={1.4}
      >
        {displayBody}
      </Text>

      {action}

      {showAction ? (
        <Pressable
          onPress={() => {
            haptics.medium();
            handler?.();
          }}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: tokens.hue, opacity: pressed ? 0.86 : 1 },
          ]}
        >
          <Text style={[stateType.action, { color: tokens.onHue }]} maxFontSizeMultiplier={1.2}>
            {label}
          </Text>
          <ArrowRight size={16} color={tokens.onHue} strokeWidth={2.6} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

/**
 * Coarse "how stale" label. Precision past an hour is noise to the reader, and
 * a screen that never recorded when it cached says so rather than guessing.
 */
function relativeTime(at: number | null): string {
  if (at == null) return 'recently';
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: stateLayout.gutter,
    paddingVertical: 40,
  },
  block: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: stateLayout.gutter,
    paddingVertical: 32,
  },
  title: { textAlign: 'center', marginTop: stateLayout.sceneGap },
  body: {
    textAlign: 'center',
    marginTop: stateLayout.titleGap,
    maxWidth: stateLayout.maxCopyWidth,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: stateLayout.actionGap,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 15,
  },
});
