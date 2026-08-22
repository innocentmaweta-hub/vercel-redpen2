import { SemesterCourse } from '../types';
import { API_ENDPOINTS, apiDelete, apiGet, apiPost, AUTH_TOKEN_KEY } from '../api';

export { AUTH_TOKEN_KEY };
export const SESSION_STORAGE_KEY = 'stored_sessions';
export const ACTIVE_SESSION_STORAGE_KEY = 'yaza_active_session_id';
export type SessionSaveState = 'idle' | 'saving' | 'saved' | 'error';

const HISTORY_STORAGE_KEY = 'grading_history';
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function sessionIdentityKey(session: SemesterCourse): string {
  return [clean(session.courseCode).toUpperCase(), clean(session.academicYear), clean(session.year), clean(session.semester), clean(session.customName)].join('|');
}

export function normalizeSession(session: SemesterCourse): SemesterCourse {
  return {
    ...session,
    id: clean(session.id) || sessionIdentityKey(session),
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

/** Reconstruct session entries from saved grading history when a session entry
 * was never explicitly persisted (for example, an Excel import while logged out). */
function sessionsFromHistory(): SemesterCourse[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];

    const byKey = new Map<string, SemesterCourse>();
    for (const record of parsed) {
      const info = record?.studentInfo;
      if (!info?.courseCode) continue;

      const session: SemesterCourse = {
        id: `history-session-${clean(info.courseCode).toUpperCase()}-${clean(info.year)}-${clean(info.semester)}`,
        courseCode: clean(info.courseCode),
        courseName: '',
        program: clean(info.program),
        year: clean(info.year),
        semester: clean(info.semester),
        academicYear: clean(info.academicYear),
        sessionLabel: '',
        createdAt: record?.date || undefined,
        updatedAt: record?.date || undefined,
      };

      byKey.set(sessionIdentityKey(session), session);
    }

    return Array.from(byKey.values());
  } catch {
    return [];
  }
}

export function loadLocalSessions(): SemesterCourse[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
    const stored = Array.isArray(parsed) ? parsed : [];
    return dedupeSessions([...stored, ...sessionsFromHistory()]);
  } catch {
    return sessionsFromHistory();
  }
}

export function writeLocalSessions(sessions: SemesterCourse[]): SemesterCourse[] {
  const deduped = dedupeSessions(sessions);
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(deduped));
  window.dispatchEvent(new CustomEvent('redpen:sessions-updated'));
  return deduped;
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
  const data = await apiGet<{ sessions?: SemesterCourse[] }>(API_ENDPOINTS.sessions.list);
  return dedupeSessions([
    ...(Array.isArray(data.sessions) ? data.sessions : []),
    ...loadLocalSessions(),
  ]);
}

export async function saveCloudSession(token: string, session: SemesterCourse): Promise<{ session: SemesterCourse; sessions: SemesterCourse[] }> {
  const normalized = normalizeSession(session);
  if (!normalized.courseCode) throw new Error('Course code is required');
  const data = await apiPost<{ session?: SemesterCourse; sessions?: SemesterCourse[] }>(API_ENDPOINTS.sessions.save, { session: normalized });
  const saved = normalizeSession(data.session || normalized);

  const mergedSessions = dedupeSessions([
    ...loadLocalSessions(),
    ...(Array.isArray(data.sessions) ? data.sessions : []),
    saved,
  ]);
  writeLocalSessions(mergedSessions);

  return { session: saved, sessions: mergedSessions };
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
  return dedupeSessions([...cloud, ...local, ...sessionsFromHistory()]);
}
