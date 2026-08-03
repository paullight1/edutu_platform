import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@clerk/clerk-expo';
import { Inbox, Lock } from 'lucide-react-native';
import {
  decideJoinRequest,
  fetchGroup,
  fetchGroupForm,
  fetchJoinRequests,
  isCommunityApiError,
  type CommunityGroup,
  type CommunityGroupMember,
  type GroupQuestion,
  type JoinRequest,
} from '@edutu/core/src/services/communities';
import { ScreenHeader } from '../../../../components/ui/ScreenHeader';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { AnimatedPressable } from '../../../../components/ui/AnimatedPressable';
import { useTheme } from '../../../../components/context/ThemeContext';

/**
 * The join queue: everybody waiting on a decision, and WHAT THEY WROTE.
 *
 * THE ANSWERS ARE THE SCREEN. A group with screening questions asked them for a
 * reason; an approve/reject pair with the answers hidden is a coin flip with
 * extra steps, and the owner would either admit everybody or nobody. So each
 * row renders every question paired with that applicant's reply, including the
 * ones they left blank — an unanswered required question is information too.
 *
 * OWNER **OR** MOD. The backend authorizes both on `GET /requests`, and this is
 * the only queue a mod exists to work: gating it on ownership alone is what
 * made the mod role cosmetic in the first review.
 *
 * DECLINING IS NOT A BAN. The backend upserts a membership row, so a declined
 * applicant can apply again — the confirmation says so rather than implying a
 * door closed for good. Approving is not confirmed: it is the constructive
 * action, it is undoable by removing the member, and a confirm on the happy
 * path just teaches the owner to tap through confirmations.
 */

interface RequestRow {
  request: JoinRequest;
  /** Answers already paired to the question that produced them. */
  answers: { id: string; label: string; value: string }[];
}

