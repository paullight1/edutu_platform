import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabase';

export type AIReportSource = 'chat' | 'cv' | 'copilot';
export type AIReportReason = 'inaccurate' | 'offensive' | 'other';

const MAX_REPORTED_CONTENT = 8000;

/**
 * In-app reporting of AI-generated content — required by Google Play's
 * AI-Generated Content policy. Returns a callback that shows a reason
 * picker and files the report through the Clerk-verified
 * `report-ai-content` edge function.
 */
export function useReportAIContent(source: AIReportSource) {
  const { getToken } = useAuth();
  const { t } = useTranslation('common');

  return useCallback(
    (content: string, context?: Record<string, unknown>) => {
      const submit = async (reason: AIReportReason) => {
        try {
          const token = await getToken();
          const { error } = await supabase.functions.invoke('report-ai-content', {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: {
              source,
              reason,
              content: content.slice(0, MAX_REPORTED_CONTENT),
              context: context ?? {},
            },
          });
          if (error) throw error;
          Alert.alert(t('aiReport.submittedTitle'), t('aiReport.submittedMessage'));
        } catch {
          Alert.alert(t('states.error'), t('aiReport.failed'));
        }
      };

      Alert.alert(t('aiReport.title'), t('aiReport.message'), [
        { text: t('aiReport.reasons.inaccurate'), onPress: () => submit('inaccurate') },
        { text: t('aiReport.reasons.offensive'), onPress: () => submit('offensive') },
        { text: t('aiReport.reasons.other'), onPress: () => submit('other') },
        { text: t('actions.cancel'), style: 'cancel' },
      ]);
    },
    [getToken, source, t],
  );
}
