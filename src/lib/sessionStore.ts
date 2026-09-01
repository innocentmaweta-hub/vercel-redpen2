import { SemesterCourse } from '../types';
import { API_ENDPOINTS, apiGet } from '../api';
import { fetchCloudWorkbooks, saveCloudWorkbook, deleteCloudWorkbook, createWorkbook, loadLocalWorkbook, writeLocalWorkbook, worksheetFromCourse } from './workbookStore';
import type { RedPenWorkbook } from '../types/workbook';

export { AUTH_TOKEN_KEY } from '../api';

// Compatibility module: the persisted model is now Workbook -> Worksheet -> Student.
export const WORKBOOK_STORAGE_KEY = 'redpen_workbook';
export const ACTIVE_WORKSHEET_STORAGE_KEY = 'redpen_active_worksheet_id';
export const SESSION_STORAGE_KEY = WORKBOOK_STORAGE_KEY;
export const ACTIVE_SESSION_STORAGE_KEY = ACTIVE_WORKSHEET_STORAGE_KEY;
export type WorkbookSaveState = 'idle' | 'saving' | 'saved' | 'error';
export type SessionSaveState = WorkbookSaveState;

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
export function worksheetIdentityKey(course: SemesterCourse): string { return [clean(course.courseCode).toUpperCase(), clean(course.academicYear), clean(course.year), clean(course.semester), clean(course.customName)].join('|'); }
export function normalizeCourse(course: SemesterCourse): SemesterCourse { const identity = worksheetIdentityKey(course); return { ...course, id: clean(course.id) || identity, courseCode: clean(course.courseCode).toUpperCase(), courseName: clean(course.courseName), program: clean(course.program), year: clean(course.year), semester: clean(course.semester), academicYear: clean(course.academicYear), sessionLabel: clean(course.sessionLabel), customName: clean(course.customName) || undefined, updatedAt: course.updatedAt || new Date().toISOString() }; }
export function dedupeCourses(courses: SemesterCourse[]): SemesterCourse[] { const map = new Map<string, SemesterCourse>(); for (const raw of Array.isArray(courses) ? courses : []) { const course = normalizeCourse(raw); if (!course.courseCode) continue; const key = worksheetIdentityKey(course); const existing = map.get(key); if (!existing || String(course.updatedAt || '').localeCompare(String(existing.updatedAt || '')) >= 0) map.set(key, course); } return Array.from(map.values()).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))); }
export function loadLocalCourses(): SemesterCourse[] { try { const workbook = loadLocalWorkbook(); return workbook?.sheets?.length ? dedupeCourses(workbook.sheets.map(sheet => sheet.course)) : []; } catch { return []; } }
export function writeLocalCourses(courses: SemesterCourse[]): SemesterCourse[] { const deduped = dedupeCourses(courses); const existing = loadLocalWorkbook(); if (existing) writeLocalWorkbook({ ...existing, sheets: deduped.map(course => worksheetFromCourse(course, existing.sheets.find(s => s.id === course.id)?.rows || [])), updatedAt: new Date().toISOString() }); return deduped; }
export function removeLocalCourse(course: SemesterCourse): SemesterCourse[] { const id = clean(course.id), key = worksheetIdentityKey(course); return writeLocalCourses(loadLocalCourses().filter(c => c.id !== id && worksheetIdentityKey(c) !== key)); }
export function loadActiveWorksheetId(): string | null { try { return localStorage.getItem(ACTIVE_WORKSHEET_STORAGE_KEY); } catch { return null; } }
export function saveActiveWorksheetId(courseOrId: SemesterCourse | string | null): void { try { const id = typeof courseOrId === 'string' ? clean(courseOrId) : courseOrId ? (clean(courseOrId.id) || worksheetIdentityKey(courseOrId)) : ''; if (id) localStorage.setItem(ACTIVE_WORKSHEET_STORAGE_KEY, id); else localStorage.removeItem(ACTIVE_WORKSHEET_STORAGE_KEY); } catch {} }
export function resolveActiveCourse(courses: SemesterCourse[], requestedId?: string | null): SemesterCourse | null { const list = dedupeCourses(courses); const id = clean(requestedId) || loadActiveWorksheetId(); if (id) { const exact = list.find(course => course.id === id || worksheetIdentityKey(course) === id); if (exact) return exact; } return list[0] || null; }

