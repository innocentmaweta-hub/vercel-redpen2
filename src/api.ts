/**
 * Centralized API configuration and utilities.
 * All endpoints are routed through the Vercel serverless API.
 */
import { getStoredString } from './lib/safeStorage';

const BASE_API = '/api';
const API_TIMEOUT_MS = 60_000;

export const AUTH_TOKEN_KEY = 'yaza_auth_token';

export function getAuthHeaders(): Record<string, string> {
  const token = getStoredString(AUTH_TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const API_ENDPOINTS = {
  auth: {
    login: `${BASE_API}/auth/login`,
    register: `${BASE_API}/auth/register`,
    me: `${BASE_API}/auth/me`,
    google: `${BASE_API}/auth/google`,
    verifyEmail: `${BASE_API}/auth/verify-email`,
    resendVerification: `${BASE_API}/auth/resend-verification`,
    forgotPassword: `${BASE_API}/auth/forgot-password`,
    resetPassword: `${BASE_API}/auth/reset-password`,
  },
  grading: {
    grade: `${BASE_API}/grade`,
  },
  workbooks: {
    list: `${BASE_API}/workbooks`,
    save: `${BASE_API}/workbooks`,
    delete: `${BASE_API}/workbooks`,
  },
  // Kept for backward compatibility with older clients/data migrations.
  sessions: {
    list: `${BASE_API}/sessions`,
    save: `${BASE_API}/sessions`,
    delete: `${BASE_API}/sessions`,
  },
  history: {
    list: `${BASE_API}/history`,
    save: `${BASE_API}/history`,
    delete: `${BASE_API}/history`,
  },
  settings: {
    apiKeys: `${BASE_API}/settings/api-keys`,
  },
} as const;

function mergeSignals(externalSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(new Error('Request timed out')), API_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { signal, cleanup } = mergeSignals(options.signal ?? undefined);
  try {
    return await fetch(url, {
      ...options,
      signal,
      headers: { ...getAuthHeaders(), ...options.headers },
    });
  } finally {
    cleanup();
  }
}

async function readApiError(response: Response): Promise<{ message: string; code?: string }> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await response.json().catch(() => null);
    if (body?.message) return { message: String(body.message), code: body?.code };
    if (body?.error) return { message: String(body.error), code: body?.code };
  } else {
    const text = await response.text().catch(() => '');
    if (text.trim()) return { message: text.trim().slice(0, 500) };
  }
  return { message: `API request failed: ${response.status}` };
}

export async function apiGet<T = unknown>(url: string): Promise<T> {
  const response = await apiFetch(url);
  if (!response.ok) {
    const { message, code } = await readApiError(response);
    const error: any = new Error(message);
    if (code) error.code = code;
    throw error;
  }
  return response.json();
}

export async function apiPost<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) {
    const { message, code } = await readApiError(response);
    const error: any = new Error(message);
    if (code) error.code = code;
    throw error;
  }
  return response.json();
}

export async function apiDelete<T = unknown>(url: string): Promise<T> {
  const response = await apiFetch(url, { method: 'DELETE' });
  if (!response.ok) {
    const { message, code } = await readApiError(response);
    const error: any = new Error(message);
    if (code) error.code = code;
    throw error;
  }
  return response.json();
}

/** Explicitly validate/refresh the current authenticated user. */
export async function refreshAuthSession<T = any>(): Promise<T | null> {
  const token = getStoredString(AUTH_TOKEN_KEY);
  if (!token) return null;

  try {
    return await apiGet<T>(API_ENDPOINTS.auth.me);
  } catch {
    return null;
  }
}
