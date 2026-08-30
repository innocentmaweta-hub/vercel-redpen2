import { useState, useCallback, useEffect } from 'react';
import { StudentInfo } from '../types';
import type { RedPenWorkbook, RedPenWorksheet } from '../types/workbook';
import { sessionIdentityKey, normalizeSession } from '../lib/sessionStore';
import { createWorkbook, loadLocalWorkbook, writeLocalWorkbook, setActiveWorksheet, fetchCloudWorkbooks, saveCloudWorkbook } from '../lib/workbookStore';
import { fetchCloudHistory, writeLocalHistory } from '../lib/historyStore';
import { SemesterCourse } from '../components/CourseSessionModal';

export function useWorkbook(user: any, token: string | null, setStudentInfo: React.Dispatch<React.SetStateAction<StudentInfo>>, setHistory: (history: any[]) => void) {
    const [workbook, setWorkbook] = useState<RedPenWorkbook | null>(null);
    const [sessions, setSessions] = useState<SemesterCourse[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [semesterCourse, setSemesterCourse] = useState<SemesterCourse | null>(null);
    const [sessionSaveState, setSessionSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [showSessionStatus, setShowSessionStatus] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const courses = workbook ? workbook.sheets.map(sheet => sheet.course).filter(course => course.courseCode?.trim()).map(course => ({ courseCode: course.courseCode.trim(), courseName: course.courseName || '' })) : Array.from(new Map(sessions.filter(session => session.courseCode?.trim()).map(session => [session.courseCode.trim(), { courseCode: session.courseCode.trim(), courseName: session.courseName || '' }])).values());

    const filteredSessions = sessions.filter(session => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return true;
        return session.courseCode?.toLowerCase().includes(term) || session.courseName?.toLowerCase().includes(term) || session.customName?.toLowerCase().includes(term) || session.sessionLabel?.toLowerCase().includes(term);
    });

    const workbookCourses = workbook?.sheets || [];
    const filteredCourses = workbookCourses.filter(sheet => searchTerm === '' || sheet.courseCode.toLowerCase().includes(searchTerm.toLowerCase()) || sheet.courseName?.toLowerCase().includes(searchTerm.toLowerCase()));

    const syncStudentInfoFromWorksheet = (worksheet: RedPenWorksheet | null) => {
        if (!worksheet) return;
        setStudentInfo(prev => ({ ...prev, courseCode: worksheet.course?.courseCode || '', year: worksheet.course?.year || '', semester: worksheet.course?.semester || '', academicYear: worksheet.course?.academicYear || '', program: worksheet.course?.program || prev.program }));
    };

    const persistSession = useCallback(async (session: SemesterCourse): Promise<SemesterCourse | null> => {
        const normalized = normalizeSession(session);
        const worksheetId = normalized.id || sessionIdentityKey(normalized);
        const now = new Date().toISOString();
        const currentWorkbook = workbook || createWorkbook(normalized.customName || normalized.courseCode || 'RedPen Workbook');
        const existingWorksheet = currentWorkbook.sheets.find(sheet => sheet.id === worksheetId || sessionIdentityKey(sheet.course) === sessionIdentityKey(normalized));
        const worksheet = existingWorksheet ? { ...existingWorksheet, id: existingWorksheet.id || worksheetId, name: normalized.courseCode || normalized.customName || existingWorksheet.name || 'Course', course: { ...existingWorksheet.course, ...normalized, id: existingWorksheet.id || worksheetId }, updatedAt: now } : { id: worksheetId, name: normalized.courseCode || normalized.customName || 'Course', course: { ...normalized, id: worksheetId }, rows: [], createdAt: normalized.createdAt || now, updatedAt: now };
        const nextSheets = existingWorksheet ? currentWorkbook.sheets.map(sheet => sheet.id === existingWorksheet.id ? worksheet : sheet) : [...currentWorkbook.sheets, worksheet];
        const nextWorkbook: RedPenWorkbook = { ...currentWorkbook, updatedAt: now, activeSheetId: worksheet.id, sheets: nextSheets };
        const savedLocalWorkbook = writeLocalWorkbook(nextWorkbook);
        setWorkbook(savedLocalWorkbook);
        const nextSessions = savedLocalWorkbook.sheets.map(sheet => normalizeSession(sheet.course));
        setSessions(nextSessions);
        const activeWorksheet = savedLocalWorkbook.sheets.find(sheet => sheet.id === savedLocalWorkbook.activeSheetId);
        const activeSession = activeWorksheet ? normalizeSession(activeWorksheet.course) : normalized;
        setSemesterCourse(activeSession);
        setActiveSessionId(activeWorksheet?.id || worksheet.id);
        syncStudentInfoFromWorksheet(activeWorksheet || worksheet);
        localStorage.setItem('yaza_active_session_id', activeWorksheet?.id || worksheet.id);
        if (!token) { setSessionSaveState('saved'); return activeSession; }
        setSessionSaveState('saving');
        try {
            const cloudResponse = await saveCloudWorkbook(token, savedLocalWorkbook);
            const cloudWorkbook = cloudResponse.workbook;
            const normalizedCloudWorkbook = writeLocalWorkbook(cloudWorkbook);
            setWorkbook(normalizedCloudWorkbook);
            setSessions(normalizedCloudWorkbook.sheets.map(sheet => normalizeSession(sheet.course)));
            const cloudActiveWorksheet = normalizedCloudWorkbook.sheets.find(sheet => sheet.id === normalizedCloudWorkbook.activeSheetId);
            if (cloudActiveWorksheet) {
                const cloudSession = normalizeSession(cloudActiveWorksheet.course);
                setSemesterCourse(cloudSession);
                setActiveSessionId(cloudActiveWorksheet.id);
                syncStudentInfoFromWorksheet(cloudActiveWorksheet);
                localStorage.setItem('yaza_active_session_id', cloudActiveWorksheet.id);
                setSessionSaveState('saved');
                return cloudSession;
            }
            setSessionSaveState('saved');
            return activeSession;
        } catch (error) {
            console.error('Failed to save workbook to cloud:', error);
            setSessionSaveState('error');
            return activeSession;
        }
    }, [workbook, token]);

    const persistWorkbook = useCallback(async (nextWorkbook: RedPenWorkbook): Promise<RedPenWorkbook> => {
        const savedLocalWorkbook = writeLocalWorkbook(nextWorkbook);
        setWorkbook(savedLocalWorkbook);
        setSessions(savedLocalWorkbook.sheets.map(sheet => normalizeSession(sheet.course)));
        if (!token) { setSessionSaveState('saved'); return savedLocalWorkbook; }
        setShowSessionStatus(true);
        setSessionSaveState('saving');
        try {
            const cloudWorkbook = await saveCloudWorkbook(token, savedLocalWorkbook);
            const savedCloudWorkbook = writeLocalWorkbook(cloudWorkbook);
            setWorkbook(savedCloudWorkbook);
            setSessions(savedCloudWorkbook.sheets.map(sheet => normalizeSession(sheet.course)));
            setSessionSaveState('saved');
            return savedCloudWorkbook;
        } catch (error) {
            console.error('Failed to persist workbook:', error);
            setSessionSaveState('error');
            return savedLocalWorkbook;
        }
    }, [token]);

    useEffect(() => {
        if (!user || !token) return;
        let cancelled = false;
        const syncCloudData = async () => {
            try {
                const [cloudWorkbooks, cloudHistory] = await Promise.all([fetchCloudWorkbooks(token), fetchCloudHistory(token)]);
                if (cancelled) return;
                setHistory(cloudHistory);
                writeLocalHistory(cloudHistory);
                const localWorkbook = loadLocalWorkbook();
                const restoredWorkbook = (localWorkbook && cloudWorkbooks.find(candidate => candidate.id === localWorkbook.id)) || cloudWorkbooks[0] || localWorkbook || null;
                if (!restoredWorkbook) {
                    setWorkbook(null); setSessions([]); setSemesterCourse(null); setActiveSessionId(null); localStorage.removeItem('yaza_active_session_id'); setSessionSaveState('saved'); return;
                }
                const activeWorksheet = restoredWorkbook.activeSheetId ? restoredWorkbook.sheets.find(sheet => sheet.id === restoredWorkbook.activeSheetId) : null;
                const normalizedWorkbook = { ...restoredWorkbook, activeSheetId: activeWorksheet?.id || null };
                const savedWorkbook = writeLocalWorkbook(normalizedWorkbook);
                setWorkbook(savedWorkbook);
                setSessions(savedWorkbook.sheets.map(sheet => normalizeSession(sheet.course)));
                if (activeWorksheet) {
                    const normalized = normalizeSession(activeWorksheet.course);
                    setSemesterCourse(normalized); setActiveSessionId(activeWorksheet.id); localStorage.setItem('yaza_active_session_id', activeWorksheet.id);
                } else {
                    setSemesterCourse(null); setActiveSessionId(null); localStorage.removeItem('yaza_active_session_id');
                }
                setSessionSaveState('saved');
            } catch (error) {
                if (cancelled) return;
                console.error('Failed to restore workbook data:', error);
                const localWorkbook = loadLocalWorkbook();
                if (localWorkbook) {
                    setWorkbook(localWorkbook);
                    setSessions(localWorkbook.sheets.map(sheet => normalizeSession(sheet.course)));
                    const activeWorksheet = localWorkbook.activeSheetId ? localWorkbook.sheets.find(sheet => sheet.id === localWorkbook.activeSheetId) : null;
                    if (activeWorksheet) {
                        const normalized = normalizeSession(activeWorksheet.course);
                        setSemesterCourse(normalized); setActiveSessionId(activeWorksheet.id);
                    }
                }
                setSessionSaveState('error');
            }
        };
        syncCloudData();
        return () => { cancelled = true; };
    }, [user, token]);

    useEffect(() => {
        if (!activeSessionId) { localStorage.removeItem('yaza_active_session_id'); return; }
        localStorage.setItem('yaza_active_session_id', activeSessionId);
        if (workbook) {
            const worksheet = workbook.sheets.find(sheet => sheet.id === activeSessionId);
            if (worksheet && workbook.activeSheetId !== activeSessionId) setWorkbook(setActiveWorksheet(workbook, activeSessionId));
        }
    }, [activeSessionId, workbook]);

    const clearWorkbookState = () => {
        setActiveSessionId(null);
        setSemesterCourse(null);
        setWorkbook(null);
    };

    return { workbook, setWorkbook, sessions, setSessions, activeSessionId, setActiveSessionId, semesterCourse, setSemesterCourse, sessionSaveState, setSessionSaveState, showSessionStatus, setShowSessionStatus, searchTerm, setSearchTerm, courses, filteredSessions, workbookCourses, filteredCourses, syncStudentInfoFromWorksheet, persistSession, persistWorkbook, clearWorkbookState };
}
