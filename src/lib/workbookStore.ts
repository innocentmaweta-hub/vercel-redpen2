import type { SemesterCourse } from '../types';
import type { RedPenWorkbook, RedPenWorksheet } from '../types/workbook';
import { apiDelete, apiGet, apiPost, API_ENDPOINTS } from '../api';

export const WORKBOOK_STORAGE_KEY = 'redpen_workbook';
export const ACTIVE_WORKBOOK_STORAGE_KEY = 'redpen_active_workbook_id';
export const ACTIVE_WORKSHEET_STORAGE_KEY = 'redpen_active_worksheet_id';
const STORAGE_SCOPE_KEY = 'redpen_storage_owner';

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const storageKey = (base: string, ownerId?: string | number | null) => {
  const owner = clean(ownerId ?? localStorage.getItem(STORAGE_SCOPE_KEY));
  return owner ? `${base}:${encodeURIComponent(owner)}` : base;
};

export function setWorkbookStorageScope(ownerId: string | number | null): void {
  if (ownerId === null || ownerId === undefined || !clean(ownerId)) { localStorage.removeItem(STORAGE_SCOPE_KEY); return; }
  localStorage.setItem(STORAGE_SCOPE_KEY, clean(ownerId));
}
export function clearWorkbookStorageScope(ownerId?: string | number | null): void {
  const owner = clean(ownerId ?? localStorage.getItem(STORAGE_SCOPE_KEY));
  if (owner) { localStorage.removeItem(storageKey(WORKBOOK_STORAGE_KEY, owner)); localStorage.removeItem(storageKey(ACTIVE_WORKBOOK_STORAGE_KEY, owner)); localStorage.removeItem(storageKey(ACTIVE_WORKSHEET_STORAGE_KEY, owner)); }
  if (!ownerId || owner === clean(localStorage.getItem(STORAGE_SCOPE_KEY))) { localStorage.removeItem(STORAGE_SCOPE_KEY); localStorage.removeItem(WORKBOOK_STORAGE_KEY); localStorage.removeItem(ACTIVE_WORKBOOK_STORAGE_KEY); localStorage.removeItem(ACTIVE_WORKSHEET_STORAGE_KEY); }
}
export function worksheetFromCourse(course: SemesterCourse, rows: RedPenWorksheet['rows'] = []): RedPenWorksheet {
  const id = clean(course.id) || `${clean(course.courseCode).toUpperCase()}|${clean(course.academicYear)}|${clean(course.year)}|${clean(course.semester)}|${clean(course.customName)}`;
  const now = new Date().toISOString();
  return { id, name: clean(course.courseCode) || clean(course.customName) || 'Course', course: { ...course, id }, rows, createdAt: course.createdAt || now, updatedAt: course.updatedAt || now };
}
export function createWorkbook(name: string, sheets: RedPenWorksheet[] = []): RedPenWorkbook {
  const now = new Date().toISOString();
  return { id: `workbook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: clean(name) || 'Untitled Workbook', fileName: clean(name) ? `${clean(name).replace(/\.xlsx$/i, '')}.xlsx` : 'Untitled Workbook.xlsx', createdAt: now, updatedAt: now, activeSheetId: null, sheets };
}
export function normalizeWorkbook(input: RedPenWorkbook): RedPenWorkbook {
  const sheets = Array.isArray(input?.sheets) ? input.sheets.map(sheet => worksheetFromCourse(sheet.course, sheet.rows || [])) : [];
  const requestedActive = clean(input?.activeSheetId);
  return { ...input, id: clean(input?.id) || `workbook-${Date.now()}`, name: clean(input?.name) || 'Untitled Workbook', fileName: clean(input?.fileName) || undefined, createdAt: input?.createdAt || new Date().toISOString(), updatedAt: input?.updatedAt || new Date().toISOString(), activeSheetId: sheets.some(s => s.id === requestedActive) ? requestedActive : null, sheets };
}
export function loadLocalWorkbook(ownerId?: string | number | null): RedPenWorkbook | null { try { const raw = localStorage.getItem(storageKey(WORKBOOK_STORAGE_KEY, ownerId)); return raw ? normalizeWorkbook(JSON.parse(raw)) : null; } catch { return null; } }
export function writeLocalWorkbook(workbook: RedPenWorkbook, ownerId?: string | number | null): RedPenWorkbook {
  const normalized = normalizeWorkbook(workbook); const owner = ownerId ?? localStorage.getItem(STORAGE_SCOPE_KEY);
  localStorage.setItem(storageKey(WORKBOOK_STORAGE_KEY, owner), JSON.stringify(normalized)); localStorage.setItem(storageKey(ACTIVE_WORKBOOK_STORAGE_KEY, owner), normalized.id);
  if (normalized.activeSheetId) localStorage.setItem(storageKey(ACTIVE_WORKSHEET_STORAGE_KEY, owner), normalized.activeSheetId); else localStorage.removeItem(storageKey(ACTIVE_WORKSHEET_STORAGE_KEY, owner));
  window.dispatchEvent(new CustomEvent('redpen:workbook-updated')); return normalized;
}
export function clearLocalWorkbook(ownerId?: string | number | null): void { const owner = ownerId ?? localStorage.getItem(STORAGE_SCOPE_KEY); localStorage.removeItem(storageKey(WORKBOOK_STORAGE_KEY, owner)); localStorage.removeItem(storageKey(ACTIVE_WORKBOOK_STORAGE_KEY, owner)); localStorage.removeItem(storageKey(ACTIVE_WORKSHEET_STORAGE_KEY, owner)); }
export function setActiveWorksheet(workbook: RedPenWorkbook, worksheetId: string): RedPenWorkbook { if (!workbook.sheets.some(sheet => sheet.id === worksheetId)) return workbook; return writeLocalWorkbook({ ...workbook, activeSheetId: worksheetId, updatedAt: new Date().toISOString() }); }
export function updateWorksheet(workbook: RedPenWorkbook, worksheetId: string, patch: Partial<RedPenWorksheet>): RedPenWorkbook { const sheets = workbook.sheets.map(sheet => sheet.id === worksheetId ? { ...sheet, ...patch, updatedAt: new Date().toISOString() } : sheet); return writeLocalWorkbook({ ...workbook, sheets, updatedAt: new Date().toISOString() }); }
export async function fetchCloudWorkbooks(token: string): Promise<RedPenWorkbook[]> { void token; const data = await apiGet<{ workbooks?: RedPenWorkbook[] }>(API_ENDPOINTS.workbooks.list); return Array.isArray(data.workbooks) ? data.workbooks.map(normalizeWorkbook) : []; }

export async function saveCloudWorkbook(token: string, workbook: RedPenWorkbook): Promise<{ workbook: RedPenWorkbook; workbooks: RedPenWorkbook[] }> {
  void token;
  const localVersionTime = new Date(workbook.updatedAt || 0).getTime();
  const currentCloudWorkbooks = await fetchCloudWorkbooks(token);
  const currentCloud = currentCloudWorkbooks.find(candidate => candidate.id === workbook.id);
  const cloudVersionTime = currentCloud ? new Date(currentCloud.updatedAt || 0).getTime() : 0;

  if (currentCloud && cloudVersionTime > localVersionTime) {
    const owner = localStorage.getItem(STORAGE_SCOPE_KEY);
    const local = writeLocalWorkbook(currentCloud, owner);
    return { workbook: local, workbooks: currentCloudWorkbooks };
  }

  const normalized = normalizeWorkbook({ ...workbook, updatedAt: new Date().toISOString() });
  try {
    const data = await apiPost<{ workbook?: RedPenWorkbook; workbooks?: RedPenWorkbook[] }>(API_ENDPOINTS.workbooks.save, {
      workbook: normalized,
      expectedUpdatedAt: currentCloud?.updatedAt || '',
    });
    const saved = normalizeWorkbook(data.workbook || normalized);
    const workbooks = Array.isArray(data.workbooks) ? data.workbooks.map(normalizeWorkbook) : [saved];
    const owner = localStorage.getItem(STORAGE_SCOPE_KEY);
    writeLocalWorkbook(saved, owner);
    return { workbook: saved, workbooks };
  } catch (error: any) {
    if (error?.code === 'WORKBOOK_CONFLICT') {
      const latest = normalizeWorkbook(error?.workbook);
      if (latest?.id) {
        const owner = localStorage.getItem(STORAGE_SCOPE_KEY);
        const local = writeLocalWorkbook(latest, owner);
        return { workbook: local, workbooks: Array.isArray(error?.workbooks) ? error.workbooks.map(normalizeWorkbook) : [local] };
      }
    }
    throw error;
  }
}
export async function deleteCloudWorkbook(token: string, workbook: RedPenWorkbook): Promise<RedPenWorkbook[]> {
  void token; const data = await apiDelete<{ workbooks?: RedPenWorkbook[] }>(`${API_ENDPOINTS.workbooks.delete}?id=${encodeURIComponent(workbook.id)}`); const workbooks = Array.isArray(data.workbooks) ? data.workbooks.map(normalizeWorkbook) : []; if (loadLocalWorkbook()?.id === workbook.id) clearLocalWorkbook(); return workbooks;
}
