import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { AuthResponse } from '../types';
import { GoogleLogin } from "@react-oauth/google";
import { API_ENDPOINTS, AUTH_TOKEN_KEY } from '../api';

interface AuthModalProps {
  onClose?: () => void;
  onAuthSuccess: (data: AuthResponse) => void;
}

export const AuthModal = ({ onClose, onAuthSuccess }: AuthModalProps) => {
  const [isLogin, setIsLogin] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? API_ENDPOINTS.auth.login : API_ENDPOINTS.auth.register;
      
      const body = isLogin
        ? { email, password }
        : { name: `${firstName} ${lastName}`, email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `${isLogin ? 'Login' : 'Registration'} failed`);
      }

      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      onAuthSuccess(data);
    } catch (err: any) {
      setError(err.message || `${isLogin ? 'Login' : 'Registration'} failed`);
    } finally {
      setLoading(false);
    }
  };

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
                <Mail size={16} className="text-accent-blue" />
              </div>
              <div>
                <p className="text-[13px] font-black text-white">{isLogin ? 'Sign In' : 'Create Account'}</p>
                <p className="text-[10px] text-gray-500">Access your grading dashboard</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-colors">
              <X size={15} />
            </button>
          </div>

          <div className="p-5 flex flex-col gap-4">
            {/* Google Login temporarily disabled - CORS configuration needed
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                setLoading(true);
                setError("");

                try {
                  const res = await fetch(API_ENDPOINTS.auth.google, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      idToken: credentialResponse.credential,
                    }),
                  });

                  const data = await res.json();

                  if (!res.ok) {
                    throw new Error(data.message || "Google authentication failed");
                  }

                  localStorage.setItem(AUTH_TOKEN_KEY, data.token);
                  onAuthSuccess(data);
                } catch (err: any) {
                  setError(err.message || "Google authentication failed");
                } finally {
                  setLoading(false);
                }
              }}
              onError={() => {
                setError("Google Sign-In failed");
              }}
            />

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-xs text-gray-600">OR</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>
            */}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
              {!isLogin && (
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

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent-blue hover:bg-accent-blue/90 disabled:bg-accent-blue/50 text-white font-bold text-xs uppercase tracking-wider py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : isLogin ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div className="text-center mt-2">
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                }}
                className="text-[11px] text-gray-500 hover:text-accent-blue transition-colors font-medium"
              >
                {isLogin ? "Don't have an account? Create one" : 'Already have an account? Sign In'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
