import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Bell,
  BellOff,
  Calendar,
  Camera,
  CloudOff,
  Compass,
  FileSearch,
  Image as ImageIcon,
  Lock,
  Search,
  ServerCrash,
  SlidersHorizontal,
  Sparkles,
  Star,
  TimerOff,
  UserPlus,
  type LucideIcon,
} from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useMotion } from '../../hooks/useMotion';
import { haptics } from '../../lib/haptics';
import { BrandedLoader } from '../ui/BrandedLoader';
import { IconTile } from './IconTile';
import { StateScene, type SceneArrangement } from './StateScene';
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
 * Tiering: `tier` on each entry decides whether the state earns a hero scene
 * (Tier 1, authored per moment), a composed scene (Tier 2, `StateScene`), or a
 * spot mark (Tier 3, `IconTile`). Screens can force a lower tier via the
 * `tier` prop when a state appears inside a dense layout, which is why a Tier 1
 * state never breaks an admin table.
 */

export type StateTier = 1 | 2 | 3;

export interface StateViewProps {
  state: ScreenState;
  /** Primary recovery. Wired to the action button when the state has one. */
  onRetry?: () => void;
  /** Overrides the default action for empty/locked/denied states. */
  onAction?: () => void;
  /** Replaces the default action label. */
  actionLabel?: string;
  /** Overrides the default copy. Pass when a screen can be more specific. */
  title?: string;
  body?: string;
  /**
   * Cap the visual weight. A Tier 1 state rendered at tier 3 becomes a spot
   * mark — used for dense surfaces and admin.
   */
  tier?: StateTier;
  /** Rendered instead of the default action button. */
  action?: React.ReactNode;
  /** Renders inside a flexed container. Off for states inside a scroll view. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Tier 1 hero scene for this surface. Screens supply their own so the eight
   * authored scenes stay owned by the flows they belong to rather than being
   * switch-cased here.
   */
  hero?: React.ReactNode;
}

