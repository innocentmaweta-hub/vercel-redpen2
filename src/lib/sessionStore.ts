import { SemesterCourse } from '../types';
import { API_ENDPOINTS, apiDelete, apiGet, apiPost, AUTH_TOKEN_KEY } from '../api';

export { AUTH_TOKEN_KEY };
export const SESSION_STORAGE_KEY = 'stored_sessions';
export type SessionSaveState = 'idle' | 'saving' | 'saved' | 'error';

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/** One canonical identity for a saved session. sessionLabel is display metadata, not identity. */
export function sessionIdentityKey(session: SemesterCourse): string {
  return [
    clean(session.courseCode).toUpperCase(),
    clean(session.academicYear),
    clean(session.year),
    clean(session.semester),
    clean(session.customName),
  ].join('|');
}

export function normalizeSession(session: SemesterCourse): SemesterCourse {
  return {
    ...session,
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

export function loadLocalSessions(): SemesterCourse[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SESSION_STORAGE_KEY) || '[]'
    );

    return Array.isArray(parsed)
      ? dedupeSessions(parsed)
      : [];
  } catch {
    return [];
  }
}

export function writeLocalSessions(
  sessions: SemesterCourse[]
): SemesterCourse[] {
  const deduped = dedupeSessions(sessions);

  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify(deduped)
  );

  window.dispatchEvent(
    new CustomEvent('redpen:sessions-updated')
  );

  return deduped;
}

export async function fetchCloudSessions(
  token: string
): Promise<SemesterCourse[]> {
  const data = await apiGet<{
    sessions?: SemesterCourse[];
  }>(API_ENDPOINTS.sessions.list);

  return Array.isArray(data.sessions)
    ? dedupeSessions(data.sessions)
    : [];
}

export async function saveCloudSession(
  token: string,
  session: SemesterCourse
): Promise<{
  session: SemesterCourse;
  sessions: SemesterCourse[];
}> {
  const normalized = normalizeSession(session);

  if (!normalized.courseCode) {
    throw new Error('Course code is required');
  }

  const data = await apiPost<{
    session?: SemesterCourse;
    sessions?: SemesterCourse[];
  }>(
    API_ENDPOINTS.sessions.save,
    { session: normalized }
  );

  return {
    session: normalizeSession(
      data.session || normalized
    ),
    sessions: dedupeSessions(
      Array.isArray(data.sessions)
        ? data.sessions
        : [data.session || normalized]
    ),
  };
}

export async function deleteCloudSession(
  token: string,
  session: SemesterCourse
): Promise<SemesterCourse[]> {
  const id = clean(session.id);
  const key = sessionIdentityKey(session);
  const params = new URLSearchParams(
    id ? { id } : { key }
  );

  const data = await apiDelete<{
    sessions?: SemesterCourse[];
  }>(
    `${API_ENDPOINTS.sessions.delete}?${params.toString()}`
  );

  return dedupeSessions(
    Array.isArray(data.sessions)
      ? data.sessions
      : []
  );
}

export function mergeCloudAndLocalSessions(
  cloud: SemesterCourse[],
  local: SemesterCourse[]
): SemesterCourse[] {
  return dedupeSessions([
    ...cloud,
    ...local,
  ]);
}
