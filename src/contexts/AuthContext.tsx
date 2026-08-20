import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, AuthResponse } from '../types';
import { API_ENDPOINTS, apiGet, apiPost } from '../api';

interface AuthContextShape {
  user: User | null;
  token: string | null;
  setUser: (u: User | null) => void;
  setToken: (t: string | null) => void;
  signOut: () => void;
  signInWithToken: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextShape | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('yaza_auth_token');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!token) return;

    // validate token against /api/auth/me
    (async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Session invalid');
        const data = await res.json();
        setUser({
          id: data.user.id,
          name: data.user.name || data.user.username || data.user.email,
          email: data.user.email,
          tier: data.user.tier || 'free',
          gradingCount: data.user.gradingCount ?? 0,
          gradingLimit: data.user.gradingLimit ?? 5,
          createdAt: new Date().toISOString(),
          institution: data.user.institution || '',
          role: data.user.role || '',
          activeProvider: data.user.activeProvider || 'server',
          totalGraded: data.user.totalGraded ?? 0,
          avatarUrl: data.user.avatarUrl || '',
        });
      } catch (err) {
        console.error('Failed to restore session', err);
        localStorage.removeItem('yaza_auth_token');
        setTokenState(null);
        setUser(null);
      }
    })();
  }, [token]);

  const setToken = (t: string | null) => {
    try {
      if (t) localStorage.setItem('yaza_auth_token', t);
      else localStorage.removeItem('yaza_auth_token');
    } catch {}
    setTokenState(t);
  };

  const signOut = () => {
    setToken(null);
    setUser(null);
  };

  const signInWithToken = async (t: string) => {
    setToken(t);
    // the effect will validate and load user
  };

  return (
    <AuthContext.Provider value={{ user, token, setUser, setToken, signOut, signInWithToken }}>
      {children}
    </AuthContext.Provider>
  );
}
