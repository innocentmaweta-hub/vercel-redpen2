import { useState } from 'react';
import { SemesterCourse } from '../components/CourseSessionModal';
import { sessionIdentityKey, normalizeSession, dedupeSessions } from '../lib/sessionStore';
import { createWorkbook, worksheetFromCourse, writeLocalWorkbook, setActiveWorksheet, saveCloudWorkbook } from '../lib/workbookStore';
import { loadWorkbookFromExcelFile } from '../lib/exportUtils';

export function useCourseSessionModals({ schemeRef, paperRef, authHeaders, clearYazaSessionHistory }: any) {
    const [modalType, setModalType] = useState<'new' | 'continue' | null>(null);
    const [pendingUpload, setPendingUpload] = useState<'scheme' | 'paper' | null>(null);
    const [showOldSessionModal, setShowOldSessionModal] = useState(false);
    const [pendingGradeNavigation, setPendingGradeNavigation] = useState(false);
    const [showNewCourseModal, setShowNewCourseModal] = useState(false);
    const [showNewSessionModal, setShowNewSessionModal] = useState(false);
    const [showCourseSelector, setShowCourseSelector] = useState(false);

    const openUploadModal = (type: 'scheme' | 'paper', semesterCourse: SemesterCourse | null) => {
        if (semesterCourse) {
            if (type === 'scheme') schemeRef.current?.triggerInput();
            else paperRef.current?.triggerInput();
            return;
        }
        setPendingUpload(type); setModalType('new');
    };

    const triggerPendingUpload = () => {
        if (pendingUpload === 'scheme') schemeRef.current?.triggerInput();
        else if (pendingUpload === 'paper') paperRef.current?.triggerInput();
        setPendingUpload(null); setModalType(null);
    };

    const closeModal = () => { setPendingUpload(null); setModalType(null); };

    const handleSkipSemester = (resetForNewUpload: () => void) => {
        const upload = pendingUpload;
        setPendingUpload(null); setModalType(null);
        resetForNewUpload();
        if (upload === 'scheme') schemeRef.current?.triggerInput();
        else if (upload === 'paper') paperRef.current?.triggerInput();
    };

    const handleContinueSemester = () => triggerPendingUpload();
    const handleStartNewFromContinue = () => setModalType('new');

    const handleNewSemesterConfirm = (
        semester: SemesterCourse,
        deps: {
            hasUnsavedResult?: boolean;
            confirmDiscardUnsavedWork?: (action?: string) => boolean;
            setSemesterCourse: (s: SemesterCourse) => void;
            setSessions: (fn: (prev: SemesterCourse[]) => SemesterCourse[]) => void;
            persistSession: (s: SemesterCourse) => Promise<SemesterCourse | null>;
            setStudentInfo: (fn: (prev: any) => any) => void;
            resetForNewSession: () => void;
        }
    ) => {
        if (deps.confirmDiscardUnsavedWork && !deps.confirmDiscardUnsavedWork('start a new session')) return;
        deps.setSemesterCourse(semester);
        clearYazaSessionHistory(semester.courseCode || 'general');
        deps.setSessions(prev => {
            const key = sessionIdentityKey(semester);
            return dedupeSessions([semester, ...prev.filter(s => sessionIdentityKey(s) !== key)]);
        });
        void deps.persistSession(semester);
        deps.setStudentInfo((prev: any) => ({ ...prev, courseCode: semester.courseCode || prev.courseCode, program: semester.program || prev.program, year: semester.year || prev.year, semester: semester.semester || prev.semester }));
        deps.resetForNewSession();
        triggerPendingUpload();
    };

    const handleNewCourse = (
        updates: { courseCode: string; courseName: string },
        deps: {
            workbook: any; token: string | null; setWorkbook: (w: any) => void; setSemesterCourse: (s: SemesterCourse) => void;
            setActiveSessionId: (id: string) => void; setStudentInfo: (info: any) => void; resetWorkspaceForNewCourse: () => void;
            persistWorkbook: (w: any) => void; confirmDiscardUnsavedWork?: (action?: string) => boolean; hasUnsavedResult?: boolean;
        }
    ) => {
        if (deps.confirmDiscardUnsavedWork && !deps.confirmDiscardUnsavedWork('start a new course')) return;
        const courseCode = updates.courseCode.trim().toUpperCase();
        const courseName = updates.courseName.trim();
        if (!courseCode) return;
        if (!deps.workbook) { alert('Please create or open a workbook before adding a course.'); return; }
        const newCourse: SemesterCourse = { courseCode, courseName, program: '', year: '', semester: '', academicYear: '', sessionLabel: '' };
        const worksheet = worksheetFromCourse(newCourse);
        const updatedWorkbook = { ...deps.workbook, sheets: [...deps.workbook.sheets, worksheet], activeSheetId: worksheet.id, updatedAt: new Date().toISOString() };
        const savedWorkbook = writeLocalWorkbook(updatedWorkbook);
        deps.setWorkbook(savedWorkbook); deps.setSemesterCourse(newCourse); deps.setActiveSessionId(worksheet.id);
        localStorage.setItem('yaza_active_session_id', worksheet.id);
        clearYazaSessionHistory(courseCode);
        deps.setStudentInfo((prev: any) => ({ ...prev, name: '', regNo: '', program: '', year: '', semester: '', courseCode, examDate: '' }));
        deps.resetWorkspaceForNewCourse(); setShowNewCourseModal(false);
        if (deps.token) void deps.persistWorkbook(savedWorkbook);
    };

    const handleNewSession = (
        updates: { academicYear: string; year: string; semester: string; sessionLabel: string; customName: string; courseCode: string; courseName: string },
        deps: {
            hasUnsavedResult: boolean; token: string | null; setWorkbook: (w: any) => void; setSemesterCourse: (s: SemesterCourse) => void;
            setSessions: (s: SemesterCourse[]) => void; setActiveSessionId: (id: string) => void; setStudentInfo: (info: any) => void;
            setHasUnsavedResult: (v: boolean) => void; resetWorkspaceForNewCourse: () => void; confirmDiscardUnsavedWork?: (action?: string) => boolean;
        }
    ) => {
        if (deps.confirmDiscardUnsavedWork && !deps.confirmDiscardUnsavedWork('start a new session')) return;
        const newSession: SemesterCourse = { courseCode: updates.courseCode.trim().toUpperCase(), courseName: updates.courseName.trim(), program: '', year: updates.year, semester: updates.semester, academicYear: updates.academicYear, sessionLabel: updates.sessionLabel, customName: updates.customName.trim() || undefined };
        const worksheet = worksheetFromCourse(newSession);
        const newWorkbook = createWorkbook(newSession.customName || newSession.sessionLabel || newSession.courseCode || 'RedPen Workbook', [worksheet]);
        const savedWorkbook = writeLocalWorkbook(newWorkbook);
        deps.setWorkbook(savedWorkbook); deps.setSemesterCourse(newSession); deps.setSessions(savedWorkbook.sheets.map((sheet: any) => normalizeSession(sheet.course))); deps.setActiveSessionId(worksheet.id);
        localStorage.setItem('yaza_active_session_id', worksheet.id);
        clearYazaSessionHistory(newSession.courseCode || 'general');
        deps.setStudentInfo((prev: any) => ({ ...prev, name: '', regNo: '', program: '', year: newSession.year, semester: newSession.semester, courseCode: newSession.courseCode, examDate: '' }));
        deps.resetWorkspaceForNewCourse(); deps.setHasUnsavedResult(false); setShowNewSessionModal(false);
        if (deps.token) void saveCloudWorkbook(deps.token, savedWorkbook).catch(error => console.error('Failed to save new workbook to cloud:', error));
    };

    const loadOldSemester = (session: SemesterCourse, deps: {
        hasUnsavedResult: boolean; workbook: any; token: string | null; setHasUnsavedResult: (v: boolean) => void; setWorkbook: (w: any) => void;
        setStudentInfo: (fn: (prev: any) => any) => void; setSemesterCourse: (s: SemesterCourse) => void; setActiveSessionId: (id: string) => void;
        resetForCourseSwitch: () => void; persistWorkbook: (w: any) => void;
    }) => {
        if (deps.hasUnsavedResult && !window.confirm('You have unsaved grading work.\n\nSwitching courses will clear it unless it has been saved.\n\nContinue switching courses?')) return;
        if (!deps.workbook) return;
        const worksheet = deps.workbook.sheets.find((sheet: any) => sessionIdentityKey(sheet.course) === sessionIdentityKey(session));
        if (!worksheet) return;
        const updatedWorkbook = setActiveWorksheet(deps.workbook, worksheet.id);
        const savedWorkbook = writeLocalWorkbook(updatedWorkbook);
        deps.setWorkbook(savedWorkbook);
        deps.setStudentInfo((prev: any) => ({ ...prev, courseCode: worksheet.course?.courseCode || '', program: worksheet.course?.program || prev.program, year: worksheet.course?.year || '', semester: worksheet.course?.semester || '', academicYear: worksheet.course?.academicYear || '' }));
        deps.setSemesterCourse(normalizeSession(worksheet.course)); deps.setActiveSessionId(worksheet.id);
        localStorage.setItem('yaza_active_session_id', worksheet.id);
        deps.resetForCourseSwitch(); setShowOldSessionModal(false);
        if (pendingGradeNavigation) { setPendingGradeNavigation(false); }
        if (deps.token) void deps.persistWorkbook(savedWorkbook);
    };

    const handleViewChange = (view: string, semesterCourse: SemesterCourse | null, activeSessionId: string | null, setActiveView: (v: any) => void) => {
        if (view !== 'grade') { setActiveView(view); return; }
        if (semesterCourse && activeSessionId) { setActiveView('grade'); return; }
        setPendingGradeNavigation(true); setShowOldSessionModal(true);
    };

    const handleLoadFromFile = (deps: {
        token: string | null; persistWorkbook: (w: any) => Promise<any>; setWorkbook: (w: any) => void; setSessions: (s: any[]) => void;
        setSemesterCourse: (s: any) => void; setActiveSessionId: (id: any) => void; setSessionSaveState: (s: any) => void;
        resetWorkspaceForImport: () => void; confirmDiscardUnsavedWork?: (action?: string) => boolean;
    }) => {
        if (deps.confirmDiscardUnsavedWork && !deps.confirmDiscardUnsavedWork('import another workbook')) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
        input.onchange = async (e) => {
            const target = e.target as HTMLInputElement;
            if (!target.files?.[0]) return;
            const file = target.files[0];
            try {
                if (!/\.(xlsx|xls)$/i.test(file.name)) { alert('Please select a valid Excel (.xlsx or .xls) workbook.'); return; }
                const importedWorkbook = await loadWorkbookFromExcelFile(file);
                if (!importedWorkbook?.sheets?.length) { alert('No courses were found in this Excel workbook.'); return; }
                const savedWorkbook = writeLocalWorkbook({ ...importedWorkbook, activeSheetId: null });
                deps.setWorkbook(savedWorkbook); deps.setSessions(savedWorkbook.sheets.map((sheet: any) => normalizeSession(sheet.course))); deps.setSemesterCourse(null); deps.setActiveSessionId(null);
                localStorage.removeItem('yaza_active_session_id'); deps.resetWorkspaceForImport(); setShowOldSessionModal(false);
                if (deps.token) await deps.persistWorkbook(savedWorkbook);
                setShowCourseSelector(true);
            } catch (error) {
                console.error('Excel workbook import failed:', error); deps.setSessionSaveState('error'); alert('We could not import this Excel workbook. Please make sure it is a valid RedPen workbook.');
            } finally { target.value = ''; }
        };
        input.click();
    };

    return { modalType, setModalType, pendingUpload, setPendingUpload, showOldSessionModal, setShowOldSessionModal, pendingGradeNavigation, setPendingGradeNavigation, showNewCourseModal, setShowNewCourseModal, showNewSessionModal, setShowNewSessionModal, showCourseSelector, setShowCourseSelector, openUploadModal, triggerPendingUpload, closeModal, handleSkipSemester, handleContinueSemester, handleStartNewFromContinue, handleNewSemesterConfirm, handleNewCourse, handleNewSession, loadOldSemester, handleViewChange, handleLoadFromFile };
}
