import * as React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth, useOAuth, useSignUp, useUser } from '@clerk/clerk-expo';
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
import { AuthShell } from '../../components/auth/AuthShell';
import { useTheme } from '../../components/context/ThemeContext';

WebBrowser.maybeCompleteAuthSession();

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

function AppleIcon({ size, color }: { size: number; color: string }) {
  return (
    <Text style={{ fontSize: size * 0.7, fontWeight: '700', color, fontFamily: 'system-ui' }}>
      &#63743;
    </Text>
  );
}

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { colors, isDark } = useTheme();
  const router = useRouter();

  const { startOAuthFlow: googleOAuth } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: appleOAuth } = useOAuth({ strategy: 'oauth_apple' });

  const [fullName, setFullName] = React.useState('');
  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [oauthLoading, setOauthLoading] = React.useState<'google' | 'apple' | null>(null);
  const [error, setError] = React.useState('');

  const continueExistingSession = () => {
    const destination = user && !user.unsafeMetadata?.onboardingComplete ? '/onboarding' : '/(app)';
    router.replace(destination);
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    if (isSignedIn) {
      continueExistingSession();
      return;
    }

    setError('');
    setOauthLoading(provider);

    try {
      const flow = provider === 'google' ? googleOAuth : appleOAuth;
      const { createdSessionId, setActive: setActiveSession } = await flow();

      if (createdSessionId && setActiveSession) {
        await setActiveSession({ session: createdSessionId });
        router.replace('/onboarding');
      }
    } catch (err: any) {
      if (isExistingSessionError(err)) {
        continueExistingSession();
        return;
      }

      setError(err.errors?.[0]?.message || `${provider} sign-in failed.`);
    } finally {
      setOauthLoading(null);
    }
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
      setError('Enter your full name.');
      return;
    }

    if (!emailAddress.trim()) {
      setError('Enter your email address.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
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
    } catch (err: any) {
      if (isExistingSessionError(err)) {
        continueExistingSession();
        return;
      }

      setError(err.errors?.[0]?.message || 'Failed to create account.');
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
        setError('Verification is not complete yet. Try again.');
      }
    } catch (err: any) {
      if (isExistingSessionError(err)) {
        continueExistingSession();
        return;
      }

      setError(err.errors?.[0]?.message || 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (!isLoaded) {
      return;
    }

    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      Alert.alert('Code sent', `A fresh code was sent to ${emailAddress}.`);
    } catch {
      Alert.alert('Resend failed', 'Try again in a moment.');
    }
  };

  if (pendingVerification) {
    return (
      <AuthShell
        title="Verify your email"
        subtitle={`Enter the code sent to ${emailAddress} to unlock your onboarding flow.`}
        icon={Mail}
      >
        {error ? <ErrorBox message={error} /> : null}

        <View style={styles.verifyCard}>
          <Text style={[styles.verifyLabel, { color: colors.textSecondary }]}>Verification code</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="000000"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            maxLength={6}
            textAlign="center"
            style={[
              styles.codeInput,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC',
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
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
            {loading ? 'Verifying...' : 'Verify and continue'}
          </Text>
        </Pressable>

        <Pressable style={styles.resendButton} onPress={resendCode}>
          <Text style={[styles.resendText, { color: colors.accent }]}>Resend code</Text>
        </Pressable>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start with a lighter first step, then finish your profile inside onboarding."
      icon={Sparkles}
      align="top"
    >
      <View style={styles.oauthRow}>
        <Pressable
          style={[styles.oauthButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => handleOAuth('google')}
          disabled={oauthLoading !== null}
        >
          <Text style={styles.oauthG}>G</Text>
          <Text style={[styles.oauthLabel, { color: colors.foreground }]}>
            {oauthLoading === 'google' ? 'Connecting...' : 'Google'}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.oauthButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => handleOAuth('apple')}
          disabled={oauthLoading !== null}
        >
          <AppleIcon size={20} color={colors.foreground} />
          <Text style={[styles.oauthLabel, { color: colors.foreground }]}>
            {oauthLoading === 'apple' ? 'Connecting...' : 'Apple'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.dividerRow}>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or continue with email</Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      </View>

      {error ? <ErrorBox message={error} /> : null}

      <View style={styles.inputContainer}>
        <View style={[styles.inputPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <User color={colors.textSecondary} size={18} />
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="John Doe"
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
            placeholder="Minimum 8 characters"
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
          {loading ? 'Creating account...' : 'Create account'}
        </Text>
        {!loading ? <ArrowRight color="#FFFFFF" size={18} /> : null}
      </Pressable>

      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>Already have an account?</Text>
        <Link href="/(auth)/sign-in">
          <Text style={[styles.footerLink, { color: '#2563EB' }]}>Sign in</Text>
        </Link>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  oauthRow: {
    flexDirection: 'row',
    gap: 12,
  },
  oauthButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  oauthG: {
    fontSize: 18,
    fontWeight: '900',
    color: '#EA4335',
  },
  oauthApple: {
    fontSize: 18,
    fontWeight: '700',
  },
  oauthLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginVertical: 4,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '600',
  },
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
  codeInput: {
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 6,
  },
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
