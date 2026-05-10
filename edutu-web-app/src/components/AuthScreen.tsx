import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sun, Moon, Mail, Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';
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

  const [fullName, setFullName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [code, setCode] = useState('');

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const parseError = (err: unknown): string => {
    if (!err) return 'Something went wrong';
    if (typeof err === 'string') return err;
    const e = err as Record<string, unknown>;
    if (e.message && typeof e.message === 'string') return e.message;
    if (e.errors && Array.isArray((e as any).errors) && (e as any).errors.length > 0) {
      const first = (e as any).errors[0];
      return first.message || first.longMessage || 'Authentication failed';
    }
    if (e.status && e.status === 422) return 'Invalid email or password';
    if (e.status && e.status === 429) return 'Too many attempts. Please try again later.';
    return 'Failed to authenticate. Please try again.';
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setError('');
    setOauthLoading(provider);
    try {
      if (provider === 'google') await signInWithGoogle();
      else await signInWithApple();
    } catch (err: unknown) {
      const msg = parseError(err);
      if (!msg.includes('redirect')) setError(msg);
    } finally {
      setOauthLoading(null);
    }
  };

  const handleEmailSignIn = async () => {
    setError('');
    if (!emailAddress.trim()) { setError('Please enter your email'); return; }
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
    if (!fullName.trim()) { setError('Please enter your name'); return; }
    if (!emailAddress.trim()) { setError('Please enter your email'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await signUpWithEmail(emailAddress.trim(), password, fullName.trim().split(' ')[0], fullName.trim().split(' ').slice(1).join(' ') || '');
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
        setError('Verification is not complete yet.');
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
      if (signUp) await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    } catch { /* silently fail */ }
  };

  useEffect(() => {
    setError('');
    if (nameRef.current) nameRef.current.focus();
    else if (emailRef.current) emailRef.current.focus();
  }, [mode]);

  const dark = isDarkMode;

  const inputClasses = (field: string) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
      focusedField === field
        ? dark ? 'border-indigo-500 bg-white/5 ring-1 ring-indigo-500' : 'border-indigo-500 bg-white ring-1 ring-indigo-500'
        : dark ? 'border-white/10 bg-white/5 hover:bg-white/[0.07]' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
    } border`;

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ backgroundColor: dark ? '#080808' : '#ffffff', color: dark ? '#f5f5f5' : '#080808', fontFamily: "'Inter', 'Arial', sans-serif" }}
    >
      {/* Dark Mode Toggle */}
      <div className="absolute top-4 right-4 z-50">
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={toggleDarkMode}
          className="p-3 rounded-xl border transition-all"
          style={{ border: `1px solid ${dark ? '#363636' : '#d8d8d8'}`, backgroundColor: dark ? '#222' : 'transparent' }}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </motion.button>
      </div>

      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm w-full">
          {/* Logo */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-4" style={{ background: dark ? '#1a1a1a' : '#f5f5f5' }}>
              <img src="/edutu-logo.png" alt="Edutu" className="h-10 w-10 object-contain" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1" style={{ color: dark ? '#ffffff' : '#080808' }}>
              {mode === 'sign-in' ? 'Welcome back' : mode === 'sign-up' ? 'Create account' : 'Check your email'}
            </h1>
            <p className="text-sm" style={{ color: dark ? '#737373' : '#6b7280' }}>
              {mode === 'sign-in'
                ? 'Sign in to continue'
                : mode === 'sign-up'
                  ? 'Start your journey'
                  : `Code sent to ${emailAddress}`}
            </p>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="mb-6 px-4 py-3 text-sm rounded-lg text-center overflow-hidden"
                style={{ backgroundColor: dark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)', color: dark ? '#fca5a5' : '#dc2626' }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {mode === 'verify' ? (
              <motion.div key="verify" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-5">
                <input
                  type="text" inputMode="numeric" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className={`w-full px-4 py-3 rounded-lg text-center text-lg tracking-widest outline-none transition-all border ${
                    dark ? 'bg-white/5 border-white/10 focus:border-indigo-500 text-white' : 'bg-slate-50 border-slate-200 focus:border-indigo-500 text-slate-900'
                  }`}
                  placeholder="000000" autoFocus
                />
                <button
                  onClick={handleVerifyEmail} disabled={code.length < 6 || loading}
                  className="w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: code.length >= 6 ? '#146ef5' : dark ? '#222' : '#e2e8f0',
                    color: code.length >= 6 ? '#fff' : dark ? '#666' : '#94a3b8',
                    cursor: code.length < 6 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? 'Verifying...' : 'Verify'}
                </button>
                <button onClick={handleResendCode} className="w-full text-sm" style={{ color: '#146ef5' }}>
                  Resend code
                </button>
              </motion.div>
            ) : (
              <motion.div key={mode} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                {/* Social */}
                <div className="flex gap-3">
                  {([
                    { id: 'google', label: 'Google', icon: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> },
                    { id: 'apple', label: 'Apple', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" /></svg> },
                  ] as const).map(({ id, label, icon }) => (
                    <button key={id} onClick={() => handleOAuth(id as 'google' | 'apple')} disabled={oauthLoading !== null}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-all border ${
                        oauthLoading !== null ? 'opacity-50 cursor-not-allowed' : ''
                      } ${dark ? 'border-white/10 bg-white/5 hover:bg-white/[0.07] text-slate-300' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}
                    >
                      {icon} {oauthLoading === id ? 'Connecting...' : label}
                    </button>
                  ))}
                </div>

                {/* Divider */}
                <div className="relative">
                  <div className={`absolute inset-0 flex items-center`}><div className={`w-full border-t`} style={{ borderColor: dark ? '#222' : '#e2e8f0' }} /></div>
                  <div className="relative flex justify-center">
                    <span className="px-3 text-xs" style={{ backgroundColor: dark ? '#080808' : '#ffffff', color: dark ? '#525252' : '#9ca3af' }}>or</span>
                  </div>
                </div>

                {/* Name (signup) */}
                <AnimatePresence>
                  {mode === 'sign-up' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className={inputClasses('name')}>
                        <User size={16} style={{ color: dark ? '#666' : '#9ca3af' }} />
                        <input ref={nameRef} type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)}
                          className="flex-1 text-sm outline-none bg-transparent" style={{ color: dark ? '#fff' : '#080808' }} placeholder="Full name" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email */}
                <div className={inputClasses('email')}>
                  <Mail size={16} style={{ color: dark ? '#666' : '#9ca3af' }} />
                  <input ref={emailRef} type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)}
                    className="flex-1 text-sm outline-none bg-transparent" style={{ color: dark ? '#fff' : '#080808' }} placeholder="Email" />
                </div>

                {/* Password */}
                <div className={inputClasses('password')}>
                  <Lock size={16} style={{ color: dark ? '#666' : '#9ca3af' }} />
                  <input ref={passwordRef} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)}
                    className="flex-1 text-sm outline-none bg-transparent" style={{ color: dark ? '#fff' : '#080808' }} placeholder="Password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="flex-shrink-0" style={{ color: dark ? '#666' : '#9ca3af', background: 'none', border: 'none' }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Submit */}
                <button
                  onClick={mode === 'sign-in' ? handleEmailSignIn : handleEmailSignUp} disabled={loading}
                  className="w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all hover:shadow-lg active:scale-[0.99]"
                  style={{ background: '#146ef5', color: '#fff', boxShadow: '0 2px 8px rgba(20,110,245,0.3)' }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  {loading ? (mode === 'sign-in' ? 'Signing in...' : 'Creating account...') : (mode === 'sign-in' ? 'Sign in' : 'Create account')}
                </button>

                {/* Toggle */}
                <p className="text-center text-sm" style={{ color: dark ? '#525252' : '#9ca3af' }}>
                  {mode === 'sign-in' ? "Don't have an account? " : 'Already have one? '}
                  <button onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(''); }} className="font-medium" style={{ color: '#146ef5' }}>
                    {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
                  </button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          <p className="text-center text-xs mt-8" style={{ color: dark ? '#444' : '#ababab' }}>
            By continuing, you agree to Edutu's Terms & Privacy Policy
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default AuthScreen;
