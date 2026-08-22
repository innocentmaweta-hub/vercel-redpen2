import type { SemesterCourse } from '../types';

const SESSION_STORAGE_KEY = 'stored_sessions';

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function persistImportedSession(session: SemesterCourse): SemesterCourse[] {
  try {
    const existing = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]');
    const list = Array.isArray(existing) ? existing : [];
    const key = (value: SemesterCourse) => [
      clean(value.courseCode).toUpperCase(),
      clean(value.academicYear),
      clean(value.year),
      clean(value.semester),
      clean(value.customName),
    ].join('|');

    const incomingKey = key(session);
    const merged = [
      session,
      ...list.filter((item: SemesterCourse) => key(item) !== incomingKey),
    ];

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('redpen:sessions-updated'));
    return merged;
  } catch {
    return [session];
  }
}
