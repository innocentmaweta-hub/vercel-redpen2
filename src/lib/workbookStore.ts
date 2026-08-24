import type { SemesterCourse } from '../types';
import type { RedPenWorkbook, RedPenWorksheet } from '../types/workbook';
import { apiDelete, apiGet, apiPost, API_ENDPOINTS } from '../api';

export const WORKBOOK_STORAGE_KEY = 'redpen_workbook';
export const ACTIVE_WORKBOOK_STORAGE_KEY = 'redpen_active_workbook_id';
export const ACTIVE_WORKSHEET_STORAGE_KEY = 'redpen_active_worksheet_id';

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function worksheetFromCourse(course: SemesterCourse, rows: RedPenWorksheet['rows'] = []): RedPenWorksheet {
  const id = clean(course.id) || `${clean(course.courseCode).toUpperCase()}|${clean(course.academicYear)}|${clean(course.year)}|${clean(course.semester)}|${clean(course.customName)}`;
  const now = new Date().toISOString();
  return {
    id,
    name: clean(course.courseCode) || clean(course.customName) || 'Course',
    course: { ...course, id },
    rows,
    createdAt: course.createdAt || now,
    updatedAt: course.updatedAt || now,
  };
}

export function createWorkbook(name: string, sheets: RedPenWorksheet[] = []): RedPenWorkbook {
  const now = new Date().toISOString();
  return {
    id: `workbook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: clean(name) || 'Untitled Workbook',
    fileName: clean(name) ? `${clean(name).replace(/\.xlsx$/i, '')}.xlsx` : 'Untitled Workbook.xlsx',
    createdAt: now,
    updatedAt: now,
    activeSheetId: null,
    sheets,
  };
}

export function normalizeWorkbook(input: RedPenWorkbook): RedPenWorkbook {
  const sheets = Array.isArray(input?.sheets) ? input.sheets.map(sheet => worksheetFromCourse(sheet.course, sheet.rows || [])) : [];
  const requestedActive = clean(input?.activeSheetId);
  return {
    ...input,
    id: clean(input?.id) || `workbook-${Date.now()}`,
    name: clean(input?.name) || 'Untitled Workbook',
    fileName: clean(input?.fileName) || undefined,
    createdAt: input?.createdAt || new Date().toISOString(),
    updatedAt: input?.updatedAt || new Date().toISOString(),
    activeSheetId: sheets.some(s => s.id === requestedActive) ? requestedActive : null,
    sheets,
  };
}

export function loadLocalWorkbook(): RedPenWorkbook | null {
  try {
    const raw = localStorage.getItem(WORKBOOK_STORAGE_KEY);
    return raw ? normalizeWorkbook(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeLocalWorkbook(workbook: RedPenWorkbook): RedPenWorkbook {
  const normalized = normalizeWorkbook(workbook);
  localStorage.setItem(WORKBOOK_STORAGE_KEY, JSON.stringify(normalized));
  if (normalized.id) localStorage.setItem(ACTIVE_WORKBOOK_STORAGE_KEY, normalized.id);
  if (normalized.activeSheetId) localStorage.setItem(ACTIVE_WORKSHEET_STORAGE_KEY, normalized.activeSheetId);
  window.dispatchEvent(new CustomEvent('redpen:workbook-updated'));
  return normalized;
}

export function clearLocalWorkbook(): void {
  localStorage.removeItem(WORKBOOK_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_WORKBOOK_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_WORKSHEET_STORAGE_KEY);
}

export function setActiveWorksheet(workbook: RedPenWorkbook, worksheetId: string): RedPenWorkbook {
  if (!workbook.sheets.some(sheet => sheet.id === worksheetId)) return workbook;
  return writeLocalWorkbook({ ...workbook, activeSheetId: worksheetId, updatedAt: new Date().toISOString() });
}

export function updateWorksheet(workbook: RedPenWorkbook, worksheetId: string, patch: Partial<RedPenWorksheet>): RedPenWorkbook {
  const sheets = workbook.sheets.map(sheet => sheet.id === worksheetId ? { ...sheet, ...patch, updatedAt: new Date().toISOString() } : sheet);
  return writeLocalWorkbook({ ...workbook, sheets, updatedAt: new Date().toISOString() });
}

export async function fetchCloudWorkbooks(token: string): Promise<RedPenWorkbook[]> {
  void token;
  const data = await apiGet<{ workbooks?: RedPenWorkbook[] }>(API_ENDPOINTS.workbooks.list);
  return Array.isArray(data.workbooks) ? data.workbooks.map(normalizeWorkbook) : [];
}

export async function saveCloudWorkbook(token: string, workbook: RedPenWorkbook): Promise<{ workbook: RedPenWorkbook; workbooks: RedPenWorkbook[] }> {
  void token;
  const normalized = normalizeWorkbook({ ...workbook, updatedAt: new Date().toISOString() });
  const data = await apiPost<{ workbook?: RedPenWorkbook; workbooks?: RedPenWorkbook[] }>(API_ENDPOINTS.workbooks.save, { workbook: normalized });
  const saved = normalizeWorkbook(data.workbook || normalized);
  const workbooks = Array.isArray(data.workbooks) ? data.workbooks.map(normalizeWorkbook) : [saved];
  writeLocalWorkbook(saved);
  return { workbook: saved, workbooks };
}

export async function deleteCloudWorkbook(token: string, workbook: RedPenWorkbook): Promise<RedPenWorkbook[]> {
  void token;
  const data = await apiDelete<{ workbooks?: RedPenWorkbook[] }>(`${API_ENDPOINTS.workbooks.delete}?id=${encodeURIComponent(workbook.id)}`);
  const workbooks = Array.isArray(data.workbooks) ? data.workbooks.map(normalizeWorkbook) : [];
  if (loadLocalWorkbook()?.id === workbook.id) clearLocalWorkbook();
  return workbooks;
}
