import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react-native';
import { submitOpportunity } from '@edutu/core/src/services/opportunitySubmissions';
import { useTheme } from '../../../components/context/ThemeContext';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';

const CATEGORIES = ['scholarship', 'fellowship', 'internship', 'job', 'grant', 'competition', 'program', 'other'];

// Module-level on purpose. This used to be declared inside the screen, which
// makes it a brand-new component type on every parent render — React then
// remounts the TextInput, dropping focus (and the keyboard) mid-typing. It
// reads the theme itself so call sites don't have to thread palette props.
function Field({
    label,
    value,
    onChange,
    placeholder,
    multiline,
    keyboardType,
    autoCapitalize,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    multiline?: boolean;
    keyboardType?: 'default' | 'url';
    autoCapitalize?: 'none' | 'sentences';
}) {
    const { colors, isDark } = useTheme();
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
    return (
        <View style={styles.field}>
            <Text style={[styles.label, { color: textSecondary }]}>{label}</Text>
            <TextInput
                style={[
                    styles.input,
                    multiline && styles.inputMultiline,
                    { backgroundColor: inputBg, color: colors.foreground, borderColor },
                ]}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor={textSecondary}
                multiline={multiline}
                keyboardType={keyboardType}
                autoCapitalize={autoCapitalize}
                autoCorrect={!keyboardType}
            />
        </View>
    );
}

export default function SubmitOpportunityScreen() {
    const { t } = useTranslation('opps');
    const router = useRouter();
    const { user } = useUser();
    const { getToken } = useAuth();
    const { colors, isDark } = useTheme();

    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';

    const [form, setForm] = useState({
        title: '',
        organization: '',
        category: '',
        summary: '',
        description: '',
        location: '',
        isRemote: false,
        eligibility: '',
        benefits: '',
        deadline: '',
        applyUrl: '',
        sourceUrl: '',
    });
    const [submitting, setSubmitting] = useState(false);

    const set = (key: keyof typeof form, value: string | boolean) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSubmit = async () => {
        if (!user) {
            Alert.alert(t('submit.signInTitle'), t('submit.signInMessage'));
            return;
        }
        if (form.title.trim().length < 3) {
            Alert.alert(t('submit.missingTitle'), t('submit.missingTitleMessage'));
            return;
        }
        if (form.applyUrl && !/^https?:\/\//i.test(form.applyUrl.trim())) {
            Alert.alert(t('submit.invalidUrlTitle'), t('submit.invalidUrlMessage'));
            return;
        }

        setSubmitting(true);
        try {
            await submitOpportunity(
                {
                    title: form.title,
                    organization: form.organization,
                    category: form.category,
                    summary: form.summary,
                    description: form.description,
                    location: form.location,
                    isRemote: form.isRemote,
                    eligibility: form.eligibility,
                    benefits: form.benefits,
                    deadline: form.deadline ? new Date(form.deadline).toISOString() : undefined,
                    applyUrl: form.applyUrl,
                    sourceUrl: form.sourceUrl,
                },
                getToken,
            );
            Alert.alert(t('submit.successTitle'), t('submit.successMessage'), [
                { text: t('submit.viewSubmissions'), onPress: () => router.replace('/opportunities/submissions') },
                { text: t('submit.done'), onPress: () => router.back() },
            ]);
        } catch (err: any) {
            Alert.alert(t('submit.failedTitle'), err?.message || t('submit.failedMessage'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title={t('submit.title')} subtitle={t('submit.subtitle')} showBack />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.screen}
            >
                <ScrollView
                    contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={[styles.intro, { backgroundColor: inputBg, borderColor }]}>
                        <Text style={[styles.introText, { color: textSecondary }]}>
                            {t('submit.intro')}
                        </Text>
                    </View>

                    <Field label={t('submit.fields.title')} value={form.title} onChange={(v) => set('title', v)} placeholder={t('submit.fields.titlePlaceholder')} />
                    <Field label={t('submit.fields.organization')} value={form.organization} onChange={(v) => set('organization', v)} placeholder={t('submit.fields.organizationPlaceholder')} />

                    <View style={styles.field}>
                        <Text style={[styles.label, { color: textSecondary }]}>{t('submit.fields.category')}</Text>
                        <View style={styles.chips}>
                            {CATEGORIES.map((cat) => {
                                const active = form.category === cat;
                                return (
                                    <Pressable
                                        key={cat}
                                        onPress={() => set('category', active ? '' : cat)}
                                        style={[
                                            styles.chip,
                                            { borderColor, backgroundColor: active ? colors.accent : 'transparent' },
                                        ]}
                                    >
                                        <Text style={[styles.chipText, { color: active ? '#fff' : textSecondary }]}>
                                            {t(`submit.categories.${cat}`)}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>

                    <Field label={t('submit.fields.summary')} value={form.summary} onChange={(v) => set('summary', v)} placeholder={t('submit.fields.summaryPlaceholder')} />
                    <Field label={t('submit.fields.description')} value={form.description} onChange={(v) => set('description', v)} placeholder={t('submit.fields.descriptionPlaceholder')} multiline />

                    <View style={styles.rowBetween}>
                        <Text style={[styles.label, { color: textSecondary }]}>{t('submit.fields.remote')}</Text>
                        <Switch
                            value={form.isRemote}
                            onValueChange={(v) => set('isRemote', v)}
                            trackColor={{ true: colors.accent }}
                        />
                    </View>

                    <Field label={t('submit.fields.location')} value={form.location} onChange={(v) => set('location', v)} placeholder={t('submit.fields.locationPlaceholder')} />
                    <Field label={t('submit.fields.eligibility')} value={form.eligibility} onChange={(v) => set('eligibility', v)} placeholder={t('submit.fields.eligibilityPlaceholder')} multiline />
                    <Field label={t('submit.fields.benefits')} value={form.benefits} onChange={(v) => set('benefits', v)} placeholder={t('submit.fields.benefitsPlaceholder')} multiline />
                    <Field label={t('submit.fields.deadline')} value={form.deadline} onChange={(v) => set('deadline', v)} placeholder={t('submit.fields.deadlinePlaceholder')} />
                    <Field label={t('submit.fields.applyUrl')} value={form.applyUrl} onChange={(v) => set('applyUrl', v)} placeholder="https://" keyboardType="url" autoCapitalize="none" />
                    <Field label={t('submit.fields.sourceUrl')} value={form.sourceUrl} onChange={(v) => set('sourceUrl', v)} placeholder="https://" keyboardType="url" autoCapitalize="none" />

                    <Pressable
                        style={[styles.submitBtn, { backgroundColor: colors.accent }, submitting && { opacity: 0.7 }]}
                        onPress={handleSubmit}
                        disabled={submitting}
                    >
                        {submitting ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Send size={18} color="#fff" />
                                <Text style={styles.submitText}>{t('submit.cta')}</Text>
                            </>
                        )}
                    </Pressable>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    intro: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 18 },
    introText: { fontSize: 13, lineHeight: 19 },
    field: { marginBottom: 16 },
    label: { fontSize: 12.5, fontWeight: '700', marginBottom: 7 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14.5 },
    inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 },
    chipText: { fontSize: 12.5, fontWeight: '700' },
    submitBtn: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        paddingVertical: 16,
        borderRadius: 16,
    },
    submitText: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
});
