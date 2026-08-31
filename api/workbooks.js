import jwt from 'jsonwebtoken';
import { getUserMeta, updateUserMeta } from './wordpress-auth.js';

const JWT_SECRET = process.env.JWT_SECRET;
const WORKBOOKS_META_KEY = 'redpen_workbooks';

function authenticate(req, res) {
  if (!JWT_SECRET) { res.status(500).json({ code: 'SERVER_CONFIG_ERROR', message: 'Authentication is not configured on the server' }); return null; }
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) { res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Authentication required' }); return null; }
  try { return jwt.verify(header.slice(7), JWT_SECRET); }
  catch { res.status(401).json({ code: 'INVALID_TOKEN', message: 'Invalid or expired token' }); return null; }
}

function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function normalizeWorksheet(sheet) {
  const course = sheet?.course || {};
  const id = clean(sheet?.id) || clean(course.id) || [clean(course.courseCode).toUpperCase(), clean(course.academicYear), clean(course.year), clean(course.semester), clean(course.customName)].join('|');
  const now = new Date().toISOString();
  return { id, name: clean(sheet?.name) || clean(course.courseCode) || 'Course', course: { ...course, id, courseCode: clean(course.courseCode).toUpperCase(), courseName: clean(course.courseName), program: clean(course.program), year: clean(course.year), semester: clean(course.semester), academicYear: clean(course.academicYear), sessionLabel: clean(course.sessionLabel), customName: clean(course.customName) || undefined, createdAt: course.createdAt || now, updatedAt: course.updatedAt || now }, rows: Array.isArray(sheet?.rows) ? sheet.rows : [], createdAt: sheet?.createdAt || now, updatedAt: sheet?.updatedAt || now };
}
function normalizeWorkbook(input) {
  const sheets = Array.isArray(input?.sheets) ? input.sheets.map(normalizeWorksheet) : [];
  const activeSheetId = sheets.some(s => s.id === clean(input?.activeSheetId)) ? clean(input.activeSheetId) : null;
  return { id: clean(input?.id) || `workbook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: clean(input?.name) || 'Untitled Workbook', fileName: clean(input?.fileName) || undefined, createdAt: input?.createdAt || new Date().toISOString(), updatedAt: input?.updatedAt || new Date().toISOString(), activeSheetId, sheets };
}
function dedupeWorkbooks(workbooks) {
  const map = new Map();
  for (const raw of Array.isArray(workbooks) ? workbooks : []) { const workbook = normalizeWorkbook(raw); const existing = map.get(workbook.id); if (!existing || String(workbook.updatedAt).localeCompare(String(existing.updatedAt)) >= 0) map.set(workbook.id, workbook); }
  return Array.from(map.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
async function saveAll(userId, workbooks) {
  const normalized = dedupeWorkbooks(workbooks);
  const ok = await updateUserMeta(userId, WORKBOOKS_META_KEY, normalized);
  if (!ok) { const error = new Error('WordPress did not persist workbook data'); error.code = 'WORKBOOK_STORAGE_UNAVAILABLE'; throw error; }
  return normalized;
}

export default async function handler(req, res) {
  const user = authenticate(req, res); if (!user) return;
  const userId = user.id || user.wordPressId;
  if (!userId) return res.status(401).json({ code: 'INVALID_USER', message: 'Authenticated user is missing an id' });
  try {
    const stored = await getUserMeta(userId, WORKBOOKS_META_KEY);
    const workbooks = dedupeWorkbooks(stored);
    if (req.method === 'GET') return res.status(200).json({ workbooks });

    if (req.method === 'POST') {
      const incoming = normalizeWorkbook(req.body?.workbook || {});
      const expectedUpdatedAt = clean(req.body?.expectedUpdatedAt);
      if (!incoming.sheets.length) return res.status(400).json({ code: 'EMPTY_WORKBOOK', message: 'A workbook must contain at least one course worksheet' });
      const existingIndex = workbooks.findIndex(w => w.id === incoming.id);
      const existing = existingIndex >= 0 ? workbooks[existingIndex] : null;

      if (existing && expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
        return res.status(409).json({ code: 'WORKBOOK_CONFLICT', message: 'This workbook was changed on another device. The newer cloud version was kept.', workbook: existing, workbooks });
      }

      const saved = normalizeWorkbook({ ...existing, ...incoming, id: existing?.id || incoming.id, createdAt: existing?.createdAt || incoming.createdAt, updatedAt: new Date().toISOString() });
      const next = workbooks.filter(w => w.id !== saved.id); next.unshift(saved);
      const result = await saveAll(userId, next);
      return res.status(existing ? 200 : 201).json({ workbook: saved, workbooks: result });
    }

    if (req.method === 'DELETE') {
      const id = clean(req.query?.id) || clean(req.body?.id);
      if (!id) return res.status(400).json({ code: 'MISSING_WORKBOOK', message: 'Workbook id is required' });
      const next = workbooks.filter(w => w.id !== id);
      const result = next.length === workbooks.length ? workbooks : await saveAll(userId, next);
      return res.status(200).json({ deleted: next.length !== workbooks.length, workbooks: result });
    }
    res.setHeader('Allow', 'GET, POST, DELETE'); return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  } catch (error) {
    console.error('Workbook API error:', error);
    return res.status(500).json({ code: error?.code || 'WORKBOOK_API_FAILED', message: error?.code === 'WORKBOOK_STORAGE_UNAVAILABLE' ? 'Cloud workbook storage is unavailable. Please try again later.' : 'Failed to access cloud workbooks' });
  }
}
