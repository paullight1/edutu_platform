import { SearchField } from '../../../components/ui/SearchField';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowRight, Pause, Play, RefreshCw } from 'lucide-react-native';
import { getDocumentAsync } from 'expo-document-picker';
import { addNotificationReceivedListener } from 'expo-notifications';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { isAiBillingError, ProductApiRequestError, requestProductApi } from '@edutu/core/src/services/productApi';
import type { UploadRecord } from '@edutu/core/src/services/uploads';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { useTheme } from '../../../components/context/ThemeContext';
import { clearAutoApplyAnswer, readAutoApplyAnswer, writeAutoApplyAnswer } from '../../../lib/autoApplyAnswerDraft';
import { syncAutoApplyActivity } from '../../../lib/autoApplyActivity';
import { autoApplyNotificationAttemptId } from '../../../lib/autoApplyNotification';
import { appendPickedDocument } from '../../../lib/appendPickedDocument';
import { autoApplyStatus, type AutoApplyProgress } from '../../../components/opportunity/autoApplyStatus';

type SelectionMode = 'multiple_required' | 'multiple_optional';

type ReviewField = { label: string; generatedByAi?: true; providerLabel?: string; providerPage?: { number: number; total: number }; value: string; maxLength?: number; optional?: boolean; choices?: string[]; selectionMode?: SelectionMode; validationHint?: string; attachment?: { type: 'pdf'; sourceName?: string; uploadId?: string } };
type PreviousAnswers = { version: number; answers: { label: string; value: string }[] };
type Attempt = AutoApplyProgress & { waitingForProvider?: boolean; allowanceRestored?: boolean; hasPreviousAnswers?: boolean; question?: string; answerMaxLength?: number; answerHint?: string; savePhoneOffered?: boolean; statementRequested?: boolean; statementRetryAvailable?: boolean; choices?: string[]; selectionMode?: SelectionMode; attachmentRequired?: boolean; attachmentBytesRemaining?: number; canResetDocuments?: boolean; cvRequested?: boolean; handoffRequired?: boolean; handoffUrl?: string; exactHandoff?: boolean; opportunityId?: string; canPreviewCv?: boolean; canSubmit?: boolean; submissionUnavailable?: boolean; canCancel?: boolean; canPause?: boolean; canResume?: boolean; canCheckReceipt?: boolean; canStartManualSubmission?: boolean; reviewingOnProvider?: boolean; canRecordManualSubmission?: boolean; manuallySubmitted?: boolean; canRetry?: boolean; receipt?: string; destinationHost?: string; failureReason?: string; listingClosed?: boolean; applicantOnly?: boolean; review?: ReviewField[] };
type SavedCv = { id: string; name: string };
type AttemptControl = 'cancel' | 'retry' | 'reset_documents' | 'pause' | 'resume';
type ProviderVisit = { version: number; departed: boolean };
const progressingStates = new Set<Attempt['state']>(['queued', 'running', 'submitting']);
const pdfBudget = 10 * 1024 * 1024;
const overBudgetMessage = 'This PDF exceeds the remaining space. Choose a smaller PDF or start document selection again.';
const applicationSteps = ['Prepare', 'Review', 'Submit'] as const;

function applicationStep(state: Attempt['state']) {
  switch (state) {
    case 'needs_review': return 1;
    case 'submitting':
    case 'unconfirmed':
    case 'submitted': return 2;
    case 'failed':
    case 'cancelled': return null;
    default: return 0;
  }
}

function AttemptProgress({ attempt, status, stale, busy, onControl }: {
  attempt: Attempt;
  status: string;
  stale: boolean;
  busy: boolean;
  onControl: (action: 'pause' | 'resume') => void;
}) {
  const { colors } = useTheme();
  const step = attempt.reviewingOnProvider ? 2 : applicationStep(attempt.state);
  const complete = attempt.state === 'submitted' && !attempt.manuallySubmitted;
  const action = attempt.canResume ? 'resume' : attempt.canPause ? 'pause' : null;
  const ToggleIcon = action === 'resume' ? Play : Pause;
  const actionLabel = action === 'resume' ? 'Resume Auto Apply' : 'Pause Auto Apply';
  const waitingForInput = attempt.state === 'needs_input' && !attempt.listingClosed && !attempt.applicantOnly;
  const hint = stale ? 'Last known status. Refresh to check for updates.'
    : attempt.waitingForProvider && (attempt.state === 'queued' || attempt.state === 'running')
      ? 'Edutu will try again automatically. Your progress is saved, and you can leave this screen.'
      : waitingForInput ? 'Edutu is waiting for your input before continuing.'
        : attempt.state === 'paused' && attempt.canResume ? 'Your progress is saved. Resume whenever you’re ready.' : null;

  return <View style={[styles.progressPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={styles.progressHeading}>
      <View style={styles.progressCopy}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.status, { color: colors.foreground }]}>{status}</Text>
      </View>
      {action && <AnimatedPressable accessibilityRole="button" accessibilityLabel={actionLabel}
        disabled={busy || stale} focusColor={colors.accent} onPress={() => onControl(action)}
        style={[styles.progressControl, { borderColor: colors.border,
          backgroundColor: action === 'resume' ? colors.foreground : colors.background, opacity: busy || stale ? 0.55 : 1 }]}>
        <ToggleIcon accessible={false} size={16} color={action === 'resume' ? colors.background : colors.foreground} />
        <Text style={[styles.controlText, { color: action === 'resume' ? colors.background : colors.foreground }]}>{action === 'resume' ? 'Resume' : 'Pause'}</Text>
      </AnimatedPressable>}
    </View>
    {step !== null && <View accessible accessibilityRole="progressbar" accessibilityLabel="Application progress"
      accessibilityValue={{ text: complete
        ? 'All steps complete' : `Step ${step + 1} of ${applicationSteps.length}, ${applicationSteps[step]}` }}
      style={styles.progressSteps}>
      <Text style={[styles.stepCount, { color: colors.textSecondary }]}>{complete ? 'All steps complete' : `Step ${step + 1} of ${applicationSteps.length}`}</Text>
      <View style={styles.rail}>
        {applicationSteps.map((label, index) => {
          const completed = complete || index < step;
          const current = !complete && index === step;
          return <View key={label} style={styles.railStep}>
            <View style={[styles.railSegment, {
              backgroundColor: completed ? colors.accent : current ? colors.background : colors.border,
              borderColor: completed || current ? colors.accent : colors.border,
            }]} />
            <Text style={[styles.railLabel, { color: current ? colors.foreground : colors.textSecondary,
              fontWeight: current ? '500' : '400' }]}>{label}</Text>
          </View>;
        })}
      </View>
    </View>}
    {!!hint && <Text accessibilityLiveRegion="polite" style={[styles.statusHint, { color: colors.textSecondary }]}>{hint}</Text>}
  </View>;
}

function exceedsProviderLimit(field: ReviewField) {
  return field.maxLength !== undefined && field.value.length > field.maxLength;
}

function selectedLabels(value: string): string[] {
  if (!value) return [];
  try {
    const labels: unknown = JSON.parse(value);
    return Array.isArray(labels) ? labels.filter((label): label is string => typeof label === 'string') : [];
  } catch {
    return [];
  }
}

function reviewFieldValue(field: ReviewField) {
  if (field.selectionMode) return selectedLabels(field.value).join(', ') || 'No options selected';
  return field.optional && !field.value ? 'Left blank' : field.value;
}

