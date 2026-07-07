import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth, useOAuth, useSignIn, useUser } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { ArrowRight, Eye, EyeOff, Lock, LogIn, Mail, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '../../components/auth/AuthShell';
import { useTheme } from '../../components/context/ThemeContext';
import i18n from '../../lib/i18n';

WebBrowser.maybeCompleteAuthSession();

const SOCIAL_SIGN_IN_HINT = 'signIn.errors.socialSignInHint';

const PASSWORD_ERROR_CODES = new Set([
  'form_password_incorrect',
  'form_identifier_not_found',
  'form_param_format_invalid',
]);

type SecondFactorStrategy = 'email_code' | 'phone_code' | 'totp' | 'backup_code';

interface SecondFactor {
  strategy: SecondFactorStrategy;
  phoneNumberId?: string;
  emailAddressId?: string;
  safeIdentifier?: string;
}

interface TwoFactorState {
  strategy: SecondFactorStrategy;
  hint: string;
  /** Delivered codes (email/SMS) can be re-sent; TOTP and backup codes cannot. */
  deliverable: boolean;
  phoneNumberId?: string;
  emailAddressId?: string;
}

function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase();
}

function pickSecondFactor(attempt: any): SecondFactor | null {
  const factors: any[] = attempt?.supportedSecondFactors ?? [];
  const byStrategy = (strategy: SecondFactorStrategy) => factors.find((f) => f?.strategy === strategy);
  // Prefer a delivered one-time code (email, then SMS) since most accounts have
  // no authenticator app; fall back to TOTP, then a backup code.
  const preferred =
    byStrategy('email_code') ??
    byStrategy('phone_code') ??
    byStrategy('totp') ??
    byStrategy('backup_code') ??
    factors[0];
  return preferred ?? null;
}

function isDeliverable(strategy: SecondFactorStrategy) {
  return strategy === 'email_code' || strategy === 'phone_code';
}

