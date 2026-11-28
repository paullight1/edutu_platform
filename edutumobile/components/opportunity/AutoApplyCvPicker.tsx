import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestProductApi, type GetAuthToken } from '@edutu/core/src/services/productApi';
import { useTheme } from '../context/ThemeContext';
import { applicationCvKey, saveApplicationCvSelection, subscribeToApplicationCv, type SelectedApplicationCv } from './applicationCvSelection';

type SavedCv = SelectedApplicationCv;

export function AutoApplyCvPicker({ userId, opportunityId, getToken, onClose, startAfterSelection = false }: {
  userId: string;
  opportunityId: string;
  getToken: GetAuthToken;
  onClose: (selection?: SavedCv | null) => void;
  startAfterSelection?: boolean;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const key = applicationCvKey(userId, opportunityId);
  const [cvs, setCvs] = useState<SavedCv[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const activeSave = useRef(false);

  useFocusEffect(useCallback(() => {
    const abort = new AbortController();
    setCvs(null);
    setMessage('');
    let selectionChanged = false;
    const unsubscribe = subscribeToApplicationCv(key, cv => {
      selectionChanged = true;
      setSelected(cv?.id ?? null);
    });
    Promise.all([
      requestProductApi<SavedCv[]>('/me/auto-apply/cvs', { signal: abort.signal }, getToken),
      AsyncStorage.getItem(key),
    ]).then(([items, saved]) => {
      if (abort.signal.aborted) return;
      if (!Array.isArray(items)) throw new Error('Could not load CVs');
      setCvs(items);
      if (!selectionChanged) setSelected(saved);
    }).catch(() => {
      if (!abort.signal.aborted) setMessage('Could not load saved CVs.');
    });
    return () => { abort.abort(); unsubscribe(); };
  // Retry the focused read even when the CV selection key has not changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, key, reload]));

  async function select(cv: SavedCv | null) {
    if (activeSave.current) return;
    activeSave.current = true;
    setSaving(true);
    setMessage('');
    try {
      await saveApplicationCvSelection(key, cv);
      onClose(cv);
    } catch {
      setMessage('Could not save this CV selection. Try again.');
    } finally {
      activeSave.current = false;
      setSaving(false);
    }
  }

  const link = { color: colors.accent, paddingVertical: 12 };
  return <View style={{ gap: 6 }}>
    <Text accessibilityRole="header" style={{ color: colors.foreground, fontWeight: '700' }}>CV for this application</Text>
    {!!cvs?.length && <Text style={{ color: colors.textSecondary }}>
      {startAfterSelection ? 'Select a CV to start Auto Apply.' : 'Edutu includes your CV when the provider asks for one.'}
    </Text>}
    {!cvs && !message && <ActivityIndicator accessibilityLabel="Loading saved CVs" />}
    {!cvs && message && <Text accessibilityRole="button" onPress={() => setReload(value => value + 1)} style={link}>Reload saved CVs</Text>}
    {cvs?.length === 0 && <Text style={{ color: colors.textSecondary }}>No saved CVs are available for Auto Apply.</Text>}
    {cvs?.map(cv => <Pressable key={cv.id} accessibilityRole={startAfterSelection ? 'button' : 'radio'} accessibilityLabel={startAfterSelection ? `Start with ${cv.name}` : cv.name}
      accessibilityState={{ ...(startAfterSelection ? {} : { checked: selected === cv.id }), disabled: saving }} disabled={saving}
      onPress={() => void select(cv)} style={{ minHeight: 44, padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: selected === cv.id ? colors.accent : colors.foreground }}>{startAfterSelection ? `Start with ${cv.name}` : cv.name}</Text>
    </Pressable>)}
    {Boolean(cvs && selected && !cvs.some(cv => cv.id === selected)) && <Text style={{ color: colors.textSecondary }}>The previously selected CV is unavailable.</Text>}
    <Pressable accessibilityRole="button" disabled={saving} onPress={() => void select(null)}
      style={startAfterSelection ? { minHeight: 44, alignItems: 'center', justifyContent: 'center',
        borderRadius: 10, borderWidth: 1, borderColor: colors.accent, marginTop: 6 } : undefined}>
      <Text style={[link, startAfterSelection && { fontWeight: '700' }]}>{startAfterSelection ? 'Start without a CV' : 'Use no CV'}</Text>
    </Pressable>
    <Pressable accessibilityRole="link" disabled={saving} onPress={() => router.push('/cv')}>
      <Text style={link}>Manage CVs</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={saving} onPress={() => { if (!activeSave.current) onClose(); }}>
      <Text style={link}>Cancel CV selection</Text>
    </Pressable>
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>{message}</Text>}
  </View>;
}
