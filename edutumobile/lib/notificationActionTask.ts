import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { getClerkInstance } from '@clerk/clerk-expo';
import { sendChatMessage } from '@edutu/core/src/services/chat';
import { saveOpportunity } from '@edutu/core/src/services/bookmarks';
import { recordOpportunitySignal } from '@edutu/core/src/services/opportunitySignals';
import { supabase } from './supabase';
import { getCurrentLanguage } from './i18n';
import { tokenCache } from '../cache';
import {
  ACTION_ASK,
  ACTION_DISMISS,
  ACTION_SAVE,
  HANDLES_ACTIONS_INLINE,
} from './notificationCategories';

export const NOTIFICATION_ACTION_TASK = 'edutuNotificationAction';

type ClerkSession = {
  userId: string;
  getToken: () => Promise<string | null>;
};

// A headless task boots the JS bundle with no React tree, so none of the
// hook-based auth is available and the module-level token getter that
// app/_layout.tsx installs is still null. Go to the Clerk singleton directly.
//
// This works from a locked device only because cache.ts stores the token with
// keychainAccessible AFTER_FIRST_UNLOCK — WHEN_UNLOCKED would throw here.
async function resolveSession(): Promise<ClerkSession | null> {
  try {
    const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!publishableKey) return null;

    const clerk = getClerkInstance({ publishableKey, tokenCache });
    if (!clerk.session) {
      await clerk.load();
    }

    const session = clerk.session;
    const userId = session?.user?.id;
    if (!session || !userId) return null;

    return { userId, getToken: () => session.getToken() };
  } catch {
    return null;
  }
}

// Android replaces a shown notification when a new one reuses its tag, which is
// how the question turns into the answer in place rather than stacking a second
// notification under the first.
async function present(tag: string, title: string, body: string, data?: Record<string, unknown>) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data ?? {},
      ...(HANDLES_ACTIONS_INLINE ? { autoDismiss: true } : {}),
    },
    trigger: null,
    identifier: tag,
  });
}

async function handleAsk(
  session: ClerkSession,
  question: string,
  opportunityId: string | null,
) {
  const tag = `edutuAsk${opportunityId ?? 'general'}`;

  // The round trip can take seconds; without this the user taps Ask and stares
  // at a shade that gives no sign the question landed.
  await present(tag, 'Asking Edutu…', question);

  try {
    const token = await session.getToken();
    // Ground the answer in the opportunity the notification was about —
    // otherwise "am I eligible for this?" has no referent.
    const message = opportunityId
      ? `About opportunity ${opportunityId}: ${question}`
      : question;

    const result = await sendChatMessage(supabase, {
      message,
      userId: session.userId,
      authToken: token,
      // A user's typed notification reply is free text, same as the composer —
      // it deserves the same crisis-support reply language.
      locale: getCurrentLanguage(),
    });

    const answer = result?.assistantMessage?.content?.trim();
    if (!answer) throw new Error('Empty assistant reply');

    await present(tag, 'Edutu', answer, {
      // Tapping through opens the real thread with the full answer.
      url: result.threadId ? `/chat?threadId=${result.threadId}` : '/chat',
    });
  } catch {
    // Replace the pending notification, never leave "Asking Edutu…" stuck.
    await present(tag, "Couldn't reach Edutu", 'Tap to ask in the app.', {
      url: '/chat',
    });
  }
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  NOTIFICATION_ACTION_TASK,
  async ({ data, error }) => {
    if (error || !data) return;

    // The same task fires for plain notification *receipt*; only a response
    // carries actionIdentifier. Receipts are handled elsewhere, so ignore them.
    if (!('actionIdentifier' in data)) return;

    const response = data as Notifications.NotificationResponse;
    const action = response.actionIdentifier;
    if (
      action !== ACTION_ASK &&
      action !== ACTION_SAVE &&
      action !== ACTION_DISMISS
    ) {
      return;
    }

    const content = response.notification.request.content;
    const payload = (content.data ?? {}) as Record<string, unknown>;
    const opportunityId =
      typeof payload.opportunityId === 'string' ? payload.opportunityId : null;

    const session = await resolveSession();
    if (!session) return;

    try {
      if (action === ACTION_ASK) {
        const question = response.userText?.trim();
        if (!question) return;
        await handleAsk(session, question, opportunityId);
        return;
      }

      if (!opportunityId) return;

      if (action === ACTION_SAVE) {
        await saveOpportunity(supabase, session.userId, opportunityId, session.getToken);
        await present(
          `edutuSaved${opportunityId}`,
          'Saved',
          'Added to your saved opportunities.',
          { url: `/opportunities/${opportunityId}` },
        );
        return;
      }

      // ACTION_DISMISS — advisory signal that feeds recommendations. Rides the
      // local signal queue, so it survives this task being killed before flush.
      await recordOpportunitySignal(
        { opportunityId, signalType: 'dismiss', source: 'mobile', context: 'notification' },
        session.getToken,
      );
    } catch {
      // Swallow: a background task that throws is killed by the OS and may be
      // deprioritized for future notifications. Failing quietly is the lesser
      // harm — the user can always open the app.
    }
  },
);

// Registration is separate from definition: defineTask must run at module scope
// (this file is imported by index.js), registration is an async native call.
export async function registerNotificationActionTask(): Promise<void> {
  if (!HANDLES_ACTIONS_INLINE) return;
  try {
    await Notifications.registerTaskAsync(NOTIFICATION_ACTION_TASK);
  } catch (err) {
    if (__DEV__) {
      console.warn('Failed to register notification action task', err);
    }
  }
}
