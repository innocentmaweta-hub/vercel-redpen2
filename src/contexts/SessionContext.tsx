// name=src/contexts/SessionContext.tsx
// Centralizes localStorage access for sessions, schools, departments, courses and history.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { SemesterCourse, HistoryRecord } from '../types';

const SESSIONS_KEY = 'stored_sessions';
const SCHOOLS_KEY = 'stored_schools';
const DEPARTMENTS_KEY = 'stored_departments';
const COURSES_KEY = 'stored_courses';
const HISTORY_KEY = 'grading_history';

function safeLoad<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function safeSave<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

type StoredCourse = { courseCode: string; courseName: string };

type SessionContextShape = {
  sessions: SemesterCourse[];
  saveSession: (s: SemesterCourse) => void;
  schools: string[];
  setSchools: (s: string[]) => void;
  departments: string[];
  setDepartments: (d: string[]) => void;
  courses: StoredCourse[];
  addCourse: (c: StoredCourse) => void;
  history: HistoryRecord[];
  saveHistory: (records: HistoryRecord[]) => void;
};

const SessionContext = createContext<SessionContextShape | undefined>(undefined);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<SemesterCourse[]>(() => safeLoad(SESSIONS_KEY, []));
  const [schools, setSchools] = useState<string[]>(() => safeLoad(SCHOOLS_KEY, []));
  const [departments, setDepartments] = useState<string[]>(() => safeLoad(DEPARTMENTS_KEY, []));
  const [courses, setCourses] = useState<StoredCourse[]>(() => safeLoad(COURSES_KEY, []));
  const [history, setHistory] = useState<HistoryRecord[]>(() => safeLoad(HISTORY_KEY, []));

  useEffect(() => safeSave(SESSIONS_KEY, sessions), [sessions]);
  useEffect(() => safeSave(SCHOOLS_KEY, schools), [schools]);
  useEffect(() => safeSave(DEPARTMENTS_KEY, departments), [departments]);
  useEffect(() => safeSave(COURSES_KEY, courses), [courses]);
  useEffect(() => safeSave(HISTORY_KEY, history), [history]);

  const saveSession = (s: SemesterCourse) => {
    setSessions(prev => [s, ...prev.filter(x => x.courseCode !== s.courseCode)]);
  };

  const addCourse = (c: StoredCourse) => {
    setCourses(prev => {
      const without = prev.filter(x => x.courseCode !== c.courseCode);
      return [c, ...without];
    });
  };

  const saveHistory = (records: HistoryRecord[]) => setHistory(records);

  return (
    <SessionContext.Provider value={{
      sessions, saveSession,
      schools, setSchools,
      departments, setDepartments,
      courses, addCourse,
      history, saveHistory
    }}>
      {children}
    </SessionContext.Provider>
  );
}
