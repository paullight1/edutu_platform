import * as React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth, useSignUp, useUser } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { Link, useRouter } from 'expo-router';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Mail,
  Sparkles,
  User,
  Lock,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '../../components/auth/AuthShell';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';
import { useTheme } from '../../components/context/ThemeContext';

function ErrorBox({ message }: { message: string }) {
  const { isDark } = useTheme();

  return (
    <View
      style={[
        styles.errorBox,
        {
          backgroundColor: isDark ? 'rgba(127, 29, 29, 0.28)' : 'rgba(254, 226, 226, 0.92)',
          borderColor: isDark ? 'rgba(248, 113, 113, 0.28)' : '#FECACA',
        },
      ]}
    >
      <Text style={[styles.errorText, { color: isDark ? '#FECACA' : '#B91C1C' }]}>{message}</Text>
    </View>
  );
}

function getClerkErrorText(error: any) {
  const clerkErrors = Array.isArray(error?.errors)
    ? error.errors.map((entry: any) => `${entry?.code ?? ''} ${entry?.message ?? ''} ${entry?.longMessage ?? ''}`).join(' ')
    : '';

  return `${clerkErrors} ${error?.message ?? ''}`.toLowerCase();
}

function isExistingSessionError(error: any) {
  const text = getClerkErrorText(error);
  return text.includes('session') && (text.includes('already') || text.includes('exists'));
}

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { t } = useTranslation('auth');

  const [fullName, setFullName] = React.useState('');
  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  // OTP UX: one hidden input drives six visible cells; auto-submit at 6 digits.
  const codeInputRef = React.useRef<TextInput>(null);
  const [codeFocused, setCodeFocused] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const lastSubmittedCodeRef = React.useRef('');

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const continueExistingSession = () => {
    const destination = user && !user.unsafeMetadata?.onboardingComplete ? '/onboarding' : '/(app)';
    router.replace(destination);
  };

  const onSignUpPress = async () => {
    if (!isLoaded) {
      return;
    }

    if (isSignedIn) {
      continueExistingSession();
      return;
    }

    setError('');

    if (!fullName.trim()) {
      setError(t('signUp.errors.fullNameRequired'));
      return;
    }

    if (!emailAddress.trim()) {
      setError(t('signUp.errors.emailRequired'));
      return;
    }

    if (password.length < 8) {
      setError(t('signUp.errors.passwordTooShort'));
      return;
    }

    setLoading(true);

    try {
      await signUp.create({
        emailAddress,
        password,
        firstName: fullName.split(' ')[0],
        lastName: fullName.split(' ').slice(1).join(' ') || undefined,
      });

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
      setResendCooldown(30);
      setTimeout(() => codeInputRef.current?.focus(), 400);
    } catch (err: any) {
      if (isExistingSessionError(err)) {
        continueExistingSession();
        return;
      }

      setError(err.errors?.[0]?.message || t('signUp.errors.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded) {
      return;
    }

    if (isSignedIn) {
      continueExistingSession();
      return;
    }

    setLoading(true);
    setError('');

    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code });

      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
        router.replace('/onboarding');
      } else {
        setError(t('signUp.errors.verificationIncomplete'));
      }
    } catch (err: any) {
      if (isExistingSessionError(err)) {
        continueExistingSession();
        return;
      }

      setError(err.errors?.[0]?.message || t('signUp.errors.invalidCode'));
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (!isLoaded || resendCooldown > 0) {
      return;
    }

    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setCode('');
      setError('');
      lastSubmittedCodeRef.current = '';
      setResendCooldown(30);
      codeInputRef.current?.focus();
      Alert.alert(t('signUp.alerts.codeSent.title'), t('signUp.alerts.codeSent.message', { email: emailAddress }));
    } catch {
      Alert.alert(t('signUp.alerts.resendFailed.title'), t('signUp.alerts.resendFailed.message'));
    }
  };

  // Submit the moment the sixth digit lands — no extra tap needed. The ref
  // guards against re-submitting the same (possibly wrong) code in a loop.
  React.useEffect(() => {
    if (!pendingVerification || loading) return;
    if (code.length === 6 && lastSubmittedCodeRef.current !== code) {
      lastSubmittedCodeRef.current = code;
      void onVerifyPress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, pendingVerification, loading]);

  if (pendingVerification) {
    return (
      <AuthShell
        title={t('signUp.verify.title')}
        subtitle={t('signUp.verify.subtitle', { email: emailAddress })}
        icon={Mail}
      >
        {error ? <ErrorBox message={error} /> : null}

        <View style={styles.verifyCard}>
          <Text style={[styles.verifyLabel, { color: colors.textSecondary }]}>{t('signUp.verify.codeLabel')}</Text>

          {/* Six OTP cells driven by one invisible input (keeps native
              keyboard, paste and autofill working). */}
          <Pressable style={styles.otpRow} onPress={() => codeInputRef.current?.focus()}>
            {Array.from({ length: 6 }).map((_, index) => {
              const digit = code[index] ?? '';
              const isActive = codeFocused && index === Math.min(code.length, 5);
              return (
                <View
                  key={index}
                  style={[
                    styles.otpCell,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC',
                      borderColor: isActive ? colors.accent : digit ? colors.textSecondary : colors.border,
                      borderWidth: isActive ? 2 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.otpDigit, { color: colors.foreground }]}>{digit}</Text>
                  {isActive && !digit && <View style={[styles.otpCaret, { backgroundColor: colors.accent }]} />}
                </View>
              );
            })}
          </Pressable>
          <TextInput
            ref={codeInputRef}
            testID="signup-verification-code"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            onFocus={() => setCodeFocused(true)}
            onBlur={() => setCodeFocused(false)}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            style={styles.otpHiddenInput}
            caretHidden
          />
        </View>

        <Pressable
          onPress={onVerifyPress}
          disabled={loading || code.length < 6}
          style={[
            styles.verifyButton,
            { backgroundColor: '#2563EB' },
            (loading || code.length < 6) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.verifyButtonText}>
            {loading ? t('signUp.verify.verifying') : t('signUp.verify.button')}
          </Text>
        </Pressable>

        <Pressable style={styles.resendButton} onPress={resendCode} disabled={resendCooldown > 0}>
          <Text
            style={[
              styles.resendText,
              { color: resendCooldown > 0 ? colors.textSecondary : colors.accent },
            ]}
          >
            {resendCooldown > 0
              ? t('signUp.verify.resendIn', { seconds: resendCooldown })
              : t('signUp.verify.resend')}
          </Text>
        </Pressable>

        <Pressable
          style={styles.resendButton}
          onPress={() => {
            setPendingVerification(false);
            setCode('');
            setError('');
            lastSubmittedCodeRef.current = '';
          }}
        >
          <Text style={[styles.wrongEmailText, { color: colors.textSecondary }]}>
            {t('signUp.verify.wrongEmail')}
          </Text>
        </Pressable>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('signUp.title')}
      subtitle={t('signUp.subtitle')}
      icon={Sparkles}
      align="top"
    >
      {error ? <ErrorBox message={error} /> : null}

      <View style={styles.inputContainer}>
        <View style={[styles.inputPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <User color={colors.textSecondary} size={18} />
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder={t('signUp.fullNamePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="words"
            style={[styles.pillInput, { color: colors.foreground }]}
          />
        </View>

        <View style={[styles.inputPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Mail color={colors.textSecondary} size={18} />
          <TextInput
            value={emailAddress}
            onChangeText={setEmailAddress}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={[styles.pillInput, { color: colors.foreground }]}
          />
        </View>

        <View style={[styles.inputPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Lock color={colors.textSecondary} size={18} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={t('signUp.passwordPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            secureTextEntry={!showPassword}
            style={[styles.pillInput, { color: colors.foreground }]}
          />
          <Pressable
            onPress={() => setShowPassword((value) => !value)}
            style={styles.eyeButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {showPassword ? (
              <EyeOff color={colors.textSecondary} size={18} />
            ) : (
              <Eye color={colors.textSecondary} size={18} />
            )}
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={onSignUpPress}
        disabled={loading}
        style={[styles.signUpButton, { backgroundColor: '#2563EB' }, loading && styles.buttonDisabled]}
      >
        <Text style={styles.signUpButtonText}>
          {loading ? t('signUp.creatingAccount') : t('signUp.createAccount')}
        </Text>
        {!loading ? <ArrowRight color="#FFFFFF" size={18} /> : null}
      </Pressable>

      <GoogleSignInButton onError={setError} />

      <Text style={[styles.consentText, { color: colors.textSecondary }]}>
        {t('signUp.consent.prefix')}{' '}
        <Text
          style={[styles.consentLink, { color: '#2563EB' }]}
          onPress={() => WebBrowser.openBrowserAsync('https://edutu.org/terms')}
        >
          {t('signUp.consent.terms')}
        </Text>{' '}
        {t('signUp.consent.and')}{' '}
        <Text
          style={[styles.consentLink, { color: '#2563EB' }]}
          onPress={() => WebBrowser.openBrowserAsync('https://edutu.org/privacy')}
        >
          {t('signUp.consent.privacy')}
        </Text>
        {t('signUp.consent.suffix')}
      </Text>

      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>{t('signUp.haveAccount')}</Text>
        <Link href="/(auth)/sign-in">
          <Text style={[styles.footerLink, { color: '#2563EB' }]}>{t('signUp.signIn')}</Text>
        </Link>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    gap: 12,
  },
  inputPill: {
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pillInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 16,
  },
  eyeButton: {
    padding: 4,
  },
  signUpButton: {
    height: 54,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  signUpButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  otpCell: {
    flex: 1,
    maxWidth: 52,
    height: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: { fontSize: 24, fontWeight: '800' },
  otpCaret: { position: 'absolute', width: 2, height: 24, borderRadius: 1, opacity: 0.9 },
  otpHiddenInput: {
    position: 'absolute',
    opacity: 0.01,
    height: 1,
    width: 1,
  },
  wrongEmailText: { fontSize: 13.5, fontWeight: '600', textDecorationLine: 'underline' },
  verifyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  verifyLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  verifyButton: {
    height: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '600',
  },
  resendButton: {
    alignItems: 'center',
  },
  resendText: {
    fontSize: 14,
    fontWeight: '700',
  },
  consentText: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  consentLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  footerRow: {
    marginTop: 12,
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
});
