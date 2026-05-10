import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sun, Moon, Mail, Lock, User, Eye, EyeOff, ArrowRight, Chrome } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

interface AuthScreenProps {
  onAuthSuccess: (userData: any) => void;
}

type AuthMode = 'sign-in' | 'sign-up' | 'verify';

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const navigate = useNavigate();
  const { signInWithGoogle, signInWithApple, signInWithEmail, signUpWithEmail } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();

  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');

  // Email/password fields
  const [fullName, setFullName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Verification code
  const [code, setCode] = useState('');

  // ─── Helpers ──────────────────────────────────────────────
  const parseError = (err: unknown): string => {
    if (!err) return 'Something went wrong';
    if (typeof err === 'string') return err;
    const e = err as Record<string, unknown>;
    // Clerk error shape
    if (e.message && typeof e.message === 'string') return e.message;
    if (e.errors && Array.isArray((e as any).errors) && (e as any).errors.length > 0) {
      const first = (e as any).errors[0];
      return first.message || first.longMessage || 'Authentication failed';
    }
    if (e.status && e.status === 422) return 'Invalid email or password';
    if (e.status && e.status === 429) return 'Too many attempts. Please try again later.';
    return 'Failed to authenticate. Please try again.';
  };

  // ─── Handlers ─────────────────────────────────────────────
  const handleOAuth = async (provider: 'google' | 'apple') => {
    setError('');
    setOauthLoading(provider);
    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithApple();
      }
    } catch (err: unknown) {
      const msg = parseError(err);
      if (!msg.includes('redirect')) {
        setError(msg);
      }
    } finally {
      setOauthLoading(null);
    }
  };

  const handleEmailSignIn = async () => {
    setError('');
    if (!emailAddress.trim()) { setError('Please enter your email address'); return; }
    if (!password.trim()) { setError('Please enter your password'); return; }

    setLoading(true);
    try {
      await signInWithEmail(emailAddress.trim(), password);
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async () => {
    setError('');
    if (!fullName.trim()) { setError('Please enter your full name'); return; }
    if (!emailAddress.trim()) { setError('Please enter your email address'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }

    setLoading(true);
    try {
      await signUpWithEmail(
        emailAddress.trim(),
        password,
        fullName.trim().split(' ')[0],
        fullName.trim().split(' ').slice(1).join(' ') || '',
      );
      setMode('verify');
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    setError('');
    if (code.length < 6) { setError('Please enter the 6-digit code'); return; }

    setLoading(true);
    try {
      const signUp = window.Clerk?.signUp;
      if (!signUp) throw new Error('Clerk not initialized');
      const attempt = await signUp.attemptEmailAddressVerification({ code });
      if (attempt.status === 'complete') {
        onAuthSuccess({ id: attempt.createdUserId, email: emailAddress, name: fullName });
      } else {
        setError('Verification is not complete yet. Try again.');
      }
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    try {
      const signUp = window.Clerk?.signUp;
      if (signUp) {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      }
    } catch {
      // silently fail
    }
  };

  // ─── Input component ──────────────────────────────────────
  const InputField = ({
    icon,
    type = 'text',
    value,
    onChange,
    placeholder,
    error,
    rightContent,
    autoFocus,
  }: {
    icon: React.ReactNode;
    type?: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    error?: string;
    rightContent?: React.ReactNode;
    autoFocus?: boolean;
  }) => (
    <div
      className="flex items-center gap-3 px-4 py-3 transition-all border-b-2"
      style={{
        borderBottomColor: error ? '#ef4444' : isDarkMode ? '#363636' : '#d8d8d8',
        borderTopColor: 'transparent',
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
      }}
    >
      <span className={`shrink-0 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
        {icon}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`flex-1 text-[15px] outline-none bg-transparent ${
          isDarkMode ? 'text-white placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'
        }`}
      />
      {rightContent}
    </div>
  );

  // ─── Primary button ───────────────────────────────────────
  const PrimaryButton = ({
    onClick,
    disabled,
    loading,
    label,
    loadingLabel,
  }: {
    onClick: () => void;
    disabled: boolean;
    loading: boolean;
    label: string;
    loadingLabel: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full py-3.5 text-[15px] font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 ${
        disabled || loading
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0'
      }`}
      style={{
        backgroundColor: '#146ef5',
        color: '#ffffff',
        boxShadow: '0 2px 12px rgba(20,110,245,0.35)',
      }}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
      {loading ? loadingLabel : label}
    </button>
  );

  // ─── OAuth button ─────────────────────────────────────────
  const OAuthButton = ({
    provider,
    label,
    icon,
    onClick,
  }: {
    provider: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      disabled={oauthLoading !== null}
      className={`flex-1 py-3 text-[14px] font-medium rounded-xl flex items-center justify-center gap-2 transition-all border ${
        oauthLoading !== null
          ? 'opacity-50 cursor-not-allowed'
          : isDarkMode
            ? 'hover:bg-white/5 hover:border-white/20'
            : 'hover:bg-slate-50 hover:border-slate-300'
      } ${
        isDarkMode
          ? 'border-white/10 bg-white/5 text-slate-300'
          : 'border-slate-200 bg-white text-slate-700 shadow-sm'
      }`}
    >
      {icon}
      {oauthLoading === provider ? 'Connecting...' : label}
    </button>
  );

  // ─── Render ───────────────────────────────────────────────
  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ backgroundColor: isDarkMode ? '#080808' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808', fontFamily: "'Inter', 'Arial', sans-serif" }}
    >
      {/* Dark Mode Toggle */}
      <div className="absolute top-4 right-4 z-50">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleDarkMode}
          className="p-3 rounded-xl border transition-all"
          style={{
            border: `1px solid ${isDarkMode ? '#363636' : '#d8d8d8'}`,
            backgroundColor: isDarkMode ? '#222' : 'transparent',
            color: isDarkMode ? '#f5f5f5' : '#080808'
          }}
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </motion.button>
      </div>

      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full"
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-20 w-20 rounded-xl mb-6 bg-white">
              <img src="/edutu-logo.png" alt="Edutu" className="h-14 w-14 object-contain" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
              {mode === 'sign-in' ? 'Welcome back' : mode === 'sign-up' ? 'Create your account' : 'Verify your email'}
            </h1>
            <p className="text-base" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
              {mode === 'sign-in'
                ? 'Continue where you left off and jump straight into your next opportunity.'
                : mode === 'sign-up'
                  ? 'Start with a lighter first step, then finish your profile inside onboarding.'
                  : `Enter the code sent to ${emailAddress} to unlock your onboarding flow.`}
            </p>
          </div>

          {/* Auth Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="p-6 space-y-6"
            style={{
              backgroundColor: isDarkMode ? '#111' : '#ffffff',
              border: `1px solid ${isDarkMode ? '#222' : '#e2e8f0'}`,
              borderRadius: '16px',
              boxShadow: isDarkMode
                ? '0 4px 24px rgba(0,0,0,0.4)'
                : '0 4px 24px rgba(0,0,0,0.06)'
            }}
          >
            <AnimatePresence mode="wait">
              {mode === 'verify' ? (
                <motion.div
                  key="verify"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  {/* Error */}
                  {error && (
                    <div className="px-4 py-3 text-sm rounded-xl text-center" style={{
                      backgroundColor: isDarkMode ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)',
                      border: `1px solid ${isDarkMode ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)'}`,
                      color: isDarkMode ? '#fca5a5' : '#dc2626'
                    }}>
                      {error}
                    </div>
                  )}

                  <InputField
                    icon={<Lock size={18} />}
                    value={code}
                    onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    autoFocus
                  />

                  <PrimaryButton
                    onClick={handleVerifyEmail}
                    disabled={code.length < 6}
                    loading={loading}
                    label="Verify and continue"
                    loadingLabel="Verifying..."
                  />

                  <button
                    onClick={handleResendCode}
                    className="w-full text-[14px] font-medium cursor-pointer transition-colors"
                    style={{ color: '#146ef5', background: 'none', border: 'none', padding: '8px' }}
                  >
                    Resend code
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5"
                >
                  {/* Social Buttons */}
                  <div className="flex gap-3">
                    <OAuthButton
                      provider="google"
                      label="Google"
                      icon={<span className="text-[16px] font-black" style={{ color: '#EA4335' }}>G</span>}
                      onClick={() => handleOAuth('google')}
                    />
                    <OAuthButton
                      provider="apple"
                      label="Apple"
                      icon={
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={isDarkMode ? 'text-white' : 'text-slate-800'}>
                          <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                        </svg>
                      }
                      onClick={() => handleOAuth('apple')}
                    />
                  </div>

                  {/* Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#e2e8f0'}` }} />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-3 text-[12px] font-medium" style={{ backgroundColor: isDarkMode ? '#111' : '#ffffff', color: isDarkMode ? '#666' : '#94a3b8' }}>
                        or continue with email
                      </span>
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="px-4 py-3 text-sm rounded-xl text-center" style={{
                      backgroundColor: isDarkMode ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)',
                      border: `1px solid ${isDarkMode ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)'}`,
                      color: isDarkMode ? '#fca5a5' : '#dc2626'
                    }}>
                      {error}
                    </div>
                  )}

                  {/* Full Name (sign-up only) */}
                  {mode === 'sign-up' && (
                    <InputField
                      icon={<User size={18} />}
                      value={fullName}
                      onChange={setFullName}
                      placeholder="John Doe"
                      autoFocus
                    />
                  )}

                  {/* Email */}
                  <InputField
                    icon={<Mail size={18} />}
                    type="email"
                    value={emailAddress}
                    onChange={setEmailAddress}
                    placeholder="you@example.com"
                    autoFocus={mode === 'sign-in'}
                  />

                  {/* Password */}
                  <InputField
                    icon={<Lock size={18} />}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={setPassword}
                    placeholder={mode === 'sign-up' ? 'Minimum 8 characters' : 'Enter password'}
                    rightContent={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="cursor-pointer shrink-0"
                        style={{ background: 'none', border: 'none', padding: 0 }}
                      >
                        {showPassword
                          ? <EyeOff size={16} className={isDarkMode ? 'text-slate-600' : 'text-slate-400'} />
                          : <Eye size={16} className={isDarkMode ? 'text-slate-600' : 'text-slate-400'} />
                        }
                      </button>
                    }
                  />

                  {/* Primary Button */}
                  <PrimaryButton
                    onClick={mode === 'sign-in' ? handleEmailSignIn : handleEmailSignUp}
                    disabled={false}
                    loading={loading}
                    label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
                    loadingLabel={mode === 'sign-in' ? 'Signing in...' : 'Creating account...'}
                  />

                  {/* Toggle mode */}
                  <div className="text-center">
                    <p className="text-[14px]" style={{ color: isDarkMode ? '#666' : '#94a3b8' }}>
                      {mode === 'sign-in' ? 'New to Edutu? ' : 'Already have an account? '}
                      <button
                        onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(''); }}
                        className="font-medium cursor-pointer"
                        style={{ color: '#146ef5', background: 'none', border: 'none' }}
                      >
                        {mode === 'sign-in' ? 'Create account' : 'Sign in'}
                      </button>
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Footer */}
          <p className="text-center text-xs mt-8" style={{ color: isDarkMode ? '#5a5a5a' : '#ababab' }}>
            By continuing, you agree to Edutu's Terms of Service and Privacy Policy
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default AuthScreen;
