import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applicationCvKey, subscribeToApplicationCv, type SelectedApplicationCv } from './applicationCvSelection';
import { openTrackedApplication } from '@edutu/core/src/services/applications';
import { ProductApiRequestError, requestProductApi } from '@edutu/core/src/services/productApi';
import { ApplicantBackground } from './ApplicantBackground';
import { AutoApplyCvPicker } from './AutoApplyCvPicker';
import { useTheme } from '../context/ThemeContext';
import { syncAutoApplyActivity } from '../../lib/autoApplyActivity';
import { autoApplyUpgradeOptions, type AutoApplyAllowance } from '../../lib/autoApplyAllowance';

import { autoApplyStatus as labels } from './autoApplyStatus';

type AttemptLaunch = { id: string; state?: keyof typeof labels; version?: number };
type Availability = {
  available: boolean;
  applicantOnly?: boolean;
  providerUnavailable?: boolean;
  profileRequired?: boolean;
  allowance?: AutoApplyAllowance | null;
  attempt: Required<AttemptLaunch> | null;
};

export function AutoApplyAction({ opportunityId, opportunityTitle, userId, getToken }: {
  opportunityId: string;
  opportunityTitle?: string;
  userId: string;
  getToken: Parameters<typeof openTrackedApplication>[1];
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const [data, setData] = useState<Availability | null>(null);
  const [pending, setPending] = useState(false);
  const [checkingAllowance, setCheckingAllowance] = useState(false);
  const [message, setMessage] = useState('');
  const [onboarding, setOnboarding] = useState(false);
  const [choosingCv, setChoosingCv] = useState(false);
  const [resumeTrackerId, setResumeTrackerId] = useState<string | undefined>(undefined);
  const [selectedCv, setSelectedCv] = useState<{ id: string; name?: string } | null>(null);
  const cvKey = applicationCvKey(userId, opportunityId);
  const starting = useRef(false);
  const focus = useRef<AbortController | null>(null);
  const allowance = data?.allowance;
  const upgradeOptions = autoApplyUpgradeOptions(allowance);
  const remaining = allowance ? Math.max(0, allowance.monthlyLimit - allowance.used) : undefined;
  const exhausted = remaining === 0;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const result = await requestProductApi<Availability>(
      `/me/auto-apply/opportunities/${encodeURIComponent(opportunityId)}`, { signal }, getToken,
    ).catch(() => null);
    if (result && !signal?.aborted) setData(result);
    return result;
  }, [getToken, opportunityId]);

  useFocusEffect(useCallback(() => {
    const activeScreen = new AbortController();
    focus.current = activeScreen;
    return () => {
      activeScreen.abort();
      if (focus.current === activeScreen) focus.current = null;
    };
  }, []));

  useFocusEffect(useCallback(() => {
    const abort = new AbortController();
    let selectionChanged = false;
    const unsubscribe = subscribeToApplicationCv(cvKey, cv => {
      selectionChanged = true;
      setSelectedCv(cv);
    });
    void refresh(abort.signal).then(async availability => {
      if (!availability?.available || availability.attempt || abort.signal.aborted || selectionChanged) return;
      const cvId = await AsyncStorage.getItem(cvKey);
      if (abort.signal.aborted || selectionChanged) return;
      setSelectedCv(cvId ? { id: cvId } : null);
      if (!cvId) return;
      const cvs = await requestProductApi<SelectedApplicationCv[]>('/me/auto-apply/cvs', { signal: abort.signal }, getToken);
      if (abort.signal.aborted || selectionChanged) return;
      const match = Array.isArray(cvs) ? cvs.find(cv => cv.id === cvId) : undefined;
      if (match) setSelectedCv(match);
    }).catch(() => undefined);
    return () => {
      abort.abort();
      unsubscribe();
    };
  }, [cvKey, getToken, refresh]));

  function openAttempt({ id, state, version }: AttemptLaunch, launchFocus = focus.current) {
    if (state && Object.hasOwn(labels, state) && version && Number.isSafeInteger(version) && version > 0) {
      if (focus.current) {
        setData(current => !current || (current.attempt?.version ?? 0) >= version
          ? current : { ...current, attempt: { id, state, version } });
      }
      void syncAutoApplyActivity({ id, state, version, ...(opportunityTitle ? { title: opportunityTitle } : {}) }, { owner: userId });
    }
    if (launchFocus && focus.current === launchFocus) {
      router.push({ pathname: '/(app)/auto-apply/[id]', params: { id } });
    }
  }

  async function checkAllowance() {
    if (checkingAllowance) return;
    const signal = focus.current?.signal;
    setCheckingAllowance(true);
    setMessage('');
    try {
      const current = await refresh(signal);
      if (!current && !signal?.aborted) setMessage('Could not check your allowance. Try again.');
    } finally {
      setCheckingAllowance(false);
    }
  }

  async function start(profileSaved = false, trackerIdToResume?: string) {
    if (!data?.available || exhausted || starting.current || (choosingCv && !trackerIdToResume)) return;
    if (data.profileRequired && !profileSaved) {
      setOnboarding(true);
      return;
    }
    setOnboarding(false);
    const launchFocus = focus.current;
    starting.current = true;
    setPending(true);
    setMessage('');
    let cvId: string | null = null;
    let trackerId = trackerIdToResume;
    try {
      cvId = await AsyncStorage.getItem(cvKey);
      if (!trackerId) {
        const tracker = await openTrackedApplication(opportunityId, getToken);
        if (!tracker || tracker.status !== 'draft') throw new Error();
        trackerId = tracker.id;
      }
      const started = await requestProductApi<AttemptLaunch>(
        `/me/auto-apply/applications/${encodeURIComponent(trackerId)}`,
        { method: 'POST', ...(cvId ? { body: JSON.stringify({ cvId }) } : {}) }, getToken, 15_000, { throwOnError: true },
      );
      if (started?.id) {
        openAttempt(started, launchFocus);
        return;
      }
      throw new Error('Attempt was not returned');
    } catch (error) {
      const result = await refresh();
      if (result?.providerUnavailable) {
        setOnboarding(false);
        return;
      }
      if (result?.allowance && result.allowance.used >= result.allowance.monthlyLimit) {
        setOnboarding(false);
        return;
      }
      if (result?.available && result.profileRequired && !result.attempt) {
        setOnboarding(true);
        return;
      }
      if (result?.attempt) openAttempt(result.attempt, launchFocus);
      else if (cvId && trackerId && error instanceof ProductApiRequestError && error.status === 404) {
        setMessage('The selected CV could not be loaded. Choose another CV or start without one.');
        setResumeTrackerId(trackerId);
        setChoosingCv(true);
      } else setMessage(error instanceof ProductApiRequestError && error.status === 429
        ? 'You’ve reached your monthly Auto Apply limit.'
        : error instanceof ProductApiRequestError && error.status === 503
          ? 'Auto Apply could not check the provider’s form. Try again shortly.'
          : 'Could not confirm that Auto Apply started. You can try again.');
    } finally {
      starting.current = false;
      setPending(false);
    }
  }

  if (data?.applicantOnly && !data.attempt) return <Text style={{ color: colors.textSecondary }}>
    This provider asks you to complete and submit your own application. Use Apply Now to open its website.
  </Text>;
  if (data?.providerUnavailable && !data.attempt) return <Text style={{ color: colors.textSecondary }}>
    Auto Apply is unavailable for this opportunity right now. Use Apply Now to continue.
  </Text>;
  if (!data?.available && !data?.attempt) return null;
  const startDisabled = pending || (choosingCv && !data.attempt);
  return <View style={{ borderRadius: 12, padding: 14, gap: 6, backgroundColor: colors.card }}>
    {(!exhausted || data.attempt) && <Pressable accessibilityRole="button" disabled={startDisabled}
      accessibilityState={{ busy: pending, disabled: startDisabled }}
      style={[styles.start, { backgroundColor: colors.background, borderColor: startDisabled ? colors.border : colors.accent }]}
      onPress={() => { if (data.attempt) openAttempt(data.attempt); else void start(); }}>
      <Text style={[styles.startLabel, { color: startDisabled ? colors.textSecondary : colors.foreground }]}>
        {pending ? 'Starting…' : data.attempt ? 'Open Auto Apply' : 'Auto Apply with Edutu'}
      </Text>
      {!startDisabled && <ArrowRight size={18} color={colors.foreground} />}
    </Pressable>}
    {data.available && !data.attempt && !exhausted && !onboarding && (choosingCv
      ? <AutoApplyCvPicker userId={userId} opportunityId={opportunityId} getToken={getToken}
          startAfterSelection={Boolean(resumeTrackerId)}
          onClose={selection => {
            setChoosingCv(false);
            setResumeTrackerId(undefined);
            if (selection === undefined) return;
            if (resumeTrackerId && focus.current) {
              void start(false, resumeTrackerId);
              return;
            }
            setMessage(selection ? 'CV selected for this application.' : 'CV selection cleared.');
          }} />
      : <Pressable accessibilityRole="button" disabled={pending} onPress={() => { setMessage(''); setChoosingCv(true); }}>
          <Text style={{ color: colors.accent, paddingVertical: 10 }}>
            {selectedCv?.name ? `Change CV · ${selectedCv.name}` : selectedCv ? 'Review selected CV' : 'Choose a CV'}
          </Text>
        </Pressable>)}
    {allowance && !data.attempt && <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground }}>
        {exhausted ? 'Monthly Auto Apply limit reached' : `${remaining} of ${allowance.monthlyLimit} Auto Apply attempts left this month`}
      </Text>
      {exhausted && <Text style={{ color: colors.textSecondary }}>
        Resets {new Date(allowance.resetAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' })} (UTC)
      </Text>}
      {exhausted && <Pressable accessibilityRole="button" accessibilityState={{ busy: checkingAllowance }}
        disabled={checkingAllowance} onPress={() => void checkAllowance()}
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.accent }}>{checkingAllowance ? 'Checking allowance…' : 'Refresh allowance'}</Text>
      </Pressable>}
      {!!upgradeOptions.length && <>
        <Text style={{ color: colors.textSecondary }}>
          {upgradeOptions.map(option =>
            `${option.tier[0].toUpperCase()}${option.tier.slice(1)} includes ${option.monthlyLimit} per month`).join(' · ')}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/paywall', params: { source: 'auto-apply' } })}>
          <Text style={{ color: colors.accent, fontWeight: '700', paddingVertical: 8 }}>View plans</Text>
        </Pressable>
      </>}
    </View>}
    {data.attempt && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>
      {labels[data.attempt.state]}
    </Text>}
    {data.available && data.profileRequired === false && !data.attempt && !onboarding && !choosingCv &&
      <Pressable accessibilityRole="button" disabled={pending} onPress={() => router.push('/profile/application')}>
        <Text style={{ color: colors.accent, paddingVertical: 10 }}>Edit application profile</Text>
      </Pressable>}
    {onboarding && !exhausted && <View style={{ gap: 8 }}>
      <Text style={{ color: colors.foreground }}>
        Review your saved details. Add education, background or a statement of purpose to get started.
      </Text>
      <ApplicantBackground onReady={() => void start(true)} />
    </View>}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>{message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  start: { minHeight: 48, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  startLabel: { flex: 1, fontWeight: '700' },
});