function ProviderOptions({ options, selected, selectionMode, disabled, onSelect }: {
  options: string[]; selected: string; selectionMode?: SelectionMode; disabled: boolean; onSelect: (value: string) => void;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const matches = options.filter(choice => choice.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const visibleOptions = matches.slice(0, 20);
  const labels = selectionMode ? selectedLabels(selected) : selected ? [selected] : [];
  const hiddenSelections = labels.filter(label => !visibleOptions.includes(label));
  return <View style={{ gap: 8 }}>
    {!!selectionMode && <Text style={{ color: colors.textSecondary }}>{selectionMode === 'multiple_required'
      ? 'Select at least one option.' : 'Select any options that apply.'}</Text>}
    {options.length > 20 && <SearchField placeholder="Search options" value={search} editable={!disabled}
      onChangeText={setSearch} onClear={!disabled && search ? () => setSearch('') : undefined} />}
    <View accessibilityRole={selectionMode ? undefined : 'radiogroup'} style={{ gap: 8 }}>
      {visibleOptions.map(choice => {
        const checked = labels.includes(choice);
        return <Pressable key={choice} accessibilityRole={selectionMode ? 'checkbox' : 'radio'}
          accessibilityLabel={choice} accessibilityState={{ checked, disabled }} disabled={disabled}
          onPress={() => onSelect(selectionMode
            ? JSON.stringify(checked ? labels.filter(label => label !== choice) : [...labels, choice]) : choice)}
          style={{ padding: 12, minHeight: 44, borderWidth: 1, borderRadius: 10,
            flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: checked ? colors.accent : colors.border }}>
          {!!selectionMode && <View accessible={false} style={{ width: 19, height: 19, borderRadius: 4, borderWidth: 1,
            borderColor: checked ? colors.accent : colors.border, justifyContent: 'center', alignItems: 'center' }}>
            {checked && <Text style={{ color: colors.accent, fontSize: 13, lineHeight: 16 }}>✓</Text>}
          </View>}
          <Text style={{ flex: 1, color: checked ? colors.accent : colors.foreground }}>{choice}</Text>
        </Pressable>;
      })}
    </View>
    {!visibleOptions.length && <Text style={{ color: colors.textSecondary }}>No matching options</Text>}
    {matches.length > 20 && <Text style={{ color: colors.textSecondary }}>Search to see more options.</Text>}
    {!!hiddenSelections.length && <Text style={{ color: colors.foreground }}>
      Selected {hiddenSelections.join(', ')}
    </Text>}
    {!!selectionMode && selected.length > 4000 && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>
      Select fewer options before continuing.
    </Text>}
  </View>;
}

export default function AutoApplyAttempt() {
  const { id, notice } = useLocalSearchParams<{ id: string; notice?: string }>();
  const { userId } = useAuth();
  return <AttemptScreen key={JSON.stringify([userId, id])} id={id} notice={notice} owner={userId ?? null} />;
}

function AttemptScreen({ id, notice, owner }: { id?: string; notice?: string; owner: string | null }) {
  const { colors } = useTheme();
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [draft, setDraft] = useState<{ version: number; answer: string; restored?: boolean }>({ version: 0, answer: '' });
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingDraft = useRef<{ version: number; answer: string } | null>(null);
  const [reviewEdit, setReviewEdit] = useState<{ version: number; fields: ReviewField[] } | null>(null);
  const [openReviewField, setOpenReviewField] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [answerFocused, setAnswerFocused] = useState(false);
  const [openPreviousVersion, setOpenPreviousVersion] = useState<number | null>(null);
  const [previous, setPrevious] = useState<PreviousAnswers | null>(null);
  const [previousFailed, setPreviousFailed] = useState(false);
  const [phoneSaveVersion, setPhoneSaveVersion] = useState<number | null>(null);
  const [phoneSaveNotice, setPhoneSaveNotice] = useState('');
  const [sending, setSending] = useState(false);
  const [pickingPdf, setPickingPdf] = useState(false);
  const advancing = useRef(false);
  const providerVisit = useRef<ProviderVisit | null>(null);
  const scroll = useRef<ScrollView>(null);
  const [previewingCv, setPreviewingCv] = useState<number | null>(null);
  const [returnedFromProvider, setReturnedFromProvider] = useState(false);
  const [resumePoll, setResumePoll] = useState(0);
  const [documents, setDocuments] = useState<UploadRecord[] | null>(null);
  const [replacement, setReplacement] = useState<{ index: number; version: number } | null>(null);
  const [reloadDocuments, setReloadDocuments] = useState(0);
  const [savedCvs, setSavedCvs] = useState<SavedCv[] | null>(null);
  const [cvLoadFailed, setCvLoadFailed] = useState(false);
  const [reloadCvs, setReloadCvs] = useState(0);
  const [pasteCvVersion, setPasteCvVersion] = useState<number | null>(null);
  const path = '/me/auto-apply/attempts/' + encodeURIComponent(id ?? '');

  const flushDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = undefined;
    const current = pendingDraft.current;
    pendingDraft.current = null;
    if (current) void writeAutoApplyAnswer(owner, id, current.version, current.answer);
  }, [owner, id]);

  function updateAnswer(version: number, answer: string) {
    setDraft({ version, answer });
    pendingDraft.current = { version, answer };
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(flushDraft, 600);
  }

  const activeQuestionVersion = attempt?.state === 'needs_input' && !attempt.attachmentRequired &&
    !attempt.handoffRequired && !attempt.listingClosed && !attempt.applicantOnly ? attempt.version : null;
  const attemptVersion = attempt?.version;
  useEffect(() => {
    if (!attemptVersion) return;
    flushDraft();
    if (activeQuestionVersion === null) {
      void clearAutoApplyAnswer(owner, id, attemptVersion);
      return;
    }
    let active = true;
    void readAutoApplyAnswer(owner, id, activeQuestionVersion).then(value => {
      if (active && value !== undefined) {
        setDraft(current => current.version >= activeQuestionVersion ? current :
          { version: activeQuestionVersion, answer: value, restored: true });
      }
    });
    return () => { active = false; };
  }, [activeQuestionVersion, attemptVersion, flushDraft, id, owner]);

  const requestControl = useCallback((action: AttemptControl, version: number, signal?: AbortSignal) =>
    requestProductApi<Pick<Attempt, 'id' | 'state' | 'version'>>(path + '/control', {
      method: 'POST', ...(signal ? { signal } : {}), body: JSON.stringify({ action, version }),
    }), [path]);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await requestProductApi<Attempt>(path, { signal }, undefined, undefined, { throwOnError: true })
        .catch(error => {
          if (signal?.aborted || !(error instanceof ProductApiRequestError) ||
              (error.status !== 401 && error.kind !== 'auth')) throw error;
          return requestProductApi<Attempt>(path, { signal }, undefined, undefined,
            { throwOnError: true, forceRefreshToken: true });
        });
      if (signal?.aborted) return;
      if (!next || next.id !== id) throw new Error();
      setAttempt(current => current?.id === next.id && current.version > next.version ? current : next);
      setStatusUnavailable(false);
      return next;
    } catch {
      if (!signal?.aborted) setStatusUnavailable(true);
    }
  }, [id, path]);
  useFocusEffect(useCallback(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshing = false;
    let refreshPending = false;
    let last: Attempt | undefined;
    function stopTimer() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    }
    async function check() {
      stopTimer();
      if (abort.signal.aborted || AppState.currentState === 'background' ||
          AppState.currentState === 'inactive') return;
      if (refreshing) {
        refreshPending = true;
        return;
      }
      refreshing = true;
      refreshPending = false;
      const fresh = await refresh(abort.signal);
      last = fresh ?? last;
      const visit = providerVisit.current;
      if (visit?.departed && fresh && !abort.signal.aborted && AppState.currentState === 'active') {
        providerVisit.current = null;
        // Returning from a provider portal only proves that the learner came
        // back. It does not prove that sign-in or the provider step finished.
        // Keep the attempt at the current version until the learner explicitly
        // asks Edutu to recheck it.
        if (fresh.state === 'needs_input' && fresh.version === visit.version &&
            fresh.handoffRequired && fresh.canRetry && !fresh.listingClosed && !fresh.applicantOnly) {
          setReturnedFromProvider(true);
        }
      }
      refreshing = false;
      if (refreshPending) {
        void check();
        return;
      }
      if (!abort.signal.aborted && AppState.currentState === 'active' &&
          (!last || progressingStates.has(last.state))) {
        timer = setTimeout(() => void check(), 8_000);
      }
    }
    void check();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void check();
      else {
        if (state === 'background' && providerVisit.current) providerVisit.current.departed = true;
        stopTimer();
        flushDraft();
      }
    });
    const notifications = addNotificationReceivedListener(notification => {
      if (autoApplyNotificationAttemptId(notification.request.content.data) === id) void check();
    });
    return () => {
      abort.abort();
      stopTimer();
      flushDraft();
      subscription.remove();
      notifications.remove();
    };
  // Restart the focused poll after a mutation or a notification tap.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, resumePoll, id, notice, flushDraft, requestControl]));

  const replacementIndex = replacement && attempt?.state === 'needs_review' && attempt.version === replacement.version
    && !attempt.listingClosed && !attempt.applicantOnly ? replacement.index : null;
  const replacementLabel = replacementIndex !== null ? attempt?.review?.[replacementIndex]?.label : undefined;
  const attachmentVersion = attempt && (attempt.attachmentRequired || replacementIndex !== null)
    && !attempt.listingClosed && !attempt.applicantOnly ? attempt.version : null;
  useFocusEffect(useCallback(() => {
    if (attachmentVersion === null) return;
    const abort = new AbortController();
    setDocuments(null);
    requestProductApi<UploadRecord[]>('/uploads', { signal: abort.signal }).then(items => {
      if (abort.signal.aborted) return;
      if (Array.isArray(items)) setDocuments(items.filter(item => item.mimeType === 'application/pdf'));
      else setError('Could not load your saved documents. Refresh and try again.');
    }).catch(() => { if (!abort.signal.aborted) setError('Could not load your saved documents. Refresh and try again.'); });
    return () => abort.abort();
  // A learner can reload documents without changing the attempt version.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentVersion, reloadDocuments]));

  const cvVersion = attempt?.state === 'needs_input' && attempt.cvRequested &&
    !attempt.listingClosed && !attempt.applicantOnly ? attempt.version : null;
  useFocusEffect(useCallback(() => {
    if (cvVersion === null) return;
    const abort = new AbortController();
    setSavedCvs(null);
    setCvLoadFailed(false);
    requestProductApi<SavedCv[]>('/me/auto-apply/cvs', { signal: abort.signal }).then(items => {
      if (!abort.signal.aborted && Array.isArray(items)) setSavedCvs(items);
      if (!abort.signal.aborted && !Array.isArray(items)) setCvLoadFailed(true);
    }).catch(() => { if (!abort.signal.aborted) setCvLoadFailed(true); });
    return () => abort.abort();
  // A learner can reload CVs without changing the attempt version.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cvVersion, reloadCvs]));

  const activityAttemptId = attempt?.id;
  const activityState = attempt?.state;
  const activityVersion = attempt?.version;
  const activityTitle = attempt?.title;
  const activityAction = attempt?.activityAction;
  useEffect(() => {
    if (owner && activityAttemptId && activityState && activityVersion) {
      void syncAutoApplyActivity({ id: activityAttemptId, state: activityState, version: activityVersion,
        title: activityTitle, activityAction }, { owner });
    }
  }, [activityAttemptId, activityState, activityVersion, activityTitle, activityAction, owner]);

  const showingPrevious = Boolean(attempt?.hasPreviousAnswers && attempt.version === openPreviousVersion);
  useEffect(() => {
    if (!showingPrevious) return;
    const abort = new AbortController();
    void requestProductApi<PreviousAnswers>(path + '/previous-answers', { signal: abort.signal }).then(result => {
      if (abort.signal.aborted) return;
      if (result?.version === openPreviousVersion) setPrevious(result);
      else setPreviousFailed(true);
    }).catch(() => { if (!abort.signal.aborted) setPreviousFailed(true); });
    return () => abort.abort();
  }, [showingPrevious, openPreviousVersion, path]);

  const answer = attempt?.version === draft.version ? draft.answer : '';
  const answerLength = answer.trim().length;
  const answerMaxLength = attempt?.answerMaxLength;
  const answerOverLimit = answerLength > Math.min(answerMaxLength ?? 4000, 4000);
  const selectionCount = attempt?.selectionMode ? selectedLabels(answer).length : 0;
  const rememberPhone = Boolean(attempt?.savePhoneOffered && phoneSaveVersion === attempt.version);
  const phoneSaveFormat = answerLength <= 40 && /^\+?[\d ().-]+$/.test(answer.trim()) &&
    /^\+[1-9]\d{6,14}$/.test(answer.trim().replace(/[ ().-]/g, ''));
  const canSendAnswer = !(rememberPhone && !phoneSaveFormat) && !answerOverLimit && (attempt?.selectionMode === 'multiple_optional' ||
    (attempt?.selectionMode === 'multiple_required' ? selectionCount > 0 : answerLength > 0));
  const options = attempt?.choices ?? [];
  const reviewOverLimit = attempt?.review?.some(exceedsProviderLimit) ?? false;
  const reviewNeedsCorrection = attempt?.state === 'needs_review' && attempt.review?.some(field => field.validationHint);
  const reviewChanged = Boolean(reviewEdit && (attempt?.state !== 'needs_review' || attempt.version !== reviewEdit.version));
  const correcting = Boolean(reviewNeedsCorrection && reviewEdit && !reviewChanged);
  const reviewFields = (reviewEdit?.fields ?? (attempt?.state === 'needs_review' ? attempt.review : undefined))
    ?.map((field, index) => ({ field, index }));
  const corrections = reviewFields?.filter(({ field }) => field.validationHint);
  const displayedReview = correcting ? corrections : reviewNeedsCorrection && !reviewChanged
    ? [...(corrections ?? []), ...(reviewFields ?? []).filter(({ field }) => !field.validationHint)]
    : reviewFields;
  const reviewAttachments = attempt?.state === 'needs_review'
    ? (attempt.review ?? []).filter(field => field.attachment?.type === 'pdf')
    : [];
  const generatedReviewAttachments = reviewAttachments.filter(field => !field.attachment?.uploadId);
  const originalReviewAttachments = reviewAttachments.filter(field => Boolean(field.attachment?.uploadId));
  const aiReviewFields = attempt?.state === 'needs_review'
    ? (attempt.review ?? []).filter(field => field.generatedByAi)
    : [];
  const actionVersion = attempt?.state === "needs_input" || attempt?.state === "needs_review"
    ? attempt.version : undefined;
  useEffect(() => {
    if (actionVersion !== undefined) scroll.current?.scrollTo({ y: 0, animated: false });
  }, [actionVersion, notice, reviewNeedsCorrection]);
  const invalidReviewEdit = reviewEdit?.fields.some(field => (!field.optional && !field.value.trim()) ||
    exceedsProviderLimit({ ...field, value: field.value.trim() }) ||
    (!!field.selectionMode && field.value.length > 4000) ||
    (field.selectionMode === 'multiple_required' && !selectedLabels(field.value).length)) ?? false;
  function setReviewValue(index: number, value: string) {
    setReviewEdit(current => current && ({
      ...current, fields: current.fields.map((field, position) => position === index ? { ...field, value } : field),
    }));
  }
  async function recoverAttemptChange(current: Attempt) {
    const latest = await refresh();
    if (!latest || (latest.version <= current.version && !latest.listingClosed && !latest.applicantOnly)) return false;
    if (progressingStates.has(latest.state)) setResumePoll(value => value + 1);
    return true;
  }

  async function advanceAttempt(action: 'answer' | 'approve' | 'retry-statement', current: Attempt, payload: { version: number; answer?: string; rememberPhone?: true }) {
    if (advancing.current) return;
    advancing.current = true;
    flushDraft();
    setSending(true);
    setError('');
    setPhoneSaveNotice('');
    try {
      const result = await requestProductApi<{ id: string; phoneSaved?: boolean }>(path + '/' + action, {
        method: 'POST', body: JSON.stringify(payload),
      }).catch(() => null);
      if (result?.id === current.id) {
        if (action === 'answer') void clearAutoApplyAnswer(owner, id, current.version);
        if (payload.rememberPhone) setPhoneSaveNotice(result.phoneSaved
          ? 'Phone number saved to your application profile.'
          : 'Answer sent. Your application profile phone number was not changed.');
        setResumePoll(value => value + 1);
        return;
      }
      if (await recoverAttemptChange(current)) return;
      setError(action === 'answer'
        ? 'Could not confirm the answer was saved. Your draft is still here.'
        : action === 'retry-statement' ? 'Could not start another draft. Refresh, or write your own statement.'
          : 'Could not confirm approval. Refresh the attempt before trying again.');
    } finally {
      advancing.current = false;
      setSending(false);
    }
  }

  function send() {
    if (!attempt?.question || !canSendAnswer || sending) return;
    return advanceAttempt('answer', attempt, { answer: answer || '[]', version: attempt.version, ...(rememberPhone ? { rememberPhone: true } : {}) });
  }

  async function postAttachment(uploadId: string, current: Attempt) {
    let result;
    try {
      result = await requestProductApi<{ id: string }>(path + '/attachment', {
        method: 'POST', body: JSON.stringify({ uploadId, version: current.version,
          ...(replacementIndex !== null ? { fieldIndex: replacementIndex } : {}) }),
      }, undefined, 12_000, { throwOnError: true });
    } catch (failure) {
      if (failure instanceof ProductApiRequestError && failure.status === 413) {
        setError(replacementIndex !== null ? 'This PDF exceeds the remaining space. Choose a smaller PDF.' : overBudgetMessage);
        return 'too_large';
      }
    }
    if (result?.id === current.id) {
      setResumePoll(value => value + 1);
      return 'saved';
    }
    return await recoverAttemptChange(current) ? 'saved' : 'uncertain';
  }

  async function selectCv(cvId: string) {
    if (cvVersion === null || !attempt || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await requestProductApi<Attempt>(path + '/cv', {
        method: 'POST', body: JSON.stringify({ cvId, version: cvVersion }),
      });
      if (result?.id !== attempt.id) throw new Error();
      setAttempt(current => current?.id === result.id && current.version > result.version ? current : { ...current, ...result });
      setResumePoll(value => value + 1);
    } catch {
      if (!(await recoverAttemptChange(attempt))) {
        setError('Could not confirm the CV was attached. Check the current attempt and try again.');
      }
    } finally { setSending(false); }
  }

  async function attachPdf(uploadId: string) {
    if (!attempt || attachmentVersion === null || sending) return;
    setSending(true);
    setError('');
    try {
      if (await postAttachment(uploadId, attempt) === 'uncertain') {
        setError('Could not confirm the PDF was attached. Check the current attempt and try again.');
      }
    } finally { setSending(false); }
  }

  async function uploadPdf() {
    if (!attempt || attachmentVersion === null || sending) return;
    let cachedUri: string | undefined;
    let uploadStarted = false;
    setSending(true);
    setPickingPdf(true);
    setError('');
    try {
      const picked = await getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      setPickingPdf(false);
      if (picked.canceled) return;
      const file = picked.assets[0];
      if (Platform.OS !== 'web') cachedUri = file?.uri;
      if (!file) throw new Error();
      if (file.size !== undefined && file.size > (attempt.attachmentBytesRemaining ?? pdfBudget)) {
        setError(attempt.canResetDocuments ? overBudgetMessage : 'Choose a PDF up to 10 MB.');
        return;
      }
      const form = new FormData();
      form.append('kind', 'other');
      appendPickedDocument(form, file, 'application/pdf');
      uploadStarted = true;
      const uploaded = await requestProductApi<{ uploadId: string }>('/uploads/file', { method: 'POST', body: form }, undefined, 30_000);
      if (!uploaded?.uploadId) throw new Error();
      const outcome = await postAttachment(uploaded.uploadId, attempt);
      if (outcome !== 'saved') setReloadDocuments(value => value + 1);
      if (outcome === 'uncertain') {
        setError('The PDF was saved in My Documents. Select it to try attaching it again.');
      }
    } catch {
      if (uploadStarted) {
        setReloadDocuments(value => value + 1);
        setError('Could not confirm the upload. Check My Documents for the PDF before uploading again.');
      } else {
        setError('Could not upload the document. Choose a PDF up to 10 MB.');
      }
    } finally {
      if (cachedUri) {
        try {
          const copy = new File(cachedUri);
          if (copy.uri.startsWith(Paths.cache.uri.replace(/\/?$/, '/')) && copy.exists) copy.delete();
        } catch { /* The OS can also clear the document picker cache. */ }
      }
      setPickingPdf(false);
      setSending(false);
    }
  }

  async function openPdf(uploadId: string) {
    try {
      const result = await requestProductApi<{ url: string }>(`/uploads/${encodeURIComponent(uploadId)}/download-url`);
      if (!result?.url) throw new Error();
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      await Linking.openURL(url.href);
    } catch { setError('Could not open the PDF. You can find it in My Documents.'); }
  }

  async function openGeneratedCv(fieldIndex: number) {
    if (!attempt?.canPreviewCv || reviewEdit || sending) return;
    setSending(true);
    setPreviewingCv(fieldIndex);
    setError('');
    let file: File | undefined;
    let shared = false;
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error();
      const result = await requestProductApi<{ pdf: string }>(path + '/cv-preview', {
        method: 'POST', body: JSON.stringify({ version: attempt.version, fieldIndex }),
      }, undefined, 15_000);
      if (!result?.pdf || result.pdf.length > 700_000) throw new Error();
      file = new File(Paths.cache, 'Edutu Auto Apply CV.pdf');
      if (file.exists) file.delete();
      file.write(result.pdf, { encoding: 'base64' });
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Edutu Auto Apply CV' });
      shared = true;
    } catch {
      setError('Could not open the CV PDF. You can still review its text here or try again.');
    } finally {
      // An Android share target can read the URI after its chooser closes.
      if (file && (!shared || Platform.OS !== 'android')) {
        try { if (file.exists) file.delete(); } catch { /* The OS can reclaim the cache. */ }
      }
      setPreviewingCv(null);
      setSending(false);
    }
  }

  async function saveReview() {
    if (!attempt || !reviewEdit || sending || invalidReviewEdit || reviewChanged) return;
    const values = reviewEdit.fields.map(field => field.value.trim());
    const matches = (fields?: ReviewField[]) => fields?.length === values.length &&
      fields.every((field, index) => field.label === reviewEdit.fields[index]?.label && field.value === values[index]);
    setSending(true);
    setError('');
    try {
      const saved = await requestProductApi<Pick<Attempt, 'id' | 'version' | 'review'>>(path + '/review', {
        method: 'PUT', body: JSON.stringify({ version: reviewEdit.version, values }),
      }).catch(() => null);
      if (saved?.id === attempt.id && saved.version > reviewEdit.version && matches(saved.review)) {
        setAttempt(current => current?.id === saved.id && current.version <= saved.version
          ? { ...current, ...saved } : current);
        if (correcting) await refresh();
      } else {
        const latest = await refresh();
        if (latest?.state !== 'needs_review' || latest.version <= reviewEdit.version || !matches(latest.review)) {
          if (!latest || latest.version <= reviewEdit.version) setError('Could not confirm the save. Your edits are still here.');
          return;
        }
      }
      setReviewEdit(null);
      setOpenReviewField(null);
    } finally {
      setSending(false);
    }
  }

  async function openProvider(current = attempt) {
    if (!current?.handoffUrl || (current === attempt && sending)) return;
    let visit: ProviderVisit | null = null;
    setReturnedFromProvider(false);
    try {
      const url = new URL(current.handoffUrl);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      if (Platform.OS !== 'web' && current.state === 'needs_input' && current.handoffRequired &&
          current.canRetry && !current.listingClosed && !current.applicantOnly) {
        visit = { version: current.version, departed: false };
        providerVisit.current = visit;
      }
      await Linking.openURL(url.href);
    } catch {
      if (providerVisit.current === visit) providerVisit.current = null;
      setError(current.state === 'unconfirmed'
        ? 'Could not open the provider site. Check your email for a confirmation.'
        : 'Could not open the provider site. You can open the opportunity details and apply there.');
    }
  }

  async function changeManualReview(enabled: boolean) {
    if (!attempt || sending || advancing.current ||
        !(enabled ? attempt.canStartManualSubmission : attempt.reviewingOnProvider)) return;
    advancing.current = true;
    setSending(true);
    setError('');
    try {
      const next = await requestProductApi<Attempt>(path + '/manual-review', {
        method: 'POST', body: JSON.stringify({ version: attempt.version, enabled }),
      });
      if (next?.id !== attempt.id || next.state !== 'needs_review' || next.reviewingOnProvider !== enabled) throw new Error();
      setAttempt(current => current?.id === next.id && current.version > next.version ? current : next);
      if (enabled) await openProvider(next);
    } catch {
      await refresh();
      setError('Could not confirm the submission option. Check the current status and try again.');
    } finally {
      advancing.current = false;
      setSending(false);
    }
  }

  function confirmUseEdutu() {
    Alert.alert('Switch back to Edutu?',
      'Check that the provider has no submission for this application before switching.', [
        { text: 'Stay on provider', style: 'cancel' },
        { text: 'Switch back', onPress: () => void changeManualReview(false) },
      ]);
  }

  async function checkReceipt() {
    if (!attempt?.canCheckReceipt || sending) return;
    setSending(true);
    setError('');
    try {
      const next = await requestProductApi<Attempt>(path + '/check-receipt', { method: 'POST' }, undefined, 12_000);
      if (!next) throw new Error();
      setAttempt(current => current?.id === next.id && current.version > next.version ? current : next);
      if (next.state === 'unconfirmed') setError('No receipt yet. Check the provider portal or email before applying again.');
    } catch {
      setError('Could not check for a receipt. Try again shortly.');
    } finally {
      setSending(false);
    }
  }

  async function recordManualSubmission(current: Attempt) {
    if (advancing.current) return;
    advancing.current = true;
    setSending(true);
    setError('');
    try {
      const next = await requestProductApi<Attempt>(path + '/manual-submission', {
        method: 'POST', body: JSON.stringify({ version: current.version }),
      });
      if (next?.id !== current.id || next.state !== 'submitted') throw new Error();
      setAttempt(previous => previous?.id === next.id && previous.version > next.version ? previous : next);
    } catch {
      const latest = await refresh();
      if (latest?.state !== 'submitted') setError('Could not record the submission. Check the latest status and try again.');
    } finally {
      advancing.current = false;
      setSending(false);
    }
  }

  function confirmManualSubmission() {
    if (!attempt?.canRecordManualSubmission || sending) return;
    Alert.alert('Already submitted on the provider site?',
      'Only record this after you submit on the provider site. Edutu will save your report and stop Auto Apply for it.', [
        { text: 'Go back', style: 'cancel' },
        { text: 'Record submission', onPress: () => void recordManualSubmission(attempt) },
      ]);
  }

  async function changeAttempt(action: AttemptControl) {
    if (!attempt || sending || advancing.current) return;
    const allowed = {
      cancel: attempt.canCancel, retry: attempt.canRetry, reset_documents: attempt.canResetDocuments,
      pause: attempt.canPause, resume: attempt.canResume,
    };
    if (!allowed[action]) return;
    providerVisit.current = null;
    setReturnedFromProvider(false);
    advancing.current = true;
    setSending(true);
    setError('');
    try {
      let changed = await requestControl(action, attempt.version);
      if (!changed) {
        const latest = await refresh();
        // The worker can claim a queued attempt between rendering Pause and tapping it.
        // Keep the request tied to this attempt and retry once if the current state still permits it.
        if (latest && latest.version > attempt.version && (action === 'pause' || action === 'resume')) {
          if (!(action === 'pause' ? latest.canPause : latest.canResume)) return;
          changed = await requestControl(action, latest.version);
        }
        if (!changed) {
          setError('Could not change Auto Apply. Check the current status and try again.');
          return;
        }
      }
      setReviewEdit(null);
      setError('');
      setAttempt(current => current?.id === changed.id && current.version <= changed.version
        ? { ...current, ...changed, question: undefined, review: undefined, canSubmit: false, canCancel: false, canRetry: false,
          attachmentRequired: false, canResetDocuments: false, canPause: false, canResume: false }
        : current);
      setResumePoll(value => value + 1);
    } catch (error) {
      setError(isAiBillingError(error) && error.status === 429
        ? 'You’ve reached your monthly Auto Apply limit. Open the opportunity to see your reset date and options.'
        : 'Could not change Auto Apply. Try refreshing the attempt.');
    } finally {
      advancing.current = false;
      setSending(false);
    }
  }

  function confirmCancellation() {
    Alert.alert('Stop Auto Apply?', 'You can retry this application using the same monthly attempt.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Stop Auto Apply', style: 'destructive', onPress: () => void changeAttempt('cancel') },
    ]);
  }

  function approve() {
    if (!attempt?.canSubmit || sending || reviewEdit || reviewOverLimit) return;
    return advanceAttempt('approve', attempt, { version: attempt.version });
  }

  const hasProviderPages = attempt?.state === 'needs_review' && Boolean(attempt.review?.[0]?.providerPage);
  const editDraftAction = replacementIndex === null && attempt?.state === 'needs_review' &&
    !!attempt.review?.length && !reviewEdit && !reviewNeedsCorrection && (
      <Pressable accessibilityRole="button" disabled={sending}
        style={{ minHeight: 44, justifyContent: 'center' }}
        onPress={() => attempt.review && setReviewEdit({ version: attempt.version, fields: attempt.review })}>
        <Text style={{ color: colors.accent }}>Edit application draft</Text>
      </Pressable>
    );
  const refreshStatus = () => {
    setError('');
    if (!attempt) setStatusUnavailable(false);
    setResumePoll(value => value + 1);
    if (attachmentVersion !== null) setReloadDocuments(value => value + 1);
  };
  const refreshButton = (
    <AnimatedPressable accessibilityRole="button" disabled={sending} focusColor={colors.accent}
      onPress={refreshStatus} style={styles.utilityAction}>
      <RefreshCw accessible={false} size={16} color={colors.accent} />
      <Text style={[styles.controlText, { color: colors.accent }]}>Refresh status</Text>
    </AnimatedPressable>
  );
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader flat title="Auto Apply" subtitle={attempt?.title} showBack />
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.content}>
      {attempt ? <AttemptProgress attempt={attempt} stale={statusUnavailable} busy={sending} onControl={changeAttempt}
        status={attempt.manuallySubmitted ? 'Submission recorded' : attempt.reviewingOnProvider ? 'Submitting on the provider site'
          : reviewNeedsCorrection ? 'Correction needed' : attempt.waitingForProvider &&
          (attempt.state === 'queued' || attempt.state === 'running') ? 'Waiting to retry the provider' : autoApplyStatus[attempt.state]} />
        : !statusUnavailable && <ActivityIndicator accessibilityLabel="Loading application status" />}
      {!attempt && statusUnavailable && <View style={[styles.progressPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.status, { color: colors.foreground }]}>
          Could not load this attempt
        </Text>
        <Text style={[styles.statusHint, { color: colors.textSecondary }]}>Refresh to check your application status.</Text>
        {refreshButton}
      </View>}
      {!!phoneSaveNotice && <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary }}>{phoneSaveNotice}</Text>}
      {attachmentVersion !== null && <>
        <Text style={{ color: colors.foreground }}>{replacementLabel ? `Replace PDF for ${replacementLabel}` : attempt?.question}</Text>
        {replacementIndex !== null && <Pressable accessibilityRole="button" disabled={sending}
          style={{ minHeight: 44, justifyContent: 'center' }}
          onPress={() => { setReplacement(null); setError(''); }}>
          <Text style={{ color: colors.accent }}>Back to review</Text>
        </Pressable>}
        <Text style={{ color: colors.textSecondary }}>Supporting PDFs can total up to 10 MB. You’ll review them before Edutu sends them to the provider.</Text>
        {typeof attempt?.attachmentBytesRemaining === 'number' && attempt.attachmentBytesRemaining < pdfBudget &&
          <Text style={{ color: colors.textSecondary }}>{Math.floor(attempt.attachmentBytesRemaining / 1024).toLocaleString()} KB remaining for supporting PDFs</Text>}
        {!!error && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>{error}</Text>}
        {!documents && !error && <ActivityIndicator accessibilityLabel="Loading documents" />}
        {documents?.map(document => <Pressable key={document.id} accessibilityRole="button" disabled={sending}
          onPress={() => void attachPdf(document.id)}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8,
            borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}>
          <Text style={{ color: colors.foreground }}>{document.fileName}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="button" disabled={sending} onPress={() => void uploadPdf()}
          style={{ minHeight: 44, justifyContent: 'center', alignItems: 'flex-start' }}>
          <Text style={{ color: colors.accent, fontWeight: '500' }}>
            {pickingPdf ? 'Opening Files…' : sending ? 'Saving document…' : 'Upload a PDF'}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="link" disabled={sending} onPress={() => router.push('/profile/documents')}>
          <Text style={{ color: colors.accent, paddingVertical: 8 }}>Open My Documents</Text>
        </Pressable>
        {attempt?.canResetDocuments && <Pressable accessibilityRole="button" disabled={sending}
          style={{ minHeight: 44, justifyContent: 'center' }}
          onPress={() => Alert.alert('Start document selection again?', 'Your PDFs stay in My Documents. Edutu will ask you to choose files for this application again.', [
            { text: 'Keep current files', style: 'cancel' },
            { text: 'Choose again', onPress: () => void changeAttempt('reset_documents') },
          ])}>
          <Text style={{ color: colors.accent }}>Start document selection again</Text>
        </Pressable>}
      </>}
      {cvVersion !== null && <>
        <Text style={{ color: colors.foreground, fontWeight: '500' }}>Choose a saved CV</Text>
        <Text style={{ color: colors.textSecondary }}>Edutu prepares a PDF for you to review.</Text>
        {!savedCvs && !cvLoadFailed && <ActivityIndicator accessibilityLabel="Loading saved CVs" />}
        {cvLoadFailed && <Pressable accessibilityRole="button" onPress={() => setReloadCvs(value => value + 1)}>
          <Text style={{ color: colors.accent, paddingVertical: 8 }}>Reload saved CVs</Text>
        </Pressable>}
        {savedCvs?.length === 0 && <Text style={{ color: colors.textSecondary }}>You have no saved CVs yet.</Text>}
        {savedCvs?.map(cv => <Pressable key={cv.id} accessibilityRole="button" accessibilityLabel={`Use ${cv.name}`}
          disabled={sending} onPress={() => void selectCv(cv.id)}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}>
          <Text style={{ color: colors.foreground }}>{cv.name}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="link" disabled={sending} onPress={() => router.push('/cv')}>
          <Text style={{ color: colors.accent, paddingVertical: 8 }}>Manage CVs</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: pasteCvVersion === cvVersion }}
          disabled={sending} onPress={() => setPasteCvVersion(current => current === cvVersion ? null : cvVersion)}>
          <Text style={{ color: colors.accent, paddingVertical: 8 }}>Paste CV text instead</Text>
        </Pressable>
      </>}
      {attempt?.state === 'needs_input' && !attempt.attachmentRequired && !attempt.listingClosed && !attempt.applicantOnly && !attempt.handoffRequired && attempt.question &&
        (!attempt.cvRequested || (cvVersion !== null && pasteCvVersion === cvVersion)) && <View style={styles.answerForm}>
        <Text accessibilityRole="header" style={[styles.question, { color: colors.foreground }]}>{attempt.question}</Text>
        {draft.restored && draft.version === attempt.version && <Text style={{ color: colors.textSecondary }}>Draft restored from this device.</Text>}
        {attempt.statementRetryAvailable && !answerLength && <>
          <Text style={{ color: colors.textSecondary }}>Edutu couldn’t draft this statement. You can try again or write your own.</Text>
          <Pressable accessibilityRole="button" disabled={sending}
            onPress={() => void advanceAttempt('retry-statement', attempt, { version: attempt.version })}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors.accent, fontWeight: '500' }}>{sending ? 'Starting…' : 'Try drafting again'}</Text>
          </Pressable>
        </>}
        {!!attempt.answerHint && <Text style={{ color: colors.textSecondary }}>{attempt.answerHint}</Text>}
        {options.length ? (
          <ProviderOptions key={attempt.version} options={options} selected={answer} selectionMode={attempt.selectionMode} disabled={sending}
            onSelect={value => updateAnswer(attempt.version, value)} />
        ) : (
          <TextInput accessibilityLabel={attempt.statementRequested ? 'Your statement of purpose' :
            attempt.savePhoneOffered ? 'Phone number' : 'Your answer'}
            multiline={!attempt.savePhoneOffered} keyboardType={attempt.savePhoneOffered ? 'phone-pad' : 'default'}
            autoComplete={attempt.savePhoneOffered ? 'tel' : undefined}
            placeholder={attempt.statementRequested ? 'Write your statement' : attempt.savePhoneOffered ? 'Enter your phone number' : 'Type your answer'}
            placeholderTextColor={colors.textSecondary}
            onFocus={() => setAnswerFocused(true)}
            onBlur={() => setAnswerFocused(false)}
            maxLength={4000} editable={!sending} value={answer}
            onChangeText={value => updateAnswer(attempt.version, value)}
            style={[styles.answer, { minHeight: attempt.savePhoneOffered ? 52 : attempt.statementRequested || attempt.cvRequested ? 120 : 68,
              backgroundColor: colors.card, borderColor: answerFocused ? colors.accent : colors.border, color: colors.foreground }]} />
        )}
        {answerMaxLength != null && !options.length && <Text style={{ color: colors.textSecondary }}>
          {answerOverLimit
            ? `Shorten your answer to ${answerMaxLength} characters. ${answerLength} entered.`
            : `${answerLength} of ${answerMaxLength} characters used`}
        </Text>}
        {attempt.savePhoneOffered && <>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="Save this number for future applications"
            accessibilityState={{ checked: rememberPhone, disabled: sending }}
            disabled={sending} onPress={() => setPhoneSaveVersion(rememberPhone ? null : attempt.version)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1,
              borderColor: rememberPhone ? colors.accent : colors.border, alignItems: 'center', justifyContent: 'center' }}>
              {rememberPhone && <Text style={{ color: colors.accent }}>✓</Text>}
            </View>
            <Text style={{ color: colors.foreground, flex: 1 }}>Save this number for future applications</Text>
          </Pressable>
          {rememberPhone && !phoneSaveFormat && <Text style={{ color: colors.textSecondary }}>
            Enter an international number starting with + and your country code, or leave the box unchecked.
          </Text>}
        </>}
        <AnimatedPressable accessibilityRole="button" disabled={sending || !canSendAnswer} onPress={send}
          focusColor={colors.accent} style={[styles.answerButton, { backgroundColor: canSendAnswer ? colors.foreground : colors.muted }]}>
          {sending && <ActivityIndicator size="small" color={canSendAnswer ? colors.background : colors.textSecondary} />}
          <Text style={[styles.answerButtonText, { color: canSendAnswer ? colors.background : colors.textSecondary }]}>{sending ? 'Saving…' :
            attempt.statementRequested ? 'Save statement and continue' :
            attempt.selectionMode === 'multiple_optional' && !selectionCount ? 'Continue without selecting' :
            attempt.selectionMode ? 'Save selections and continue' : 'Send answer and continue'}</Text>
          {!sending && <ArrowRight accessible={false} size={17} color={canSendAnswer ? colors.background : colors.textSecondary} />}
        </AnimatedPressable>
      </View>}
      {attempt?.state === 'needs_input' && !attempt.listingClosed && !attempt.applicantOnly && attempt.handoffRequired && <>
        <Text style={{ color: colors.foreground, fontWeight: '500' }}>{attempt.question}</Text>
        {returnedFromProvider && attempt.canRetry && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>
          You’re back from the provider. Tap Recheck provider form when you’re ready.
        </Text>}
        <Text style={{ color: colors.textSecondary }}>
          {!attempt.canRetry ? 'After you finish, return to Edutu to check your application status.'
            : 'After you finish, return to Edutu and tap Recheck provider form. You’ll review the form before submitting.'}
        </Text>
        {attempt.handoffUrl && <Pressable accessibilityRole="link" onPress={() => void openProvider()}
          style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.accent }}>
          <Text style={{ color: colors.accent, fontWeight: '500', textAlign: 'center' }}>{attempt.exactHandoff ? 'Open provider step' : 'Open provider site'}</Text>
        </Pressable>}
        {attempt.opportunityId && <Pressable accessibilityRole="link" onPress={() =>
          router.push({ pathname: '/(app)/opportunities/[id]', params: { id: attempt.opportunityId! } })}>
          <Text style={{ color: colors.accent, paddingVertical: 8 }}>View opportunity details</Text>
        </Pressable>}
      </>}
      {attempt?.state === 'needs_review' && attempt.destinationHost &&
        <Text style={{ color: colors.textSecondary }}>Application destination {attempt.destinationHost}</Text>}
      {attempt?.state === 'needs_review' && <View accessibilityRole="summary" style={{ gap: 8, borderWidth: 1,
        borderColor: colors.border, borderRadius: 12, padding: 14 }}>
        <Text style={{ color: colors.foreground, fontWeight: '500' }}>
          {attempt.reviewingOnProvider ? 'Your application draft' : 'Review before approval'}
        </Text>
        {!attempt.reviewingOnProvider && <Text style={{ color: colors.textSecondary }}>Nothing has been submitted yet.</Text>}
        {!!attempt.destinationHost && <Text style={{ color: colors.textSecondary }}>
          Destination · {attempt.destinationHost}
        </Text>}
        {!!generatedReviewAttachments.length && <View style={{ gap: 3 }}>
          <Text style={{ color: colors.foreground, fontWeight: '500' }}>Generated files</Text>
          {generatedReviewAttachments.map((field, index) => <Text key={`generated-${field.label}-${index}`} style={{ color: colors.textSecondary }}>
            Generated CV PDF{field.attachment?.sourceName ? ` · based on ${field.attachment.sourceName}` : ''}
          </Text>)}
        </View>}
        {!!originalReviewAttachments.length && <View style={{ gap: 3 }}>
          <Text style={{ color: colors.foreground, fontWeight: '500' }}>Original files</Text>
          {originalReviewAttachments.map((field, index) => <Text key={`original-${field.label}-${index}`} style={{ color: colors.textSecondary }}>
            Original · {field.attachment?.sourceName ?? field.value}
          </Text>)}
        </View>}
        {!!aiReviewFields.length && <View style={{ gap: 3 }}>
          <Text style={{ color: colors.foreground, fontWeight: '500' }}>AI-assisted answers</Text>
          {aiReviewFields.map((field, index) => <Text key={`ai-${field.label}-${index}`} style={{ color: colors.textSecondary }}>
            {field.label} · started with Edutu AI. Check it against your experience.
          </Text>)}
        </View>}
        <Text style={{ color: colors.textSecondary }}>
          {attempt.reviewingOnProvider ? 'Use this draft on the provider site. Record your submission here when you’re done.'
            : 'Edutu will send these reviewed answers and files only after you approve.'}
        </Text>
      </View>}
      {attempt?.state === 'needs_review' && !!attempt.review?.length &&
        <Text style={{ color: colors.textSecondary }}>{reviewNeedsCorrection
          ? 'The provider needs you to fix the highlighted answers. You can review the full draft after saving.'
          : 'Check that each answer is accurate before submitting.'}</Text>}
      {hasProviderPages && editDraftAction}
      {reviewNeedsCorrection && !reviewEdit &&
        <Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}
          onPress={() => attempt.review && setReviewEdit({ version: attempt.version, fields: attempt.review })}>
          <Text style={{ color: colors.accent }}>Edit highlighted answers</Text>
        </Pressable>}
      {attempt?.state === 'needs_review' && attempt.submissionUnavailable &&
        <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary }}>
          Submission is temporarily unavailable. Your review is saved. Refresh the status to check again.
        </Text>}
      {attempt?.state === 'failed' && attempt.failureReason === 'mapping_changed' && !attempt.listingClosed && !attempt.applicantOnly && <>
        <Text style={{ color: colors.foreground }}>The provider form changed. You can try preparing it again or finish the application on the provider’s website.</Text>
        {attempt.handoffUrl && <Pressable accessibilityRole="link" onPress={() => void openProvider()}>
          <Text style={{ color: colors.accent, paddingVertical: 8 }}>Open provider site</Text>
        </Pressable>}
      </>}
      {attempt?.state === 'failed' && attempt.failureReason === 'provider_busy' &&
        <Text style={{ color: colors.foreground }}>
          Auto Apply stayed busy after several tries.{!attempt.allowanceRestored && ' You can retry without using another monthly attempt.'}
        </Text>}
      {attempt?.state === 'failed' && attempt.failureReason === 'provider_unavailable' &&
        <Text style={{ color: colors.foreground }}>
          Edutu couldn’t load the provider form after several tries.{!attempt.allowanceRestored && ' You can retry without using another monthly attempt.'}
        </Text>}
      {attempt?.state === 'failed' && attempt.allowanceRestored &&
        <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary }}>
          Edutu restored this run to your monthly allowance. Retrying uses one available run and keeps this application.
        </Text>}
      {attempt?.state === 'failed' && attempt.failureReason === 'attachment_changed' &&
        <Text style={{ color: colors.foreground }}>The selected PDF changed or became unavailable. Retry to choose a document and review the application again.</Text>}
      {attempt?.state === 'failed' && attempt.failureReason === 'attachment_size_limit' &&
        <Text style={{ color: colors.foreground }}>The supporting PDFs total more than 10 MB. Retry and choose smaller files to continue.</Text>}
      {attempt?.listingClosed && !['submitted', 'unconfirmed'].includes(attempt.state) &&
        <Text style={{ color: colors.foreground }}>This opportunity has closed.</Text>}
      {attempt?.applicantOnly && !['submitted', 'unconfirmed'].includes(attempt.state) && <>
        <Text style={{ color: colors.foreground }}>This provider asks you to complete and submit your own application.</Text>
        {attempt.handoffUrl && <Pressable accessibilityRole="link" onPress={() => void openProvider()}>
          <Text style={{ color: colors.accent, paddingVertical: 8 }}>Open provider site</Text>
        </Pressable>}
      </>}
      {attempt?.hasPreviousAnswers && <View style={{ gap: 12, borderWidth: 1, borderRadius: 12, borderColor: colors.border, paddingHorizontal: 12 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showingPrevious }}
          onPress={() => {
            setPrevious(null);
            setPreviousFailed(false);
            setOpenPreviousVersion(showingPrevious ? null : attempt.version);
          }}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.accent, fontWeight: '500' }}>Previous draft answers</Text>
        </Pressable>
        {showingPrevious && <View style={{ gap: 12, paddingBottom: 12 }}>
          {previousFailed ? <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>
            Could not load previous answers. Close and open this section to retry.
          </Text> : previous?.version === openPreviousVersion ? (previous.answers.length ? <>
            <Text style={{ color: colors.textSecondary }}>Touch and hold an answer to copy it. Check it against the current form before reusing it.</Text>
            {previous.answers.map(field => (
              <View key={field.label} style={{ gap: 4, paddingTop: 8, borderTopWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.foreground, fontWeight: '500' }}>{field.label}</Text>
                <Text selectable style={{ color: colors.foreground }}>{field.value}</Text>
              </View>
            ))}
          </> : <Text style={{ color: colors.textSecondary }}>The previous text answers already match this draft.</Text>
          ) : <ActivityIndicator accessibilityLabel="Loading previous draft answers" />}
        </View>}
      </View>}
      {replacementIndex === null && displayedReview?.map(({ field, index }, position) => {
        const page = field.providerPage;
        const pageLabel = page ? `Provider page ${page.number} of ${page.total}` : undefined;
        const pageStarts = page && displayedReview[position - 1]?.field.providerPage?.number !== page.number;
        return <React.Fragment key={index}>
          {pageStarts && !reviewNeedsCorrection && <Text accessibilityRole="header"
            style={{ color: colors.textSecondary, fontWeight: '500', borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}>
            {pageLabel}
          </Text>}
          <View style={field.validationHint
            ? { gap: 10, borderWidth: 1, borderColor: colors.accent, borderRadius: 12, padding: 12 }
            : { gap: 10 }}>
            <Text style={{ color: colors.foreground, fontWeight: '500' }}>{field.label}</Text>
            {field.generatedByAi && <Text style={{ color: colors.textSecondary }}>Started with Edutu AI</Text>}
            {field.validationHint && pageLabel && <Text style={{ color: colors.textSecondary }}>{pageLabel}</Text>}
            {field.optional && <Text style={{ color: colors.textSecondary }}>Optional</Text>}
            {field.providerLabel && <Text style={{ color: colors.textSecondary }}>On the provider form: {field.providerLabel}</Text>}
            {!!field.validationHint && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>
              {field.validationHint}
            </Text>}
            {field.maxLength !== undefined && <Text style={{ color: colors.textSecondary }}>
              {exceedsProviderLimit(field)
                ? `Shorten this answer to ${field.maxLength} characters. ${field.value.length} entered.`
                : `${field.value.length} of ${field.maxLength} characters used`}
            </Text>}
            {field.attachment?.type === 'pdf' && <Text style={{ color: colors.textSecondary }}>
              {field.attachment.sourceName ? `PDF attachment based on ${field.attachment.sourceName}` : 'PDF attachment'}
            </Text>}
            {Platform.OS !== 'web' && attempt?.canPreviewCv && !reviewEdit && field.attachment?.type === 'pdf' && !field.attachment.uploadId &&
              <Pressable accessibilityRole="button" onPress={() => void openGeneratedCv(index)} disabled={sending}
                style={{ minHeight: 44, justifyContent: 'center', alignItems: 'flex-start' }}>
                <Text style={{ color: colors.accent }}>{previewingCv === index ? 'Opening CV PDF…' : 'Open or share CV PDF'}</Text>
              </Pressable>}
            {field.attachment?.uploadId ? <Pressable accessibilityRole="link" onPress={() => void openPdf(field.attachment!.uploadId!)}
                style={{ minHeight: 44, justifyContent: 'center', alignItems: 'flex-start' }}>
                <Text style={{ color: colors.accent }}>{field.value}</Text>
              </Pressable>
              : !reviewEdit ? <Text selectable style={{ color: colors.foreground }}>{reviewFieldValue(field)}</Text>
              : field.choices?.length ? <>
                <Pressable accessibilityRole="button" accessibilityLabel={`Change ${field.label}`} accessibilityValue={{ text: reviewFieldValue(field) }}
                  accessibilityState={{ expanded: openReviewField === index, disabled: sending }} disabled={sending}
                  onPress={() => setOpenReviewField(current => current === index ? null : index)}
                  style={{ minHeight: 44, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.accent }}>{reviewFieldValue(field)}</Text>
                </Pressable>
                {openReviewField === index && <ProviderOptions options={field.choices} selected={field.value} selectionMode={field.selectionMode} disabled={sending}
                  onSelect={value => { setReviewValue(index, value); if (!field.selectionMode) setOpenReviewField(null); }} />}
              </> : <TextInput accessibilityLabel={field.label} multiline maxLength={16000}
                editable={!sending} value={field.value} onChangeText={value => setReviewValue(index, value)}
                style={{ minHeight: 76, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.foreground }} />}
            {field.attachment?.uploadId && !reviewEdit && !attempt?.listingClosed && !attempt?.applicantOnly &&
              <Pressable accessibilityRole="button" accessibilityLabel={`Replace PDF for ${field.label}`}
                disabled={sending} style={{ minHeight: 44, justifyContent: 'center' }}
                onPress={() => {
                  if (!attempt) return;
                  setDocuments(null);
                  setError('');
                  scroll.current?.scrollTo({ y: 0, animated: false });
                  setReplacement({ index, version: attempt.version });
                }}>
                <Text style={{ color: colors.accent }}>Replace PDF</Text>
              </Pressable>}
          </View>
        </React.Fragment>;
      })}
      {!hasProviderPages && editDraftAction}
      {reviewEdit && <>
        {reviewChanged && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>
          This draft changed. Copy your edits, then discard them to view the latest draft.
        </Text>}
        <Pressable accessibilityRole="button" disabled={sending || invalidReviewEdit || reviewChanged}
          onPress={saveReview} style={correcting
            ? { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 1,
                borderColor: sending || invalidReviewEdit ? colors.border : colors.accent }
            : undefined}>
          <Text style={{ color: colors.accent, fontWeight: correcting ? '500' : undefined }}>
            {sending ? 'Saving…' : correcting ? 'Save corrections' : 'Save changes'}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={sending} onPress={() => { setReviewEdit(null); setOpenReviewField(null); setError(''); }}>
          <Text style={{ color: colors.accent }}>Discard edits</Text>
        </Pressable>
      </>}
      {replacementIndex === null && attempt?.canSubmit && !reviewEdit && !reviewOverLimit && <Pressable accessibilityRole="button" disabled={sending} onPress={approve}
        style={{ minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.accent, borderRadius: 12 }}>
        <Text style={{ color: colors.accent, fontWeight: '500', textAlign: 'center' }}>{sending ? 'Saving…' : 'Approve and submit with Edutu'}</Text>
      </Pressable>}
      {replacementIndex === null && !reviewEdit && attempt?.canStartManualSubmission && <AnimatedPressable
        accessibilityRole="button" disabled={sending} focusColor={colors.accent}
        onPress={() => void changeManualReview(true)} style={[styles.utilityAction, { justifyContent: 'center' }]}>
        <Text style={[styles.controlText, { color: colors.accent }]}>Submit on the provider site</Text>
      </AnimatedPressable>}
      {attempt?.reviewingOnProvider && !reviewEdit && replacementIndex === null && <>
        {attempt.handoffUrl && <AnimatedPressable accessibilityRole="link" disabled={sending} focusColor={colors.accent}
          onPress={() => void openProvider()} style={styles.utilityAction}>
          <Text style={[styles.controlText, { color: colors.accent }]}>Open provider site</Text>
        </AnimatedPressable>}
        <AnimatedPressable accessibilityRole="button" disabled={sending} focusColor={colors.accent}
          onPress={confirmUseEdutu} style={styles.utilityAction}>
          <Text style={[styles.controlText, { color: colors.textSecondary }]}>Switch back to Edutu</Text>
        </AnimatedPressable>
      </>}
      {attempt?.state === 'submitted' && !attempt.manuallySubmitted && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>
        The provider confirmed this application was submitted.
      </Text>}
      {attempt?.receipt && <Text selectable style={{ color: colors.foreground }}>Provider receipt {attempt.receipt}</Text>}
      {attempt?.state === 'submitted' && attempt.manuallySubmitted &&
        <>
          <Text style={{ color: colors.textSecondary }}>You recorded this submission from the provider site.</Text>
          <Text style={{ color: colors.textSecondary }}>Provider confirmation is unavailable.</Text>
        </>}
      {attempt?.state === 'unconfirmed' && <>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>
          Edutu has not received a provider receipt yet.
        </Text>
        <Text style={{ color: colors.textSecondary }}>
          The provider may have received part or all of your application. Check the provider portal or your email for a receipt. If the portal shows a draft, continue it there.
        </Text>
        {attempt.handoffUrl && <Pressable accessibilityRole="link" onPress={() => void openProvider()}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.accent }}>Open provider site to check</Text>
        </Pressable>}
      </>}
      {attempt?.canCheckReceipt && <Pressable accessibilityRole="button" disabled={sending} onPress={checkReceipt}>
        <Text style={{ color: colors.accent }}>{sending ? 'Checking…' : 'Check for a receipt'}</Text>
      </Pressable>}
      {attempt?.canRecordManualSubmission && !reviewEdit && replacementIndex === null && <Pressable accessibilityRole="button" disabled={sending}
        onPress={confirmManualSubmission} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.accent }}>I submitted on the provider site</Text>
      </Pressable>}
      {attempt?.canRetry && <Pressable accessibilityRole="button" disabled={sending}
        onPress={() => void changeAttempt('retry')} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.accent }}>{attempt.handoffRequired ? 'Recheck provider form' : 'Retry preparation'}</Text>
      </Pressable>}
      {!!error && attachmentVersion === null && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>{error}</Text>}
      {attempt && <View style={[styles.utilityRow, { borderTopColor: colors.border }]}>
        {refreshButton}
        {attempt?.canCancel && !reviewEdit && <AnimatedPressable accessibilityRole="button" disabled={sending}
          focusColor={colors.accent} onPress={confirmCancellation} style={styles.utilityAction}>
          <Text style={[styles.controlText, { color: colors.textSecondary }]}>Stop Auto Apply</Text>
        </AnimatedPressable>}
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 20 },
  progressPanel: { padding: 16, borderRadius: 14, borderWidth: 1, gap: 12 },
  progressHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  progressCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 165 },
  status: { fontSize: 20, lineHeight: 26, fontWeight: '500' },
  statusHint: { fontSize: 14, lineHeight: 20 },
  progressControl: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, gap: 6 },
  controlText: { fontSize: 14, fontWeight: '500' },
  progressSteps: { gap: 7 },
  stepCount: { fontSize: 13, lineHeight: 18 },
  rail: { flexDirection: 'row', gap: 6 },
  railStep: { flex: 1, gap: 6 },
  railSegment: { height: 7, borderRadius: 3, borderWidth: 1 },
  railLabel: { fontSize: 13, lineHeight: 17 },
  answerForm: { gap: 12 },
  question: { fontSize: 18, lineHeight: 24, fontWeight: '500' },
  answer: { padding: 12, borderRadius: 10, borderWidth: 1, fontSize: 16, textAlignVertical: 'top' },
  answerButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10 },
  answerButtonText: { flexShrink: 1, fontSize: 15, fontWeight: '500', textAlign: 'center' },
  utilityRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, paddingTop: 4 },
  utilityAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 },
});
