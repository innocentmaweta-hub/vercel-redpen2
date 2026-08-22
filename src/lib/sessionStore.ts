import { SemesterCourse } from '../types';
import { API_ENDPOINTS, apiDelete, apiGet, apiPost, AUTH_TOKEN_KEY } from '../api';

export { AUTH_TOKEN_KEY };
export const SESSION_STORAGE_KEY = 'stored_sessions';
export const ACTIVE_SESSION_STORAGE_KEY = 'yaza_active_session_id';
export type SessionSaveState = 'idle' | 'saving' | 'saved' | 'error';

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function sessionIdentityKey(session: SemesterCourse): string {
  return [clean(session.courseCode).toUpperCase(), clean(session.academicYear), clean(session.year), clean(session.semester), clean(session.customName)].join('|');
}

export function normalizeSession(session: SemesterCourse): SemesterCourse {
  const identity = sessionIdentityKey(session);
  return {
    ...session,
    id: clean(session.id) || identity,
    courseCode: clean(session.courseCode).toUpperCase(),
    courseName: clean(session.courseName),
    program: clean(session.program),
    year: clean(session.year),
    semester: clean(session.semester),
    academicYear: clean(session.academicYear),
    sessionLabel: clean(session.sessionLabel),
    customName: clean(session.customName) || undefined,
    updatedAt: session.updatedAt || new Date().toISOString(),
  };
}

export function dedupeSessions(sessions: SemesterCourse[]): SemesterCourse[] {
  const seen = new Set<string>();
  const result: SemesterCourse[] = [];
  for (const raw of sessions) {
    const session = normalizeSession(raw);
    if (!session.courseCode) continue;
    const key = sessionIdentityKey(session);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(session);
  }
  return result;
}

/**
 * Sessions are first-class entities. Do not reconstruct them from grading
 * history: deleting a session must remain a deletion even when its results
 * are still present in history.
 */
export function loadLocalSessions(): SemesterCourse[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
    return dedupeSessions(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

export function writeLocalSessions(sessions: SemesterCourse[]): SemesterCourse[] {
  const deduped = dedupeSessions(sessions);
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(deduped));
  window.dispatchEvent(new CustomEvent('redpen:sessions-updated'));
  return deduped;
}

export function removeLocalSession(session: SemesterCourse): SemesterCourse[] {
  const id = clean(session.id);
  const key = sessionIdentityKey(session);
  return writeLocalSessions(loadLocalSessions().filter(s => s.id !== id && sessionIdentityKey(s) !== key));
}

export function loadActiveSessionId(): string | null {
  try { return localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY); } catch { return null; }
}

export function saveActiveSessionId(session: SemesterCourse | string | null): void {
  try {
    const id = typeof session === 'string' ? clean(session) : session ? (clean(session.id) || sessionIdentityKey(session)) : '';
    if (id) localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, id);
    else localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch { /* storage may be unavailable */ }
}

export function resolveActiveSession(sessions: SemesterCourse[], requestedId?: string | null): SemesterCourse | null {
  const list = dedupeSessions(sessions);
  const id = clean(requestedId) || loadActiveSessionId();
  if (id) {
    const exact = list.find(session => session.id === id || sessionIdentityKey(session) === id);
    if (exact) return exact;
  }
  return list[0] || null;
}

export async function fetchCloudSessions(token: string): Promise<SemesterCourse[]> {
  // Cloud is authoritative for authenticated users. Local data is a fallback
  // only when the request itself fails, not something that can resurrect a
  // deliberately deleted cloud session.
  const data = await apiGet<{ sessions?: SemesterCourse[] }>(API_ENDPOINTS.sessions.list);
  return dedupeSessions(Array.isArray(data.sessions) ? data.sessions : []);
}

export async function saveCloudSession(token: string, session: SemesterCourse): Promise<{ session: SemesterCourse; sessions: SemesterCourse[] }> {
  const normalized = normalizeSession(session);
  if (!normalized.courseCode) throw new Error('Course code is required');
  const data = await apiPost<{ session?: SemesterCourse; sessions?: SemesterCourse[] }>(API_ENDPOINTS.sessions.save, { session: normalized });
  const saved = normalizeSession(data.session || normalized);
  const sessions = dedupeSessions(Array.isArray(data.sessions) ? data.sessions : [saved]);
  writeLocalSessions(sessions);
  return { session: saved, sessions };
}

export async function deleteCloudSession(token: string, session: SemesterCourse): Promise<SemesterCourse[]> {
  const id = clean(session.id);
  const key = sessionIdentityKey(session);
  const params = new URLSearchParams(id ? { id } : { key });
  const data = await apiDelete<{ sessions?: SemesterCourse[] }>(`${API_ENDPOINTS.sessions.delete}?${params.toString()}`);
  const sessions = dedupeSessions(Array.isArray(data.sessions) ? data.sessions : []);
  writeLocalSessions(sessions);
  return sessions;
}

export function mergeCloudAndLocalSessions(cloud: SemesterCourse[], local: SemesterCourse[]): SemesterCourse[] {
  // Kept for compatibility. Callers that have authenticated should normally
  // use the cloud list directly so a deleted cloud session cannot reappear.
  return dedupeSessions([...cloud, ...local]);
}