function secondFactorHint(strategy: SecondFactorStrategy, safeIdentifier?: string) {
  if (strategy === 'email_code') {
    return i18n.t('auth:signIn.twoFactor.hintEmail', {
      identifier: safeIdentifier ?? i18n.t('auth:signIn.twoFactor.fallbackEmail'),
    });
  }
  if (strategy === 'phone_code') {
    return i18n.t('auth:signIn.twoFactor.hintPhone', {
      identifier: safeIdentifier ?? i18n.t('auth:signIn.twoFactor.fallbackPhone'),
    });
  }
  if (strategy === 'backup_code') {
    return i18n.t('auth:signIn.twoFactor.hintBackup');
  }
  return i18n.t('auth:signIn.twoFactor.hintAuthenticator');
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
  const { t } = useTranslation('auth');

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
  const [twoFactor, setTwoFactor] = React.useState<TwoFactorState | null>(null);
  const [code, setCode] = React.useState('');
  const [resendIn, setResendIn] = React.useState(0);
  const shouldShowPasswordRecovery = failedAttempts > 0 && Boolean(normalizeEmailAddress(emailAddress));
  const isBackupCode = twoFactor?.strategy === 'backup_code';
  const canVerify = isBackupCode ? code.trim().length >= 4 : code.trim().length === 6;

  React.useEffect(() => {
    if (resendIn <= 0) {
      return;
    }
    const timer = setInterval(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

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

      setError(err.errors?.[0]?.message || t('oauth.failed', { provider }));
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
        setFailedEmail('');
        setFailedAttempts(0);
        await beginSecondFactor(signInAttempt);
      } else {
        setError(t('signIn.errors.notCompleted'));
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
        setError(t(SOCIAL_SIGN_IN_HINT));
      } else {
        setError(err.errors?.[0]?.message || t('signIn.errors.failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const beginSecondFactor = async (attempt: any) => {
    if (!signIn) {
      return;
    }

    const factor = pickSecondFactor(attempt);

    if (!factor) {
      setError(t('signIn.errors.noSecondFactor'));
      return;
    }

    // Delivered codes (email / SMS) must be requested before they can be
    // entered; TOTP and backup codes are already available on the device.
    const delivered = isDeliverable(factor.strategy);
    if (delivered) {
      const sent = await sendSecondFactorCode(factor.strategy, factor.phoneNumberId, factor.emailAddressId);
      if (!sent) {
        return;
      }
    }

    setCode('');
    setError('');
    setResendIn(delivered ? 30 : 0);
    setTwoFactor({
      strategy: factor.strategy,
      hint: secondFactorHint(factor.strategy, factor.safeIdentifier),
      deliverable: delivered,
      phoneNumberId: factor.phoneNumberId,
      emailAddressId: factor.emailAddressId,
    });
  };

  const sendSecondFactorCode = async (
    strategy: SecondFactorStrategy,
    phoneNumberId?: string,
    emailAddressId?: string,
  ) => {
    if (!signIn) {
      return false;
    }

    try {
      if (strategy === 'phone_code') {
        await signIn.prepareSecondFactor({ strategy: 'phone_code', phoneNumberId });
      } else if (strategy === 'email_code') {
        await signIn.prepareSecondFactor({ strategy: 'email_code', emailAddressId });
      }
      return true;
    } catch (err: any) {
      setError(err?.errors?.[0]?.message || t('signIn.errors.sendCodeFailed'));
      return false;
    }
  };

  const resendSecondFactorCode = async () => {
    if (!twoFactor || !twoFactor.deliverable || resendIn > 0 || loading) {
      return;
    }

    const sent = await sendSecondFactorCode(twoFactor.strategy, twoFactor.phoneNumberId, twoFactor.emailAddressId);
    if (sent) {
      setError('');
      setResendIn(30);
    }
  };

  const onVerifyTwoFactor = async () => {
    if (!isLoaded || !twoFactor || loading) {
      return;
    }

    setError('');
    setLoading(true);

    try {
      const result = await signIn.attemptSecondFactor({
        strategy: twoFactor.strategy,
        code: code.trim(),
      });

      if (result.status === 'complete') {
        setTwoFactor(null);
        setCode('');
        await setActive({ session: result.createdSessionId });
      } else {
        setError(t('signIn.errors.codeRejected'));
      }
    } catch (err: any) {
      setError(err?.errors?.[0]?.message || t('signIn.errors.codeInvalid'));
    } finally {
      setLoading(false);
    }
  };

  const cancelTwoFactor = () => {
    setTwoFactor(null);
    setCode('');
    setError('');
    setPassword('');
    setResendIn(0);
  };

  const handleForgotPassword = () => {
    if (!emailAddress.trim()) {
      Alert.alert(t('signIn.alerts.emailRequired.title'), t('signIn.alerts.emailRequired.message'));
      return;
    }

    router.push({
      pathname: '/(auth)/reset-password',
      params: { email: emailAddress },
    });
  };

  const errorBanner = error ? (
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
  ) : null;

  return (
    <AuthShell
      title={twoFactor ? t('signIn.twoFactor.title') : t('signIn.title')}
      subtitle={twoFactor ? t('signIn.twoFactor.subtitle') : t('signIn.subtitle')}
      icon={twoFactor ? ShieldCheck : LogIn}
    >
      <View style={styles.formStack}>
        {twoFactor ? (
          <>
            <View
              style={[
                styles.infoBox,
                {
                  backgroundColor: isDark ? 'rgba(37, 99, 235, 0.16)' : 'rgba(219, 234, 254, 0.9)',
                  borderColor: isDark ? 'rgba(96, 165, 250, 0.32)' : '#BFDBFE',
                },
              ]}
            >
              <ShieldCheck color="#3B82F6" size={20} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>{twoFactor.hint}</Text>
            </View>

            {errorBanner}

            <View style={[styles.inputPill, styles.codePill, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                autoFocus
                keyboardType={isBackupCode ? 'default' : 'number-pad'}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                placeholder={isBackupCode ? t('signIn.twoFactor.backupCodePlaceholder') : '••••••'}
                placeholderTextColor={colors.textSecondary}
                value={code}
                onChangeText={(text) =>
                  setCode(isBackupCode ? text.trim() : text.replace(/[^0-9]/g, '').slice(0, 6))
                }
                maxLength={isBackupCode ? 16 : 6}
                returnKeyType="done"
                onSubmitEditing={onVerifyTwoFactor}
                style={[styles.codeInput, { color: colors.foreground }]}
              />
            </View>

            <Pressable
              onPress={onVerifyTwoFactor}
              disabled={loading || !canVerify}
              style={[
                styles.signInButton,
                { backgroundColor: '#2563EB', marginTop: 4 },
                (loading || !canVerify) && styles.buttonDisabled,
              ]}
            >
              <ShieldCheck color="#FFFFFF" size={18} />
              <Text style={styles.signInButtonText}>{loading ? t('signIn.twoFactor.verifying') : t('signIn.twoFactor.verifyButton')}</Text>
            </Pressable>

            {twoFactor.deliverable ? (
              <Pressable
                onPress={resendSecondFactorCode}
                disabled={resendIn > 0 || loading}
                style={styles.forgotLink}
              >
                <Text style={[styles.footerLink, { color: resendIn > 0 ? colors.textSecondary : '#2563EB' }]}>
                  {resendIn > 0 ? t('signIn.twoFactor.resendIn', { seconds: resendIn }) : t('signIn.twoFactor.resendCode')}
                </Text>
              </Pressable>
            ) : null}

            <Pressable onPress={cancelTwoFactor} style={styles.forgotLink}>
              <Text style={[styles.footerLink, { color: colors.textSecondary }]}>{t('signIn.twoFactor.useDifferentAccount')}</Text>
            </Pressable>
          </>
        ) : (
          <>
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
                  {oauthLoading === 'google' ? t('oauth.connecting') : 'Google'}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.oauthButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleOAuth('apple')}
                disabled={oauthLoading !== null}
              >
                <AppleIcon size={20} color={colors.foreground} />
                <Text style={[styles.oauthLabel, { color: colors.foreground }]}>
                  {oauthLoading === 'apple' ? t('oauth.connecting') : 'Apple'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>{t('oauth.orContinueWithEmail')}</Text>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </View>

            {errorBanner}

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
                  placeholder={t('signIn.passwordPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={onSignInPress}
                  returnKeyType="go"
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
              <Text style={styles.signInButtonText}>{loading ? t('signIn.signingIn') : t('signIn.signInButton')}</Text>
            </Pressable>

            <Pressable onPress={handleForgotPassword} style={styles.forgotLink}>
              <Text style={[styles.footerLink, { color: '#2563EB' }]}>
                {shouldShowPasswordRecovery ? t('signIn.forgotPasswordReset') : t('signIn.forgotPassword')}
              </Text>
            </Pressable>

            <View style={styles.footerRow}>
              <Text style={[styles.footerText, { color: colors.textSecondary }]}>{t('signIn.newToEdutu')}</Text>
              <Link href="/(auth)/sign-up">
                <Text style={[styles.footerLink, { color: '#2563EB' }]}>{t('signIn.createAccount')}</Text>
              </Link>
            </View>
          </>
        )}
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
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  codePill: {
    justifyContent: 'center',
  },
  codeInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 8,
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
