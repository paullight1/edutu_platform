import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2, LockKeyhole, Mail, ShieldCheck, Star, User } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useClerk, useSignIn, useSignUp } from '@clerk/clerk-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { rememberPostAuthRedirect } from '../lib/auth';

interface AuthScreenProps {
  onAuthSuccess: (userData: any) => void;
}

type AuthMode = 'sign-in' | 'sign-up' | 'verify' | 'verify-sign-in' | 'verify-second-factor' | 'reset-password';
type OAuthProvider = 'google' | 'apple';
type SecondFactorStrategy = 'email_code' | 'phone_code' | 'totp' | 'backup_code' | '';

const GoogleIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335" />
  </svg>
);

const AppleIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25C11.88 5.02 13.69 3.18 15.77 3c.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const AvatarNode = ({ className, label }: { className: string; label: string }) => (
  <div className={`absolute h-14 w-14 rounded-2xl border border-white/60 bg-white/95 p-1.5 shadow-xl ${className}`}>
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white">
      {label}
    </div>
  </div>
);

const FieldShell = ({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) => (
  <label className="block">
    <span className="mb-2 block text-xs font-medium text-slate-700">{label}</span>
    {children}
  </label>
);

const baseInputClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-400';

const describeFactors = (factors: { strategy: string }[] | null | undefined) =>
  factors?.map((factor) => factor.strategy.replace(/_/g, ' ')).join(', ') || 'none returned';

const getEmailCodeFactor = (factors: { strategy: string; emailAddressId?: string; safeIdentifier?: string }[] | null | undefined) =>
  factors?.find((factor) => factor.strategy === 'email_code' && factor.emailAddressId);

const getSecondFactor = (factors: { strategy: string; emailAddressId?: string; phoneNumberId?: string; safeIdentifier?: string }[] | null | undefined) =>
  factors?.find((factor) => factor.strategy === 'email_code')
  || factors?.find((factor) => factor.strategy === 'phone_code')
  || factors?.find((factor) => factor.strategy === 'totp')
  || factors?.find((factor) => factor.strategy === 'backup_code');

const isExistingAccountError = (err: unknown) => {
  const message = typeof err === 'string' ? err : err instanceof Error ? err.message : JSON.stringify(err ?? '');
  return /already exists|already taken|identifier.*taken|form_identifier_exists|email_address_exists/i.test(message);
};

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const { setActive } = useClerk();
  const { signIn: clerkSignIn } = useSignIn();
  const { signUp: clerkSignUp } = useSignUp();
  const location = useLocation();

  const [mode, setMode] = useState<AuthMode>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('signup') === 'true') return 'sign-up';
    if (params.get('mode') === 'sign-in') return 'sign-in';
    return 'sign-up';
  });
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [code, setCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [signInFailureCount, setSignInFailureCount] = useState(0);
  const [signInEmailCodeFactorId, setSignInEmailCodeFactorId] = useState('');
  const [secondFactorStrategy, setSecondFactorStrategy] = useState<SecondFactorStrategy>('');
  const [secondFactorId, setSecondFactorId] = useState('');

  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
    rememberPostAuthRedirect(from ?? null);
  }, [location.state]);

  const parseError = (err: unknown): string => {
    if (!err) return 'Something went wrong';
    if (typeof err === 'string') return err;
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string') return e.message;
    if (Array.isArray(e.errors) && e.errors.length > 0) {
      const first = e.errors[0] as { message?: string; longMessage?: string };
      return first.message || first.longMessage || 'Authentication failed';
    }
    if (e.status === 422) return 'Invalid email or password';
    if (e.status === 429) return 'Too many attempts. Please try again later.';
    return 'Failed to authenticate. Please try again.';
  };

  const resetMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    setCode('');
    setResetPassword('');
    setResetCodeSent(false);
    setSignInEmailCodeFactorId('');
    setSecondFactorStrategy('');
    setSecondFactorId('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowResetPassword(false);
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setError('');
    setOauthLoading(provider);

    try {
      if (provider === 'google') await signInWithGoogle();
      else await signInWithApple();
    } catch (err: unknown) {
      const msg = parseError(err);
      if (!msg.toLowerCase().includes('redirect')) setError(msg);
    } finally {
      setOauthLoading(null);
    }
  };

  const handleEmailSignIn = async () => {
    if (!emailAddress.trim()) throw new Error('Please enter your email');
    if (!password.trim()) throw new Error('Please enter your password');

    if (!clerkSignIn) throw new Error('Clerk is still loading. Please try again.');
    const result = await clerkSignIn.create({
      strategy: 'password',
      identifier: emailAddress.trim(),
      password,
    });

    if (result.status === 'needs_first_factor') {
      const emailCodeFactor = getEmailCodeFactor(result.supportedFirstFactors);
      if (emailCodeFactor?.emailAddressId) {
        await clerkSignIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailCodeFactor.emailAddressId,
        });
        setSignInEmailCodeFactorId(emailCodeFactor.emailAddressId);
        setCode('');
        setMode('verify-sign-in');
        return;
      }
    }

    const completedSignIn = result;

    if (completedSignIn.status === 'needs_second_factor') {
      const factor = getSecondFactor(completedSignIn.supportedSecondFactors);
      if (!factor) {
        throw new Error(`Your account requires a second verification step. Available methods: ${describeFactors(completedSignIn.supportedSecondFactors)}.`);
      }

      if (factor.strategy === 'email_code') {
        await clerkSignIn.prepareSecondFactor({
          strategy: 'email_code',
          emailAddressId: factor.emailAddressId,
        });
        setSecondFactorId(factor.emailAddressId || '');
      } else if (factor.strategy === 'phone_code') {
        await clerkSignIn.prepareSecondFactor({
          strategy: 'phone_code',
          phoneNumberId: factor.phoneNumberId,
        });
        setSecondFactorId(factor.phoneNumberId || '');
      } else {
        setSecondFactorId('');
      }

      setSecondFactorStrategy(factor.strategy as SecondFactorStrategy);
      setCode('');
      setMode('verify-second-factor');
      return;
    }

    if (completedSignIn.status !== 'complete' || !completedSignIn.createdSessionId) {
      if (completedSignIn.status === 'needs_new_password') {
        throw new Error('Clerk requires this account to create a new password before signing in.');
      }

      if (completedSignIn.status === 'needs_identifier') {
        throw new Error('Clerk still needs an email address or username before it can sign you in.');
      }

      if (completedSignIn.status === 'needs_first_factor') {
        throw new Error(`Clerk still needs a first sign-in factor. Available methods: ${describeFactors(completedSignIn.supportedFirstFactors)}.`);
      }

      throw new Error(`Clerk did not complete sign-in. Current status: ${completedSignIn.status ?? 'unknown'}.`);
    }

    await setActive({ session: completedSignIn.createdSessionId });
    setSignInFailureCount(0);
    onAuthSuccess({ email: emailAddress.trim() });
  };

  const handleVerifySecondFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!code.trim()) {
      setError('Please enter your verification code');
      return;
    }

    if (!clerkSignIn) {
      setError('Clerk is still loading. Please try again.');
      return;
    }

    setLoading(true);
    try {
      const attempt = await clerkSignIn.attemptSecondFactor({
        strategy: secondFactorStrategy || 'totp',
        code: code.trim(),
      });

      if (attempt.status === 'complete' && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        setSignInFailureCount(0);
        onAuthSuccess({ email: emailAddress.trim() });
        return;
      }

      setError(`Clerk did not complete sign-in. Current status: ${attempt.status ?? 'unknown'}.`);
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignInEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (code.length < 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    if (!clerkSignIn) {
      setError('Clerk is still loading. Please try again.');
      return;
    }

    setLoading(true);
    try {
      const attempt = await clerkSignIn.attemptFirstFactor({
        strategy: 'email_code',
        code,
      });

      if (attempt.status === 'complete' && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        setSignInFailureCount(0);
        onAuthSuccess({ email: emailAddress.trim() });
        return;
      }

      if (attempt.status === 'needs_second_factor') {
        const factor = getSecondFactor(attempt.supportedSecondFactors);
        if (!factor) {
          setError(`Your account requires a second verification step. Available methods: ${describeFactors(attempt.supportedSecondFactors)}.`);
          return;
        }

        if (factor.strategy === 'email_code') {
          await clerkSignIn.prepareSecondFactor({
            strategy: 'email_code',
            emailAddressId: factor.emailAddressId,
          });
          setSecondFactorId(factor.emailAddressId || '');
        } else if (factor.strategy === 'phone_code') {
          await clerkSignIn.prepareSecondFactor({
            strategy: 'phone_code',
            phoneNumberId: factor.phoneNumberId,
          });
          setSecondFactorId(factor.phoneNumberId || '');
        } else {
          setSecondFactorId('');
        }

        setSecondFactorStrategy(factor.strategy as SecondFactorStrategy);
        setCode('');
        setMode('verify-second-factor');
        return;
      }

      setError(`Clerk did not complete sign-in. Current status: ${attempt.status ?? 'unknown'}.`);
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) throw new Error('Please enter your name');
    if (!emailAddress.trim()) throw new Error('Please enter your email');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    if (password !== confirmPassword) throw new Error('Passwords do not match');
    if (!acceptTerms) throw new Error('Please accept the terms and privacy policy');

    if (!clerkSignUp) throw new Error('Clerk is still loading. Please try again.');

    const result = await clerkSignUp.create({
      emailAddress: emailAddress.trim(),
      password,
      firstName: trimmedName.split(' ')[0],
      lastName: trimmedName.split(' ').slice(1).join(' ') || '',
    });

    if (result.status === 'complete') {
      if (result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
      }
      onAuthSuccess({ id: result.createdUserId, email: emailAddress, name: fullName });
      return;
    }

    await clerkSignUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    setMode('verify');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'sign-in') await handleEmailSignIn();
      if (mode === 'sign-up') await handleEmailSignUp();
    } catch (err: unknown) {
      if (mode === 'sign-in') {
        setSignInFailureCount((count) => count + 1);
      }
      if (mode === 'sign-up' && isExistingAccountError(err)) {
        setMode('sign-in');
        setError('That account already exists. Sign in with the same email to finish verification or resend the code.');
        return;
      }
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!emailAddress.trim()) {
      setError('Please enter your email first');
      emailRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      if (!clerkSignIn) throw new Error('Clerk is still loading. Please try again.');
      await clerkSignIn.create({
        strategy: 'reset_password_email_code',
        identifier: emailAddress.trim(),
      });
      setResetCodeSent(true);
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCompletePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (code.length < 6) {
      setError('Please enter the 6-digit reset code');
      return;
    }

    if (resetPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      if (!clerkSignIn) throw new Error('Clerk is still loading. Please try again.');
      const attempt = await clerkSignIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password: resetPassword,
      });

      if (attempt.status === 'complete') {
        if (attempt.createdSessionId) {
          await setActive({ session: attempt.createdSessionId });
        }
        setSignInFailureCount(0);
        onAuthSuccess({ email: emailAddress });
      } else {
        setError('Password reset is not complete yet.');
      }
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (code.length < 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      if (!clerkSignUp) throw new Error('Clerk is still loading. Please try again.');
      const attempt = await clerkSignUp.attemptEmailAddressVerification({ code });
      if (attempt.status === 'complete') {
        if (attempt.createdSessionId) {
          await setActive({ session: attempt.createdSessionId });
        }
        onAuthSuccess({ id: attempt.createdUserId, email: emailAddress, name: fullName });
      } else {
        setError('Verification is not complete yet.');
      }
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setLoading(true);
    try {
      if (mode === 'verify-sign-in') {
        if (!clerkSignIn) throw new Error('Clerk is still loading. Please try again.');
        const emailCodeFactor = signInEmailCodeFactorId
          ? { emailAddressId: signInEmailCodeFactorId }
          : getEmailCodeFactor(clerkSignIn.supportedFirstFactors);
        if (!emailCodeFactor?.emailAddressId) throw new Error('No email verification method is available for this sign-in.');
        await clerkSignIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailCodeFactor.emailAddressId,
        });
        return;
      }

      if (mode === 'verify-second-factor') {
        if (!clerkSignIn) throw new Error('Clerk is still loading. Please try again.');
        if (secondFactorStrategy === 'email_code') {
          await clerkSignIn.prepareSecondFactor({
            strategy: 'email_code',
            emailAddressId: secondFactorId || undefined,
          });
          return;
        }
        if (secondFactorStrategy === 'phone_code') {
          await clerkSignIn.prepareSecondFactor({
            strategy: 'phone_code',
            phoneNumberId: secondFactorId || undefined,
          });
          return;
        }
        throw new Error('This second-factor method does not support resending a code.');
      }

      if (!clerkSignUp) throw new Error('Clerk is still loading. Please try again.');
      await clerkSignUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const target = mode === 'sign-up' ? nameRef.current : emailRef.current;
    target?.focus();
  }, [mode]);

  const title =
    mode === 'sign-in'
      ? 'Welcome back'
      : mode === 'verify' || mode === 'verify-sign-in'
        ? 'Check your email'
        : mode === 'verify-second-factor'
          ? 'One more step'
        : mode === 'reset-password'
          ? 'Reset password'
          : 'Create Account';
  const subtitle =
    mode === 'verify' || mode === 'verify-sign-in'
      ? `We sent a verification code to ${emailAddress}`
      : mode === 'verify-second-factor'
        ? secondFactorStrategy === 'totp'
          ? 'Enter the code from your authenticator app.'
          : secondFactorStrategy === 'backup_code'
            ? 'Enter one of your backup codes.'
            : 'Enter the second verification code sent by Clerk.'
      : mode === 'reset-password'
        ? resetCodeSent
          ? `Enter the reset code sent to ${emailAddress}`
          : 'Enter your email and we will send you a reset code.'
      : mode === 'sign-in'
        ? 'Sign in to continue your Edutu journey'
        : 'Your information is secure and will not be shared.';

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#081225] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(78,131,255,0.34),transparent_24%),radial-gradient(circle_at_88%_78%,rgba(43,100,255,0.3),transparent_22%)]" />
      <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(rgba(255,255,255,0.55)_1px,transparent_1px)] [background-size:12px_12px]" />

      <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="grid w-full overflow-hidden rounded-[28px] bg-white p-3 shadow-2xl shadow-black/30 lg:grid-cols-[1.08fr_1fr]"
        >
          <aside className="relative hidden min-h-[650px] overflow-hidden rounded-[22px] bg-[#236fff] text-white lg:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(206,238,255,0.8),rgba(94,158,255,0.68)_27%,rgba(35,111,255,0)_50%)]" />
            <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:9px_9px]" />

            <div className="relative z-10 flex h-full flex-col justify-between p-8">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <img src="/edutu-logo.png" alt="" className="h-7 w-7 rounded-lg bg-white/90 p-1" />
                <span>Edutu</span>
              </div>

              <div className="relative mx-auto h-[360px] w-full max-w-[440px]">
                <div className="absolute left-1/2 top-[54%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-sky-100 to-blue-400 shadow-2xl shadow-blue-950/30" />
                <div className="absolute left-1/2 top-[54%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 [background-image:linear-gradient(0deg,transparent_48%,rgba(255,255,255,0.5)_49%,rgba(255,255,255,0.5)_51%,transparent_52%),linear-gradient(90deg,transparent_48%,rgba(255,255,255,0.45)_49%,rgba(255,255,255,0.45)_51%,transparent_52%)] [background-size:100%_38px,38px_100%]" />
                <div className="absolute left-[23%] top-[41%] h-px w-[110px] rotate-[24deg] bg-white/60" />
                <div className="absolute right-[22%] top-[37%] h-px w-[112px] -rotate-[31deg] bg-white/60" />
                <div className="absolute left-[33%] top-[22%] h-[92px] w-px -rotate-[10deg] bg-white/60" />
                <div className="absolute right-[18%] top-[52%] h-px w-[78px] rotate-[8deg] bg-white/60" />
                <AvatarNode className="left-[12%] top-[36%]" label="KA" />
                <AvatarNode className="left-[35%] top-[9%]" label="AM" />
                <AvatarNode className="right-[21%] top-[19%]" label="TO" />
                <AvatarNode className="right-[5%] top-[45%]" label="LM" />
              </div>

              <div className="rounded-2xl bg-gradient-to-t from-blue-950/30 to-white/5 p-6 backdrop-blur-sm">
                <p className="max-w-sm text-2xl font-semibold leading-tight">
                  "Edutu helped me find opportunities I would have missed on my own."
                </p>
                <div className="mt-7 flex items-end justify-between">
                  <div>
                    <p className="font-semibold">Lulu Meyers</p>
                    <p className="mt-1 text-sm text-white/70">Scholarship applicant</p>
                  </div>
                  <div className="flex items-center gap-1 text-yellow-300" aria-label="Five star rating">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={index} size={17} fill="currentColor" strokeWidth={0} />
                    ))}
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white/80">
                    <ArrowLeft size={17} />
                  </button>
                  <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white/80">
                    <ArrowRight size={17} />
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <div className="flex min-h-[650px] items-center justify-center bg-white px-5 py-8 sm:px-8 lg:px-12">
            <div className="w-full max-w-[360px]">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 shadow-inner">
                  {mode === 'verify' || mode === 'verify-sign-in' || mode === 'verify-second-factor' || mode === 'reset-password' ? <ShieldCheck className="text-blue-600" size={27} /> : <User className="text-slate-700" size={26} />}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
                <p className="mt-2 text-sm leading-5 text-slate-500">{subtitle}</p>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-center text-sm text-red-600"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {mode === 'verify' || mode === 'verify-sign-in' || mode === 'verify-second-factor' ? (
                <form onSubmit={mode === 'verify-second-factor' ? handleVerifySecondFactor : mode === 'verify-sign-in' ? handleVerifySignInEmail : handleVerifyEmail} className="space-y-5">
                  <FieldShell label="Verification code">
                    <input
                      type="text"
                      inputMode={secondFactorStrategy === 'backup_code' ? 'text' : 'numeric'}
                      maxLength={secondFactorStrategy === 'backup_code' ? 32 : 6}
                      value={code}
                      onChange={(event) => setCode(
                        mode === 'verify-second-factor' && secondFactorStrategy === 'backup_code'
                          ? event.target.value.trim().slice(0, 32)
                          : event.target.value.replace(/\D/g, '').slice(0, 6),
                      )}
                      className={`${baseInputClass} text-center text-lg tracking-[0.45em]`}
                      placeholder={secondFactorStrategy === 'backup_code' ? 'BACKUPCODE' : '000000'}
                      autoFocus
                    />
                  </FieldShell>
                  <button
                    type="submit"
                    disabled={loading || code.length < 6}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                  >
                    {loading ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                    {loading ? 'Verifying...' : mode === 'verify-second-factor' || mode === 'verify-sign-in' ? 'Verify and sign in' : 'Verify email'}
                  </button>
                  {(mode !== 'verify-second-factor' || secondFactorStrategy === 'email_code' || secondFactorStrategy === 'phone_code') && (
                    <button type="button" onClick={handleResendCode} disabled={loading} className="w-full text-center text-sm font-medium text-blue-600 disabled:text-slate-300">
                      Resend code
                    </button>
                  )}
                </form>
              ) : mode === 'reset-password' ? (
                <form onSubmit={resetCodeSent ? handleCompletePasswordReset : handleSendPasswordReset} className="space-y-4">
                  <FieldShell label="Email">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                      <input
                        ref={emailRef}
                        type="email"
                        value={emailAddress}
                        onChange={(event) => setEmailAddress(event.target.value)}
                        className={`${baseInputClass} pl-11`}
                        placeholder="e.g. ahmed@edutu.org"
                        autoComplete="email"
                        disabled={resetCodeSent}
                      />
                    </div>
                  </FieldShell>

                  {resetCodeSent && (
                    <>
                      <FieldShell label="Reset code">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={code}
                          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                          className={`${baseInputClass} text-center text-lg tracking-[0.45em]`}
                          placeholder="000000"
                          autoFocus
                        />
                      </FieldShell>

                      <FieldShell label="New password">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                            <LockKeyhole size={15} strokeWidth={1.9} />
                          </span>
                          <input
                            type={showResetPassword ? 'text' : 'password'}
                            value={resetPassword}
                            onChange={(event) => setResetPassword(event.target.value)}
                            className={`${baseInputClass} pl-12 pr-11`}
                            placeholder="Create a new password"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowResetPassword((value) => !value)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                            aria-label={showResetPassword ? 'Hide new password' : 'Show new password'}
                          >
                            {showResetPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                          </button>
                        </div>
                      </FieldShell>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={loading || (resetCodeSent && (code.length < 6 || resetPassword.length < 8))}
                    className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                  >
                    {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
                    {loading ? 'Please wait...' : resetCodeSent ? 'Reset password' : 'Send reset code'}
                  </button>

                  <button
                    type="button"
                    onClick={() => resetMode('sign-in')}
                    className="w-full text-center text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Back to sign in
                  </button>
                </form>
              ) : (
                <>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === 'sign-up' && (
                      <FieldShell label="Name">
                        <div className="relative">
                          <User className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                          <input
                            ref={nameRef}
                            type="text"
                            value={fullName}
                            onChange={(event) => setFullName(event.target.value)}
                            className={`${baseInputClass} pl-11`}
                            placeholder="e.g. Amina Bello"
                            autoComplete="name"
                          />
                        </div>
                      </FieldShell>
                    )}

                    <FieldShell label="Email">
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                        <input
                          ref={emailRef}
                          type="email"
                          value={emailAddress}
                          onChange={(event) => setEmailAddress(event.target.value)}
                          className={`${baseInputClass} pl-11`}
                          placeholder="e.g. ahmed@edutu.org"
                          autoComplete="email"
                        />
                      </div>
                    </FieldShell>

                    <FieldShell label="Password">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <LockKeyhole size={15} strokeWidth={1.9} />
                        </span>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          className={`${baseInputClass} pl-12 pr-11`}
                          placeholder="Enter your password"
                          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                    </FieldShell>

                    {mode === 'sign-in' && signInFailureCount >= 1 && (
                      <div className="-mt-1 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                        <p className="text-xs font-medium leading-5 text-blue-950">
                          Password not working? Send a recovery code to reset it.
                        </p>
                        <button
                          type="button"
                          onClick={() => resetMode('reset-password')}
                          className="mt-2 text-xs font-bold text-blue-700 hover:text-blue-800"
                        >
                          Recover password
                        </button>
                      </div>
                    )}

                    {mode === 'sign-up' && (
                      <>
                        <FieldShell label="Confirm password">
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                              <LockKeyhole size={15} strokeWidth={1.9} />
                            </span>
                            <input
                              type={showConfirmPassword ? 'text' : 'password'}
                              value={confirmPassword}
                              onChange={(event) => setConfirmPassword(event.target.value)}
                              className={`${baseInputClass} pl-12 pr-11`}
                              placeholder="Repeat your password"
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword((value) => !value)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                            >
                              {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                            </button>
                          </div>
                        </FieldShell>

                        <label className="flex items-start gap-2 text-xs text-slate-500">
                          <input
                            type="checkbox"
                            checked={acceptTerms}
                            onChange={(event) => setAcceptTerms(event.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>
                            I agree to Edutu's terms and privacy policy.
                          </span>
                        </label>

                        <div
                          id="clerk-captcha"
                          className="min-h-[65px] rounded-xl border border-slate-100 bg-slate-50/70 p-2"
                        />
                      </>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
                      {loading ? (mode === 'sign-in' ? 'Signing in...' : 'Creating account...') : mode === 'sign-in' ? 'Sign in' : 'Create an account'}
                    </button>
                  </form>

                  <p className="mt-5 text-center text-sm text-slate-500">
                    {mode === 'sign-in' ? "Don't have an account? " : 'Already have an account? '}
                    <button
                      type="button"
                      onClick={() => resetMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
                      className="font-semibold text-blue-600 hover:text-blue-700"
                    >
                      {mode === 'sign-in' ? 'Sign up' : 'Log in'}
                    </button>
                  </p>

                  <div className="my-6 flex items-center gap-4">
                    <div className="h-px flex-1 bg-slate-100" />
                    <span className="text-xs text-slate-400">OR</span>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleOAuth('google')}
                      disabled={oauthLoading !== null}
                      className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {oauthLoading === 'google' ? <Loader2 size={16} className="animate-spin" /> : <GoogleIcon />}
                      Google
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOAuth('apple')}
                      disabled={oauthLoading !== null}
                      className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {oauthLoading === 'apple' ? <Loader2 size={16} className="animate-spin" /> : <AppleIcon />}
                      Apple
                    </button>
                  </div>
                </>
              )}

              <p className="mt-8 text-center text-xs leading-5 text-slate-400">
                By continuing, you agree to Edutu's Terms & Privacy Policy.
              </p>
            </div>
          </div>
        </motion.div>
      </section>
    </main>
  );
};

export default AuthScreen;
