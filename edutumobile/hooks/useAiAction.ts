import { useCallback, useRef } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { sendChatMessage } from '@edutu/core/src/services/chat';
import type { ScreenContext } from '@edutu/core/src/services/chat';
import { isAiBillingError } from '@edutu/core/src/services/productApi';
import { supabase } from '../lib/supabase';
import type { AiAction, AiActionResult } from '../components/ai/AiActionBar';
import { AiActionError } from '../components/ai/AiActionBar';

/**
 * Binds the win-coach inline actions to the chat agent for a given screen
 * context. Returns a runner that sends the action's seed message with the
 * screen context + intent and resolves the assistant's reply, mapping the
 * billing error to a typed upgrade nudge.
 *
 * Every action on a screen reuses the thread the first one created, so a
 * session's exchanges land in one retrievable conversation instead of N
 * orphan threads the user can never find again.
 */
export function useAiAction(context: ScreenContext) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { t, i18n } = useTranslation('chat');
  const threadIdRef = useRef<string | null>(null);

  return useCallback(
    async (action: AiAction): Promise<AiActionResult> => {
      const userId = user?.id;
      if (!userId) {
        throw new AiActionError(t('winCoach.signInRequired'));
      }
      const authToken = await getToken();
      try {
        const result = await sendChatMessage(supabase, {
          message: action.message,
          userId,
          authToken,
          context,
          intent: action.intent,
          threadId: threadIdRef.current,
          locale: i18n.language?.split('-')[0] || 'en',
        });
        if (result.threadId) {
          threadIdRef.current = result.threadId;
        }
        return {
          text:
            result.assistantMessage?.content?.trim() ||
            t('winCoach.noReplyFallback'),
          threadId: threadIdRef.current,
        };
      } catch (err) {
        if (isAiBillingError(err)) {
          throw new AiActionError(t('winCoach.billingLimitReached'), 'billing');
        }
        throw err;
      }
    },
    [context, getToken, i18n, t, user?.id],
  );
}
