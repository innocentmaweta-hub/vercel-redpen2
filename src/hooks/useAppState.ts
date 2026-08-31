import { useState, useRef } from 'react';
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
    // --- Local state that doesn't belong to any domain hook ---
    const [studentInfo, setStudentInfo] = useState<StudentInfo>({
        name: '', regNo: '', program: '', year: '', semester: '', courseCode: '', examDate: ''
    });
    const [activeView, setActiveView] = useState<ActiveView>('dashboard');
    const [examinerRemarks, setExaminerRemarks] = useState('');
    const [showHelp, setShowHelp] = useState(false);
    const [showRefresh, setShowRefresh] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [clearCount, setClearCount] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [markingScheme, setMarkingScheme] = useState<{ base64: string; name: string } | null>(null);
    const [studentPaper, setStudentPaper] = useState<{ base64: string; name: string } | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showYaza, setShowYaza] = useState(false);
    const [showBatch, setShowBatch] = useState(false);

    // markingMode lives here — not inside useCanvasTools or useGrading —
    // because both hooks need it and neither can depend on the other.
    const [markingMode, setMarkingModeState] = useState<'self' | 'ai'>('ai');

    const schemeRef = useRef<UploadZoneHandle>(null);
    const paperRef = useRef<UploadZoneHandle>(null);
    const paperCanvasRef = useRef<PaperCanvasHandle>(null);

    // --- Domain hooks, in dependency order ---

    const auth = useAuth();
    const history = useHistory();
    const workbookState = useWorkbook(auth.user, auth.token, setStudentInfo, history.setHistory);
    const tools = useCanvasTools(markingMode);

    // modals must exist before grading, since grading needs
    // modals.setShowCourseSelector — this was the ordering bug from before.
    const workspaceActions = useWorkspaceActions({
        authHeaders: auth.authHeaders,
        setStudentInfo, setMarkingScheme, setStudentPaper,
        setResult: undefined as any, // patched below, see note
        setExaminerRemarks,
        setSemesterCourse: workbookState.setSemesterCourse,
        setActiveSessionId: workbookState.setActiveSessionId,
        setHasUnsavedResult: undefined as any, // patched below
        setPendingHistoryRecord: history.setPendingHistoryRecord,
        setHistorySaveState: history.setHistorySaveState,
        setActiveView,
        setMarkingModeState,
        resetTools: tools.resetTools,
        setZoom, setClearCount, setIsMaximized,
        setIsAutoMode: undefined as any, // patched below
        paperCanvasRef,
        setPendingGradeNavigation: undefined as any, // patched below
        setShowOldSessionModal: undefined as any, // patched below
    });

    const modals = useCourseSessionModals({
        schemeRef, paperRef,
        authHeaders: auth.authHeaders,
        clearYazaSessionHistory: workspaceActions.clearYazaSessionHistory,
    });

    const grading = useGrading({
        studentPaper,
        semesterCourse: workbookState.semesterCourse,
        workbook: workbookState.workbook,
        activeSessionId: workbookState.activeSessionId,
        user: auth.user,
        token: auth.token,
        setUser: auth.setUser,
        persistWorkbook: workbookState.persistWorkbook,
        studentInfo,
        setStudentInfo,
        markingScheme,
        isMaximized,
        setIsMaximized,
        setActiveView,
        setShowAuth: auth.setShowAuth,
        setShowCourseSelector: modals.setShowCourseSelector,
        setWorkbook: workbookState.setWorkbook,
        autoHideTimerRef: tools.autoHideTimerRef,
        markingMode,
        setMarkingModeState,
    });

    // workspaceActions was created before grading/modals existed, so it
    // received placeholder `undefined` for setters that live on those two
    // hooks. Patch them now via direct property assignment on the returned
    // object — safe because these are plain functions, not hook state, and
    // workspaceActions itself doesn't call them until a handler runs (i.e.
    // never during this render pass).
    workspaceActions.setResult = grading.setResult as any;
    (workspaceActions as any).setHasUnsavedResult = grading.setHasUnsavedResult;
    (workspaceActions as any).setIsAutoMode = grading.setIsAutoMode;
    (workspaceActions as any).setPendingGradeNavigation = modals.setPendingGradeNavigation;
    (workspaceActions as any).setShowOldSessionModal = modals.setShowOldSessionModal;

    const paymentCallback = usePaymentCallback();

    // --- Wrapper handlers (previously loose in App.tsx) ---

    const handlePrint = () => {
        const image = paperCanvasRef.current?.captureFullPaper();

        if (!image) {
            alert('No graded paper to print yet.');
            return;
        }

        const printWindow = window.open('', '_blank');

        if (!printWindow) {
            alert('Please allow popups to print.');
            return;
        }

        printWindow.document.write(`
            <html>
              <head>
                <title>${studentInfo.courseCode || 'Graded Paper'} - ${studentInfo.name || ''}</title>
                <style>
                  @page { margin: 0; }
                  body { margin: 0; display: flex; align-items: center; justify-content: center; }
                  img { max-width: 100%; height: auto; display: block; }
                </style>
              </head>
              <body>
                <img src="${image}" onload="window.focus(); window.print();" />
              </body>
            </html>
        `);

        printWindow.document.close();
    };

    const handleSave = (resultToSave?: any) => {
        history.handleSave({
            token: auth.token,
            workbook: workbookState.workbook,
            semesterCourse: workbookState.semesterCourse,
            studentInfo,
            result: grading.result,
            resultToSave,
            examinerRemarks,
            paperCanvasRef,
            setShowCourseSelector: modals.setShowCourseSelector,
            setWorkbook: workbookState.setWorkbook,
            persistWorkbook: workbookState.persistWorkbook,
            setHasUnsavedResult: grading.setHasUnsavedResult,
        });
    };

    const handleLoadRecord = (record: any) => {
        history.handleLoadRecord(record, grading.hasUnsavedResult, workbookState.workbook, {
            setSemesterCourse: workbookState.setSemesterCourse,
            setActiveSessionId: workbookState.setActiveSessionId,
            setStudentInfo,
            setResult: grading.setResult,
            setHasUnsavedResult: grading.setHasUnsavedResult,
            setMarkingModeState,
            setActiveView,
        });
    };

    const handleYazaEditQuestionScore = (questionNumber: number, score?: string, feedback?: string) => {
        grading.setResult(prev => {
            if (!prev) return prev;

            const questions = (prev.questions || []).map(q =>
                q.q === questionNumber
                    ? { ...q, ...(score !== undefined && { score }), ...(feedback !== undefined && { feedback }) }
                    : q
            );

            return { ...prev, questions };
        });

        grading.setHasUnsavedResult(true);
    };

    const handleSaveRemarks = () => {
        if (examinerRemarks.trim()) {
            grading.setHasUnsavedResult(true);
            alert("Remarks added. Use 'Save Results' to include them in the saved result.");
        }

        setActiveView('dashboard');
    };

    const handleUpgrade = () => setShowSettings(true);

    const handleStudentInfoChange = (nextInfo: StudentInfo) => {
        const sessionChanged =
            nextInfo.courseCode !== studentInfo.courseCode ||
            nextInfo.year !== studentInfo.year ||
            nextInfo.semester !== studentInfo.semester ||
            nextInfo.academicYear !== studentInfo.academicYear;

        if (sessionChanged && grading.hasUnsavedResult) {
            grading.setHasUnsavedResult(false);
        }

        setStudentInfo(nextInfo);
    };

    const handleSelectSessionFromTopBar = async (session: any) => {
        const savedSession = await workbookState.persistSession(session);
        const activeSession = savedSession || session;

        workbookState.setSemesterCourse(activeSession);
        workbookState.setActiveSessionId(activeSession.id || sessionIdentityKey(activeSession));

        setStudentInfo(prev => ({
            ...prev,
            courseCode: activeSession.courseCode || prev.courseCode,
            year: activeSession.year || prev.year,
            semester: activeSession.semester || prev.semester,
            program: activeSession.program || prev.program,
            academicYear: activeSession.academicYear || prev.academicYear,
        }));

        grading.setResult(null);
        setExaminerRemarks('');
        grading.setHasUnsavedResult(false);
        history.setPendingHistoryRecord(null);
        history.setHistorySaveState('idle');

        setActiveView('grade');
    };

    const handleGradeButtonClick = () => grading.handleGrade(tools.resetTools);

    const resetForCourseSwitch = () => {
        setMarkingModeState('ai');
        tools.resetTools();
        grading.setResult(null);
        setStudentPaper(null);
        setExaminerRemarks('');

        if (modals.pendingGradeNavigation) {
            modals.setPendingGradeNavigation(false);
            setActiveView('grade');
        }
    };

    const resetWorkspaceForNewCourse = () => {
        setMarkingScheme(null);
        setStudentPaper(null);
        grading.setResult(null);
        setExaminerRemarks('');
        setMarkingModeState('ai');
        tools.resetTools();
        setZoom(1);
        setClearCount(c => c + 1);
        setIsMaximized(false);
        grading.setIsAutoMode(false);
        setActiveView('grade');
    };

    const resetWorkspaceForImport = () => {
        setStudentInfo({ name: '', regNo: '', program: '', year: '', semester: '', courseCode: '', examDate: '' });
        setMarkingScheme(null);
        setStudentPaper(null);
        grading.setResult(null);
        setExaminerRemarks('');
        setMarkingModeState('ai');
        tools.resetTools();
        setZoom(1);
        setClearCount(c => c + 1);
        setIsMaximized(false);
        grading.setIsAutoMode(false);
    };

    return {
        // local state
        studentInfo, setStudentInfo,
        activeView, setActiveView,
        examinerRemarks, setExaminerRemarks,
        showHelp, setShowHelp,
        showRefresh, setShowRefresh,
        isMaximized, setIsMaximized,
        clearCount, setClearCount,
        zoom, setZoom,
        markingScheme, setMarkingScheme,
        studentPaper, setStudentPaper,
        showSettings, setShowSettings,
        showYaza, setShowYaza,
        showBatch, setShowBatch,
        markingMode, setMarkingModeState,
        schemeRef, paperRef, paperCanvasRef,

        // domain hooks
        auth, history, workbookState, tools, grading, modals, workspaceActions, paymentCallback,

        // wrapper handlers
        handlePrint, handleSave, handleLoadRecord, handleYazaEditQuestionScore,
        handleSaveRemarks, handleUpgrade, handleStudentInfoChange,
        handleSelectSessionFromTopBar, handleGradeButtonClick,
        resetForCourseSwitch, resetWorkspaceForNewCourse, resetWorkspaceForImport,
    };
}