interface Presentation {
  tier: StateTier;
  arrangement: SceneArrangement;
  glyphs: LucideIcon[];
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
            tier: 1,
            arrangement: 'orbit',
            glyphs: [Compass, Star, Sparkles, Search],
            titleKey: 'screenState.emptyFirstRun.title',
            bodyKey: 'screenState.emptyFirstRun.body',
            actionKey: 'screenState.emptyFirstRun.action',
          }
        : {
            // Deliberately Tier 2 and neutral-hued: a filter that matched
            // nothing is a normal outcome of searching, not a dead end, and
            // dressing it as one makes users distrust their own query.
            tier: 2,
            arrangement: 'scan',
            glyphs: [SlidersHorizontal],
            titleKey: 'screenState.emptyFiltered.title',
            bodyKey: 'screenState.emptyFiltered.body',
            actionKey: 'screenState.emptyFiltered.action',
          };

    case 'offline':
      return {
        tier: 1,
        arrangement: 'pulse',
        glyphs: [CloudOff],
        titleKey: 'screenState.offline.title',
        bodyKey: 'screenState.offline.body',
        actionKey: 'screenState.offline.action',
        retryAction: true,
      };

    case 'error': {
      const byCause: Record<typeof state.cause, Omit<Presentation, 'tier'>> = {
        network: {
          arrangement: 'pulse',
          glyphs: [CloudOff],
          titleKey: 'screenState.error.network.title',
          bodyKey: 'screenState.error.network.body',
          actionKey: 'actions.tryAgain',
          retryAction: true,
        },
        auth: {
          arrangement: 'pulse',
          glyphs: [Lock],
          titleKey: 'screenState.error.auth.title',
          bodyKey: 'screenState.error.auth.body',
          actionKey: 'screenState.error.auth.action',
        },
        notFound: {
          arrangement: 'scatter',
          glyphs: [FileSearch, Search],
          titleKey: 'screenState.error.notFound.title',
          bodyKey: 'screenState.error.notFound.body',
          actionKey: 'screenState.error.notFound.action',
        },
        server: {
          arrangement: 'pulse',
          glyphs: [ServerCrash],
          titleKey: 'screenState.error.server.title',
          bodyKey: 'screenState.error.server.body',
          actionKey: 'actions.tryAgain',
          retryAction: true,
        },
        timeout: {
          arrangement: 'pulse',
          glyphs: [TimerOff],
          titleKey: 'screenState.error.timeout.title',
          bodyKey: 'screenState.error.timeout.body',
          actionKey: 'actions.tryAgain',
          retryAction: true,
        },
      };
      return { tier: 1, ...byCause[state.cause] };
    }

    case 'locked': {
      const byReason = {
        pro: {
          arrangement: 'orbit' as SceneArrangement,
          glyphs: [Star, Sparkles, Compass],
          titleKey: 'screenState.locked.pro.title',
          bodyKey: 'screenState.locked.pro.body',
          actionKey: 'screenState.locked.pro.action',
        },
        guest: {
          arrangement: 'pulse' as SceneArrangement,
          glyphs: [UserPlus],
          titleKey: 'screenState.locked.guest.title',
          bodyKey: 'screenState.locked.guest.body',
          actionKey: 'screenState.locked.guest.action',
        },
        module: {
          arrangement: 'pulse' as SceneArrangement,
          glyphs: [Lock],
          titleKey: 'screenState.locked.module.title',
          bodyKey: 'screenState.locked.module.body',
        },
      };
      return { tier: state.reason === 'module' ? 2 : 1, ...byReason[state.reason] };
    }

    case 'denied': {
      const glyph: Record<typeof state.permission, LucideIcon> = {
        notifications: BellOff,
        camera: Camera,
        calendar: Calendar,
        photos: ImageIcon,
      };
      return {
        tier: 2,
        arrangement: 'pulse',
        glyphs: [glyph[state.permission]],
        titleKey: `screenState.denied.${state.permission}.title`,
        bodyKey: `screenState.denied.${state.permission}.body`,
        actionKey: 'screenState.denied.action',
      };
    }

    case 'partial':
      return {
        tier: 3,
        arrangement: 'pulse',
        glyphs: [Bell],
        titleKey: 'screenState.partial.title',
        bodyKey: 'screenState.partial.body',
        actionKey: 'screenState.partial.action',
        retryAction: true,
      };

    default:
      return {
        tier: 2,
        arrangement: 'pulse',
        glyphs: [Sparkles],
        titleKey: 'screenState.loading.title',
        bodyKey: 'screenState.loading.body',
      };
  }
}

export function StateView({
  state,
  onRetry,
  onAction,
  actionLabel,
  title,
  body,
  tier,
  action,
  fill = true,
  style,
  hero,
}: StateViewProps) {
  const { t } = useTranslation('common');
  const motion = useMotion();
  const hue = hueForState(state);
  const tokens = useStateTokens(hue);

  // Loading has no scene: a skeleton or branded spinner communicates "working"
  // faster than any illustration, and an animated scene during load competes
  // with the content that is about to replace it.
  if (state.kind === 'loading') {
    return (
      <View style={[fill ? styles.fill : styles.block, style]}>
        <BrandedLoader />
      </View>
    );
  }

  // Refreshing and ready are the screen's own business — it keeps rendering
  // content and drives its own RefreshControl.
  if (state.kind === 'refreshing' || state.kind === 'ready') return null;

  const p = presentationFor(state);
  const effectiveTier = (tier ?? p.tier) as StateTier;

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
      {effectiveTier === 1 && hero ? (
        hero
      ) : effectiveTier === 3 ? (
        <IconTile icon={p.glyphs[0]} hue={hue} />
      ) : (
        <StateScene
          arrangement={p.arrangement}
          glyphs={p.glyphs}
          hue={hue}
          size={effectiveTier === 1 ? stateStage.hero : stateStage.scene}
        />
      )}

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
