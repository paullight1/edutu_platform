import { useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { sendChatMessage } from '@edutu/core/src/services/chat';
import type { ScreenContext } from '@edutu/core/src/services/chat';
import { isAiBillingError } from '@edutu/core/src/services/productApi';
import { supabase } from '../lib/supabase';
import type { AiAction } from '../components/ai/AiActionBar';

/**
 * Binds the win-coach inline actions to the chat agent for a given screen
 * context. Returns a runner that sends the action's seed message with the
 * screen context + intent and resolves the assistant's reply text, mapping the
 * billing error to a friendly upgrade nudge.
 */
export function useAiAction(context: ScreenContext) {
  const { user } = useUser();
  const { getToken } = useAuth();

  return useCallback(
    async (action: AiAction): Promise<string> => {
      const userId = user?.id;
      if (!userId) {
        throw new Error('Sign in to use Edutu Coach.');
      }
      const authToken = await getToken();
      try {
        const result = await sendChatMessage(supabase, {
          message: action.message,
          userId,
          authToken,
          context,
          intent: action.intent,
        });
        return (
          result.assistantMessage?.content?.trim() ||
          "I couldn't generate a response just now — please try again."
        );
      } catch (err) {
        if (isAiBillingError(err)) {
          throw new Error(
            'This uses AI credits and you are out. Upgrade to Edutu Pro or top up to continue.',
          );
        }
        throw err;
      }
    },
    [context, getToken, user?.id],
  );
}
