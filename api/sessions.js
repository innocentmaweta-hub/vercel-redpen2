import jwt from 'jsonwebtoken';
import { getUserMeta, updateUserMeta } from './wordpress-auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const SESSIONS_META_KEY = 'redpen_sessions';

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

function sessionKey(session) {
  return [
    clean(session.courseCode).toUpperCase(),
    clean(session.academicYear),
    clean(session.year),
    clean(session.semester),
    clean(session.sessionLabel),
    clean(session.customName),
  ].join('|');
}

function normalizeSession(input) {
  const courseCode = clean(input?.courseCode).toUpperCase();
  return {
    id: clean(input?.id) || undefined,
    courseCode,
    courseName: clean(input?.courseName),
    program: clean(input?.program),
    year: clean(input?.year),
    semester: clean(input?.semester),
    academicYear: clean(input?.academicYear),
    sessionLabel: clean(input?.sessionLabel),
    customName: clean(input?.customName) || undefined,
    updatedAt: new Date().toISOString(),
  };
}

function dedupeSessions(sessions) {
  const byKey = new Map();
  for (const raw of Array.isArray(sessions) ? sessions : []) {
    const session = normalizeSession(raw);
    if (!session.courseCode) continue;
    const key = sessionKey(session);
    if (!byKey.has(key)) byKey.set(key, { ...session, id: session.id || key });
  }
  return Array.from(byKey.values()).sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  );
}

export default async function handler(req, res) {
  const user = authenticate(req, res);
  if (!user) return;

  const userId = user.id || user.wordPressId;
  if (!userId) {
    return res.status(401).json({ code: 'INVALID_USER', message: 'Authenticated user is missing an id' });
  }

  try {
    const stored = await getUserMeta(userId, SESSIONS_META_KEY);
    const sessions = dedupeSessions(stored);

    if (JSON.stringify(stored || []) !== JSON.stringify(sessions)) {
      await updateUserMeta(userId, SESSIONS_META_KEY, sessions);
    }

    if (req.method === 'GET') return res.status(200).json({ sessions });

    if (req.method === 'POST') {
      const incoming = normalizeSession(req.body?.session || {});
      if (!incoming.courseCode) {
        return res.status(400).json({ code: 'MISSING_COURSE', message: 'Course code is required' });
      }

      // If the client supplies an id, that id is authoritative. This lets a
      // session keep its identity while course/year/semester metadata changes.
      const existingIndex = incoming.id
        ? sessions.findIndex((s) => s.id === incoming.id)
        : -1;
      const key = sessionKey(incoming);
      const keyIndex = sessions.findIndex((s) => sessionKey(s) === key);
      const matchIndex = existingIndex >= 0 ? existingIndex : keyIndex;
      const existing = matchIndex >= 0 ? sessions[matchIndex] : null;

      const saved = {
        ...incoming,
        id: existing?.id || incoming.id || key,
        updatedAt: new Date().toISOString(),
      };

      const next = sessions.filter((s, index) => index !== matchIndex && sessionKey(s) !== key);
      next.unshift(saved);
      const deduped = dedupeSessions(next);
      await updateUserMeta(userId, SESSIONS_META_KEY, deduped);

      return res.status(existing ? 200 : 201).json({ session: saved, sessions: deduped });
    }

    if (req.method === 'DELETE') {
      const id = clean(req.query?.id) || clean(req.body?.id);
      const key = clean(req.query?.key) || clean(req.body?.key);
      if (!id && !key) {
        return res.status(400).json({ code: 'MISSING_SESSION', message: 'Session id or key is required' });
      }

      const next = sessions.filter((s) => s.id !== id && sessionKey(s) !== key);
      await updateUserMeta(userId, SESSIONS_META_KEY, next);
      return res.status(200).json({ deleted: sessions.length !== next.length, sessions: next });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  } catch (error) {
    console.error('Session API error:', error);
    return res.status(500).json({ code: 'SESSION_API_FAILED', message: 'Failed to access cloud sessions' });
  }
}
