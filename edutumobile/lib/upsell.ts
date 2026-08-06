// ─── One way to ask for the upgrade ──────────────────────────────────────────
// Every Pro upsell in the app used to be hand-rolled: some screens pushed
// /paywall raw, others built their own Alert with a "Go Pro" button, and a few
// used the shared upgrade sheet — so the same refusal looked different
// depending on where you hit it. This hook is the single entry point.
//
// It does NOT decide how the purchase is made: /paywall owns that (RevenueCat
// on iOS/Android, pay.edutu.org only on the web build). This is purely the
// "ask" layer.

import { useCallback } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { useRouter } from 'expo-router';
import i18n from './i18n';
import { useUpgradeSheet } from '../components/context/UpgradeSheetContext';

export interface ProUpsellOptions {
  /**
   * Why the user is being asked to upgrade, in their own language — usually the
   * server's billing message ("You've used your free AI actions today…"). Shown
   * verbatim in the sheet or the alert body. Without a reason there is nothing
   * to say, so we open the paywall directly instead of an empty dialog.
   */
  reason?: string;
  /** Title for the alert fallback only (the sheet has its own headline). */
  title?: string;
  /**
   * A credit shortage has two honest exits — top up, or go Pro. The sheet only
   * sells Pro, so these callers get the alert, which can offer both.
   */
  offerCredits?: boolean;
  /**
   * The surrounding UI already sells Pro (upgrade pill, profile row, lock
   * screen, limit banner) — re-explaining it in a dialog is a speed bump, so
   * go straight to the paywall.
   */
  direct?: boolean;
}

export type PromptProUpgrade = (options?: ProUpsellOptions) => void;

/**
 * Returns the one function every Pro upsell should call.
 *
 * Resolution order: direct/reason-less → paywall; credit shortage → alert with
 * both exits; otherwise the shared upgrade sheet, falling back to an alert when
 * no provider is mounted (the sheet lives in the (app) layout, so anything
 * rendered outside it still needs a path).
 */
export function usePromptProUpgrade(): PromptProUpgrade {
  const router = useRouter();
  const upgradeSheet = useUpgradeSheet();
  // Narrow reads: depending on the context object itself would make the
  // memoized callback re-create on every provider render.
  const showUpgradeSheet = upgradeSheet?.show;
  const isUpgradeFlowOpen = upgradeSheet?.isUpgradeFlowOpen ?? false;

  return useCallback(
    (options?: ProUpsellOptions) => {
      const { reason, title, offerCredits, direct } = options || {};
      const openPaywall = () => router.push('/paywall' as never);

      // Single-flow guard (UpgradeSheetContext): a monetization surface is
      // already on screen — the sheet, or a screen-local one that claimed the
      // slot. `show()` self-guards, but a raw paywall push or an Alert would
      // stack on top of it, which is exactly the bug the guard exists to stop.
      // The user is already being asked; asking twice is not an improvement.
      if (isUpgradeFlowOpen) return;

      if (direct || !reason) {
        openPaywall();
        return;
      }

      if (!offerCredits && showUpgradeSheet) {
        showUpgradeSheet(reason);
        return;
      }

      const buttons: AlertButton[] = [{ text: i18n.t('common:actions.cancel'), style: 'cancel' }];
      if (offerCredits) {
        buttons.push({
          text: i18n.t('opps:detail.alerts.getCredits', { defaultValue: 'Get Credits' }),
          onPress: () => router.push('/wallet' as never),
        });
      }
      buttons.push({
        text: i18n.t('common:adBanner.upgradePro.actionLabel', { defaultValue: 'Upgrade Now' }),
        onPress: openPaywall,
      });

      Alert.alert(
        title || i18n.t('common:adBanner.upgradePro.title', { defaultValue: 'Unlock Pro Features' }),
        reason,
        buttons,
      );
    },
    [router, showUpgradeSheet, isUpgradeFlowOpen],
  );
}
