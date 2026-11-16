import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { haptics } from '../../lib/haptics';
import {
  registerFeedbackHandlers,
  type ConfirmOptions,
  type FailureOptions,
  type MilestoneOptions,
  type SuccessOptions,
} from '../../lib/feedback';
import { useToast } from '../context/ToastContext';
import { SuccessDialog } from '../ui/SuccessDialog';
import { ConfirmSheet } from './ConfirmSheet';

/**
 * Hosts the surfaces `notify()` routes to, and registers the handlers that let
 * it be called from anywhere — including plain async functions and catch
 * blocks, which is where most feedback in this app actually originates.
 *
 * Mount inside ToastProvider and ThemeProvider, above the router.
 */

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('common');
  const toast = useToast();

  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [milestone, setMilestone] = useState<MilestoneOptions | null>(null);

  // A confirm that unmounts with its promise unsettled would hang any `await`
  // upstream of it, so the resolver is tracked separately and always settled.
  const pendingResolve = useRef<((value: boolean) => void) | null>(null);

  const handleSuccess = useCallback(
    (options: SuccessOptions) => {
      haptics.success();
      toast.show({
        message: options.message,
        variant: 'success',
        emoji: options.emoji,
        action: options.undo
          ? { label: t('actions.undo', 'Undo'), onPress: options.undo }
          : undefined,
      });
    },
    [toast, t],
  );

  const handleFailure = useCallback(
    (options: FailureOptions) => {
      haptics.error();
      toast.show({
        message: options.message,
        variant: 'error',
        // A failure toast without a way forward is just the OS alert again with
        // a shorter lifespan, so the retry is carried through when there is one.
        action: options.retry
          ? { label: t('actions.tryAgain'), onPress: options.retry }
          : undefined,
        // Failures hold longer than successes: the user has to read and decide.
        durationMs: options.retry ? 6000 : 4000,
      });
    },
    [toast, t],
  );

  const handleConfirm = useCallback((options: ConfirmOptions) => {
    // Only one confirm can be on screen. A second request while one is open
    // resolves the first as cancelled rather than stacking sheets.
    pendingResolve.current?.(false);

    return new Promise<boolean>((resolve) => {
      pendingResolve.current = resolve;
      setConfirm({ ...options, resolve });
    });
  }, []);

  const handleMilestone = useCallback((options: MilestoneOptions) => {
    haptics.success();
    setMilestone(options);
  }, []);

  const settle = useCallback((value: boolean) => {
    pendingResolve.current?.(value);
    pendingResolve.current = null;
    setConfirm(null);
  }, []);

  const handlers = useMemo(
    () => ({
      success: handleSuccess,
      failure: handleFailure,
      confirm: handleConfirm,
      milestone: handleMilestone,
    }),
    [handleSuccess, handleFailure, handleConfirm, handleMilestone],
  );

  useEffect(() => {
    registerFeedbackHandlers(handlers);
    return () => {
      registerFeedbackHandlers(null);
      // Never leave an awaited confirm dangling across an unmount.
      pendingResolve.current?.(false);
      pendingResolve.current = null;
    };
  }, [handlers]);

  return (
    <>
      {children}

      <ConfirmSheet
        visible={confirm !== null}
        title={confirm?.title ?? ''}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel ?? t('actions.continue')}
        cancelLabel={confirm?.cancelLabel ?? t('actions.cancel')}
        destructive={confirm?.destructive}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />

      <SuccessDialog
        visible={milestone !== null}
        kind={milestone?.kind ?? 'celebrate'}
        title={milestone?.title ?? ''}
        message={milestone?.message}
        actionLabel={milestone?.actionLabel ?? t('actions.done')}
        onAction={() => {
          const action = milestone?.onAction;
          setMilestone(null);
          action?.();
        }}
        secondaryLabel={milestone?.secondaryLabel}
        onSecondary={
          milestone?.onSecondary
            ? () => {
                const action = milestone.onSecondary;
                setMilestone(null);
                action?.();
              }
            : undefined
        }
      />
    </>
  );
}
