import jwt from 'jsonwebtoken';
import { getUserMeta, updateUserMeta } from './wordpress-auth.js';

const JWT_SECRET = process.env.JWT_SECRET;
const WORKBOOKS_META_KEY = 'redpen_workbooks';
const LEGACY_SESSIONS_META_KEY = 'redpen_sessions';

function authenticate(req, res) {
  if (!JWT_SECRET) {
    res.status(500).json({ code: 'SERVER_CONFIG_ERROR', message: 'Authentication is not configured on the server' });
    return null;
  }
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Authentication required' });
    return null;
  }
  try { return jwt.verify(header.slice(7), JWT_SECRET); }
  catch { res.status(401).json({ code: 'INVALID_TOKEN', message: 'Invalid or expired token' }); return null; }
}

const clean = value => typeof value === 'string' ? value.trim() : '';
const identity = course => [clean(course?.courseCode).toUpperCase(), clean(course?.academicYear), clean(course?.year), clean(course?.semester), clean(course?.customName)].join('|');

function normalizeCourse(course) {
  const now = new Date().toISOString();
  const id = clean(course?.id) || identity(course);
  return {
    ...course,
    id,
    courseCode: clean(course?.courseCode).toUpperCase(),
    courseName: clean(course?.courseName),
    program: clean(course?.program),
    year: clean(course?.year),
    semester: clean(course?.semester),
    academicYear: clean(course?.academicYear),
    sessionLabel: clean(course?.sessionLabel),
    customName: clean(course?.customName) || undefined,
    createdAt: course?.createdAt || now,
    updatedAt: course?.updatedAt || now,
  };
}

function normalizeWorkbook(input) {
  const sheets = Array.isArray(input?.sheets) ? input.sheets.map(sheet => ({
    id: clean(sheet?.id) || identity(sheet?.course),
    name: clean(sheet?.name) || clean(sheet?.course?.courseCode) || 'Course',
    course: normalizeCourse(sheet?.course || {}),
    rows: Array.isArray(sheet?.rows) ? sheet.rows : [],
    createdAt: sheet?.createdAt || new Date().toISOString(),
    updatedAt: sheet?.updatedAt || new Date().toISOString(),
  })) : [];
  return {
    id: clean(input?.id) || `workbook-${Date.now()}`,
    name: clean(input?.name) || 'RedPen Workbook',
    fileName: clean(input?.fileName) || undefined,
    createdAt: input?.createdAt || new Date().toISOString(),
    updatedAt: input?.updatedAt || new Date().toISOString(),
    activeSheetId: sheets.some(s => s.id === clean(input?.activeSheetId)) ? clean(input.activeSheetId) : null,
    sheets,
  };
}

async function readWorkbooks(userId) {
  const stored = await getUserMeta(userId, WORKBOOKS_META_KEY);
  if (Array.isArray(stored) && stored.length) return stored.map(normalizeWorkbook);

  // One-time compatibility read. Old sessions become worksheets in a single workbook.
  const legacy = await getUserMeta(userId, LEGACY_SESSIONS_META_KEY);
  if (!Array.isArray(legacy) || !legacy.length) return [];
  const sheets = legacy.map(course => {
    const normalized = normalizeCourse(course);
    return { id: normalized.id, name: normalized.courseCode || 'Course', course: normalized, rows: [], createdAt: normalized.createdAt, updatedAt: normalized.updatedAt };
  });
  return [normalizeWorkbook({ id: `legacy-workbook-${userId}`, name: 'RedPen Workbook', sheets, activeSheetId: sheets[0]?.id })];
}

async function saveWorkbooks(userId, workbooks) {
  const ok = await updateUserMeta(userId, WORKBOOKS_META_KEY, workbooks.map(normalizeWorkbook));
  if (!ok) throw Object.assign(new Error('WordPress did not persist workbook data'), { code: 'SESSION_STORAGE_UNAVAILABLE' });
  return workbooks.map(normalizeWorkbook);
}

export default async function handler(req, res) {
  const user = authenticate(req, res);
  if (!user) return;
  const userId = user.id || user.wordPressId;
  if (!userId) return res.status(401).json({ code: 'INVALID_USER', message: 'Authenticated user is missing an id' });

  try {
    const workbooks = await readWorkbooks(userId);
    let workbook = workbooks[0] || null;

    if (req.method === 'GET') {
      const sessions = workbook ? workbook.sheets.map(sheet => sheet.course) : [];
      return res.status(200).json({ sessions, workbook });
    }

    if (!workbook && req.method === 'POST') {
      workbook = normalizeWorkbook({ id: `workbook-${Date.now()}`, name: 'RedPen Workbook', sheets: [] });
    }

    if (req.method === 'POST') {
      const incoming = normalizeCourse(req.body?.session || {});
      if (!incoming.courseCode) return res.status(400).json({ code: 'MISSING_COURSE', message: 'Course code is required' });
      const sheet = { id: incoming.id, name: incoming.courseCode, course: incoming, rows: [], createdAt: incoming.createdAt, updatedAt: incoming.updatedAt };
      const sheets = workbook.sheets.filter(s => s.id !== incoming.id && identity(s.course) !== identity(incoming));
      sheets.unshift(sheet);
      workbook = normalizeWorkbook({ ...workbook, sheets, activeSheetId: sheet.id, updatedAt: new Date().toISOString() });
      const saved = await saveWorkbooks(userId, [workbook, ...workbooks.slice(1).filter(w => w.id !== workbook.id)]);
      return res.status(200).json({ session: incoming, sessions: saved[0].sheets.map(s => s.course), workbook: saved[0] });
    }

    if (req.method === 'DELETE') {
      const id = clean(req.query?.id) || clean(req.body?.id);
      const key = clean(req.query?.key) || clean(req.body?.key);
      if (!id && !key) return res.status(400).json({ code: 'MISSING_SESSION', message: 'Session id or key is required' });
      if (!workbook) return res.status(200).json({ deleted: false, sessions: [] });
      const nextSheets = workbook.sheets.filter(s => s.id !== id && identity(s.course) !== key && identity(s.course) !== id);
      const deleted = nextSheets.length !== workbook.sheets.length;
      workbook = normalizeWorkbook({ ...workbook, sheets: nextSheets, activeSheetId: nextSheets[0]?.id || null, updatedAt: new Date().toISOString() });
      const saved = deleted ? await saveWorkbooks(userId, [workbook, ...workbooks.slice(1).filter(w => w.id !== workbook.id)]) : workbooks;
      return res.status(200).json({ deleted, sessions: saved[0]?.sheets.map(s => s.course) || [] });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  } catch (error) {
    console.error('Session compatibility API error:', error);
    return res.status(500).json({ code: error?.code || 'SESSION_API_FAILED', message: error?.code === 'SESSION_STORAGE_UNAVAILABLE' ? 'Cloud workbook storage is unavailable. Please try again later.' : 'Failed to access cloud workbook' });
  }
}
