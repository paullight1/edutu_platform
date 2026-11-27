import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, Text, TextInput, View } from 'react-native';
import { getDocumentAsync } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { ProductApiRequestError, requestProductApi } from '@edutu/core/src/services/productApi';
import { useTheme } from '../context/ThemeContext';

type ApplicationContact = { name: string; email: string; phone?: string };
type ApplicationEducation = { school: string; degree: string; major: string; graduationYear: string };
type Profile = { background: string; statement: string; version: number; contact?: ApplicationContact; education?: ApplicationEducation };
type ProfileResponse = Profile & { suggestedBackground?: string; suggestedExperience?: string };
const educationFields = [
  ['school', 'School or university'], ['degree', 'Degree'],
  ['major', 'Field of study'], ['graduationYear', 'Graduation year'],
] as const;
const path = '/me/auto-apply/profile';
const backgroundLimit = 8000;

const statementTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];
const summaryPrompt = [
  'Prepare a short background summary I can review for scholarship, internship, or fellowship applications.',
  'Use only facts I explicitly shared. Group them under Education, Work and volunteering, Projects and achievements, and Skills and interests. Include dates and outcomes only when I provided them. Skip empty sections.',
  'Leave out guesses, contact details, identity numbers, and unrelated conversations. Use bullet points under 500 words.',
].join('\n\n');

