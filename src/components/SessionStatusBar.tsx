import { useState } from 'react';
import { CloudSaveStatus } from './CloudSaveStatus';
import { writeLocalWorkbook, saveCloudWorkbook } from '../lib/workbookStore';
import { normalizeSession } from '../lib/sessionStore';
import type { RedPenWorkbook } from '../types/workbook';
import { SemesterCourse } from './CourseSessionModal';

interface SessionStatusBarProps {
    semesterCourse: SemesterCourse;
    sessionSaveState: 'idle' | 'saving' | 'saved' | 'error';
    onRetry: () => void;
    onDismiss: () => void;
    workbook: RedPenWorkbook | null;
    token: string | null;
    setWorkbook: (w: RedPenWorkbook | null) => void;
    setSessions: (s: SemesterCourse[]) => void;
    setSemesterCourse: (s: SemesterCourse | null) => void;
    setActiveSessionId: (id: string | null) => void;
    setSessionSaveState: (s: 'idle' | 'saving' | 'saved' | 'error') => void;
}

export function SessionStatusBar({
    semesterCourse, sessionSaveState, onRetry, onDismiss,
    workbook, token, setWorkbook, setSessions, setSemesterCourse,
    setActiveSessionId, setSessionSaveState,
}: SessionStatusBarProps) {
    const handleClear = async () => {
        // Clearing the active course session must NOT delete the workbook or
        // any worksheets — only the active worksheet selection.
        const currentWorkbook = workbook;

        if (!currentWorkbook) {
            setSemesterCourse(null);
            setActiveSessionId(null);
            localStorage.removeItem('yaza_active_session_id');
            return;
        }

        const clearedWorkbook: RedPenWorkbook = {
            ...currentWorkbook,
            activeSheetId: null,
            updatedAt: new Date().toISOString(),
        };

        const locallySaved = writeLocalWorkbook(clearedWorkbook);
        setWorkbook(locallySaved);
        setSemesterCourse(null);
        setActiveSessionId(null);
        localStorage.removeItem('yaza_active_session_id');

        if (!token) {
            setSessionSaveState('saved');
            return;
        }

        setSessionSaveState('saving');
        try {
            const response = await saveCloudWorkbook(token, locallySaved);
            const savedWorkbook = response.workbook;
            setWorkbook(savedWorkbook);
            setSessions(savedWorkbook.sheets.map(sheet => normalizeSession(sheet.course)));
            setSessionSaveState('saved');
        } catch (error) {
            console.error('Failed to clear active course session:', error);
            setSessionSaveState('error');
        }
    };

    const sessionName = semesterCourse.customName || semesterCourse.sessionLabel || semesterCourse.academicYear || 'Current session';

    return (
        <div className="flex items-center gap-2 px-3 py-2 bg-accent-blue/5 border border-accent-blue/20 rounded-xl shrink-0">
            <CloudSaveStatus state={sessionSaveState} onRetry={onRetry} onDismiss={onDismiss} label="Course session" />
            <div className="w-1.5 h-4 bg-accent-blue rounded-full" />
            <span className="text-[10px] font-black text-accent-blue uppercase tracking-wider">
                Session: {sessionName}
            </span>
            <span className="text-[10px] text-gray-500">
                • Course: {semesterCourse.courseCode}
            </span>
            {sessionSaveState === 'saving' && <span className="text-[9px] text-gray-500">Saving…</span>}
            <button
                onClick={handleClear}
                className="ml-auto text-[9px] text-gray-600 hover:text-gray-400 uppercase font-bold tracking-wider transition-colors"
                title="Leave the current course session without deleting the workbook"
            >
                Leave Session
            </button>
        </div>
    );
}
