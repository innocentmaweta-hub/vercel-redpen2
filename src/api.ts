/**
 * Centralized API configuration and utilities.
 * All endpoints are routed through the Vercel serverless API.
 */
import { getStoredString } from './lib/safeStorage';

const BASE_API = '/api';
const API_TIMEOUT_MS = 60_000;

export const AUTH_TOKEN_KEY = 'yaza_auth_token';

/**
 * Get authorization headers without allowing a storage failure to crash the app.
 */
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
    google: `${BASE_API}/auth/google`,
  },
  grading: {
    grade: `${BASE_API}/grade`,
    history: `${BASE_API}/history`,
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

/**
 * Fetch wrapper with auth headers, timeout protection and safe cleanup.
 * A caller-provided AbortSignal is still respected.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { signal, cleanup } = mergeSignals(options.signal ?? undefined);

  try {
    return await fetch(url, {
      ...options,
      signal,
      headers: {
        ...getAuthHeaders(),
        ...options.headers,
      },
    });
  } finally {
    cleanup();
  }
}

async function readApiError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = await response.json().catch(() => null);
    if (body?.message) return String(body.message);
    if (body?.error) return String(body.error);
  } else {
    const text = await response.text().catch(() => '');
    if (text.trim()) return text.trim().slice(0, 500);
  }

  return `API request failed: ${response.status}`;
}

export async function apiPost<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await apiFetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function apiGet<T = unknown>(url: string): Promise<T> {
  const response = await apiFetch(url);

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}
