import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Alert,
    ActivityIndicator,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../components/context/ThemeContext';
import { CountrySelectModal } from '../../../components/ui/CountrySelectModal';
import { Card } from '../../../components/ui/Card';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { BrandedLoader } from '../../../components/ui/BrandedLoader';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
    User,
    GraduationCap,
    Globe,
    Save,
    BookOpen,
    Award,
    Pencil,
    School,
    ChevronRight,
} from 'lucide-react-native';
import { Avatar } from '../../../components/ui/Avatar';
import { useCreditRewards } from '@edutu/core/src/hooks/useCreditRewards';
import { useToast } from '../../../components/context/ToastContext';
import { useTranslation } from 'react-i18next';

interface ProfileData {
    full_name?: string;
    school?: string;
    major?: string;
    cgpa?: string;
    country?: string;
}

export default function EditProfileScreen() {
    const { user } = useUser();
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation('profile');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [profile, setProfile] = useState<ProfileData>({});
    const [focusedField, setFocusedField] = useState<string | null>(null);
    const [countryPickerOpen, setCountryPickerOpen] = useState(false);

    const { show: showToast } = useToast();
    const { award } = useCreditRewards(supabase, user?.id || null, {
        onEarned: (amount) => {
            showToast({
                emoji: '🎯',
                variant: 'success',
                message: t('edit.creditsEarned', { count: amount }),
            });
        },
    });
    // Referrals now have a dedicated flow (/referrals + the redeem/settle
    // RPCs in migration 032). REFER_FRIEND credits are granted server-side at
    // referral settlement, not via a self-serve award() call here.

    useEffect(() => {
        if (!user) return;
        const loadProfile = async () => {
        try {
            // Read the row directly from Supabase. The RLS policy authorizes it
            // via current_app_user_id() = user_id (the Clerk sub carried by the
            // supabase-templated token), so the row is keyed by the raw Clerk
            // id — the same row every other Supabase-backed screen reads and
            // that the chat backend seeds. (The product API path was returning
            // 401s and silently falling back to an empty profile.)
            const { data } = await supabase
                .from('profiles')
                .select('full_name, school, major, cgpa, country')
                .eq('user_id', user!.id)
                .maybeSingle();

            // "Edutu User" is the backend's placeholder name for a freshly
            // seeded row — prefer the real Clerk name over it.
            const storedName = data?.full_name && data.full_name !== 'Edutu User'
                ? data.full_name
                : '';

            setProfile({
                full_name: storedName || user?.fullName || '',
                school: data?.school || '',
                major: data?.major || '',
                cgpa: data?.cgpa != null ? String(data.cgpa) : '',
                country: data?.country || '',
            });
        } catch (error) {
            console.error('Error loading profile:', error);
            setProfile({
                full_name: user?.fullName || '',
                school: '',
                major: '',
                cgpa: '',
                country: '',
            });
        } finally {
            setLoading(false);
        }
        };
        loadProfile();
    }, [user]);

    async function handleSave() {
        if (!user) return;
        setSaving(true);
        try {
            const toNullable = (v?: string) => {
                const trimmed = v?.trim();
                return trimmed ? trimmed : null;
            };
            const parsedCgpa = profile.cgpa ? Number.parseFloat(profile.cgpa) : null;
            const cgpaValue =
                parsedCgpa != null && !Number.isNaN(parsedCgpa) ? parsedCgpa : null;

            // Persist straight to Supabase, keyed by the raw Clerk id. RLS
            // authorizes the write (current_app_user_id() = user_id) and it
            // lands on the row the rest of the app reads — no dependence on the
            // product API, which was rejecting the mobile token (401 → the old
            // "silent not-saving" bug).
            const { error } = await supabase
                .from('profiles')
                .upsert(
                    {
                        user_id: user.id,
                        full_name: toNullable(profile.full_name),
                        country: toNullable(profile.country),
                        school: toNullable(profile.school),
                        major: toNullable(profile.major),
                        cgpa: cgpaValue,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'user_id' },
                );

            if (error) throw error;

            // Mirror saved fields into Clerk unsafeMetadata so screens that read
            // it (profile header, personalization) stay in sync. Non-fatal.
            try {
                const meta = { ...(user.unsafeMetadata as Record<string, unknown>) };
                if (toNullable(profile.country)) meta.country = profile.country!.trim();
                if (toNullable(profile.school)) meta.schoolName = profile.school!.trim();
                if (toNullable(profile.major)) meta.education = profile.major!.trim();
                await user.update({ unsafeMetadata: meta });
            } catch (metaError) {
                console.warn('Clerk metadata mirror failed:', metaError);
            }

            void award('PROFILE_COMPLETE');
            Alert.alert(t('common:states.success'), t('edit.saveSuccess'), [
                { text: t('common:actions.ok'), onPress: () => router.back() }
            ]);
        } catch (error) {
            console.error('Error updating profile:', error);
            // Surface the real reason instead of a generic message — a failed
            // save should never be silent again.
            const detail =
                (error as { message?: string })?.message || t('edit.saveError');
            Alert.alert(t('common:states.error'), detail);
        } finally {
            setSaving(false);
        }
    }

    const updateField = useCallback((field: keyof ProfileData, value: string) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    }, []);

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const inputBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
                <ScreenHeader title={t('edit.title')} showBack />
                <View style={styles.loadingContainer}>
                    <BrandedLoader label={t('edit.loadingProfile')} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={t('edit.title')}
                showBack
                subtitle={t('edit.subtitle')}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView
                    style={styles.scrollView}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
                >
                    {/* Avatar Section */}
                    <Animated.View entering={FadeInDown.duration(400)} style={styles.avatarSection}>
                        <LinearGradient
                            colors={['#6366F1', '#3b82f6', '#3b82f6']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.avatarGradient}
                        >
                            <View style={styles.avatarContent}>
                                <Avatar
                                    name={user?.fullName || t('edit.userFallback')}
                                    imageUrl={user?.imageUrl}
                                    size="xl"
                                />
                                <TouchableOpacity
                                    style={[styles.editAvatarBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
                                    onPress={() => showToast({
                                        emoji: '🖼️',
                                        variant: 'default',
                                        message: t('edit.avatarManagedByClerk'),
                                    })}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('edit.avatarManagedByClerk')}
                                >
                                    <Pencil size={14} color="#FFFFFF" />
                                </TouchableOpacity>
                                <Text style={styles.avatarHint}>
                                    {t('edit.avatarManagedByClerk')}
                                </Text>
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    {/* Personal Information */}
                    <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.formSection}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIconBox, { backgroundColor: `${colors.primary}15` }]}>
                                <User size={18} color={colors.primary} />
                            </View>
                            <View>
                                <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('edit.personalInfoTitle')}</Text>
                                <Text style={[styles.sectionSubtitle, { color: textSecondary }]}>{t('edit.personalInfoSubtitle')}</Text>
                            </View>
                        </View>

                        <Card variant="solid" style={styles.formCard}>
                            {/* Full Name */}
                            <View style={[styles.inputWrapper, { borderBottomColor: inputBorder }]}>
                                <View style={styles.inputLeft}>
                                    <View style={[styles.inputIconBox, { backgroundColor: focusedField === 'full_name' ? `${colors.primary}15` : 'transparent' }]}>
                                        <User size={16} color={focusedField === 'full_name' ? colors.primary : textSecondary} />
                                    </View>
                                    <View style={styles.inputTextContainer}>
                                        <Text style={[styles.inputLabelText, { color: focusedField === 'full_name' ? colors.primary : textSecondary }]}>{t('edit.fullNameLabel')}</Text>
                                        <TextInput
                                            style={[styles.input, { color: textPrimary }]}
                                            value={profile.full_name}
                                            onChangeText={(val) => updateField('full_name', val)}
                                            onFocus={() => setFocusedField('full_name')}
                                            onBlur={() => setFocusedField(null)}
                                            placeholder={t('edit.fullNamePlaceholder')}
                                            placeholderTextColor={textSecondary}
                                        />
                                    </View>
                                </View>
                                {profile.full_name && <View style={[styles.inputDot, { backgroundColor: colors.primary }]} />}
                            </View>

                            {/* Country — tap to pick from a searchable list */}
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => setCountryPickerOpen(true)}
                                style={styles.inputWrapper}
                                accessibilityRole="button"
                                accessibilityLabel={t('edit.countryLabel')}
                            >
                                <View style={styles.inputLeft}>
                                    <View style={[styles.inputIconBox, { backgroundColor: profile.country ? `${colors.primary}15` : 'transparent' }]}>
                                        <Globe size={16} color={profile.country ? colors.primary : textSecondary} />
                                    </View>
                                    <View style={styles.inputTextContainer}>
                                        <Text style={[styles.inputLabelText, { color: profile.country ? colors.primary : textSecondary }]}>{t('edit.countryLabel')}</Text>
                                        <Text
                                            style={[styles.input, { color: profile.country ? textPrimary : textSecondary }]}
                                            numberOfLines={1}
                                        >
                                            {profile.country || t('edit.countryPlaceholder')}
                                        </Text>
                                    </View>
                                </View>
                                <ChevronRight size={18} color={textSecondary} />
                            </TouchableOpacity>
                        </Card>
                    </Animated.View>

                    {/* Academic Background */}
                    <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.formSection}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIconBox, { backgroundColor: '#10B98115' }]}>
                                <GraduationCap size={18} color="#10B981" />
                            </View>
                            <View>
                                <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('edit.academicTitle')}</Text>
                                <Text style={[styles.sectionSubtitle, { color: textSecondary }]}>{t('edit.academicSubtitle')}</Text>
                            </View>
                        </View>

                        <Card variant="solid" style={styles.formCard}>
                            {/* School */}
                            <View style={[styles.inputWrapper, { borderBottomColor: inputBorder }]}>
                                <View style={styles.inputLeft}>
                                    <View style={[styles.inputIconBox, { backgroundColor: focusedField === 'school' ? '#10B98115' : 'transparent' }]}>
                                        <School size={16} color={focusedField === 'school' ? '#10B981' : textSecondary} />
                                    </View>
                                    <View style={styles.inputTextContainer}>
                                        <Text style={[styles.inputLabelText, { color: focusedField === 'school' ? '#10B981' : textSecondary }]}>{t('edit.schoolLabel')}</Text>
                                        <TextInput
                                            style={[styles.input, { color: textPrimary }]}
                                            value={profile.school}
                                            onChangeText={(val) => updateField('school', val)}
                                            onFocus={() => setFocusedField('school')}
                                            onBlur={() => setFocusedField(null)}
                                            placeholder={t('edit.schoolPlaceholder')}
                                            placeholderTextColor={textSecondary}
                                        />
                                    </View>
                                </View>
                                {profile.school && <View style={[styles.inputDot, { backgroundColor: '#10B981' }]} />}
                            </View>

                            {/* Major */}
                            <View style={[styles.inputWrapper, { borderBottomColor: inputBorder }]}>
                                <View style={styles.inputLeft}>
                                    <View style={[styles.inputIconBox, { backgroundColor: focusedField === 'major' ? '#10B98115' : 'transparent' }]}>
                                        <BookOpen size={16} color={focusedField === 'major' ? '#10B981' : textSecondary} />
                                    </View>
                                    <View style={styles.inputTextContainer}>
                                        <Text style={[styles.inputLabelText, { color: focusedField === 'major' ? '#10B981' : textSecondary }]}>{t('edit.majorLabel')}</Text>
                                        <TextInput
                                            style={[styles.input, { color: textPrimary }]}
                                            value={profile.major}
                                            onChangeText={(val) => updateField('major', val)}
                                            onFocus={() => setFocusedField('major')}
                                            onBlur={() => setFocusedField(null)}
                                            placeholder={t('edit.majorPlaceholder')}
                                            placeholderTextColor={textSecondary}
                                        />
                                    </View>
                                </View>
                                {profile.major && <View style={[styles.inputDot, { backgroundColor: '#10B981' }]} />}
                            </View>

                            {/* CGPA */}
                            <View style={styles.inputWrapper}>
                                <View style={styles.inputLeft}>
                                    <View style={[styles.inputIconBox, { backgroundColor: focusedField === 'cgpa' ? '#10B98115' : 'transparent' }]}>
                                        <Award size={16} color={focusedField === 'cgpa' ? '#10B981' : textSecondary} />
                                    </View>
                                    <View style={styles.inputTextContainer}>
                                        <Text style={[styles.inputLabelText, { color: focusedField === 'cgpa' ? '#10B981' : textSecondary }]}>{t('edit.cgpaLabel')}</Text>
                                        <TextInput
                                            style={[styles.input, { color: textPrimary }]}
                                            value={profile.cgpa}
                                            onChangeText={(val) => updateField('cgpa', val)}
                                            onFocus={() => setFocusedField('cgpa')}
                                            onBlur={() => setFocusedField(null)}
                                            placeholder={t('edit.cgpaPlaceholder')}
                                            keyboardType="decimal-pad"
                                            placeholderTextColor={textSecondary}
                                        />
                                    </View>
                                </View>
                                {profile.cgpa && <View style={[styles.inputDot, { backgroundColor: '#10B981' }]} />}
                            </View>
                        </Card>
                    </Animated.View>

                    {/* Why this matters */}
                    <Animated.View entering={FadeInUp.duration(400).delay(300)} style={styles.formSection}>
                        <Card variant="solid" style={[styles.infoCard, { borderColor: `${colors.primary}20` }]}>
                            <LinearGradient
                                colors={[`${colors.primary}08`, `${colors.primary}02`]}
                                style={StyleSheet.absoluteFill}
                            />
                            <View style={styles.infoContent}>
                                <View style={[styles.infoIconBox, { backgroundColor: `${colors.primary}15` }]}>
                                    <GraduationCap size={20} color={colors.primary} />
                                </View>
                                <View style={styles.infoTextContainer}>
                                    <Text style={[styles.infoTitle, { color: colors.primary }]}>{t('edit.whyTitle')}</Text>
                                    <Text style={[styles.infoDesc, { color: textSecondary }]}>
                                        {t('edit.whyDesc')}
                                    </Text>
                                </View>
                            </View>
                        </Card>
                    </Animated.View>

                    {/* Save Button */}
                    <Animated.View entering={FadeInUp.duration(400).delay(400)} style={styles.saveSection}>
                        <AnimatedPressable
                            onPress={handleSave}
                            disabled={saving}
                            style={styles.saveButtonWrapper}
                            hapticFeedback="medium"
                        >
                            <LinearGradient
                                colors={['#6366F1', '#3b82f6']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.saveButtonGradient}
                            >
                                {saving ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <>
                                        <Save size={18} color="#FFFFFF" />
                                        <Text style={styles.saveButtonText}>{t('edit.saveChanges')}</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </AnimatedPressable>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>

            <CountrySelectModal
                visible={countryPickerOpen}
                value={profile.country}
                onSelect={(name) => updateField('country', name)}
                onClose={() => setCountryPickerOpen(false)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    // Avatar Section
    avatarSection: {
        marginHorizontal: 20,
        marginTop: 16,
        borderRadius: 24,
        overflow: 'hidden',
    },
    avatarGradient: {
        paddingVertical: 32,
        paddingHorizontal: 24,
    },
    avatarContent: {
        alignItems: 'center',
    },
    editAvatarBtn: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarHint: {
        marginTop: 12,
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
    },

    // Form Sections
    formSection: {
        marginTop: 24,
        paddingHorizontal: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    sectionIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    sectionSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    formCard: {
        borderRadius: 16,
        overflow: 'hidden',
    },

    // Input Styles
    inputWrapper: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    inputLeft: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        flex: 1,
    },
    inputIconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    inputTextContainer: {
        flex: 1,
    },
    inputLabelText: {
        fontSize: 10,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    input: {
        fontSize: 15,
        fontWeight: '500',
        padding: 0,
        minHeight: 24,
    },
    textArea: {
        fontSize: 15,
        fontWeight: '500',
        padding: 0,
        minHeight: 72,
        textAlignVertical: 'top',
    },
    inputDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },

    // Info Card
    infoCard: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    infoContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 14,
    },
    infoIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoTextContainer: {
        flex: 1,
    },
    infoTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 4,
    },
    infoDesc: {
        fontSize: 13,
        lineHeight: 20,
    },

    // Save Button
    saveSection: {
        marginTop: 32,
        paddingHorizontal: 20,
    },
    saveButtonWrapper: {
        borderRadius: 18,
        overflow: 'hidden',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    saveButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        gap: 10,
        borderRadius: 18,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
