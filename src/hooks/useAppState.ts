import { useState, useRef, useCallback } from 'react';
import { UploadZoneHandle } from '../components/UploadZone';
import { PaperCanvasHandle } from '../components/PaperCanvas';
import { StudentInfo, ActiveView } from '../types';
import { sessionIdentityKey } from '../lib/sessionStore';
import { useCanvasTools } from './useCanvasTools';
import { usePaymentCallback } from './usePaymentCallback';
import { useAuth } from './useAuth';
import { useWorkbook } from './useWorkbook';
import { useGrading } from './useGrading';
import { useHistory } from './useHistory';
import { useCourseSessionModals } from './useCourseSessionModals';
import { useWorkspaceActions } from './useWorkspaceActions';

export function useAppState() {
    const [studentInfo, setStudentInfo] = useState<StudentInfo>({ name: '', regNo: '', program: '', year: '', semester: '', courseCode: '', examDate: '' });
    const [activeView, setActiveView] = useState<ActiveView>('dashboard');
    const [examinerRemarks, setExaminerRemarks] = useState('');
    const [showHelp, setShowHelp] = useState(false), [showRefresh, setShowRefresh] = useState(false), [isMaximized, setIsMaximized] = useState(false), [clearCount, setClearCount] = useState(0), [zoom, setZoom] = useState(1);
    const [markingScheme, setMarkingScheme] = useState<{ base64: string; name: string } | null>(null);
    const [studentPaper, setStudentPaper] = useState<{ base64: string; name: string } | null>(null);
    const [showSettings, setShowSettings] = useState(false), [showYaza, setShowYaza] = useState(false), [showBatch, setShowBatch] = useState(false);
    const [markingMode, setMarkingModeState] = useState<'self' | 'ai'>('ai');
    const schemeRef = useRef<UploadZoneHandle>(null), paperRef = useRef<UploadZoneHandle>(null), paperCanvasRef = useRef<PaperCanvasHandle>(null);
    const auth = useAuth();
    const history = useHistory();
    const workbookState = useWorkbook(auth.user, auth.token, setStudentInfo, history.setHistory);
    const tools = useCanvasTools(markingMode);
    const workspaceActions = useWorkspaceActions({ authHeaders: auth.authHeaders, setStudentInfo, setMarkingScheme, setStudentPaper, setResult: undefined as any, setExaminerRemarks, setSemesterCourse: workbookState.setSemesterCourse, setActiveSessionId: workbookState.setActiveSessionId, setHasUnsavedResult: undefined as any, setPendingHistoryRecord: history.setPendingHistoryRecord, setHistorySaveState: history.setHistorySaveState, setActiveView, setMarkingModeState, resetTools: tools.resetTools, setZoom, setClearCount, setIsMaximized, setIsAutoMode: undefined as any, paperCanvasRef, setPendingGradeNavigation: undefined as any, setShowOldSessionModal: undefined as any });
    const modals = useCourseSessionModals({ schemeRef, paperRef, authHeaders: auth.authHeaders, clearYazaSessionHistory: workspaceActions.clearYazaSessionHistory });
    const grading = useGrading({ studentPaper, semesterCourse: workbookState.semesterCourse, workbook: workbookState.workbook, activeSessionId: workbookState.activeSessionId, user: auth.user, token: auth.token, setUser: auth.setUser, persistWorkbook: workbookState.persistWorkbook, studentInfo, setStudentInfo, markingScheme, isMaximized, setIsMaximized, setActiveView, setShowAuth: auth.setShowAuth, setShowCourseSelector: modals.setShowCourseSelector, setWorkbook: workbookState.setWorkbook, autoHideTimerRef: tools.autoHideTimerRef, markingMode, setMarkingModeState });
    workspaceActions.setResult = grading.setResult as any; (workspaceActions as any).setHasUnsavedResult = grading.setHasUnsavedResult; (workspaceActions as any).setIsAutoMode = grading.setIsAutoMode; (workspaceActions as any).setPendingGradeNavigation = modals.setPendingGradeNavigation; (workspaceActions as any).setShowOldSessionModal = modals.setShowOldSessionModal;
    const paymentCallback = usePaymentCallback();

    const confirmDiscardUnsavedWork = useCallback((action = 'continue') => {
        if (!grading.hasUnsavedResult) return true;
        return window.confirm(`You have unsaved grading work.\n\nIf you ${action}, your current result and edits will be cleared unless you have already saved them.\n\nContinue?`);
    }, [grading.hasUnsavedResult]);
    const handlePrint = () => { const image = paperCanvasRef.current?.captureFullPaper(); if (!image) { alert('No graded paper to print yet.'); return; } const printWindow = window.open('', '_blank'); if (!printWindow) { alert('Please allow popups to print.'); return; } printWindow.document.write(`<html><head><title>${studentInfo.courseCode || 'Graded Paper'} - ${studentInfo.name || ''}</title><style>@page{margin:0}body{margin:0;display:flex;align-items:center;justify-content:center}img{max-width:100%;height:auto;display:block}</style></head><body><img src="${image}" onload="window.focus();window.print();" /></body></html>`); printWindow.document.close(); };
    const handleSave = (resultToSave?: any) => history.handleSave({ token: auth.token, workbook: workbookState.workbook, semesterCourse: workbookState.semesterCourse, studentInfo, result: grading.result, resultToSave, examinerRemarks, paperCanvasRef, setShowCourseSelector: modals.setShowCourseSelector, setWorkbook: workbookState.setWorkbook, persistWorkbook: workbookState.persistWorkbook, setHasUnsavedResult: grading.setHasUnsavedResult });
    const handleLoadRecord = (record: any) => { if (!confirmDiscardUnsavedWork('load another graded paper')) return; history.handleLoadRecord(record, false, workbookState.workbook, { setSemesterCourse: workbookState.setSemesterCourse, setActiveSessionId: workbookState.setActiveSessionId, setStudentInfo, setResult: grading.setResult, setHasUnsavedResult: grading.setHasUnsavedResult, setMarkingModeState, setActiveView }); };
    const handleYazaEditQuestionScore = (questionNumber: number, score?: string, feedback?: string) => { grading.setResult(prev => { if (!prev) return prev; return { ...prev, questions: (prev.questions || []).map(q => q.q === questionNumber ? { ...q, ...(score !== undefined && { score }), ...(feedback !== undefined && { feedback }) } : q) }; }); grading.setHasUnsavedResult(true); };
    const handleSaveRemarks = () => { if (examinerRemarks.trim()) { grading.setHasUnsavedResult(true); alert("Remarks added. Use 'Save Results' to include them in the saved result."); } if (confirmDiscardUnsavedWork('leave the remarks view')) setActiveView('dashboard'); };
    const handleUpgrade = () => setShowSettings(true);
    const handleStudentInfoChange = (nextInfo: StudentInfo) => { const sessionChanged = nextInfo.courseCode !== studentInfo.courseCode || nextInfo.year !== studentInfo.year || nextInfo.semester !== studentInfo.semester || nextInfo.academicYear !== studentInfo.academicYear; if (sessionChanged && grading.hasUnsavedResult) { if (!confirmDiscardUnsavedWork('change the session/course information')) return; grading.setHasUnsavedResult(false); grading.setResult(null); } setStudentInfo(nextInfo); };
    const handleSelectSessionFromTopBar = async (session: any) => { if (!confirmDiscardUnsavedWork('switch sessions')) return; const savedSession = await workbookState.persistSession(session); const activeSession = savedSession || session; workbookState.setSemesterCourse(activeSession); workbookState.setActiveSessionId(activeSession.id || sessionIdentityKey(activeSession)); setStudentInfo(prev => ({ ...prev, courseCode: activeSession.courseCode || prev.courseCode, year: activeSession.year || prev.year, semester: activeSession.semester || prev.semester, program: activeSession.program || prev.program, academicYear: activeSession.academicYear || prev.academicYear })); grading.setResult(null); setExaminerRemarks(''); grading.setHasUnsavedResult(false); history.setPendingHistoryRecord(null); history.setHistorySaveState('idle'); setActiveView('grade'); };
    const handleGradeButtonClick = () => { if (grading.hasUnsavedResult && !confirmDiscardUnsavedWork('grade this paper again')) return; grading.handleGrade(tools.resetTools); };
    const handlePaperUpload = (base64: string, name: string) => { if (studentPaper && !confirmDiscardUnsavedWork('replace the current student paper')) return; workspaceActions.handlePaperUpload(base64, name); };
    const handleClearStudentPaper = () => { if (!studentPaper) return; if (grading.hasUnsavedResult && !confirmDiscardUnsavedWork('clear the current student paper')) return; workspaceActions.handleClearStudentPaper(); };
    const handleNewPaper = () => { if (!confirmDiscardUnsavedWork('start a new paper')) return; workspaceActions.handleNewPaper(workbookState.semesterCourse, workbookState.activeSessionId, grading.result, studentPaper); };
    const handleNew = () => { if (!confirmDiscardUnsavedWork('start a new workspace')) return; workspaceActions.handleNew(false, null, markingScheme, studentPaper); };
    const handleLogout = () => { if (!confirmDiscardUnsavedWork('log out')) return; auth.handleLogout(); };
    const handleDeleteAccount = async (password: string) => { if (!confirmDiscardUnsavedWork('delete your account')) return { success: false, message: 'Account deletion cancelled.' }; return auth.handleDeleteAccount(password); };
    const handleClearResult = () => { if (!grading.result) return; if (!confirmDiscardUnsavedWork('clear the current result')) return; grading.setResult(null); grading.setHasUnsavedResult(false); };
    const handleNewCourse = () => { if (!confirmDiscardUnsavedWork('start a new course')) return; modals.setShowNewCourseModal(true); };
    const handleNewSession = () => { if (!confirmDiscardUnsavedWork('start a new session')) return; modals.setShowNewSessionModal(true); };
    const handleLoadSessions = () => { modals.setShowOldSessionModal(true); };
    const handleViewChange = (view: ActiveView) => setActiveView(view);
    const resetForCourseSwitch = () => { setMarkingModeState('ai'); tools.resetTools(); grading.setResult(null); setStudentPaper(null); setExaminerRemarks(''); if (modals.pendingGradeNavigation) { modals.setPendingGradeNavigation(false); setActiveView('grade'); } };
    const resetWorkspaceForNewCourse = () => { setMarkingScheme(null); setStudentPaper(null); grading.setResult(null); setExaminerRemarks(''); setMarkingModeState('ai'); tools.resetTools(); setZoom(1); setClearCount(c => c + 1); setIsMaximized(false); grading.setIsAutoMode(false); setActiveView('grade'); };
    const resetWorkspaceForImport = () => { setStudentInfo({ name: '', regNo: '', program: '', year: '', semester: '', courseCode: '', examDate: '' }); setMarkingScheme(null); setStudentPaper(null); grading.setResult(null); setExaminerRemarks(''); setMarkingModeState('ai'); tools.resetTools(); setZoom(1); setClearCount(c => c + 1); setIsMaximized(false); grading.setIsAutoMode(false); };

    return { studentInfo, setStudentInfo, activeView, setActiveView, examinerRemarks, setExaminerRemarks, showHelp, setShowHelp, showRefresh, setShowRefresh, isMaximized, setIsMaximized, clearCount, setClearCount, zoom, setZoom, markingScheme, setMarkingScheme, studentPaper, setStudentPaper, showSettings, setShowSettings, showYaza, setShowYaza, showBatch, setShowBatch, markingMode, setMarkingModeState, schemeRef, paperRef, paperCanvasRef, auth, history, workbookState, tools, grading, modals, workspaceActions, paymentCallback, handlePrint, handleSave, handleLoadRecord, handleYazaEditQuestionScore, handleSaveRemarks, handleUpgrade, handleStudentInfoChange, handleSelectSessionFromTopBar, handleGradeButtonClick, handlePaperUpload, handleClearStudentPaper, handleNewPaper, handleNew, handleLogout, handleDeleteAccount, handleClearResult, handleNewCourse, handleNewSession, handleLoadSessions, handleViewChange, resetForCourseSwitch, resetWorkspaceForNewCourse, resetWorkspaceForImport, confirmDiscardUnsavedWork };
}
