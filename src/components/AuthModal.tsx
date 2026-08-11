import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Lock, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { AuthResponse } from '../types';
import { GoogleLogin } from "@react-oauth/google";
import { API_ENDPOINTS, AUTH_TOKEN_KEY, apiPost } from '../api';

interface AuthModalProps {
  onClose?: () => void;
  onAuthSuccess: (data: AuthResponse) => void;
}

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

export const AuthModal = ({ onClose, onAuthSuccess }: AuthModalProps) => {
  const [mode, setMode] = useState<Mode>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const resetTransientState = () => {
    setError('');
    setInfo('');
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetTransientState();
    setLoading(true);

    try {
      if (mode === 'login') {
        const data = await apiPost<any>(API_ENDPOINTS.auth.login, { email, password });
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        onAuthSuccess(data);
        return;
      }

      if (mode === 'register') {
        const data = await apiPost<any>(API_ENDPOINTS.auth.register, {
          name: `${firstName} ${lastName}`,
          email,
          password,
        });

        if (data.requiresVerification) {
          setInfo(`We've sent a 6-digit code to ${email}.`);
          setMode('verify');
          return;
        }

        // Fallback, in case a server without verification enabled returns a token directly
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        onAuthSuccess(data);
        return;
      }

      if (mode === 'verify') {
        const data = await apiPost<any>(API_ENDPOINTS.auth.verifyEmail, { email, code });
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        onAuthSuccess(data);
        return;
      }

      if (mode === 'forgot') {
        await apiPost<any>(API_ENDPOINTS.auth.forgotPassword, { email });
        setInfo('If that email is registered, a reset code has been sent.');
        setMode('reset');
        return;
      }

      if (mode === 'reset') {
        if (newPassword.length < 6) {
          setError('New password must be at least 6 characters');
          return;
        }
        if (newPassword !== confirmNewPassword) {
          setError('Passwords do not match');
          return;
        }
        await apiPost<any>(API_ENDPOINTS.auth.resetPassword, { email, code, newPassword });
        setInfo('Password reset successfully. Please sign in.');
        setPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setCode('');
        setMode('login');
        return;
      }
    } catch (err: any) {
      // Special-cased: login blocked because the account isn't verified yet —
      // send the user straight to the verify screen instead of a dead-end error.
      if (mode === 'login' && err?.code === 'EMAIL_NOT_VERIFIED') {
        setInfo('Please verify your email to continue.');
        setMode('verify');
        return;
      }
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    resetTransientState();
    setLoading(true);
    try {
      await apiPost<any>(API_ENDPOINTS.auth.resendVerification, { email });
      setInfo('A new code has been sent.');
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    resetTransientState();
    setLoading(true);
    try {
      const data = await apiPost<any>(API_ENDPOINTS.auth.google, { idToken: credentialResponse.credential });
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      onAuthSuccess(data);
    } catch (err: any) {
      setError(err.message || 'Google authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const headings: Record<Mode, { title: string; subtitle: string; icon: React.ReactNode }> = {
    login: { title: 'Sign In', subtitle: 'Access your grading dashboard', icon: <Mail size={16} className="text-accent-blue" /> },
    register: { title: 'Create Account', subtitle: 'Access your grading dashboard', icon: <Mail size={16} className="text-accent-blue" /> },
    verify: { title: 'Verify Your Email', subtitle: `Enter the code sent to ${email}`, icon: <ShieldCheck size={16} className="text-accent-blue" /> },
    forgot: { title: 'Forgot Password', subtitle: 'We\'ll email you a reset code', icon: <Lock size={16} className="text-accent-blue" /> },
    reset: { title: 'Reset Password', subtitle: `Enter the code sent to ${email}`, icon: <Lock size={16} className="text-accent-blue" /> },
  };

  const heading = headings[mode];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 20 }}
          transition={{ duration: 0.2 }}
          onClick={e => e.stopPropagation()}
          className="bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-accent-blue/10 rounded-xl flex items-center justify-center">
                {heading.icon}
              </div>
              <div>
                <p className="text-[13px] font-black text-white">{heading.title}</p>
                <p className="text-[10px] text-gray-500">{heading.subtitle}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-colors">
              <X size={15} />
            </button>
          </div>

          <div className="p-5 flex flex-col gap-4">
            {(mode === 'login' || mode === 'register') && (
              <>
                <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setError('Google Sign-In failed')} />
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-800" />
                  <span className="text-xs text-gray-600">OR</span>
                  <div className="flex-1 h-px bg-gray-800" />
                </div>
              </>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400">
                {error}
              </div>
            )}
            {info && !error && (
              <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-lg p-3 text-xs text-accent-blue">
                {info}
              </div>
            )}

            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
              {mode === 'register' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">First Name</label>
                    <input
                      type="text"
                      className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-[12px] text-white focus:border-accent-blue focus:outline-none transition-colors placeholder:text-gray-600"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Last Name</label>
                    <input
                      type="text"
                      className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-[12px] text-white focus:border-accent-blue focus:outline-none transition-colors placeholder:text-gray-600"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Email Address</label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                    <input
                      type="email"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-[12px] text-white focus:border-accent-blue focus:outline-none transition-colors placeholder:text-gray-600"
                      placeholder="you@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {(mode === 'verify' || mode === 'reset') && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">6-Digit Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-[16px] tracking-[0.3em] text-center text-white focus:border-accent-blue focus:outline-none transition-colors placeholder:text-gray-600"
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                </div>
              )}

              {(mode === 'login' || mode === 'register') && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Password</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-9 py-2 text-[12px] text-white focus:border-accent-blue focus:outline-none transition-colors placeholder:text-gray-600"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={mode === 'register' ? 6 : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'login' && (
                <div className="text-right -mt-2">
                  <button
                    type="button"
                    onClick={() => { resetTransientState(); setMode('forgot'); }}
                    className="text-[10px] text-gray-500 hover:text-accent-blue transition-colors font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {mode === 'reset' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">New Password</label>
                    <input
                      type="password"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-[12px] text-white focus:border-accent-blue focus:outline-none transition-colors placeholder:text-gray-600"
                      placeholder="Min 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Confirm New Password</label>
                    <input
                      type="password"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-[12px] text-white focus:border-accent-blue focus:outline-none transition-colors placeholder:text-gray-600"
                      placeholder="Re-enter new password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent-blue hover:bg-accent-blue/90 disabled:bg-accent-blue/50 text-white font-bold text-xs uppercase tracking-wider py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : mode === 'login' ? 'Sign In'
                  : mode === 'register' ? 'Create Account'
                  : mode === 'verify' ? 'Verify Email'
                  : mode === 'forgot' ? 'Send Reset Code'
                  : 'Reset Password'}
              </button>
            </form>

            {mode === 'verify' && (
              <div className="text-center">
                <button
                  onClick={handleResendCode}
                  disabled={loading}
                  className="text-[11px] text-gray-500 hover:text-accent-blue transition-colors font-medium"
                >
                  Didn't get a code? Resend
                </button>
              </div>
            )}

            {(mode === 'login' || mode === 'register') && (
              <div className="text-center mt-2">
                <button
                  onClick={() => {
                    resetTransientState();
                    setMode(mode === 'login' ? 'register' : 'login');
                  }}
                  className="text-[11px] text-gray-500 hover:text-accent-blue transition-colors font-medium"
                >
                  {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign In'}
                </button>
              </div>
            )}

            {(mode === 'forgot' || mode === 'reset' || mode === 'verify') && (
              <div className="text-center mt-1">
                <button
                  onClick={() => { resetTransientState(); setMode('login'); }}
                  className="text-[11px] text-gray-500 hover:text-accent-blue transition-colors font-medium"
                >
                  Back to Sign In
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
