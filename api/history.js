import jwt from 'jsonwebtoken';
import { getUserMeta, updateUserMeta } from './wordpress-auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const HISTORY_META_KEY = 'redpen_grading_history';
const MAX_HISTORY = 50;

function authenticate(req, res) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Authentication required' });
    return null;
  }
  try {
    return jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    res.status(401).json({ code: 'INVALID_TOKEN', message: 'Invalid or expired token' });
    return null;
  }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRecord(input) {
  const now = new Date().toISOString();
  return {
    id: clean(input?.id) || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    date: clean(input?.date) || now,
    studentInfo: input?.studentInfo && typeof input.studentInfo === 'object' ? input.studentInfo : {},
    result: input?.result && typeof input.result === 'object' ? input.result : {},
  };
}

function dedupeHistory(records) {
  const byId = new Map();
  for (const raw of Array.isArray(records) ? records : []) {
    const record = normalizeRecord(raw);
    if (!byId.has(record.id)) byId.set(record.id, record);
  }
  return Array.from(byId.values())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, MAX_HISTORY);
}

export default async function handler(req, res) {
  const user = authenticate(req, res);
  if (!user) return;

  const userId = user.id || user.wordPressId;
  if (!userId) return res.status(401).json({ code: 'INVALID_USER', message: 'Authenticated user is missing an id' });

  try {
    const stored = await getUserMeta(userId, HISTORY_META_KEY);
    const history = dedupeHistory(stored);

    if (JSON.stringify(stored || []) !== JSON.stringify(history)) {
      await updateUserMeta(userId, HISTORY_META_KEY, history);
    }

    if (req.method === 'GET') return res.status(200).json({ history });

    if (req.method === 'POST') {
      const incoming = normalizeRecord(req.body?.record || req.body || {});
      const existingIndex = history.findIndex(record => record.id === incoming.id);
      const next = [...history];
      if (existingIndex >= 0) next.splice(existingIndex, 1);
      next.unshift(incoming);
      const saved = dedupeHistory(next);
      await updateUserMeta(userId, HISTORY_META_KEY, saved);
      return res.status(existingIndex >= 0 ? 200 : 201).json({ record: incoming, history: saved });
    }

    if (req.method === 'DELETE') {
      const id = clean(req.query?.id) || clean(req.body?.id);
      if (!id) return res.status(400).json({ code: 'MISSING_RECORD', message: 'History record id is required' });
      const next = history.filter(record => record.id !== id);
      await updateUserMeta(userId, HISTORY_META_KEY, next);
      return res.status(200).json({ deleted: next.length !== history.length, history: next });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  } catch (error) {
    console.error('History API error:', error);
    return res.status(500).json({ code: 'HISTORY_API_FAILED', message: 'Failed to access grading history' });
  }
}
