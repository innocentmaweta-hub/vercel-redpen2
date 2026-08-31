import { useState, useCallback, useEffect } from 'react';
import { User, AuthResponse } from '../types';
import { clearWorkbookStorageScope } from '../lib/workbookStore';
import { clearLocalHistory } from '../lib/historyStore';

const AUTH_TOKEN_KEY = 'yaza_auth_token';

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [showAuth, setShowAuth] = useState(false);
    const [showProfile, setShowProfile] = useState(false);

    const authHeaders = useCallback((): Record<string, string> => {
        const t = localStorage.getItem(AUTH_TOKEN_KEY);

        return t
            ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' }
            : { 'Content-Type': 'application/json' };
    }, []);

    useEffect(() => {
        const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
        if (!storedToken) return;
        setToken(storedToken);
        let cancelled = false;

        const restoreAuthentication = async () => {
            try {
                const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${storedToken}` } });
                if (!res.ok) throw new Error('Session expired');
                const data = await res.json();
                if (cancelled) return;
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
                setShowAuth(false);
            } catch (err) {
                if (cancelled) return;
                console.error('Failed to restore session:', err);
                localStorage.removeItem(AUTH_TOKEN_KEY);
                clearWorkbookStorageScope();
                clearLocalHistory();
                localStorage.removeItem('yaza_active_session_id');
                setToken(null);
                setUser(null);
            }
        };
        restoreAuthentication();
        return () => { cancelled = true; };
    }, []);

    const handleSaveApiKeys = useCallback(async (keys: { openai?: string; gemini?: string; anthropic?: string }) => {
        if (!token) { alert('Please sign in before saving API keys.'); return; }
        try {
            const response = await fetch('/api/user/api-keys', { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(keys) });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || 'Failed to save API keys.');
            }
            alert('API keys saved successfully.');
        } catch (error) {
            console.error('Failed to save API keys:', error);
            alert(error instanceof Error ? error.message : 'Failed to save API keys.');
        }
    }, [token, authHeaders]);

    const handleAuthSuccess = (data: AuthResponse) => {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        setToken(data.token);
        setUser(data.user);
        setShowAuth(false);
    };

    const handleLogout = () => {
        const ownerId = user?.id ?? null;
        localStorage.removeItem(AUTH_TOKEN_KEY);
        if (ownerId !== null) {
            clearWorkbookStorageScope(ownerId);
            clearLocalHistory(ownerId);
        } else {
            clearWorkbookStorageScope();
            clearLocalHistory();
        }
        localStorage.removeItem('yaza_active_session_id');
        setToken(null);
        setUser(null);
        setShowProfile(false);
    };

    const handleSaveProfile = async (institution: string, role: string) => {
        if (!user) return;
        const res = await fetch('/api/settings/profile', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ institution, role }) });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(data.message || 'Failed to save profile');
            return;
        }
        setUser(prev => prev ? { ...prev, institution, role } : prev);
    };

    const handleUploadAvatar = async (file: File): Promise<{ success: boolean; message?: string }> => {
        if (!user) return { success: false, message: 'Not logged in' };
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const base64 = reader.result as string;
                    const res = await fetch('/api/settings/avatar', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ imageBase64: base64, filename: file.name, mimeType: file.type }) });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) { resolve({ success: false, message: data.message || 'Failed to upload image' }); return; }
                    setUser(prev => prev ? { ...prev, avatarUrl: data.avatarUrl } : prev);
                    resolve({ success: true });
                } catch { resolve({ success: false, message: 'Failed to upload image' }); }
            };
            reader.onerror = () => resolve({ success: false, message: 'Failed to read image file' });
            reader.readAsDataURL(file);
        });
    };

    const handleChangePassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> => {
        try {
            const res = await fetch('/api/auth/change-password', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ currentPassword, newPassword }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return { success: false, message: data.message || 'Failed to change password' };
            return { success: true };
        } catch { return { success: false, message: 'Failed to change password' }; }
    };

    const handleDeleteAccount = async (password: string): Promise<{ success: boolean; message?: string }> => {
        try {
            const res = await fetch('/api/auth/delete-account', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ password }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return { success: false, message: data.message || 'Failed to delete account' };
            handleLogout();
            return { success: true };
        } catch { return { success: false, message: 'Failed to delete account' }; }
    };

    return { user, setUser, token, showAuth, setShowAuth, showProfile, setShowProfile, authHeaders, handleSaveApiKeys, handleAuthSuccess, handleLogout, handleSaveProfile, handleUploadAvatar, handleChangePassword, handleDeleteAccount };
}
