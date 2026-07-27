import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import Constants from 'expo-constants';
import { Bug, LifeBuoy, Send } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useTheme } from '../../components/context/ThemeContext';
import { useToast } from '../../components/context/ToastContext';
import { useTranslation } from 'react-i18next';

const API_URL = (
    process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com'
).replace(/\/$/, '');

const SUPPORT_EMAIL = 'my.edutu@gmail.com';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type SupportType = 'support' | 'bug';

export default function ContactScreen() {
    const { t } = useTranslation('home');
    const { colors, isDark } = useTheme();
    const { show } = useToast();
    const router = useRouter();
    const params = useLocalSearchParams<{ type?: string }>();
    const { getToken } = useAuth();
    const { user } = useUser();

    const [type, setType] = useState<SupportType>(
        params.type === 'bug' ? 'bug' : 'support'
    );
    // `null` means "untouched" → fall back to the signed-in user's details.
    // Once the user edits a field (even to empty), their input takes over.
    const [nameInput, setNameInput] = useState<string | null>(null);
    const [emailInput, setEmailInput] = useState<string | null>(null);
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const name = nameInput ?? user?.fullName ?? user?.firstName ?? '';
    const email =
        emailInput ?? user?.primaryEmailAddress?.emailAddress ?? '';

    const isBug = type === 'bug';

    const handleSubmit = async () => {
        if (submitting) return;

        const trimmedEmail = email.trim();
        const trimmedSubject = subject.trim();
        const trimmedMessage = message.trim();

        if (!EMAIL_RE.test(trimmedEmail)) {
            show({
                message: t('contact.errors.email', {
                    defaultValue: 'Enter a valid email so we can reply.',
                }),
                variant: 'error',
            });
            return;
        }
        if (!trimmedSubject) {
            show({
                message: t('contact.errors.subject', {
                    defaultValue: 'Add a short subject.',
                }),
                variant: 'error',
            });
            return;
        }
        if (trimmedMessage.length < 10) {
            show({
                message: t('contact.errors.message', {
                    defaultValue: 'Please add a little more detail.',
                }),
                variant: 'error',
            });
            return;
        }

        setSubmitting(true);
        try {
            const token = await getToken().catch(() => null);
            const response = await fetch(`${API_URL}/support`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    type,
                    name: name.trim() || undefined,
                    email: trimmedEmail,
                    subject: trimmedSubject,
                    message: trimmedMessage,
                    context: {
                        app: 'mobile',
                        platform: Platform.OS,
                        appVersion: Constants.expoConfig?.version || 'unknown',
                        ...(user?.id ? { userId: user.id } : {}),
                    },
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            show({
                message: isBug
                    ? t('contact.success.bug', {
                          defaultValue: "Bug report sent — thank you!",
                      })
                    : t('contact.success.support', {
                          defaultValue: "Message sent — we'll be in touch by email.",
                      }),
                variant: 'success',
                emoji: '✅',
            });
            router.back();
        } catch {
            show({
                message: t('contact.errors.send', {
                    defaultValue: `Couldn't send. Please email ${SUPPORT_EMAIL} directly.`,
                }),
                variant: 'error',
            });
        } finally {
            setSubmitting(false);
        }
    };

    const inputStyle = [
        styles.input,
        {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.foreground,
        },
    ];
    const placeholderColor = isDark ? '#64748B' : '#94A3B8';

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: colors.background }]}
            edges={['top', 'left', 'right']}
        >
            <ScreenHeader
                title={
                    isBug
                        ? t('contact.bugTitle', { defaultValue: 'Report a bug' })
                        : t('contact.title', { defaultValue: 'Contact us' })
                }
                showBack={true}
            />

            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text
                        style={[styles.intro, { color: colors.textSecondary }]}
                    >
                        {isBug
                            ? t('contact.bugIntro', {
                                  defaultValue:
                                      'Found something broken? Tell us what happened and we’ll look into it.',
                              })
                            : t('contact.intro', {
                                  defaultValue:
                                      'Ask a question or share feedback. We’ll reply to your email.',
                              })}
                    </Text>

                    {/* Type toggle */}
                    <View
                        style={[
                            styles.toggle,
                            { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                    >
                        {(['support', 'bug'] as const).map((option) => {
                            const active = type === option;
                            const Icon = option === 'bug' ? Bug : LifeBuoy;
                            return (
                                <TouchableOpacity
                                    key={option}
                                    activeOpacity={0.8}
                                    onPress={() => setType(option)}
                                    style={[
                                        styles.toggleBtn,
                                        active && { backgroundColor: colors.accent },
                                    ]}
                                >
                                    <Icon
                                        size={15}
                                        color={active ? '#ffffff' : colors.textSecondary}
                                    />
                                    <Text
                                        style={[
                                            styles.toggleText,
                                            {
                                                color: active
                                                    ? '#ffffff'
                                                    : colors.textSecondary,
                                            },
                                        ]}
                                    >
                                        {option === 'bug'
                                            ? t('contact.toggle.bug', {
                                                  defaultValue: 'Report a bug',
                                              })
                                            : t('contact.toggle.support', {
                                                  defaultValue: 'Ask a question',
                                              })}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={[styles.label, { color: colors.foreground }]}>
                        {t('contact.name', { defaultValue: 'Name' })}
                    </Text>
                    <TextInput
                        style={inputStyle}
                        value={name}
                        onChangeText={setNameInput}
                        placeholder={t('contact.namePlaceholder', {
                            defaultValue: 'Your name',
                        })}
                        placeholderTextColor={placeholderColor}
                        autoCapitalize="words"
                    />

                    <Text style={[styles.label, { color: colors.foreground }]}>
                        {t('contact.email', { defaultValue: 'Email' })} *
                    </Text>
                    <TextInput
                        style={inputStyle}
                        value={email}
                        onChangeText={setEmailInput}
                        placeholder="you@example.com"
                        placeholderTextColor={placeholderColor}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    <Text style={[styles.label, { color: colors.foreground }]}>
                        {t('contact.subject', { defaultValue: 'Subject' })} *
                    </Text>
                    <TextInput
                        style={inputStyle}
                        value={subject}
                        onChangeText={setSubject}
                        placeholder={
                            isBug
                                ? t('contact.subjectBugPlaceholder', {
                                      defaultValue: 'e.g. Save button does nothing',
                                  })
                                : t('contact.subjectPlaceholder', {
                                      defaultValue: 'e.g. Question about matching',
                                  })
                        }
                        placeholderTextColor={placeholderColor}
                        maxLength={200}
                    />

                    <Text style={[styles.label, { color: colors.foreground }]}>
                        {isBug
                            ? t('contact.messageBug', {
                                  defaultValue: 'What happened?',
                              })
                            : t('contact.message', {
                                  defaultValue: 'How can we help?',
                              })}{' '}
                        *
                    </Text>
                    <TextInput
                        style={[inputStyle, styles.textarea]}
                        value={message}
                        onChangeText={setMessage}
                        placeholder={
                            isBug
                                ? t('contact.messageBugPlaceholder', {
                                      defaultValue:
                                          'Describe the bug, the steps to reproduce it, and what you expected.',
                                  })
                                : t('contact.messagePlaceholder', {
                                      defaultValue: 'Tell us what you need a hand with.',
                                  })
                        }
                        placeholderTextColor={placeholderColor}
                        multiline
                        numberOfLines={6}
                        textAlignVertical="top"
                        maxLength={5000}
                    />

                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={handleSubmit}
                        disabled={submitting}
                        style={[
                            styles.submitBtn,
                            { backgroundColor: colors.accent },
                            submitting && { opacity: 0.7 },
                        ]}
                    >
                        {submitting ? (
                            <ActivityIndicator color="#ffffff" />
                        ) : (
                            <>
                                <Send size={18} color="#ffffff" />
                                <Text style={styles.submitText}>
                                    {isBug
                                        ? t('contact.sendBug', {
                                              defaultValue: 'Send bug report',
                                          })
                                        : t('contact.send', {
                                              defaultValue: 'Send message',
                                          })}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() =>
                            Linking.openURL(`mailto:${SUPPORT_EMAIL}`)
                        }
                        style={styles.emailFallback}
                    >
                        <Text
                            style={[
                                styles.emailFallbackText,
                                { color: colors.textSecondary },
                            ]}
                        >
                            {t('contact.orEmail', {
                                defaultValue: 'Or email us at',
                            })}{' '}
                            <Text style={{ color: colors.accent, fontWeight: '700' }}>
                                {SUPPORT_EMAIL}
                            </Text>
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    flex: { flex: 1 },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 48,
    },
    intro: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 20,
    },
    toggle: {
        flexDirection: 'row',
        borderWidth: 1,
        borderRadius: 14,
        padding: 4,
        marginBottom: 20,
    },
    toggleBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 9,
        borderRadius: 10,
    },
    toggleText: {
        fontSize: 13,
        fontWeight: '700',
    },
    label: {
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === 'ios' ? 12 : 9,
        fontSize: 15,
        marginBottom: 18,
    },
    textarea: {
        minHeight: 130,
        paddingTop: 12,
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 14,
        paddingVertical: 15,
        marginTop: 4,
    },
    submitText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },
    emailFallback: {
        alignItems: 'center',
        marginTop: 20,
    },
    emailFallbackText: {
        fontSize: 13,
    },
});
