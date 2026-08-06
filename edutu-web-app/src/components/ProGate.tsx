import React, { useCallback, useMemo, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { usePaywall } from '../hooks/usePaywall';

/**
 * Hook for hard-lock gating of a Pro-only action.
 *
 * `requirePro()` returns true when the user is Pro (let the action proceed);
 * otherwise it opens the shared paywall and returns false so the caller can
 * bail out early.
 *
 * While billing status is still loading we do NOT know whether the user is
 * Pro, so we stay optimistic: `locked` is false (don't flash a lock at a
 * paying user) and `requirePro()` allows the action rather than paywalling
 * a subscriber mid-fetch. `locked` is true only once we positively know the
 * user is non-Pro.
 */
export function useProFeature(feature: string): {
  isPro: boolean;
  isLoading: boolean;
  /** True only when billing has loaded AND the user is definitively non-Pro. */
  locked: boolean;
  requirePro: () => boolean;
} {
  const { isPro, billingLoading, openPaywall } = usePaywall();

  const requirePro = useCallback((): boolean => {
    // Optimistic while billing is unknown — never paywall a possible subscriber.
    if (isPro || billingLoading) return true;
    openPaywall({
      feature,
      reason: `${feature} is an Edutu Pro feature. Upgrade to unlock it.`,
    });
    return false;
  }, [isPro, billingLoading, openPaywall, feature]);

  return useMemo(
    () => ({ isPro, isLoading: billingLoading, locked: !isPro && !billingLoading, requirePro }),
    [isPro, billingLoading, requirePro],
  );
}

export interface ProGateProps {
  /** The feature being gated (used for paywall context + aria labels). */
  feature: string;
  /** Content shown unlocked to Pro users, or dimmed under the lock otherwise. */
  children: ReactNode;
  /** Extra classes applied to the wrapper. */
  className?: string;
  /** Small badge text on the lock affordance. Defaults to "Pro". */
  label?: string;
}

/**
 * Wraps Pro-only UI. Pro users see `children` untouched. Everyone else sees the
 * same content dimmed and non-interactive behind a lock overlay; clicking the
 * lock opens the shared upgrade modal.
 */
export const ProGate: React.FC<ProGateProps> = ({
  feature,
  children,
  className,
  label = 'Pro',
}) => {
  const { isPro, billingLoading, openPaywall } = usePaywall();

  // Show children unlocked to Pro users, and also while billing is still
  // loading — we don't lock content until we positively know the user isn't Pro.
  if (isPro || billingLoading) {
    return <>{children}</>;
  }

  const wrapperClassName = ['relative', className].filter(Boolean).join(' ');

  return (
    <div className={wrapperClassName}>
      <div aria-hidden="true" className="pointer-events-none select-none opacity-40 blur-[1px]">
        {children}
      </div>
      <button
        type="button"
        onClick={() => openPaywall({ feature })}
        aria-label={`Unlock ${feature} with Edutu Pro`}
        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-subtle bg-surface-layer/60 backdrop-blur-[1px] transition-colors hover:border-brand hover:bg-surface-elevated/70"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-brand shadow-sm">
          <Lock className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="rounded-full bg-brand px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-white">
          {label}
        </span>
      </button>
    </div>
  );
};

export default ProGate;
