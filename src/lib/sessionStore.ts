import { SemesterCourse } from '../types';
import { API_ENDPOINTS, apiGet } from '../api';
import { fetchCloudWorkbooks, saveCloudWorkbook, deleteCloudWorkbook, createWorkbook, loadLocalWorkbook, writeLocalWorkbook, worksheetFromCourse } from './workbookStore';
import type { RedPenWorkbook } from '../types/workbook';

export { AUTH_TOKEN_KEY } from '../api';
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
  const map = new Map<string, SemesterCourse>();
  for (const raw of Array.isArray(sessions) ? sessions : []) {
    const session = normalizeSession(raw);
    if (!session.courseCode) continue;
    const key = sessionIdentityKey(session);
    const existing = map.get(key);
    if (!existing || String(session.updatedAt || '').localeCompare(String(existing.updatedAt || '')) >= 0) map.set(key, session);
  }
  return Array.from(map.values()).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export function loadLocalSessions(): SemesterCourse[] {
  try {
    const workbook = loadLocalWorkbook();
    if (workbook?.sheets?.length) return dedupeSessions(workbook.sheets.map(sheet => sheet.course));
    const parsed = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
    return dedupeSessions(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

export function writeLocalSessions(sessions: SemesterCourse[]): SemesterCourse[] {
  const deduped = dedupeSessions(sessions);
  const existing = loadLocalWorkbook();
  if (existing) {
    const sheets = deduped.map(session => worksheetFromCourse(session, existing.sheets.find(s => s.id === session.id)?.rows || []));
    writeLocalWorkbook({ ...existing, sheets, updatedAt: new Date().toISOString() });
  }
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

function firstWorkbook(workbooks: RedPenWorkbook[]): RedPenWorkbook | null {
  return workbooks[0] || null;
}

export async function fetchCloudSessions(token: string): Promise<SemesterCourse[]> {
  void token;
  try {
    const workbooks = await fetchCloudWorkbooks(token);
    const workbook = firstWorkbook(workbooks);
    if (!workbook) return loadLocalSessions();
    const sessions = dedupeSessions(workbook.sheets.map(sheet => sheet.course));
    if (sessions.length) {
      const local = loadLocalWorkbook();
      writeLocalWorkbook({ ...workbook, activeSheetId: workbook.activeSheetId || null });
      if (local?.activeSheetId && sessions.some(s => s.id === local.activeSheetId)) saveActiveSessionId(local.activeSheetId);
    }
    return sessions;
  } catch {
    return loadLocalSessions();
  }
}

export async function saveCloudSession(token: string, session: SemesterCourse): Promise<{ session: SemesterCourse; sessions: SemesterCourse[] }> {
  void token;
  const normalized = normalizeSession(session);
  if (!normalized.courseCode) throw new Error('Course code is required');
  let workbook = loadLocalWorkbook();
  if (!workbook) workbook = createWorkbook('RedPen Workbook');

  const newSheet = worksheetFromCourse(normalized, workbook.sheets.find(s => s.id === normalized.id)?.rows || []);
  const sheets = workbook.sheets.filter(sheet => sheet.id !== newSheet.id && sessionIdentityKey(sheet.course) !== sessionIdentityKey(normalized));
  sheets.unshift(newSheet);
  workbook = { ...workbook, sheets, activeSheetId: newSheet.id, updatedAt: new Date().toISOString() };

  const result = await saveCloudWorkbook(token, workbook);
  const sessions = dedupeSessions(result.workbook.sheets.map(sheet => sheet.course));
  writeLocalSessions(sessions);
  saveActiveSessionId(newSheet.course);
  return { session: newSheet.course, sessions };
}

export async function deleteCloudSession(token: string, session: SemesterCourse): Promise<SemesterCourse[]> {
  void token;
  const workbook = loadLocalWorkbook();
  if (!workbook) return removeLocalSession(session);
  const key = sessionIdentityKey(session);
  const sheets = workbook.sheets.filter(sheet => sheet.id !== session.id && sessionIdentityKey(sheet.course) !== key);
  if (sheets.length === 0) {
    await deleteCloudWorkbook(token, workbook);
    removeLocalSession(session);
    saveActiveSessionId(null);
    return [];
  }
  const next: RedPenWorkbook = { ...workbook, sheets, activeSheetId: sheets[0].id, updatedAt: new Date().toISOString() };
  const result = await saveCloudWorkbook(token, next);
  const sessions = dedupeSessions(result.workbook.sheets.map(sheet => sheet.course));
  writeLocalSessions(sessions);
  saveActiveSessionId(sessions[0] || null);
  return sessions;
}

/** Compatibility helper retained for callers that still merge old session data. */
export function mergeCloudAndLocalSessions(cloud: SemesterCourse[], local: SemesterCourse[]): SemesterCourse[] {
  return dedupeSessions([...cloud, ...local]);
}

/** Legacy endpoint probe retained for compatibility during migration. */
export async function fetchLegacyCloudSessions(): Promise<SemesterCourse[]> {
  try {
    const data = await apiGet<{ sessions?: SemesterCourse[] }>(API_ENDPOINTS.sessions.list);
    return dedupeSessions(Array.isArray(data.sessions) ? data.sessions : []);
  } catch {
    return [];
  }
}