export default function JoinRequestsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { t } = useTranslation(['community', 'common']);
  const { colors, reducedMotion } = useTheme();

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '');

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [membership, setMembership] = useState<CommunityGroupMember | null>(null);
  const [questions, setQuestions] = useState<GroupQuestion[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** The request currently mid-decision, and which way. */
  const [deciding, setDeciding] = useState<{ id: string; decision: 'approved' | 'rejected' } | null>(
    null,
  );
  /** The request whose decline is awaiting confirmation. */
  const [confirmingDecline, setConfirmingDecline] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const detail = await fetchGroup(groupId, getToken);
      setGroup(detail.group);
      setMembership(detail.membership);

      const role = detail.membership?.role;
      // A member who wandered in by URL gets the refusal, not an empty queue
      // that reads like "nobody wants to join your group".
      if (role !== 'owner' && role !== 'mod') return;

      // The form is fetched for its LABELS. Answers carry a question id and
      // nothing else, so without it every reply renders as an opaque uuid.
      const [form, pending] = await Promise.all([
        fetchGroupForm(groupId, getToken).catch(() => ({ questions: [] as GroupQuestion[] })),
        fetchJoinRequests(groupId, getToken),
      ]);
      setQuestions(form.questions);
      setRequests(pending);
    } catch (caught) {
      setError(isCommunityApiError(caught) ? caught.message : t('common:errors.generic'));
    }
  }, [groupId, getToken, t]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const role = membership?.role;
  const canReview = role === 'owner' || role === 'mod';

  /**
   * Pair every question with its answer.
   *
   * Question order wins over answer order, and a question with no answer still
   * renders: "they skipped it" is the most useful thing an owner can learn from
   * a form. Answers whose question has since been deleted are appended rather
   * than dropped, because they were still written by this applicant.
   */
  const rows: RequestRow[] = useMemo(
    () =>
      requests.map((request) => {
        const byId = new Map(request.answers.map((answer) => [answer.id, answer.value]));
        const paired = questions.map((question) => ({
          id: question.id,
          label: question.label,
          value: (byId.get(question.id) ?? '').trim(),
        }));
        const known = new Set(questions.map((question) => question.id));
        const orphans = request.answers
          .filter((answer) => !known.has(answer.id) && (answer.value ?? '').trim())
          .map((answer) => ({ id: answer.id, label: '', value: answer.value.trim() }));
        return { request, answers: [...paired, ...orphans] };
      }),
    [requests, questions],
  );

  const decide = useCallback(
    async (request: JoinRequest, decision: 'approved' | 'rejected') => {
      if (deciding) return;
      setRowError(null);
      setDeciding({ id: request.id, decision });
      try {
        await decideJoinRequest(groupId, request.id, decision, getToken);
        // Decided is decided: the row leaves the queue either way, and the
        // approved applicant is now an active member of the group.
        setRequests((previous) => previous.filter((row) => row.id !== request.id));
        setConfirmingDecline(null);
      } catch (caught) {
        setRowError({
          id: request.id,
          message: isCommunityApiError(caught) ? caught.message : t('common:errors.generic'),
        });
      } finally {
        setDeciding(null);
      }
    },
    [deciding, groupId, getToken, t],
  );

  const openGroup = useCallback(() => {
    // `as never` matches the rest of this feature: expo-router's typed-routes
    // map does not know a dynamic segment built at runtime.
    router.push(`/discussions/${groupId}` as never);
  }, [router, groupId]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title={t('community:screens.requestsTitle')} showBack />

      {loading ? (
        <View testID="requests-skeleton" style={styles.skeletonWrap}>
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} height={132} borderRadius={16} />
          ))}
        </View>
      ) : error ? (
        <View style={styles.stateWrap}>
          <View
            testID="requests-error"
            style={[
              styles.errorBox,
              { borderColor: colors.error, backgroundColor: `${colors.error}12` },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            <AnimatedPressable
              testID="requests-error-retry"
              accessibilityRole="button"
              accessibilityLabel={t('common:actions.retry')}
              onPress={() => void load()}
              style={[styles.retryButton, { borderColor: colors.error }]}
            >
              <Text style={[styles.retryLabel, { color: colors.error }]}>
                {t('common:actions.retry')}
              </Text>
            </AnimatedPressable>
          </View>
        </View>
      ) : !canReview ? (
        <View style={styles.stateWrap}>
          <View testID="requests-forbidden" style={styles.empty}>
            <Lock size={32} color={colors.textSecondary} style={styles.emptyIcon} />
            <Text style={[styles.emptyLine, { color: colors.textSecondary }]}>
              {t('community:requests.notAllowed')}
            </Text>
            <EmptyCta label={t('community:actions.viewGroup')} onPress={openGroup} />
          </View>
        </View>
      ) : rows.length === 0 ? (
        // One icon, one line, one way out (DESIGN.md §4). The line teaches what
        // the screen is for, so an owner who never had a request still learns
        // where they will land.
        <View style={styles.stateWrap}>
          <View testID="requests-empty" style={styles.empty}>
            <Inbox size={32} color={colors.textSecondary} style={styles.emptyIcon} />
            <Text style={[styles.emptyLine, { color: colors.textSecondary }]}>
              {t('community:empty.noPendingRequests')}
            </Text>
            <EmptyCta label={t('community:actions.viewGroup')} onPress={openGroup} />
          </View>
        </View>
      ) : (
        <ScrollView
          testID="requests-list"
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('community:requests.subtitle')}
          </Text>
          {!!group && (
            <Text style={[styles.groupName, { color: colors.foreground }]} numberOfLines={1}>
              {group.coverEmoji} {group.name}
            </Text>
          )}

          {rows.map((row, index) => (
            <Animated.View
              key={row.request.id}
              testID={`request-row-${row.request.id}`}
              entering={reducedMotion ? undefined : FadeInDown.delay(index * 40).duration(200)}
              style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <Text
                testID={`request-applicant-${row.request.id}`}
                style={[styles.applicant, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {t('community:requests.applicant')} · {shortId(row.request.userId)}
              </Text>

              {row.answers.length === 0 ? (
                <Text style={[styles.answerValue, { color: colors.textSecondary }]}>
                  {t('community:requests.noAnswers')}
                </Text>
              ) : (
                row.answers.map((answer) => (
                  <View key={answer.id} style={styles.answer}>
                    {!!answer.label && (
                      <Text
                        testID={`request-question-${row.request.id}-${answer.id}`}
                        style={[styles.answerLabel, { color: colors.textSecondary }]}
                      >
                        {answer.label}
                      </Text>
                    )}
                    <Text
                      testID={`request-answer-${row.request.id}-${answer.id}`}
                      style={[
                        styles.answerValue,
                        { color: answer.value ? colors.foreground : colors.textSecondary },
                      ]}
                    >
                      {answer.value || t('community:requests.noAnswer')}
                    </Text>
                  </View>
                ))
              )}

              {confirmingDecline === row.request.id ? (
                <View testID={`request-decline-confirm-${row.request.id}`} style={styles.confirm}>
                  <Text style={[styles.confirmTitle, { color: colors.foreground }]}>
                    {t('community:requests.declineConfirmTitle')}
                  </Text>
                  <Text style={[styles.confirmBody, { color: colors.textSecondary }]}>
                    {t('community:requests.declineConfirmBody')}
                  </Text>
                  <View style={styles.actions}>
                    <DecisionButton
                      testID={`request-decline-cancel-${row.request.id}`}
                      label={t('common:actions.cancel')}
                      tone="neutral"
                      busy={false}
                      disabled={deciding !== null}
                      onPress={() => setConfirmingDecline(null)}
                    />
                    <DecisionButton
                      testID={`request-decline-confirm-accept-${row.request.id}`}
                      label={t('community:actions.decline')}
                      tone="destructive"
                      busy={deciding?.id === row.request.id && deciding.decision === 'rejected'}
                      disabled={deciding !== null}
                      onPress={() => void decide(row.request, 'rejected')}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.actions}>
                  <DecisionButton
                    testID={`request-decline-${row.request.id}`}
                    label={t('community:actions.decline')}
                    tone="destructive"
                    busy={false}
                    disabled={deciding !== null}
                    onPress={() => setConfirmingDecline(row.request.id)}
                  />
                  <DecisionButton
                    testID={`request-approve-${row.request.id}`}
                    label={t('community:actions.approve')}
                    tone="primary"
                    busy={deciding?.id === row.request.id && deciding.decision === 'approved'}
                    disabled={deciding !== null}
                    onPress={() => void decide(row.request, 'approved')}
                  />
                </View>
              )}

              {rowError?.id === row.request.id && (
                <Text
                  testID={`request-error-${row.request.id}`}
                  style={[styles.rowError, { color: colors.error }]}
                >
                  {rowError.message}
                </Text>
              )}
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * Clerk subjects are long and identical for their first eight characters
 * (`user_2ab…`), so the tail is what tells two applicants apart until this
 * feature carries display names.
 */
function shortId(userId: string): string {
  return userId.length > 10 ? `…${userId.slice(-6)}` : userId;
}

function DecisionButton({
  testID,
  label,
  tone,
  busy,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  tone: 'primary' | 'destructive' | 'neutral';
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const border =
    tone === 'destructive' ? colors.error : tone === 'primary' ? colors.accent : colors.border;
  const labelColor =
    tone === 'primary' ? '#FFFFFF' : tone === 'destructive' ? colors.error : colors.foreground;

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      hapticFeedback={tone === 'destructive' ? 'heavy' : 'medium'}
      scaleTo={0.97}
      onPress={onPress}
      style={[
        styles.decision,
        {
          borderColor: border,
          backgroundColor: tone === 'primary' ? colors.accent : 'transparent',
          opacity: disabled && !busy ? 0.5 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator testID={`${testID}-busy`} size="small" color={labelColor} />
      ) : (
        <Text style={[styles.decisionLabel, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}

function EmptyCta({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      testID="requests-empty-cta"
      accessibilityRole="button"
      accessibilityLabel={label}
      hapticFeedback="selection"
      scaleTo={0.97}
      onPress={onPress}
      style={[styles.emptyCta, { borderColor: colors.border }]}
    >
      <Text style={[styles.emptyCtaLabel, { color: colors.foreground }]} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  skeletonWrap: {
    padding: 16,
    gap: 12,
  },
  stateWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  groupName: {
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 14,
    gap: 10,
  },
  applicant: {
    fontSize: 14,
    fontWeight: '700',
  },
  answer: {
    gap: 3,
  },
  answerLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  answerValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  decision: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  decisionLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirm: {
    gap: 8,
  },
  confirmTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  rowError: {
    fontSize: 12,
    lineHeight: 18,
  },
  empty: {
    alignItems: 'center',
    gap: 12,
  },
  emptyIcon: {
    opacity: 0.5,
  },
  emptyLine: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyCta: {
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  emptyCtaLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 14,
    gap: 10,
    alignItems: 'flex-start',
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  retryLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
