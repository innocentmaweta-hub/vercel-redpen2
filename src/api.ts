/**
 * Centralized API configuration and utilities
 * All endpoints are routed through the Vercel serverless function
 * (api/server-wordpress.js), which talks to WordPress server-to-server.
 */
const BASE_API = '/api';

export const AUTH_TOKEN_KEY = 'yaza_auth_token';

/**
 * Get authorization headers with token from localStorage
 */
export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

/**
 * API endpoint paths (no trailing slash — must match Express routes exactly)
 */
export const API_ENDPOINTS = {
  // Authentication endpoints
  auth: {
    login: `${BASE_API}/auth/login`,
    register: `${BASE_API}/auth/register`,
    google: `${BASE_API}/auth/google`,
  },
  // Grading endpoints
  grading: {
    grade: `${BASE_API}/grade`,
    history: `${BASE_API}/history`,
  },
  // Settings endpoints
  settings: {
    apiKeys: `${BASE_API}/settings/api-keys`,
  },
} as const;

/**
 * Fetch wrapper that automatically includes auth headers
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });
}

/**
 * Helper to make POST requests to API
 */
export async function apiPost<T = any>(
  url: string,
  body: any
): Promise<T> {
  const response = await apiFetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API request failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Helper to make GET requests to API
 */
export async function apiGet<T = any>(url: string): Promise<T> {
  const response = await apiFetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API request failed: ${response.status}`);
  }
  return response.json();
}
