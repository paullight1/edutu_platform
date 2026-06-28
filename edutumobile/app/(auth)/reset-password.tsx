import { useAuth, useSignIn, useUser } from '@clerk/clerk-expo'
import { Link, useRouter } from 'expo-router'
import { Text, TextInput, View, StyleSheet, Alert, Pressable } from 'react-native'
import React from 'react'
import { Eye, EyeOff, KeyRound, Lock, Mail } from 'lucide-react-native'
import { AuthShell } from '../../components/auth/AuthShell'
import { useTheme } from '../../components/context/ThemeContext'

type ResetStep = 'email' | 'code' | 'password'

function getClerkErrorText(error: any) {
    const clerkErrors = Array.isArray(error?.errors)
        ? error.errors.map((entry: any) => `${entry?.code ?? ''} ${entry?.message ?? ''} ${entry?.longMessage ?? ''}`).join(' ')
        : ''

    return `${clerkErrors} ${error?.message ?? ''}`.toLowerCase()
}

function isExistingSessionError(error: any) {
    const text = getClerkErrorText(error)
    return text.includes('session') && (text.includes('already') || text.includes('exists'))
}

export default function ResetPasswordPage() {
    const { isLoaded, signIn } = useSignIn()
    const { isSignedIn } = useAuth()
    const { user } = useUser()
    const router = useRouter()
    const { colors, isDark } = useTheme()

    const [emailAddress, setEmailAddress] = React.useState('')
    const [step, setStep] = React.useState<ResetStep>('email')
    const [code, setCode] = React.useState('')
    const [newPassword, setNewPassword] = React.useState('')
    const [repeatPassword, setRepeatPassword] = React.useState('')
    const [showNewPassword, setShowNewPassword] = React.useState(false)
    const [showRepeatPassword, setShowRepeatPassword] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState('')

    const continueExistingSession = () => {
        const destination = user && !user.unsafeMetadata?.onboardingComplete ? '/onboarding' : '/(app)'
        router.replace(destination)
    }

    const onRequestReset = async () => {
        if (!isLoaded) return

        if (isSignedIn) {
            continueExistingSession()
            return
        }

        setError('')
        setLoading(true)

        try {
            await signIn.create({
                strategy: 'reset_password_email_code',
                identifier: emailAddress,
            })
            setStep('code')
            Alert.alert('Email Sent', `A verification code has been sent to ${emailAddress}`)
        } catch (err: any) {
            if (isExistingSessionError(err)) {
                continueExistingSession()
                return
            }

            const error = err.errors?.[0]
            setError(error?.longMessage || 'Failed to send reset email')
        } finally {
            setLoading(false)
        }
    }

    const onVerifyCode = () => {
        setError('')

        if (!code.trim()) {
            setError('Enter the verification code sent to your email.')
            return
        }

        setStep('password')
    }

    const onResetPassword = async () => {
        if (!isLoaded) return

        if (isSignedIn) {
            continueExistingSession()
            return
        }

        setError('')

        if (newPassword.length < 8) {
            setError('Use at least 8 characters for your new password.')
            return
        }

        if (newPassword !== repeatPassword) {
            setError('Passwords do not match.')
            return
        }

        setLoading(true)

        try {
            const result = await signIn.attemptFirstFactor({
                strategy: 'reset_password_email_code',
                code,
                password: newPassword,
            })

            if (result.status === 'complete') {
                Alert.alert('Success', 'Your password has been reset successfully', [
                    { text: 'OK', onPress: () => router.replace('/(auth)/sign-in') }
                ])
            } else {
                setError('Failed to reset password. Please try again.')
            }
        } catch (err: any) {
            if (isExistingSessionError(err)) {
                continueExistingSession()
                return
            }

            const error = err.errors?.[0]
            setError(error?.longMessage || 'Failed to reset password')
        } finally {
            setLoading(false)
        }
    }

    const errorNode = error ? (
        <View
            style={[
                styles.errorBox,
                {
                    backgroundColor: isDark ? 'rgba(127, 29, 29, 0.28)' : 'rgba(254, 226, 226, 0.92)',
                    borderColor: isDark ? 'rgba(248, 113, 113, 0.28)' : '#FECACA',
                },
            ]}
        >
            <Text style={[styles.errorText, { color: isDark ? '#FECACA' : '#B91C1C' }]}>{error}</Text>
        </View>
    ) : null

    if (step === 'code') {
        return (
            <AuthShell
                title="Enter code"
                subtitle={`Use the verification code sent to ${emailAddress}`}
                icon={KeyRound}
            >
                {errorNode}

                <View style={styles.fieldGroup}>
                    <Text style={[styles.label, { color: colors.foreground }]}>Verification Code</Text>
                    <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <KeyRound color={colors.textSecondary} size={18} />
                        <TextInput
                            value={code}
                            placeholder="Enter code"
                            placeholderTextColor={colors.textSecondary}
                            onChangeText={setCode}
                            style={[styles.input, { color: colors.foreground }]}
                            keyboardType="number-pad"
                            maxLength={6}
                        />
                    </View>
                </View>

                <Pressable
                    onPress={onVerifyCode}
                    style={[styles.primaryButton, { backgroundColor: colors.accent }]}
                >
                    <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>Continue</Text>
                </Pressable>

                <Pressable onPress={() => setStep('email')} style={styles.secondaryTextButton}>
                    <Text style={[styles.footerLink, { color: colors.accent }]}>Use another email</Text>
                </Pressable>
            </AuthShell>
        )
    }

    if (step === 'password') {
        return (
            <AuthShell
                title="New password"
                subtitle="Create a new password for your Edutu account."
                icon={KeyRound}
            >
                {errorNode}

                <View style={styles.fieldGroup}>
                    <Text style={[styles.label, { color: colors.foreground }]}>New Password</Text>
                    <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Lock color={colors.textSecondary} size={18} />
                        <TextInput
                            value={newPassword}
                            placeholder="Enter new password"
                            placeholderTextColor={colors.textSecondary}
                            secureTextEntry={!showNewPassword}
                            onChangeText={setNewPassword}
                            style={[styles.input, { color: colors.foreground }]}
                        />
                        <Pressable onPress={() => setShowNewPassword((value) => !value)} style={styles.eyeButton}>
                            {showNewPassword ? (
                                <EyeOff color={colors.textSecondary} size={18} />
                            ) : (
                                <Eye color={colors.textSecondary} size={18} />
                            )}
                        </Pressable>
                    </View>
                </View>

                <View style={styles.fieldGroup}>
                    <Text style={[styles.label, { color: colors.foreground }]}>Repeat Password</Text>
                    <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Lock color={colors.textSecondary} size={18} />
                        <TextInput
                            value={repeatPassword}
                            placeholder="Repeat new password"
                            placeholderTextColor={colors.textSecondary}
                            secureTextEntry={!showRepeatPassword}
                            onChangeText={setRepeatPassword}
                            style={[styles.input, { color: colors.foreground }]}
                        />
                        <Pressable onPress={() => setShowRepeatPassword((value) => !value)} style={styles.eyeButton}>
                            {showRepeatPassword ? (
                                <EyeOff color={colors.textSecondary} size={18} />
                            ) : (
                                <Eye color={colors.textSecondary} size={18} />
                            )}
                        </Pressable>
                    </View>
                </View>

                <Pressable
                    onPress={onResetPassword}
                    style={[styles.primaryButton, { backgroundColor: colors.accent }, loading && styles.buttonDisabled]}
                    disabled={loading}
                >
                    <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>
                        {loading ? 'Saving...' : 'Save password'}
                    </Text>
                </Pressable>

                <Pressable onPress={() => setStep('code')} style={styles.secondaryTextButton}>
                    <Text style={[styles.footerLink, { color: colors.accent }]}>Back to code</Text>
                </Pressable>

                <View style={styles.footerRow}>
                    <Text style={[styles.footerText, { color: colors.textSecondary }]}>Remembered your password?</Text>
                    <Link href="/(auth)/sign-in">
                        <Text style={[styles.footerLink, { color: colors.accent }]}>Sign in</Text>
                    </Link>
                </View>
            </AuthShell>
        )
    }

    return (
        <AuthShell
            title="Reset Password"
            subtitle="Enter your email to receive a reset code"
            icon={KeyRound}
        >
            {errorNode}

            <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Email Address</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Mail color={colors.textSecondary} size={18} />
                    <TextInput
                        autoCapitalize="none"
                        value={emailAddress}
                        placeholder="Enter email"
                        placeholderTextColor={colors.textSecondary}
                        onChangeText={setEmailAddress}
                        style={[styles.input, { color: colors.foreground }]}
                        keyboardType="email-address"
                    />
                </View>
            </View>

            <Pressable
                onPress={onRequestReset}
                style={[styles.primaryButton, { backgroundColor: colors.accent }, loading && styles.buttonDisabled]}
                disabled={loading}
            >
                <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>
                    {loading ? 'Sending...' : 'Send Reset Code'}
                </Text>
            </Pressable>

            <View style={styles.footerRow}>
                <Text style={[styles.footerText, { color: colors.textSecondary }]}>Remembered your password?</Text>
                <Link href="/(auth)/sign-in">
                    <Text style={[styles.footerLink, { color: colors.accent }]}>Sign in</Text>
                </Link>
            </View>
        </AuthShell>
    )
}

const styles = StyleSheet.create({
    fieldGroup: {
        gap: 10,
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
    },
    inputRow: {
        minHeight: 56,
        borderRadius: 18,
        borderWidth: 1,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    input: {
        flex: 1,
        fontSize: 15,
        paddingVertical: 16,
    },
    eyeButton: {
        padding: 4,
    },
    primaryButton: {
        minHeight: 58,
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 12,
    },
    primaryButtonText: {
        fontSize: 16,
        fontWeight: '800',
    },
    buttonDisabled: {
        opacity: 0.55,
    },
    errorBox: {
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    errorText: {
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        fontWeight: '600',
    },
    footerRow: {
        marginTop: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
    },
    footerText: {
        fontSize: 14,
    },
    footerLink: {
        fontSize: 14,
        fontWeight: '800',
    },
    secondaryTextButton: {
        alignSelf: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
})
