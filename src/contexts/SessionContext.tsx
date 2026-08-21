import React, { createContext, useContext, useEffect, useState } from 'react';
import { HistoryRecord } from '../types';
import { getSavedFolder, writeFileToFolder } from '../lib/fileStorage';
import { buildPaperPdfBlob, buildPaperPdfFilename, appendResultToSessionExcel } from '../lib/exportUtils';

const HISTORY_KEY = 'grading_history';
const SESSIONS_KEY = 'stored_sessions';

type SessionContextShape = {
  history: HistoryRecord[];
  saveRecord: (record: HistoryRecord, paperImageBase64?: string | null) => Promise<void>;
  loadSessions: () => any[];
  saveSessions: (sessions: any[]) => void;
};

const SessionContext = createContext<SessionContextShape | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<HistoryRecord[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (err) {
      console.error('Failed to persist history to localStorage', err);
    }
  }, [history]);

  const loadSessions = () => {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveSessions = (sessions: any[]) => {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions || []));
    } catch (err) {
      console.error('Failed to persist sessions', err);
    }
  };

  const saveRecord = async (record: HistoryRecord, paperImageBase64?: string | null) => {
    // Update local history state
    setHistory(prev => {
      const updated = [record, ...prev].slice(0, 50);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to persist history', err);
      }
      return updated;
    });

    // Sync to backend (best-effort)
    try {
      fetch('/api/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ studentInfo: record.studentInfo, result: record.result })
      }).catch((e) => console.error('Failed to sync history to server', e));
    } catch (err) {
      console.error('Failed to sync history', err);
    }

    // Export PDF/Excel if possible
    try {
      const folder = await getSavedFolder();

      if (paperImageBase64) {
        try {
          const pdfBlob = await buildPaperPdfBlob(paperImageBase64);
          const pdfFilename = buildPaperPdfFilename(record.studentInfo as any);
          await writeFileToFolder(folder, pdfFilename, pdfBlob);
        } catch (err) {
          console.error('Failed to export PDF', err);
        }
      }

      try {
        const workbookKey = {
          academicYear: (record.studentInfo as any)?.academicYear || '',
          semester: (record.studentInfo as any)?.semester || '',
          sessionLabel: (record.studentInfo as any)?.sessionLabel || '',
          customName: (record.studentInfo as any)?.customName || ''
        } as any;

        const courseSheetKey = (record.studentInfo as any)?.courseCode || 'general';

        await appendResultToSessionExcel(folder, workbookKey, courseSheetKey, record.studentInfo as any, record.result as any);
      } catch (err) {
        console.error('Failed to append result to session Excel', err);
      }
    } catch (err) {
      console.error('Export flow failed', err);
    }
  };

  const value: SessionContextShape = {
    history,
    saveRecord,
    loadSessions,
    saveSessions
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
