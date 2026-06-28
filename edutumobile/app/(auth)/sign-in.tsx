import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth, useOAuth, useSignIn, useUser } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { ArrowRight, Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react-native';
import { AuthShell } from '../../components/auth/AuthShell';
import { useTheme } from '../../components/context/ThemeContext';

WebBrowser.maybeCompleteAuthSession();

const SOCIAL_SIGN_IN_HINT =
  'That password did not work. If you created your account with Google or Apple, use that sign-in option above.';

const PASSWORD_ERROR_CODES = new Set([
  'form_password_incorrect',
  'form_identifier_not_found',
  'form_param_format_invalid',
]);

function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase();
}

function isPasswordSignInError(error: any) {
  const clerkError = error?.errors?.[0];
  const code = clerkError?.code;
  const message = `${clerkError?.message ?? error?.message ?? ''}`.toLowerCase();

  return (
    PASSWORD_ERROR_CODES.has(code) ||
    message.includes('password') ||
    message.includes('identifier') ||
    message.includes('couldn') ||
    message.includes('invalid')
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

export default function SignInPage() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { colors, isDark } = useTheme();
  const router = useRouter();

  const { startOAuthFlow: googleOAuth } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: appleOAuth } = useOAuth({ strategy: 'oauth_apple' });

  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [oauthLoading, setOauthLoading] = React.useState<'google' | 'apple' | null>(null);
  const [failedEmail, setFailedEmail] = React.useState('');
  const [failedAttempts, setFailedAttempts] = React.useState(0);
  const shouldShowPasswordRecovery = failedAttempts > 0 && Boolean(normalizeEmailAddress(emailAddress));

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
        router.replace('/');
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

  const onSignInPress = async () => {
    if (!isLoaded) {
      return;
    }

    if (isSignedIn) {
      continueExistingSession();
      return;
    }

    setError('');
    setLoading(true);

    try {
      const signInAttempt = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (signInAttempt.status === 'complete') {
        setFailedEmail('');
        setFailedAttempts(0);
        await setActive({ session: signInAttempt.createdSessionId });
      } else if (signInAttempt.status === 'needs_second_factor') {
        setError('Two-factor authentication is required for this account.');
      } else {
        setError('Sign in could not be completed. Try again.');
      }
    } catch (err: any) {
      if (isExistingSessionError(err)) {
        continueExistingSession();
        return;
      }

      const normalizedEmail = normalizeEmailAddress(emailAddress);
      const nextFailedAttempts = normalizedEmail && normalizedEmail === failedEmail ? failedAttempts + 1 : 1;

      if (normalizedEmail) {
        setFailedEmail(normalizedEmail);
        setFailedAttempts(nextFailedAttempts);
      }

      if (nextFailedAttempts >= 2 && isPasswordSignInError(err)) {
        setError(SOCIAL_SIGN_IN_HINT);
      } else {
        setError(err.errors?.[0]?.message || 'Failed to sign in.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    if (!emailAddress.trim()) {
      Alert.alert('Email required', 'Enter your email address first.');
      return;
    }

    router.push({
      pathname: '/(auth)/reset-password',
      params: { email: emailAddress },
    });
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Continue where you left off and jump straight into your next opportunity."
      icon={LogIn}
    >
      <View style={styles.formStack}>
        <View style={styles.oauthRow}>
        <Pressable
          style={[styles.oauthButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => handleOAuth('google')}
          disabled={oauthLoading !== null}
        >
          <View style={styles.oauthIconWrap}>
            <Text style={styles.oauthG}>G</Text>
          </View>
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

      {error ? (
        <View style={styles.errorStack}>
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
        </View>
      ) : null}

      <View style={styles.inputContainer}>
        <View style={[styles.inputPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Mail color={colors.textSecondary} size={18} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary}
            value={emailAddress}
            onChangeText={setEmailAddress}
            style={[styles.pillInput, { color: colors.foreground }]}
          />
        </View>

        <View style={[styles.inputPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Lock color={colors.textSecondary} size={18} />
          <TextInput
            placeholder="Enter password"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            style={[styles.pillInput, { color: colors.foreground }]}
          />
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
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
        onPress={onSignInPress}
        disabled={loading}
        style={[styles.signInButton, { backgroundColor: '#2563EB' }, loading && styles.buttonDisabled]}
      >
        <ArrowRight color="#FFFFFF" size={18} />
        <Text style={styles.signInButtonText}>{loading ? 'Signing in...' : 'Sign in'}</Text>
      </Pressable>

      <Pressable onPress={handleForgotPassword} style={styles.forgotLink}>
        <Text style={[styles.footerLink, { color: '#2563EB' }]}>
          {shouldShowPasswordRecovery ? 'Forgot password? Reset it here' : 'Forgot password?'}
        </Text>
      </Pressable>

      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>New to Edutu?</Text>
        <Link href="/(auth)/sign-up">
          <Text style={[styles.footerLink, { color: '#2563EB' }]}>Create account</Text>
        </Link>
      </View>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  formStack: {
    gap: 16,
  },
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
  oauthIconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oauthG: {
    fontSize: 18,
    fontWeight: '900',
    color: '#EA4335',
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
  signInButton: {
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
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorStack: {
    gap: 10,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '600',
  },
  recoveryButton: {
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  recoveryButtonText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '800',
  },
  forgotLink: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
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
});