export function ApplicantBackground({ onReady, initiallyOpen = false }: {
  onReady?: () => void;
  initiallyOpen?: boolean;
} = {}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen || Boolean(onReady));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showSummaryPrompt, setShowSummaryPrompt] = useState(false);
  const [showEducation, setShowEducation] = useState(Boolean(onReady));
  const [summaryDraft, setSummaryDraft] = useState('');
  const [summaryFeedback, setSummaryFeedback] = useState('');
  const [imported, setImported] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    requestProductApi<ProfileResponse>(`${path}?includeSavedDetails=true`, { signal: abort.signal }).then(result => {
      if (abort.signal.aborted) return;
      if (!result) {
        setMessage('Could not load your application profile.');
        return;
      }
      const { background, statement, version, suggestedBackground, suggestedExperience, contact, education } = result;
      const suggestion = version === 0 && !background ? (suggestedExperience ?? suggestedBackground) : undefined;
      setPrefilled(version === 0 && Boolean(suggestion || contact?.name || contact?.email || Object.values(education ?? {}).some(Boolean)));
      setProfile({ background: suggestion ?? background, statement, version, contact, education });
    }).catch(() => { if (!abort.signal.aborted) setMessage('Could not load your application profile.'); });
    return () => abort.abort();
  }, [open, reload]);
  async function importStatement() {
    if (!profile || saving || importing) return;
    let cachedUri: string | undefined;
    setImporting(true);
    setMessage('');
    try {
      const picked = await getDocumentAsync({ type: statementTypes, copyToCacheDirectory: true });
      if (picked.canceled) return;
      const file = picked.assets[0];
      if (Platform.OS !== 'web') cachedUri = file?.uri;
      if (!file || (file.size !== undefined && file.size > 2 * 1024 * 1024)) {
        setMessage('Choose a PDF, DOCX or text file up to 2 MB.');
        return;
      }
      const form = new FormData();
      if (Platform.OS === 'web' && file.file) {
        form.append('file', file.file, file.name);
      } else {
        const extension = file.name.split('.').at(-1)?.toLowerCase();
        const fallback = extension === 'pdf' ? statementTypes[0]
          : extension === 'docx' ? statementTypes[1] : statementTypes[2];
        form.append('file', { uri: file.uri, name: file.name, type: file.mimeType && statementTypes.includes(file.mimeType) ? file.mimeType : fallback } as unknown as Blob);
      }
      const result = await requestProductApi<{ statement: string }>(path + '/statement-import', {
        method: 'POST', body: form,
      }, undefined, 20_000, { throwOnError: true });
      if (!result?.statement) throw new Error();
      if (profile.statement.trim()) setImported(result.statement);
      else setProfile(current => current && ({ ...current, statement: result.statement }));
      setMessage('Statement text imported. Review it before saving.');
    } catch (error) {
      setMessage(error instanceof ProductApiRequestError && error.status === 422
        ? 'Choose a readable document with up to 16,000 characters.'
        : 'Could not import this file. You can paste the statement text instead.');
    } finally {
      if (cachedUri) {
        try {
          const cacheCopy = new File(cachedUri);
          if (cacheCopy.uri.startsWith(Paths.cache.uri.replace(/\/?$/, '/')) && cacheCopy.exists) cacheCopy.delete();
        } catch {
          // The document picker cache can also be cleared by the OS.
        }
      }
      setImporting(false);
    }
  }

  async function save() {
    if (!profile || saving || importing || imported || summaryDraft.trim()) return;
    const email = profile.contact?.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage('Enter a valid application email or leave it blank.');
      return;
    }
    const phone = profile.contact?.phone?.trim();
    if (phone) {
      const digits = phone.replace(/\D/g, '').length;
      if (!/^\+?[\d ().-]+$/.test(phone) || digits < 7 || digits > 15) {
        setMessage('Enter a phone number with 7 to 15 digits or leave it blank.');
        return;
      }
    }
    const year = profile.education?.graduationYear.trim();
    if (year && !/^[1-9]\d{3}$/.test(year)) {
      setShowEducation(true);
      setMessage('Enter your graduation year as four digits or leave it blank.');
      return;
    }
    setSaving(true);
    try {
      const result = await requestProductApi<{ version: number }>(path, {
        method: 'PUT', body: JSON.stringify(profile),
      });
      if (!result) throw new Error();
      setProfile({ ...profile, version: result.version });
      setPrefilled(false);
      setMessage('Application profile saved.');
      onReady?.();
    } catch {
      setMessage('Could not save. Your draft is still here. Retry or reload the saved version.');
    } finally { setSaving(false); }
  }

  async function shareSummaryPrompt() {
    setSummaryFeedback('');
    try {
      await Share.share({ title: 'Edutu application background prompt', message: summaryPrompt });
    } catch {
      setSummaryFeedback('You can select and copy the prompt above.');
    }
  }

  const draftSummary = summaryDraft.trim();
  const existingBackground = profile?.background.trim() ?? '';
  const combinedBackground = [existingBackground, draftSummary].filter(Boolean).join('\n\n');
  const summaryFits = combinedBackground.length <= backgroundLimit;
  const hasProfileDetails = Boolean(profile?.background.trim() || profile?.statement.trim() ||
    Object.values(profile?.education ?? {}).some(value => value.trim()));
  function addSummary() {
    if (!draftSummary || !summaryFits || saving || importing) return;
    setProfile(current => current && ({ ...current, background: combinedBackground }));
    setSummaryDraft('');
    setSummaryFeedback('Summary added to your background. Review it before saving.');
  }
  const link = { color: colors.accent, paddingVertical: 10 };
  if (!open) return <Text accessibilityRole="button" onPress={() => setOpen(true)} style={link}>Edit application background</Text>;
  return <View style={{ gap: 10 }}>
    {prefilled && <Text style={{ color: colors.textSecondary }}>
      We added saved details from your Edutu profile. Review or edit them before saving.
    </Text>}
    {profile?.contact && <View style={{ gap: 8 }}>
      <Text style={{ color: colors.foreground, fontWeight: '600' }}>Application contact details</Text>
      <Text style={{ color: colors.textSecondary }}>Optional. Edutu uses these details when a form asks for them.</Text>
      {(['name', 'email', 'phone'] as const).map(field => {
        const isEmail = field === 'email';
        const label = isEmail ? 'Application email' : field === 'phone' ? 'Application phone number' : 'Application name';
        return <TextInput key={field} accessibilityLabel={label} placeholder={label}
          placeholderTextColor={colors.textSecondary} autoCapitalize={field === 'name' ? 'words' : 'none'}
          autoCorrect={false} keyboardType={isEmail ? 'email-address' : field === 'phone' ? 'phone-pad' : 'default'}
          value={profile.contact?.[field] ?? ''} maxLength={isEmail ? 254 : field === 'phone' ? 40 : 200} editable={!saving && !importing}
          onChangeText={value => {
            setProfile(current => current?.contact ? { ...current, contact: { ...current.contact, [field]: value } } : current);
            setMessage('');
          }}
          style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.foreground }} />;
      })}
    </View>}
    {profile?.education && <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showEducation }} onPress={() => setShowEducation(current => !current)}
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.accent, fontWeight: '700' }}>Education details</Text>
      </Pressable>
      {showEducation && <>
        <Text style={{ color: colors.textSecondary }}>Optional. Edutu uses these details when a form asks for them.</Text>
        {educationFields.map(([field, label]) => <View key={field} style={{ gap: 4 }}>
          <Text style={{ color: colors.foreground }}>{label}</Text>
          <TextInput accessibilityLabel={label} value={profile.education?.[field]}
            placeholder={field === 'graduationYear' ? 'YYYY' : undefined}
            placeholderTextColor={colors.textSecondary} keyboardType={field === 'graduationYear' ? 'number-pad' : 'default'}
            maxLength={field === 'graduationYear' ? 4 : 160} editable={!saving && !importing}
            onChangeText={value => {
              setProfile(current => current?.education ? { ...current, education: { ...current.education, [field]: value } } : current);
              setMessage('');
            }}
            style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.foreground }} />
        </View>)}
      </>}
    </View>}
    {profile && (['background', 'statement'] as const).map(field => {
      const label = field === 'background' ? 'Education, experience and achievements' : 'Statement of purpose';
      return <View key={field}>
        <Text style={{ color: colors.foreground }}>{label}</Text>
        <TextInput accessibilityLabel={label} multiline editable={!saving && !importing}
          placeholder={field === 'background' ? 'Your studies, experience, achievements and interests' : 'Paste text or import a file below'}
          placeholderTextColor={colors.textSecondary}
          maxLength={field === 'background' ? backgroundLimit : 16000} value={profile[field]}
          onChangeText={value => { setProfile({ ...profile, [field]: value }); setMessage(''); }}
          style={{ minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.foreground, textAlignVertical: 'top' }} />
      </View>;
    })}
    {profile && <>
      <Pressable accessibilityRole="button" disabled={saving || importing || !!imported} onPress={importStatement}>
        <Text style={link}>{importing ? 'Reading statement…' : 'Import statement file'}</Text>
      </Pressable>
      <Text style={{ color: colors.textSecondary }}>PDF, DOCX or text, up to 2 MB. Edutu reads the file and saves the text only when you tap Save.</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showSummaryPrompt }}
        onPress={() => setShowSummaryPrompt(current => !current)}>
        <Text style={link}>Use a summary from ChatGPT or another AI</Text>
      </Pressable>
      {showSummaryPrompt && <View style={{ gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 }}>
        <Text style={{ color: colors.textSecondary }}>Copy the prompt into your AI chat. Check the facts in its reply and paste only the relevant summary here.</Text>
        <Text selectable style={{ color: colors.foreground }}>{summaryPrompt}</Text>
        <Pressable accessibilityRole="button" onPress={() => void shareSummaryPrompt()}>
          <Text style={link}>Share prompt</Text>
        </Pressable>
        <TextInput accessibilityLabel="Summary from your AI chat" multiline
          placeholder="Paste your reviewed summary" placeholderTextColor={colors.textSecondary}
          editable={!saving && !importing} maxLength={backgroundLimit}
          value={summaryDraft} onChangeText={value => { setSummaryDraft(value); setSummaryFeedback(''); }}
          style={{ minHeight: 96, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.foreground, textAlignVertical: 'top' }} />
        {!summaryFits && <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary }}>
          Shorten your summary or background by {combinedBackground.length - backgroundLimit} characters to add it.
        </Text>}
        <Pressable accessibilityRole="button"
          disabled={!draftSummary || !summaryFits || saving || importing} onPress={addSummary}>
          <Text style={{ ...link, opacity: draftSummary && summaryFits ? 1 : 0.55 }}>Add summary to background</Text>
        </Pressable>
        {!!draftSummary && <Pressable accessibilityRole="button" disabled={saving || importing}
          onPress={() => { setSummaryDraft(''); setSummaryFeedback(''); }}>
          <Text style={link}>Discard summary</Text>
        </Pressable>}
        {!!summaryFeedback && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>{summaryFeedback}</Text>}
      </View>}
    </>}
    {imported && <>
      <Text style={{ color: colors.foreground }}>Replace the existing statement with text from this file?</Text>
      <Pressable accessibilityRole="button" onPress={() => {
        setProfile(current => current && ({ ...current, statement: imported }));
        setImported(null);
      }}><Text style={link}>Replace statement</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => { setImported(null); setMessage(''); }}>
        <Text style={link}>Keep current statement</Text>
      </Pressable>
    </>}
    {!profile && !message && <ActivityIndicator />}
    {!!draftSummary && !showSummaryPrompt && <Text style={{ color: colors.textSecondary }}>
      Open your AI summary to add or discard it before saving.
    </Text>}
    {profile && <Pressable accessibilityRole="button" accessibilityState={{ busy: saving }}
      disabled={saving || importing || !!imported || !!draftSummary || Boolean(onReady && !hasProfileDetails)}
      onPress={save} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={link}>{saving ? 'Saving…' : onReady ? 'Save and start Auto Apply' : 'Save for future applications'}</Text>
    </Pressable>}
    {message && <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>{message}</Text>}
    {(message.startsWith('Could not load your application profile') || message.startsWith('Could not save.')) && <Text accessibilityRole="button" style={link}
      onPress={() => { setMessage(''); setReload(value => value + 1); }}>Reload saved version</Text>}
  </View>;
}
