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
    Mail,
    BookOpen,
    Award,
    Pencil,
    MapPin,
    School,
    ChevronRight,
} from 'lucide-react-native';
import { Avatar } from '../../../components/ui/Avatar';
import { toSafeUUID } from '@edutu/core/src/utils/auth';

interface ProfileData {
    full_name?: string;
    school?: string;
    major?: string;
    cgpa?: string;
    country?: string;
    bio?: string;
}

export default function EditProfileScreen() {
    const { user } = useUser();
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [profile, setProfile] = useState<ProfileData>({});
    const [focusedField, setFocusedField] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            loadProfile();
        }
    }, [user]);

    async function loadProfile() {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('user_id', toSafeUUID(user?.id!))
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            setProfile({
                full_name: data?.full_name || user?.fullName || '',
                school: data?.school || '',
                major: data?.major || '',
                cgpa: data?.cgpa?.toString() || '',
                country: data?.country || '',
                bio: data?.bio || '',
            });
        } catch (error) {
            console.error('Error loading profile:', error);
            setProfile({
                full_name: user?.fullName || '',
                school: '',
                major: '',
                cgpa: '',
                country: '',
                bio: '',
            });
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        if (!user) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .upsert({
                    user_id: toSafeUUID(user.id),
                    full_name: profile.full_name,
                    school: profile.school,
                    major: profile.major,
                    cgpa: profile.cgpa ? parseFloat(profile.cgpa) : null,
                    country: profile.country,
                    bio: profile.bio,
                    updated_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id'
                });

            if (error) throw error;
            Alert.alert('Success', 'Profile updated successfully!', [
                { text: 'OK', onPress: () => router.back() }
            ]);
        } catch (error) {
            console.error('Error updating profile:', error);
            Alert.alert('Error', 'Failed to update profile.');
        } finally {
            setSaving(false);
        }
    }

    const updateField = useCallback((field: keyof ProfileData, value: string) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    }, []);

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const inputBg = isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC';
    const inputBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
                <ScreenHeader title="Edit Profile" showBack />
                <View style={styles.loadingContainer}>
                    <BrandedLoader label="Loading profile..." />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title="Edit Profile"
                showBack
                subtitle="Keep your profile up to date"
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
                                    name={user?.fullName || 'User'}
                                    imageUrl={user?.imageUrl}
                                    size="xl"
                                />
                                <TouchableOpacity
                                    style={[styles.editAvatarBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
                                    onPress={() => {/* Clerk avatar managed externally */}}
                                >
                                    <Pencil size={14} color="#FFFFFF" />
                                </TouchableOpacity>
                                <Text style={styles.avatarHint}>
                                    Profile picture managed by Clerk
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
                                <Text style={[styles.sectionTitle, { color: textPrimary }]}>Personal Information</Text>
                                <Text style={[styles.sectionSubtitle, { color: textSecondary }]}>Basic details about yourself</Text>
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
                                        <Text style={[styles.inputLabelText, { color: focusedField === 'full_name' ? colors.primary : textSecondary }]}>Full Name</Text>
                                        <TextInput
                                            style={[styles.input, { color: textPrimary }]}
                                            value={profile.full_name}
                                            onChangeText={(val) => updateField('full_name', val)}
                                            onFocus={() => setFocusedField('full_name')}
                                            onBlur={() => setFocusedField(null)}
                                            placeholder="Your full name"
                                            placeholderTextColor={textSecondary}
                                        />
                                    </View>
                                </View>
                                {profile.full_name && <View style={[styles.inputDot, { backgroundColor: colors.primary }]} />}
                            </View>

                            {/* Bio */}
                            <View style={[styles.inputWrapper, { borderBottomColor: inputBorder }]}>
                                <View style={styles.inputLeft}>
                                    <View style={[styles.inputIconBox, { backgroundColor: focusedField === 'bio' ? `${colors.primary}15` : 'transparent' }]}>
                                        <Pencil size={16} color={focusedField === 'bio' ? colors.primary : textSecondary} />
                                    </View>
                                    <View style={styles.inputTextContainer}>
                                        <Text style={[styles.inputLabelText, { color: focusedField === 'bio' ? colors.primary : textSecondary }]}>Bio</Text>
                                        <TextInput
                                            style={[styles.textArea, { color: textPrimary }]}
                                            value={profile.bio}
                                            onChangeText={(val) => updateField('bio', val)}
                                            onFocus={() => setFocusedField('bio')}
                                            onBlur={() => setFocusedField(null)}
                                            placeholder="Tell us about yourself..."
                                            placeholderTextColor={textSecondary}
                                            multiline
                                            numberOfLines={3}
                                        />
                                    </View>
                                </View>
                            </View>

                            {/* Country */}
                            <View style={styles.inputWrapper}>
                                <View style={styles.inputLeft}>
                                    <View style={[styles.inputIconBox, { backgroundColor: focusedField === 'country' ? `${colors.primary}15` : 'transparent' }]}>
                                        <Globe size={16} color={focusedField === 'country' ? colors.primary : textSecondary} />
                                    </View>
                                    <View style={styles.inputTextContainer}>
                                        <Text style={[styles.inputLabelText, { color: focusedField === 'country' ? colors.primary : textSecondary }]}>Country</Text>
                                        <TextInput
                                            style={[styles.input, { color: textPrimary }]}
                                            value={profile.country}
                                            onChangeText={(val) => updateField('country', val)}
                                            onFocus={() => setFocusedField('country')}
                                            onBlur={() => setFocusedField(null)}
                                            placeholder="e.g., Nigeria"
                                            placeholderTextColor={textSecondary}
                                        />
                                    </View>
                                </View>
                                {profile.country && <View style={[styles.inputDot, { backgroundColor: colors.primary }]} />}
                            </View>
                        </Card>
                    </Animated.View>

                    {/* Academic Background */}
                    <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.formSection}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIconBox, { backgroundColor: '#10B98115' }]}>
                                <GraduationCap size={18} color="#10B981" />
                            </View>
                            <View>
                                <Text style={[styles.sectionTitle, { color: textPrimary }]}>Academic Background</Text>
                                <Text style={[styles.sectionSubtitle, { color: textSecondary }]}>Education details for better matching</Text>
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
                                        <Text style={[styles.inputLabelText, { color: focusedField === 'school' ? '#10B981' : textSecondary }]}>University / School</Text>
                                        <TextInput
                                            style={[styles.input, { color: textPrimary }]}
                                            value={profile.school}
                                            onChangeText={(val) => updateField('school', val)}
                                            onFocus={() => setFocusedField('school')}
                                            onBlur={() => setFocusedField(null)}
                                            placeholder="e.g., University of Lagos"
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
                                        <Text style={[styles.inputLabelText, { color: focusedField === 'major' ? '#10B981' : textSecondary }]}>Major / Course</Text>
                                        <TextInput
                                            style={[styles.input, { color: textPrimary }]}
                                            value={profile.major}
                                            onChangeText={(val) => updateField('major', val)}
                                            onFocus={() => setFocusedField('major')}
                                            onBlur={() => setFocusedField(null)}
                                            placeholder="e.g., Computer Science"
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
                                        <Text style={[styles.inputLabelText, { color: focusedField === 'cgpa' ? '#10B981' : textSecondary }]}>Current CGPA</Text>
                                        <TextInput
                                            style={[styles.input, { color: textPrimary }]}
                                            value={profile.cgpa}
                                            onChangeText={(val) => updateField('cgpa', val)}
                                            onFocus={() => setFocusedField('cgpa')}
                                            onBlur={() => setFocusedField(null)}
                                            placeholder="e.g., 3.8"
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
                                    <Text style={[styles.infoTitle, { color: colors.primary }]}>Why this matters</Text>
                                    <Text style={[styles.infoDesc, { color: textSecondary }]}>
                                        Keep your academic profile updated to see the most relevant scholarships and internship opportunities matched to your background.
                                    </Text>
                                </View>
                                <ChevronRight size={18} color={textSecondary} />
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
                                        <Text style={styles.saveButtonText}>Save Changes</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </AnimatedPressable>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
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