// Temporary source-compatibility aliases; they no longer define the storage model.
export const sessionIdentityKey = worksheetIdentityKey;
export const normalizeSession = normalizeCourse;
export const dedupeSessions = dedupeCourses;
export const loadLocalSessions = loadLocalCourses;
export const writeLocalSessions = writeLocalCourses;
export const removeLocalSession = removeLocalCourse;
export const loadActiveSessionId = loadActiveWorksheetId;
export const saveActiveSessionId = saveActiveWorksheetId;
export const resolveActiveSession = resolveActiveCourse;

function firstWorkbook(workbooks: RedPenWorkbook[]): RedPenWorkbook | null { return workbooks[0] || null; }
export async function fetchCloudSessions(token: string): Promise<SemesterCourse[]> { try { const workbooks = await fetchCloudWorkbooks(token); const workbook = firstWorkbook(workbooks); if (!workbook) return loadLocalCourses(); writeLocalWorkbook({ ...workbook, activeSheetId: workbook.activeSheetId || null }); return dedupeCourses(workbook.sheets.map(sheet => sheet.course)); } catch { return loadLocalCourses(); } }
export async function saveCloudSession(token: string, course: SemesterCourse): Promise<{ session: SemesterCourse; sessions: SemesterCourse[] }> { const normalized = normalizeCourse(course); if (!normalized.courseCode) throw new Error('Course code is required'); let workbook = loadLocalWorkbook(); if (!workbook) workbook = createWorkbook(''); const newSheet = worksheetFromCourse(normalized, workbook.sheets.find(s => s.id === normalized.id)?.rows || []); const sheets = workbook.sheets.filter(sheet => sheet.id !== newSheet.id && worksheetIdentityKey(sheet.course) !== worksheetIdentityKey(normalized)); workbook = { ...workbook, sheets: [newSheet, ...sheets], activeSheetId: newSheet.id, updatedAt: new Date().toISOString() }; const result = await saveCloudWorkbook(token, workbook); const courses = dedupeCourses(result.workbook.sheets.map(sheet => sheet.course)); writeLocalCourses(courses); saveActiveWorksheetId(newSheet.course); return { session: newSheet.course, sessions: courses }; }
export async function deleteCloudSession(token: string, course: SemesterCourse): Promise<SemesterCourse[]> { const workbook = loadLocalWorkbook(); if (!workbook) return removeLocalCourse(course); const key = worksheetIdentityKey(course); const sheets = workbook.sheets.filter(sheet => sheet.id !== course.id && worksheetIdentityKey(sheet.course) !== key); if (!sheets.length) { await deleteCloudWorkbook(token, workbook); removeLocalCourse(course); saveActiveWorksheetId(null); return []; } const result = await saveCloudWorkbook(token, { ...workbook, sheets, activeSheetId: sheets[0].id, updatedAt: new Date().toISOString() }); const courses = dedupeCourses(result.workbook.sheets.map(sheet => sheet.course)); writeLocalCourses(courses); saveActiveWorksheetId(courses[0] || null); return courses; }
export function mergeCloudAndLocalSessions(cloud: SemesterCourse[], local: SemesterCourse[]): SemesterCourse[] { return dedupeCourses([...cloud, ...local]); }
export async function fetchLegacyCloudSessions(): Promise<SemesterCourse[]> { try { const data = await apiGet<{ sessions?: SemesterCourse[] }>(API_ENDPOINTS.sessions.list); return dedupeCourses(Array.isArray(data.sessions) ? data.sessions : []); } catch { return []; } }
