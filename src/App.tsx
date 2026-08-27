/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { StudentForm } from './components/StudentForm';
import { UploadZone, UploadZoneHandle } from './components/UploadZone';
import { PaperCanvas, PaperCanvasHandle } from './components/PaperCanvas';
import { ResultsPanel } from './components/ResultsPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { RemarkPanel } from './components/RemarkPanel';
import { HelpModal } from './components/HelpModal';
import { RefreshModal } from './components/RefreshModal';
import { AuthModal } from './components/AuthModal';
import { ProfileModal } from './components/ProfileModal';
import { SettingsModal, PENDING_TX_KEY } from './components/SettingsModal';
import { BatchModal } from './components/BatchModal';
import { PostsPage } from './components/PostsPage';
import { CloudSaveStatus } from './components/CloudSaveStatus';

import {
    sessionIdentityKey,
    normalizeSession,
    dedupeSessions,
    fetchCloudSessions,
    saveCloudSession,
    deleteCloudSession,
} from './lib/sessionStore';

import {
    fetchCloudHistory,
    saveCloudHistory,
    deleteCloudHistory,
    writeLocalHistory,
} from './lib/historyStore';

import {
    NewSemesterModal,
    ContinueSemesterModal,
    NewCourseModal,
    NewSessionModal,
    SemesterCourse
} from './components/CourseSessionModal';

import { ToolOptionsBar } from './components/ToolOptionsBar';

import {
    StudentInfo,
    GradingResult,
    ApiGradingResult,
    HistoryRecord,
    ActiveView,
    User,
    AuthResponse,
    parseScore
} from './types';

import {
    Play,
    AlertTriangle,
    Hand,
    Pen as PenIcon,
    Type,
    Square,
    Eraser,
    Upload,
    FileCheck,
    Trash2,
    FileX,
    Maximize2,
    Minimize2,
    ZoomIn,
    ZoomOut,
    Undo2,
    Redo2,
    RotateCcw,
    RotateCw,
    ChevronLeft,
    ChevronRight,
    Check,
    X,
    Plus,
    Search
} from 'lucide-react';

import { motion, AnimatePresence } from 'motion/react';
import { YazaPanel } from './components/YazaPanel';
import { getSavedFolder } from './lib/fileStorage';

import {
    buildPaperPdfBlob,
    buildPaperPdfFilename,
    appendResultToSessionExcel,
    loadSessionFromExcelFile,
} from './lib/exportUtils';

import { writeFileToFolder } from './lib/fileStorage';

import type {
    RedPenWorkbook,
    RedPenWorksheet
} from './types/workbook';

import {
    createWorkbook,
    loadLocalWorkbook,
    worksheetFromCourse,
    writeLocalWorkbook,
    setActiveWorksheet,
    updateWorksheet,
    fetchCloudWorkbooks,
    saveCloudWorkbook,
} from './lib/workbookStore';

const AUTH_TOKEN_KEY = 'yaza_auth_token';

export default function App() {
    const [studentInfo, setStudentInfo] = useState<StudentInfo>({
        name: '',
        regNo: '',
        program: '',
        year: '',
        semester: '',
        courseCode: '',
        examDate: ''
    });
    const syncStudentInfoFromWorksheet = (
        worksheet: RedPenWorksheet | null
    ) => {
        if (!worksheet) return;
    
        setStudentInfo(prev => ({
            ...prev,
    
            // Course/session metadata
            courseCode: worksheet.course?.courseCode || '',
            year: worksheet.course?.year || '',
            semester: worksheet.course?.semester || '',
            academicYear: worksheet.course?.academicYear || '',
    
            // Program of Study is NOT the course name.
            // Keep the user's actual program value.
            program: worksheet.course?.program || prev.program,
        }));
    };

    const [markingScheme, setMarkingScheme] = useState<{
        base64: string;
        name: string;
    } | null>(null);

    const [studentPaper, setStudentPaper] = useState<{
        base64: string;
        name: string;
    } | null>(null);

    const [result, setResult] = useState<GradingResult | null>(null);
    const [loading, setLoading] = useState(false);

    const [activeView, setActiveView] =
        useState<ActiveView>('dashboard');

    const [history, setHistory] = useState<HistoryRecord[]>([]);

    /*
     * ================================================================
     * WORKBOOK
     * ================================================================
     *
     * RedPen now treats one workbook as the container for all courses.
     *
     * Workbook
     *   ├── Worksheet / Course
     *   ├── Worksheet / Course
     *   └── Worksheet / Course
     *
     * The workbook is the canonical source of truth.
     */
    const [workbook, setWorkbook] =
        useState<RedPenWorkbook | null>(null);

    /*
     * Compatibility state.
     *
     * Existing grading components still expect SemesterCourse[].
     * During the migration this is derived from the workbook worksheets.
     */
    const [sessions, setSessions] =
        useState<SemesterCourse[]>([]);

    const courses = workbook
        ? workbook.sheets
            .map(sheet => sheet.course)
            .filter(course => course.courseCode?.trim())
            .map(course => ({
                courseCode: course.courseCode.trim(),
                courseName: course.courseName || '',
            }))
        : Array.from(
            new Map(
                sessions
                    .filter(session => session.courseCode?.trim())
                    .map(session => [
                        session.courseCode.trim(),
                        {
                            courseCode: session.courseCode.trim(),
                            courseName: session.courseName || '',
                        }
                    ])
            ).values()
        );

    /*
     * The active session id is temporarily retained as a compatibility
     * name. Conceptually it is now the active worksheet/course id.
     */
    const [activeSessionId, setActiveSessionId] =
        useState<string | null>(null);

    const [sessionSaveState, setSessionSaveState] =
        useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    const [historySaveState, setHistorySaveState] =
        useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [showSessionStatus, setShowSessionStatus] =
        useState(false);

    const [pendingHistoryRecord, setPendingHistoryRecord] =
        useState<HistoryRecord | null>(null);

    const [hasUnsavedResult, setHasUnsavedResult] =
        useState(false);

    const [examinerRemarks, setExaminerRemarks] = useState('');
    const [showHelp, setShowHelp] = useState(false);
    const [showRefresh, setShowRefresh] = useState(false);

    const [activeTool, setActiveTool] =
        useState<string | null>(null);

    /*
     * Marking mode
     *
     * There is NO "unmarked" mode anymore.
     *
     * ai   = AI grading
     * self = manual/examiner grading
     *
     * AI is the default mode whenever a new paper/session is started.
     */
    const [markingMode, setMarkingModeState] =
        useState<'self' | 'ai'>('ai');

    /*
     * Change the marking method.
     */
    const handleMarkingModeChange = (mode: 'ai' | 'self') => {
        // Auto Mode always forces AI.
        if (isAutoMode) {
            setMarkingModeState('ai');
            return;
        }

        setMarkingModeState(mode);

        if (mode === 'ai') {
            setResult(null);

            setActiveTool(null);
            setShowToolOptions(false);

            if (autoHideTimerRef.current) {
                clearTimeout(autoHideTimerRef.current);
                autoHideTimerRef.current = null;
            }

            return;
        }

        // Manual/self marking mode.
        setActiveTool(null);
        setShowToolOptions(false);

        if (autoHideTimerRef.current) {
            clearTimeout(autoHideTimerRef.current);
            autoHideTimerRef.current = null;
        }

        if (studentPaper) {
            setResult({
                score: '',
                totalScore: '',
                percentage: '',
                grade: '',
                feedback: '',
                questions: [],
                extracted_info: {
                    name: studentInfo.name || '',
                    regNo: studentInfo.regNo || '',
                    program: studentInfo.program || '',
                    year: studentInfo.year || '',
                    courseCode: studentInfo.courseCode || '',
                    examDate: studentInfo.examDate || ''
                }
            });
        }

        setHasUnsavedResult(true);
    };

    const [isMaximized, setIsMaximized] = useState(false);
    const [clearCount, setClearCount] = useState(0);
    const [zoom, setZoom] = useState(1);

    // Tool options
    const [penColor, setPenColor] = useState('#FF0000');
    const [penSize, setPenSize] = useState(3);
    const [shapeColor, setShapeColor] = useState('#FF0000');
    const [shapeSize, setShapeSize] = useState(2);

    const [shapeType, setShapeType] =
        useState<'rectangle' | 'ellipse' | 'line' | 'triangle'>(
            'rectangle'
        );

    const [textColor, setTextColor] = useState('#FF0000');
    const [textSize, setTextSize] = useState(16);
    const [textFont, setTextFont] = useState('Arial');

    const [markingModeSetting, setMarkingModeSetting] =
        useState<'none' | 'right' | 'wrong'>('none');

    const [markSize, setMarkSize] = useState(28);
    const [markThickness, setMarkThickness] = useState(2);

    // Tool options panel visibility
    const [showToolOptions, setShowToolOptions] = useState(false);

    // Auto-hide timer for tool options bar
    const autoHideTimerRef =
        useRef<NodeJS.Timeout | null>(null);

    /*
     * Active worksheet/course.
     *
     * This is still named semesterCourse because the existing grading
     * interface expects SemesterCourse.
     */
    const [semesterCourse, setSemesterCourse] =
        useState<SemesterCourse | null>(null);

    const [pendingUpload, setPendingUpload] =
        useState<'scheme' | 'paper' | null>(null);

    const [modalType, setModalType] =
        useState<'new' | 'continue' | null>(null);

    const [showOldSessionModal, setShowOldSessionModal] =
        useState(false);
    const [pendingGradeNavigation, setPendingGradeNavigation] =
        useRef(false);

    const [showNewCourseModal, setShowNewCourseModal] =
        useState(false);

    const [showNewSessionModal, setShowNewSessionModal] =
        useState(false);

    // Search functionality
    const [searchTerm, setSearchTerm] = useState('');
    
    /*
     * Filter the compatibility session list used by the
     * legacy course/session selector.
     *
     * The workbook is now the canonical source of truth,
     * but some existing UI still expects SemesterCourse[].
     */
    const filteredSessions = sessions.filter(session => {
        const term = searchTerm.trim().toLowerCase();
    
        if (!term) {
            return true;
        }
    
        return (
            session.courseCode
                ?.toLowerCase()
                .includes(term) ||
            session.courseName
                ?.toLowerCase()
                .includes(term) ||
            session.customName
                ?.toLowerCase()
                .includes(term) ||
            session.sessionLabel
                ?.toLowerCase()
                .includes(term)
        );
    });

    // Auth state
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);

    // Only shown when a gated action is attempted.
    const [showAuth, setShowAuth] = useState(false);

    const [showProfile, setShowProfile] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showYaza, setShowYaza] = useState(false);
    const [showBatch, setShowBatch] = useState(false);

    const [
        paymentStatusMessage,
        setPaymentStatusMessage
    ] = useState<string | null>(null);

    // Auto mode
    const [isAutoMode, setIsAutoMode] = useState(false);

    const [isGradingInProgress, setIsGradingInProgress] =
        useState(false);

    const [upgradePromptMessage, setUpgradePromptMessage] =
        useState<string | null>(null);

    const authHeaders = useCallback(
        (): Record<string, string> => {
            const t =
                localStorage.getItem(
                    AUTH_TOKEN_KEY
                );

            return t
                ? {
                    'Authorization': `Bearer ${t}`,
                    'Content-Type': 'application/json',
                }
                : {
                    'Content-Type': 'application/json',
                };
        },
        []
    );

    const handleSaveApiKeys = useCallback(
        async (
            keys: {
                openai?: string;
                gemini?: string;
                anthropic?: string;
            }
        ) => {
            if (!token) {
                alert(
                    'Please sign in before saving API keys.'
                );
                return;
            }

            try {
                const response =
                    await fetch(
                        '/api/user/api-keys',
                        {
                            method: 'PUT',
                            headers: {
                                ...authHeaders(),
                                'Content-Type':
                                    'application/json',
                            },
                            body: JSON.stringify(
                                keys
                            ),
                        }
                    );

                if (!response.ok) {
                    const data =
                        await response
                            .json()
                            .catch(
                                () => null
                            );

                    throw new Error(
                        data?.error ||
                        'Failed to save API keys.'
                    );
                }

                alert(
                    'API keys saved successfully.'
                );
            }
            catch (error) {
                console.error(
                    'Failed to save API keys:',
                    error
                );

                alert(
                    error instanceof Error
                        ? error.message
                        : 'Failed to save API keys.'
                );
            }
        },
        [
            token,
            authHeaders,
        ]
    );

    /**
     * Persist the active worksheet inside the current workbook.
     *
     * Workbook is the canonical source of truth:
     *
     * Workbook
     *   ├── Worksheet / CS301
     *   ├── Worksheet / CS201
     *   └── Worksheet / ENG101
     *
     * Local persistence happens first so the user's work is never
     * dependent on the cloud being available.
     */
    const persistSession = useCallback(async (
        session: SemesterCourse
    ): Promise<SemesterCourse | null> => {
        const normalized = normalizeSession(session);

        const worksheetId =
            normalized.id ||
            sessionIdentityKey(normalized);

        const now =
            new Date().toISOString();

        /*
         * Use the current workbook if one exists.
         *
         * If this is the first course ever created, create the workbook
         * around that course.
         */
        const currentWorkbook =
            workbook ||
            createWorkbook(
                normalized.customName ||
                normalized.courseCode ||
                'RedPen Workbook'
            );

        const existingWorksheet =
            currentWorkbook.sheets.find(
                sheet =>
                    sheet.id === worksheetId ||
                    sessionIdentityKey(sheet.course) ===
                    sessionIdentityKey(normalized)
            );

        const worksheet = existingWorksheet
            ? {
                ...existingWorksheet,

                id:
                    existingWorksheet.id ||
                    worksheetId,

                name:
                    normalized.courseCode ||
                    normalized.customName ||
                    existingWorksheet.name ||
                    'Course',

                course: {
                    ...existingWorksheet.course,
                    ...normalized,
                    id:
                        existingWorksheet.id ||
                        worksheetId,
                },

                updatedAt: now,
            }
            : {
                id: worksheetId,

                name:
                    normalized.courseCode ||
                    normalized.customName ||
                    'Course',

                course: {
                    ...normalized,
                    id: worksheetId,
                },

                rows: [],

                createdAt:
                    normalized.createdAt ||
                    now,

                updatedAt: now,
            };

        /*
         * Replace the existing worksheet rather than creating duplicates.
         */
        const nextSheets =
            existingWorksheet
                ? currentWorkbook.sheets.map(sheet =>
                    sheet.id === existingWorksheet.id
                        ? worksheet
                        : sheet
                )
                : [
                    ...currentWorkbook.sheets,
                    worksheet,
                ];

        const nextWorkbook: RedPenWorkbook = {
            ...currentWorkbook,

            updatedAt: now,

            activeSheetId:
                worksheet.id,

            sheets: nextSheets,
        };

        /*
         * LOCAL FIRST
         *
         * This is important for offline safety and for users who are
         * temporarily unable to reach the cloud.
         */
        const savedLocalWorkbook =
            writeLocalWorkbook(
                nextWorkbook
            );

        setWorkbook(
            savedLocalWorkbook
        );

        const nextSessions =
            savedLocalWorkbook.sheets.map(
                sheet =>
                    normalizeSession(
                        sheet.course
                    )
            );

        setSessions(
            nextSessions
        );

        const activeWorksheet =
            savedLocalWorkbook.sheets.find(
                sheet =>
                    sheet.id ===
                    savedLocalWorkbook.activeSheetId
            );

        const activeSession =
            activeWorksheet
                ? normalizeSession(
                    activeWorksheet.course
                )
                : normalized;

        setSemesterCourse(
            activeSession
        );

        setActiveSessionId(
            activeWorksheet?.id ||
            worksheet.id
        );

        syncStudentInfoFromWorksheet(
            activeWorksheet || worksheet
        );

        localStorage.setItem(
            'yaza_active_session_id',
            activeWorksheet?.id ||
            worksheet.id
        );

        /*
         * No authenticated user means local persistence is the complete
         * save operation.
         */
        if (!token) {
            setSessionSaveState(
                'saved'
            );

            return activeSession;
        }

        /*
         * CLOUD SAVE
         *
         * The complete workbook is saved, not an individual legacy
         * session. This preserves all worksheets/courses.
         */
        setSessionSaveState(
            'saving'
        );

        try {
            const cloudResponse =
                await saveCloudWorkbook(
                    token,
                    savedLocalWorkbook
                );

            const cloudWorkbook =
                cloudResponse.workbook;

            /*
             * Cloud is now authoritative because the save succeeded.
             */
            const normalizedCloudWorkbook =
                writeLocalWorkbook(
                    cloudWorkbook
                );

            setWorkbook(
                normalizedCloudWorkbook
            );

            setSessions(
                normalizedCloudWorkbook.sheets.map(
                    sheet =>
                        normalizeSession(
                            sheet.course
                        )
                )
            );

            const cloudActiveWorksheet =
                normalizedCloudWorkbook.sheets.find(
                    sheet =>
                        sheet.id ===
                        normalizedCloudWorkbook.activeSheetId
                );

            if (cloudActiveWorksheet) {
                const cloudSession =
                    normalizeSession(
                        cloudActiveWorksheet.course
                    );

                setSemesterCourse(
                    cloudSession
                );

                setActiveSessionId(
                    cloudActiveWorksheet.id
                );

                syncStudentInfoFromWorksheet(
                    cloudActiveWorksheet
                );

                localStorage.setItem(
                    'yaza_active_session_id',
                    cloudActiveWorksheet.id
                );

                setSessionSaveState(
                    'saved'
                );

                return cloudSession;
            }

            setSessionSaveState(
                'saved'
            );

            return activeSession;
        }
        catch (error) {
            console.error(
                'Failed to save workbook to cloud:',
                error
            );

            /*
             * IMPORTANT:
             *
             * Do NOT roll back the local workbook.
             * The user's latest work is already safely stored locally.
             */
            setSessionSaveState(
                'error'
            );

            return activeSession;
        }
    }, [
        workbook,
        token,
    ]);

    /*
     * Persist the complete workbook.
     *
     * Workbook-level operations use this function.
     * Local storage is updated first, then the workbook is synced
     * to the cloud when the user is authenticated.
     */
    const persistWorkbook = useCallback(
        async (
            nextWorkbook: RedPenWorkbook
        ): Promise<RedPenWorkbook> => {
            const savedLocalWorkbook =
                writeLocalWorkbook(
                    nextWorkbook
                );
    
            setWorkbook(
                savedLocalWorkbook
            );
    
            setSessions(
                savedLocalWorkbook.sheets.map(
                    sheet =>
                        normalizeSession(
                            sheet.course
                        )
                )
            );
    
            if (!token) {
                setSessionSaveState('saved');
    
                return savedLocalWorkbook;
            }
    
            setShowSessionStatus(true);
            setSessionSaveState('saving');
    
            try {
                const cloudWorkbook =
                    await saveCloudWorkbook(
                        token,
                        savedLocalWorkbook
                    );
    
                const savedCloudWorkbook =
                    writeLocalWorkbook(
                        cloudWorkbook
                    );
    
                setWorkbook(
                    savedCloudWorkbook
                );
    
                setSessions(
                    savedCloudWorkbook.sheets.map(
                        sheet =>
                            normalizeSession(
                                sheet.course
                            )
                    )
                );
    
                setSessionSaveState('saved');
    
                return savedCloudWorkbook;
            }
            catch (error) {
                console.error(
                    'Failed to persist workbook:',
                    error
                );
    
                /*
                 * The local workbook has already been saved.
                 * Keep it available even when cloud sync fails.
                 */
                setSessionSaveState('error');
    
                return savedLocalWorkbook;
            }
        },
        [
            token,
        ]
    );
    
    /**
     * Retry saving a grading-history record that previously failed.
     */
    const retryHistorySave = useCallback(async () => {
        if (!pendingHistoryRecord || !token) {
            return;
        }

        setHistorySaveState('saving');

        try {
            const cloudHistory =
                await saveCloudHistory(
                    token,
                    pendingHistoryRecord
                );

            setHistory(cloudHistory);
            writeLocalHistory(cloudHistory);

            setPendingHistoryRecord(null);
            setHistorySaveState('saved');
            setHasUnsavedResult(false);
        }
        catch (error) {
            console.error(
                'History retry failed:',
                error
            );

            setHistorySaveState('error');
        }
    }, [
        pendingHistoryRecord,
        token,
    ]);

    /**
     * Automatically persist course/workbook metadata changes.
     *
     * studentInfo contains editable course/session information in the
     * grading UI, while semesterCourse represents the selected worksheet.
     */
    useEffect(() => {
        if (!semesterCourse) {
            return;
        }

        const nextSession = normalizeSession({
            ...semesterCourse,

            courseCode:
                studentInfo.courseCode ||
                semesterCourse.courseCode,

            program:
                studentInfo.program ||
                semesterCourse.program,

            year:
                studentInfo.year ||
                semesterCourse.year,

            semester:
                studentInfo.semester ||
                semesterCourse.semester,
        });

        const currentSession =
            normalizeSession(semesterCourse);

        const changed =
            JSON.stringify(nextSession) !==
            JSON.stringify(currentSession);

        if (!changed) {
            return;
        }

        const timer = window.setTimeout(() => {
            persistSession(nextSession);
        }, 500);

        return () => {
            window.clearTimeout(timer);
        };
    }, [
        studentInfo.courseCode,
        studentInfo.program,
        studentInfo.year,
        studentInfo.semester,
        semesterCourse,
        persistSession,
    ]);
    // Restore session by validating the stored token against the backend
    useEffect(() => {
        const storedToken =
            localStorage.getItem(AUTH_TOKEN_KEY);
    
        if (!storedToken) {
            return;
        }
    
        setToken(storedToken);
    
        let cancelled = false;
    
        const restoreAuthentication = async () => {
            try {
                const res = await fetch('/api/auth/me', {
                    headers: {
                        'Authorization': `Bearer ${storedToken}`
                    }
                });
    
                if (!res.ok) {
                    throw new Error('Session expired');
                }
    
                const data = await res.json();
    
                if (cancelled) {
                    return;
                }
    
                setUser({
                    id: data.user.id,
                    name:
                        data.user.name ||
                        data.user.username ||
                        data.user.email,
                    email: data.user.email,
                    tier: data.user.tier || 'free',
                    gradingCount:
                        data.user.gradingCount ?? 0,
                    gradingLimit:
                        data.user.gradingLimit ?? 5,
                    createdAt:
                        new Date().toISOString(),
                    institution:
                        data.user.institution || '',
                    role:
                        data.user.role || '',
                    activeProvider:
                        data.user.activeProvider || 'server',
                    totalGraded:
                        data.user.totalGraded ?? 0,
                    avatarUrl:
                        data.user.avatarUrl || '',
                });
    
                setShowAuth(false);
            }
            catch (err) {
                if (cancelled) {
                    return;
                }
    
                console.error(
                    'Failed to restore session:',
                    err
                );
    
                localStorage.removeItem(AUTH_TOKEN_KEY);
                localStorage.removeItem(
                    'yaza_active_session_id'
                );
    
                setToken(null);
                setUser(null);
                setActiveSessionId(null);
                setSemesterCourse(null);
                setWorkbook(null);
            }
        };
    
        restoreAuthentication();
    
        return () => {
            cancelled = true;
        };
    }, []);
    
    /**
     * Restore workbook and grading history after authentication.
     *
     * The workbook is now the canonical source of truth.
     *
     * Cloud workbook data is preferred when authenticated, while the local
     * workbook remains available as the immediate offline/local fallback.
     */
    useEffect(() => {
        if (!user || !token) {
            return;
        }
    
        let cancelled = false;
    
        const syncCloudData = async () => {
            try {
                const [
                    cloudWorkbooks,
                    cloudHistory
                ] = await Promise.all([
                    fetchCloudWorkbooks(token),
                    fetchCloudHistory(token),
                ]);
    
                if (cancelled) {
                    return;
                }
    
                setHistory(cloudHistory);
                writeLocalHistory(cloudHistory);
    
                const localWorkbook =
                    loadLocalWorkbook();
    
                /*
                 * Prefer the locally active workbook when the cloud response
                 * contains it. Otherwise use the first available cloud workbook.
                 */
                const restoredWorkbook =
                    (
                        localWorkbook &&
                        cloudWorkbooks.find(
                            candidate =>
                                candidate.id ===
                                localWorkbook.id
                        )
                    ) ||
                    cloudWorkbooks[0] ||
                    localWorkbook ||
                    null;
    
                if (!restoredWorkbook) {
                    setWorkbook(null);
                    setSessions([]);
                    setSemesterCourse(null);
                    setActiveSessionId(null);
    
                    localStorage.removeItem(
                        'yaza_active_session_id'
                    );
    
                    setSessionSaveState('saved');
                    setHistorySaveState('saved');
    
                    return;
                }
    
                /*
                 * If the workbook has no active worksheet, the user must choose
                 * a course before grading can begin.
                 *
                 * We intentionally do NOT automatically select the first
                 * worksheet here.
                 */
                const activeWorksheet =
                    restoredWorkbook.activeSheetId
                        ? restoredWorkbook.sheets.find(
                            sheet =>
                                sheet.id ===
                                restoredWorkbook.activeSheetId
                        )
                        : null;
    
                const normalizedWorkbook =
                    {
                        ...restoredWorkbook,
                        activeSheetId:
                            activeWorksheet?.id || null,
                    };
    
                const savedWorkbook =
                    writeLocalWorkbook(
                        normalizedWorkbook
                    );
    
                setWorkbook(savedWorkbook);
    
                const workbookSessions =
                    savedWorkbook.sheets.map(
                        sheet =>
                            normalizeSession(
                                sheet.course
                            )
                    );
    
                setSessions(workbookSessions);
    
                if (activeWorksheet) {
                    const normalized =
                        normalizeSession(
                            activeWorksheet.course
                        );
    
                    setSemesterCourse(normalized);
                    setActiveSessionId(
                        activeWorksheet.id
                    );
    
                    localStorage.setItem(
                        'yaza_active_session_id',
                        activeWorksheet.id
                    );
                }
                else {
                    setSemesterCourse(null);
                    setActiveSessionId(null);
    
                    localStorage.removeItem(
                        'yaza_active_session_id'
                    );
                }
    
                setSessionSaveState('saved');
                setHistorySaveState('saved');
            }
            catch (error) {
                if (cancelled) {
                    return;
                }
    
                console.error(
                    'Failed to restore workbook data:',
                    error
                );
    
                /*
                 * Cloud restoration failed. Preserve the local workbook rather
                 * than clearing the user's existing work.
                 */
                const localWorkbook =
                    loadLocalWorkbook();
    
                if (localWorkbook) {
                    setWorkbook(localWorkbook);
    
                    const localSessions =
                        localWorkbook.sheets.map(
                            sheet =>
                                normalizeSession(
                                    sheet.course
                                )
                        );
    
                    setSessions(localSessions);
    
                    const activeWorksheet =
                        localWorkbook.activeSheetId
                            ? localWorkbook.sheets.find(
                                sheet =>
                                    sheet.id ===
                                    localWorkbook.activeSheetId
                            )
                            : null;
    
                    if (activeWorksheet) {
                        const normalized =
                            normalizeSession(
                                activeWorksheet.course
                            );
    
                        setSemesterCourse(
                            normalized
                        );
    
                        setActiveSessionId(
                            activeWorksheet.id
                        );
                    }
                }
    
                setSessionSaveState('error');
                setHistorySaveState('error');
            }
        };
    
        syncCloudData();
    
        return () => {
            cancelled = true;
        };
    }, [user, token]);
    
    /*
     * Keep the legacy active-session pointer synchronized while App.tsx
     * is being migrated to workbook/worksheet terminology.
     */
    useEffect(() => {
        if (!activeSessionId) {
            localStorage.removeItem(
                'yaza_active_session_id'
            );
            return;
        }
    
        localStorage.setItem(
            'yaza_active_session_id',
            activeSessionId
        );
    
        if (workbook) {
            const worksheet =
                workbook.sheets.find(
                    sheet =>
                        sheet.id ===
                        activeSessionId
                );
    
            if (
                worksheet &&
                workbook.activeSheetId !==
                    activeSessionId
            ) {
                setWorkbook(
                    setActiveWorksheet(
                        workbook,
                        activeSessionId
                    )
                );
            }
        }
    }, [
        activeSessionId,
        workbook,
    ]);
    
    // Detect return from PayChangu checkout
    useEffect(() => {
        const params =
            new URLSearchParams(window.location.search);
    
        if (params.get('payment_callback') !== '1') {
            return;
        }
    
        const pendingTxRef =
            localStorage.getItem(PENDING_TX_KEY);
    
        window.history.replaceState(
            {},
            '',
            window.location.pathname
        );
    
        if (!pendingTxRef) {
            return;
        }
    
        const storedToken =
            localStorage.getItem(AUTH_TOKEN_KEY);
    
        if (!storedToken) {
            localStorage.removeItem(PENDING_TX_KEY);
            return;
        }
    
        (async () => {
            try {
                const res = await fetch(
                    '/api/payments/verify',
                    {
                        method: 'POST',
                        headers: {
                            'Authorization':
                                `Bearer ${storedToken}`,
                            'Content-Type':
                                'application/json'
                        },
                        body: JSON.stringify({
                            txRef: pendingTxRef
                        }),
                    }
                );
    
                const data =
                    await res.json().catch(() => ({}));
    
                localStorage.removeItem(PENDING_TX_KEY);
    
                if (data.credited) {
                    setPaymentStatusMessage(
                        `Success! ${data.tokens} token(s) added. New balance: ${data.newBalance}.`
                    );
                }
                else {
                    setPaymentStatusMessage(
                        data.message ||
                        'We could not confirm your payment yet. If money was deducted, please contact support.'
                    );
                }
            }
            catch (err) {
                localStorage.removeItem(PENDING_TX_KEY);
    
                setPaymentStatusMessage(
                    'We could not confirm your payment. If money was deducted, please contact support.'
                );
            }
        })();
    }, []);
    
    /*
     * Tool options auto-hide.
     *
     * IMPORTANT:
     * AI mode never shows this bar.
     */
    useEffect(() => {
        if (
            markingMode !== 'self' ||
            !showToolOptions ||
            !activeTool ||
            !(
                activeTool === 'mark' ||
                activeTool === 'mark-right' ||
                activeTool === 'mark-wrong'
            )
        ) {
            return;
        }
    
        if (autoHideTimerRef.current) {
            clearTimeout(autoHideTimerRef.current);
        }
    
        autoHideTimerRef.current = setTimeout(() => {
            setShowToolOptions(false);
        }, 6000);
    
        return () => {
            if (autoHideTimerRef.current) {
                clearTimeout(
                    autoHideTimerRef.current
                );
            }
        };
    }, [
        showToolOptions,
        activeTool,
        markingMode
    ]);
    
    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (autoHideTimerRef.current) {
                clearTimeout(
                    autoHideTimerRef.current
                );
            }
        };
    }, []);
    
    // Function to handle interaction with tool options
    const handleToolOptionInteraction = () => {
        // Never allow tool options in AI mode.
        if (markingMode !== 'self') {
            return;
        }
    
        if (autoHideTimerRef.current) {
            clearTimeout(
                autoHideTimerRef.current
            );
        }
    
        if (
            !showToolOptions &&
            (
                activeTool === 'mark' ||
                activeTool === 'mark-right' ||
                activeTool === 'mark-wrong'
            )
        ) {
            setShowToolOptions(true);
        }
    
        autoHideTimerRef.current = setTimeout(() => {
            setShowToolOptions(false);
        }, 6000);
    };
    
    const schemeRef =
        useRef<UploadZoneHandle>(null);
    
    const paperRef =
        useRef<UploadZoneHandle>(null);
    
    const paperCanvasRef =
        useRef<PaperCanvasHandle>(null);
    const handleClearStudentPaper = () => {
        // Clear all canvas annotations/drawings.
        paperCanvasRef.current?.clear();
    
        // Remove only the uploaded student paper.
        setStudentPaper(null);
    };
    
    const openUploadModal = (
        type: 'scheme' | 'paper'
    ) => {
        if (semesterCourse) {
            if (type === 'scheme') {
                schemeRef.current?.triggerInput();
            }
            else {
                paperRef.current?.triggerInput();
            }
    
            return;
        }
    
        setPendingUpload(type);
        setModalType('new');
    };
    
    const triggerPendingUpload = () => {
        if (pendingUpload === 'scheme') {
            schemeRef.current?.triggerInput();
        }
        else if (pendingUpload === 'paper') {
            paperRef.current?.triggerInput();
        }
    
        setPendingUpload(null);
        setModalType(null);
    };
    
    const clearYazaSessionHistory = (
        key: string
    ) => {
        fetch(
            `/api/yaza/history?sessionKey=${encodeURIComponent(key)}`,
            {
                method: 'DELETE',
                headers: authHeaders(),
            }
        ).catch(err =>
            console.error(
                'Failed to reset Yaza history for new session:',
                err
            )
        );
    };
    
    const handleNewSemesterConfirm = (
        semester: SemesterCourse
    ) => {
        setSemesterCourse(semester);
    
        clearYazaSessionHistory(
            semester.courseCode || 'general'
        );
    
        setSessions(prev => {
            const key = sessionIdentityKey(semester);
    
            return dedupeSessions([
                semester,
                ...prev.filter(
                    session =>
                        sessionIdentityKey(session) !== key
                )
            ]);
        });
    
        void persistSession(semester);
    
        setStudentInfo(prev => ({
            ...prev,
            courseCode:
                semester.courseCode ||
                prev.courseCode,
            program:
                semester.program ||
                prev.program,
            year:
                semester.year ||
                prev.year,
            semester:
                semester.semester ||
                prev.semester,
        }));
    
        // Every new session starts in AI mode.
        setMarkingModeState('ai');
        setActiveTool(null);
        setShowToolOptions(false);
    
        triggerPendingUpload();
    };
    
    const handleSkipSemester = () => {
        setPendingUpload(null);
        setModalType(null);
    
        // New uploads start in AI mode.
        setMarkingModeState('ai');
        setActiveTool(null);
        setShowToolOptions(false);
    
        if (pendingUpload === 'scheme') {
            schemeRef.current?.triggerInput();
        }
        else if (pendingUpload === 'paper') {
            paperRef.current?.triggerInput();
        }
    };
    
    const handleContinueSemester = () =>
        triggerPendingUpload();
    
    const handleStartNewFromContinue = () => {
        setModalType('new');
    };

    /*
     * New Course
     *
     * Creates a new worksheet inside the current workbook.
     */
    const handleNewCourse = (
        updates: {
            courseCode: string;
            courseName: string;
        }
    ) => {
        const courseCode =
            updates.courseCode
                .trim()
                .toUpperCase();
    
        const courseName =
            updates.courseName.trim();
    
        if (!courseCode) {
            return;
        }
    
        const newCourse: SemesterCourse = {
            courseCode,
            courseName,
            program: '',
            year: '',
            semester: '',
            academicYear: '',
            sessionLabel: '',
        };
    
        if (!workbook) {
            /*
             * A course cannot exist without a workbook.
             * Create a workbook first through the normal workbook flow.
             */
            alert(
                'Please create or open a workbook before adding a course.'
            );
            return;
        }
    
        const worksheet = worksheetFromCourse(
            newCourse
        );
    
        const updatedWorkbook = {
            ...workbook,
            sheets: [
                ...workbook.sheets,
                worksheet,
            ],
            activeSheetId: worksheet.id,
        };
    
        const savedWorkbook =
            writeLocalWorkbook(
                updatedWorkbook
            );
    
        setWorkbook(savedWorkbook);
    
        setSemesterCourse(newCourse);
            
        setActiveSessionId(worksheet.id);
    
        localStorage.setItem(
            'yaza_active_session_id',
            worksheet.id
        );
    
        clearYazaSessionHistory(
            courseCode || 'general'
        );
    
        setStudentInfo(prev => ({
            ...prev,
            name: '',
            regNo: '',
            program: '',
            year: '',
            semester: '',
            courseCode,
            examDate: '',
        }));
    
        setMarkingScheme(null);
        setStudentPaper(null);
        setResult(null);
        setExaminerRemarks('');
    
        setMarkingModeState('ai');
    
        setActiveTool(null);
        setShowToolOptions(false);
    
        setZoom(1);
        setClearCount(c => c + 1);
        setIsMaximized(false);
        setIsAutoMode(false);
        setActiveView('grade');
    
        setShowNewCourseModal(false);
    
        if (token) {
            void persistWorkbook(
                savedWorkbook
            );
        }
    };
    
    /*
     * New Session
     *
     * A RedPen session is now a workbook.
     *
     * This creates a completely new workbook rather than creating
     * another independent course/session record.
     */
    const handleNewSession = (
        updates: {
            academicYear: string;
            year: string;
            semester: string;
            sessionLabel: string;
            customName: string;
            courseCode: string;
            courseName: string;
        }
    ) => {
        if (hasUnsavedResult) {
            const confirmed = window.confirm(
                'You have an unsaved grading result.\n\n' +
                'Starting a new workbook will leave this result unsaved.\n\n' +
                'Continue?'
            );
    
            if (!confirmed) {
                return;
            }
    
            setHasUnsavedResult(false);
        }
    
        const newSession: SemesterCourse = {
            courseCode:
                updates.courseCode
                    .trim()
                    .toUpperCase(),
    
            courseName:
                updates.courseName.trim(),
    
            program: '',
            year: updates.year,
            semester: updates.semester,
            academicYear:
                updates.academicYear,
            sessionLabel:
                updates.sessionLabel,
            customName:
                updates.customName.trim() ||
                undefined,
        };
    
        const worksheet =
            worksheetFromCourse(
                newSession
            );
    
        const newWorkbook =
            createWorkbook(
                newSession.customName ||
                    newSession.sessionLabel ||
                    newSession.courseCode ||
                    'RedPen Workbook',
                [
                    worksheet
                ]
            );
    
        const savedWorkbook =
            writeLocalWorkbook(
                newWorkbook
            );
    
        setWorkbook(savedWorkbook);
    
        setSemesterCourse(newSession);
    
        setSessions(
            savedWorkbook.sheets.map(
                sheet =>
                    normalizeSession(
                        sheet.course
                    )
            )
        );
    
        setActiveSessionId(
            worksheet.id
        );
    
        localStorage.setItem(
            'yaza_active_session_id',
            worksheet.id
        );
    
        clearYazaSessionHistory(
            newSession.courseCode ||
            'general'
        );
    
        setStudentInfo(prev => ({
            ...prev,
            name: '',
            regNo: '',
            program: '',
            year: newSession.year,
            semester:
                newSession.semester,
            courseCode:
                newSession.courseCode,
            examDate: '',
        }));
    
        setMarkingScheme(null);
        setStudentPaper(null);
        setResult(null);
        setExaminerRemarks('');
    
        setMarkingModeState('ai');
    
        setActiveTool(null);
        setShowToolOptions(false);
    
        setZoom(1);
        setClearCount(c => c + 1);
        setIsMaximized(false);
        setIsAutoMode(false);
        setActiveView('grade');
    
        setShowNewSessionModal(false);

        setShowOldSessionModal(false);
        setPendingGradeNavigation(false);
        setActiveView('grade');
    
        if (token) {
            void saveCloudWorkbook(
                token,
                savedWorkbook
            ).catch(error => {
                console.error(
                    'Failed to save new workbook to cloud:',
                    error
                );
            });
        }
    };
    
    /*
     * New Paper
     *
     * Keeps:
     * - workbook
     * - active worksheet/course
     * - marking scheme
     * - academic information
     *
     * Clears:
     * - student
     * - previous paper
     * - grading result
     * - annotations
     */
    const handleNewPaper = () => {
        if (!semesterCourse || !activeSessionId) {
            setPendingGradeNavigation(true);
            setShowOldSessionModal(true);
            return;
        }
        if (
            result ||
            studentPaper
        ) {
            if (
                !window.confirm(
                    'Start a new paper? Current student work will be cleared.'
                )
            ) {
                return;
            }
        }
    
        setStudentInfo(prev => ({
            ...prev,
            name: '',
            regNo: '',
            program: '',
        }));
    
        setStudentPaper(null);
        setResult(null);
        setExaminerRemarks('');
    
        setMarkingModeState('ai');
    
        setActiveTool(null);
        setShowToolOptions(false);
    
        if (autoHideTimerRef.current) {
            clearTimeout(
                autoHideTimerRef.current
            );
            autoHideTimerRef.current = null;
        }
    
        setZoom(1);
        setClearCount(c => c + 1);
        setIsMaximized(false);
        setIsAutoMode(false);
        setActiveView('grade');
    };
    
    /*
     * Close upload/session modal.
     */
    const closeModal = () => {
        setPendingUpload(null);
        setModalType(null);
    };
    
    /*
     * Select an existing worksheet/course.
     *
     * The workbook remains unchanged; only the active worksheet changes.
     */
    const loadOldSemester = (
        session: SemesterCourse
    ) => {
        if (hasUnsavedResult) {
            const confirmed = window.confirm(
                'You have an unsaved grading result.\n\n' +
                'Switching courses will leave this result unsaved.\n\n' +
                'Continue switching courses?'
            );
    
            if (!confirmed) {
                return;
            }
    
            setHasUnsavedResult(false);
        }
    
        if (!workbook) {
            return;
        }
    
        const worksheet =
            workbook.sheets.find(
                sheet =>
                    sessionIdentityKey(
                        sheet.course
                    ) ===
                    sessionIdentityKey(session)
            );
        
        if (!worksheet) {
            return;
        }
        
        const updatedWorkbook =
            setActiveWorksheet(
                workbook,
                worksheet.id
            );
        
        const savedWorkbook =
            writeLocalWorkbook(
                updatedWorkbook
            );
        
        setWorkbook(savedWorkbook);
        
        // Sync the Identity Panel with the newly active session
        setStudentInfo(prev => ({
            ...prev,
            courseCode: worksheet.course?.courseCode || '',
            program: worksheet.course?.courseName || '',
            year: worksheet.course?.yearOfStudy || '',
            semester: worksheet.course?.semester || '',
            academicYear: worksheet.course?.academicYear || '',
        }));
    
        setSemesterCourse(
            normalizeSession(
                worksheet.course
            )
        );
    
        setActiveSessionId(
            worksheet.id
        );
    
        localStorage.setItem(
            'yaza_active_session_id',
            worksheet.id
        );
    
        setStudentInfo(prev => ({
            ...prev,
    
            courseCode:
                session.courseCode ||
                prev.courseCode,
    
            program:
                session.program ||
                prev.program,
    
            year:
                session.year ||
                prev.year,
    
            semester:
                session.semester ||
                prev.semester,
    
            academicYear:
                session.academicYear ||
                prev.academicYear,
        }));
    
        setMarkingModeState('ai');
        setActiveTool(null);
        setShowToolOptions(false);
    
        setResult(null);
        setStudentPaper(null);
        setExaminerRemarks('');
    
        setShowOldSessionModal(false);
        
        if (pendingGradeNavigation) {
            setPendingGradeNavigation(false);
            setActiveView('grade');
        }
    
        if (token) {
            void persistWorkbook(
                savedWorkbook
            );
        }
    };
    const handleViewChange = (view: ActiveView) => {
        if (view !== 'grade') {
            setActiveView(view);
            return;
        }
    
        // Already inside an active session/course:
        // go directly to Grade.
        if (semesterCourse && activeSessionId) {
            setActiveView('grade');
            return;
        }
    
        // No active session:
        // remember that Grade is the destination after a session is selected.
        setPendingGradeNavigation(true);
        setShowOldSessionModal(true);
    };
    
    /*
     * Load an Excel workbook.
     *
     * A workbook can contain multiple worksheets/courses.
     *
     * After loading:
     * - all worksheets are discovered
     * - no worksheet is automatically selected
     * - the user must select the course they want to start with
     */
    const handleLoadFromFile =
        useCallback(() => {
            const input =
                document.createElement(
                    'input'
                );
    
            input.type = 'file';
    
            input.accept =
                '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
    
            input.onchange = async (e) => {
                const target =
                    e.target as HTMLInputElement;
    
                if (
                    !target.files ||
                    !target.files[0]
                ) {
                    return;
                }
    
                const file =
                    target.files[0];
    
                try {
                    const isExcelFile =
                        file.name
                            .toLowerCase()
                            .endsWith('.xlsx') ||
                        file.name
                            .toLowerCase()
                            .endsWith('.xls');
    
                    if (!isExcelFile) {
                        alert(
                            'Please select a valid Excel (.xlsx or .xls) workbook.'
                        );
                        return;
                    }
    
                    /*
                     * Parse the complete workbook.
                     *
                     * The loader returns every worksheet/course instead
                     * of reconstructing one legacy session.
                     */
                    const importedWorkbook =
                        await loadWorkbookFromExcelFile(
                            file
                        );
    
                    if (
                        !importedWorkbook ||
                        importedWorkbook.sheets.length === 0
                    ) {
                        alert(
                            'No courses were found in this Excel workbook.'
                        );
                        return;
                    }
    
                    /*
                     * Never automatically activate the first worksheet.
                     *
                     * The course-selection UI will use the discovered
                     * worksheets and require the user to choose one.
                     */
                    const workbookWithoutActiveSheet =
                        {
                            ...importedWorkbook,
                            activeSheetId: null,
                        };
    
                    const savedWorkbook =
                        writeLocalWorkbook(
                            workbookWithoutActiveSheet
                        );
    
                    setWorkbook(
                        savedWorkbook
                    );
    
                    const importedSessions =
                        savedWorkbook.sheets.map(
                            sheet =>
                                normalizeSession(
                                    sheet.course
                                )
                        );
    
                    setSessions(
                        importedSessions
                    );
    
                    setSemesterCourse(
                        null
                    );
    
                    setActiveSessionId(
                        null
                    );
    
                    localStorage.removeItem(
                        'yaza_active_session_id'
                    );
    
                    /*
                     * Reset the grading workspace until the user chooses
                     * one of the discovered courses.
                     */
                    setStudentInfo({
                        name: '',
                        regNo: '',
                        program: '',
                        year: '',
                        semester: '',
                        courseCode: '',
                        examDate: '',
                    });
    
                    setMarkingScheme(null);
                    setStudentPaper(null);
                    setResult(null);
                    setExaminerRemarks('');
    
                    setMarkingModeState('ai');
                    setActiveTool(null);
                    setShowToolOptions(false);
    
                    setZoom(1);
                    setClearCount(
                        c => c + 1
                    );
                    setIsMaximized(false);
                    setIsAutoMode(false);
    
                    setShowOldSessionModal(
                        false
                    );
    
                    /*
                     * Persist the workbook as the single source of truth.
                     */
                    if (token) {
                        await persistWorkbook(
                            savedWorkbook
                        );
                    }
    
                    /*
                     * Open the course selector after the workbook has
                     * been successfully loaded.
                     */
                    setShowCourseSelector(
                        true
                    );
                }
                catch (error) {
                    console.error(
                        'Excel workbook import failed:',
                        error
                    );
    
                    setSessionSaveState(
                        'error'
                    );
    
                    alert(
                        'We could not import this Excel workbook. Please make sure it is a valid RedPen workbook.'
                    );
                }
                finally {
                    target.value = '';
                }
            };
    
            input.click();
        }, [
            token,
            persistWorkbook,
        ]);

        
        /*
     * Main grading handler.
     *
     * The active worksheet is the grading context.
     */
    const handleGrade = async () => {
        if (!studentPaper) {
            alert(
                'Please upload a student paper before grading.'
            );
            return;
        }
    
        if (!semesterCourse || !workbook) {
            alert(
                'Please select a course before grading.'
            );
            setShowCourseSelector(true);
            return;
        }
    
        // Manual grading works independently of authentication.
        if (markingMode === 'self') {
            if (isMaximized) {
                setIsMaximized(false);
            }
    
            setActiveView('grade');
    
            if (!result) {
                setResult({
                    score: '',
                    totalScore: '',
                    percentage: '',
                    grade: '',
                    feedback: '',
                    questions: [],
                    extracted_info: {
                        name: studentInfo.name || '',
                        regNo: studentInfo.regNo || '',
                        program: studentInfo.program || '',
                        year: studentInfo.year || '',
                        courseCode:
                            studentInfo.courseCode ||
                            semesterCourse.courseCode ||
                            '',
                        examDate:
                            studentInfo.examDate || ''
                    }
                });
            }
    
            setHasUnsavedResult(true);
    
            return;
        }
    
        // AI grading requires authentication.
        if (!user) {
            setShowAuth(true);
            return;
        }
    
        if (markingMode !== 'ai') {
            return;
        }
    
        if (isMaximized) {
            setIsMaximized(false);
        }
    
        setLoading(true);
    
        setActiveTool(null);
        setShowToolOptions(false);
    
        try {
            const headers = {
                'Authorization':
                    `Bearer ${localStorage.getItem(
                        AUTH_TOKEN_KEY
                    )}`,
                'Content-Type':
                    'application/json'
            };
    
            const response = await fetch(
                '/api/grade',
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        studentInfo: {
                            ...studentInfo,
                            courseCode:
                                semesterCourse.courseCode ||
                                studentInfo.courseCode,
                        },
                        markingScheme:
                            markingScheme?.base64 ??
                            null,
                        studentPaper:
                            studentPaper.base64
                    })
                }
            );
    
            if (response.status === 401) {
                setShowAuth(true);
    
                throw new Error(
                    'Authentication required. Please sign in.'
                );
            }
    
            if (response.status === 403) {
                const data =
                    await response
                        .json()
                        .catch(() => ({}));
    
                if (
                    data.code ===
                    'LIMIT_REACHED'
                ) {
                    setUpgradePromptMessage(
                        data.message ||
                        'You have reached your grading limit.'
                    );
    
                    return;
                }
    
                throw new Error(
                    data.message ||
                    'Access denied'
                );
            }
    
            if (!response.ok) {
                const data =
                    await response
                        .json()
                        .catch(() => ({}));
    
                throw new Error(
                    data.message ||
                    'Grading request failed'
                );
            }
    
            const gradingResult:
                ApiGradingResult =
                await response.json();
    
            if (gradingResult.error) {
                throw new Error(
                    gradingResult.message ||
                    'Grading failed'
                );
            }
    
            const mappedResult:
                GradingResult = {
                totalScore:
                    gradingResult.total_score ||
                    gradingResult.totalScore,
    
                score:
                    gradingResult.score,
    
                percentage:
                    gradingResult.percentage,
    
                grade:
                    gradingResult.grade,
    
                feedback:
                    gradingResult.feedback ||
                    '',
    
                questions:
                    gradingResult.questions ||
                    [],
    
                extracted_info:
                    gradingResult.extracted_info ||
                    undefined,
            };
    
            const validatedResult =
                validateAndNormalizeResult(
                    mappedResult
                );
    
            if (!validatedResult) {
                throw new Error(
                    'The grading service returned an invalid result. Please try grading again.'
                );
            }
    
            setResult(
                validatedResult
            );
    
            setHasUnsavedResult(true);
    
            setActiveView('grade');
    
            setUser(prev =>
                prev
                    ? {
                        ...prev,
                        gradingCount:
                            prev.gradingCount +
                            1
                    }
                    : prev
            );
    
            if (
                validatedResult.extracted_info
            ) {
                setStudentInfo(prev => ({
                    ...prev,
    
                    name:
                        validatedResult
                            .extracted_info
                            ?.name ||
                        prev.name,
    
                    program:
                        validatedResult
                            .extracted_info
                            ?.program ||
                        prev.program,
    
                    regNo:
                        validatedResult
                            .extracted_info
                            ?.regNo ||
                        prev.regNo,
    
                    year:
                        validatedResult
                            .extracted_info
                            ?.year ||
                        prev.year,
    
                    courseCode:
                        semesterCourse.courseCode ||
                        validatedResult
                            .extracted_info
                            ?.courseCode ||
                        prev.courseCode,
    
                    examDate:
                        validatedResult
                            .extracted_info
                            ?.examDate ||
                        prev.examDate,
    
                    semester:
                        prev.semester,
                }));
            }
    
            /*
             * Keep the active worksheet synchronized with the latest
             * student/result state. The workbook remains the source of truth.
             */
            if (workbook && activeSessionId) {
                const updatedWorkbook =
                    updateWorksheetResult(
                        workbook,
                        activeSessionId,
                        {
                            studentInfo: {
                                ...studentInfo,
                                courseCode:
                                    semesterCourse.courseCode ||
                                    studentInfo.courseCode,
                            },
                            result: validatedResult,
                        }
                    );
    
                const savedWorkbook =
                    writeLocalWorkbook(
                        updatedWorkbook
                    );
    
                setWorkbook(
                    savedWorkbook
                );
    
                if (token) {
                    void persistWorkbook(
                        savedWorkbook
                    );
                }
            }
        }
        catch (error) {
            console.error(
                'Grading failed:',
                error
            );
    
            alert(
                error instanceof Error
                    ? error.message
                    : 'An error occurred during grading. Check the console for details.'
            );
        }
        finally {
            setLoading(false);
        }
    };
    
    /*
     * Grade using an explicitly selected mode.
     */
    const handleGradeWithMode = async (
        mode: 'ai' | 'self'
    ) => {
        if (isGradingInProgress) {
            return;
        }
    
        if (!studentPaper) {
            return;
        }
    
        if (!semesterCourse || !workbook) {
            alert(
                'Please select a course before grading.'
            );
    
            setShowCourseSelector(true);
            return;
        }
    
        setIsGradingInProgress(true);
    
        setMarkingModeState(mode);
    
        if (mode === 'ai') {
            setActiveTool(null);
            setShowToolOptions(false);
    
            if (autoHideTimerRef.current) {
                clearTimeout(
                    autoHideTimerRef.current
                );
    
                autoHideTimerRef.current = null;
            }
        }
    
        if (mode === 'self') {
            if (isMaximized) {
                setIsMaximized(false);
            }
    
            setActiveView('grade');
    
            setResult({
                score: '',
                totalScore: '',
                percentage: '',
                grade: '',
                feedback: '',
                questions: [],
                extracted_info: {
                    name:
                        studentInfo.name || '',
                    regNo:
                        studentInfo.regNo || '',
                    program:
                        studentInfo.program || '',
                    year:
                        studentInfo.year || '',
                    courseCode:
                        semesterCourse.courseCode ||
                        studentInfo.courseCode ||
                        '',
                    examDate:
                        studentInfo.examDate || ''
                }
            });
    
            setHasUnsavedResult(true);
    
            setIsGradingInProgress(false);
            return;
        }
    
        if (!user) {
            setShowAuth(true);
            setIsGradingInProgress(false);
            return;
        }
    
        setLoading(true);
    
        try {
            const response =
                await fetch('/api/grade', {
                    method: 'POST',
                    headers: {
                        'Authorization':
                            `Bearer ${localStorage.getItem(
                                AUTH_TOKEN_KEY
                            )}`,
                        'Content-Type':
                            'application/json'
                    },
                    body: JSON.stringify({
                        studentInfo: {
                            ...studentInfo,
                            courseCode:
                                semesterCourse.courseCode ||
                                studentInfo.courseCode,
                        },
                        markingScheme:
                            markingScheme?.base64 ??
                            null,
                        studentPaper:
                            studentPaper.base64
                    })
                });
    
            const data =
                await response
                    .json()
                    .catch(() => ({}));
    
            if (!response.ok) {
                if (response.status === 401) {
                    setShowAuth(true);
    
                    throw new Error(
                        'Authentication required. Please sign in.'
                    );
                }
    
                if (
                    response.status === 403 &&
                    data.code ===
                        'LIMIT_REACHED'
                ) {
                    setUpgradePromptMessage(
                        data.message ||
                        'You have reached your grading limit.'
                    );
    
                    return;
                }
    
                throw new Error(
                    data.message ||
                    `Grading request failed (${response.status})`
                );
            }
    
            const gradingResult:
                ApiGradingResult = data;
    
            if (gradingResult.error) {
                throw new Error(
                    gradingResult.message ||
                    'Grading failed'
                );
            }
    
            const mappedResult:
                GradingResult = {
                totalScore:
                    gradingResult.total_score ||
                    gradingResult.totalScore,
    
                score:
                    gradingResult.score,
    
                percentage:
                    gradingResult.percentage,
    
                grade:
                    gradingResult.grade,
    
                feedback:
                    gradingResult.feedback ||
                    '',
    
                questions:
                    gradingResult.questions ||
                    [],
    
                extracted_info:
                    gradingResult.extracted_info ||
                    undefined,
            };
    
            const validatedResult =
                validateAndNormalizeResult(
                    mappedResult
                );
    
            if (!validatedResult) {
                throw new Error(
                    'The grading service returned an invalid result. Please try grading again.'
                );
            }
    
            setResult(
                validatedResult
            );
    
            setHasUnsavedResult(true);
    
            setActiveView('grade');
    
            setUser(prev =>
                prev
                    ? {
                        ...prev,
                        gradingCount:
                            prev.gradingCount +
                            1
                    }
                    : prev
            );
    
            if (
                validatedResult.extracted_info
            ) {
                setStudentInfo(prev => ({
                    ...prev,
    
                    name:
                        validatedResult
                            .extracted_info?.name ||
                        prev.name,
    
                    program:
                        validatedResult
                            .extracted_info?.program ||
                        prev.program,
    
                    regNo:
                        validatedResult
                            .extracted_info?.regNo ||
                        prev.regNo,
    
                    year:
                        validatedResult
                            .extracted_info?.year ||
                        prev.year,
    
                    courseCode:
                        semesterCourse.courseCode ||
                        validatedResult
                            .extracted_info?.courseCode ||
                        prev.courseCode,
    
                    examDate:
                        validatedResult
                            .extracted_info?.examDate ||
                        prev.examDate,
    
                    semester:
                        prev.semester,
                }));
            }
    
            /*
             * Save the result into the active worksheet.
             */
            if (
                workbook &&
                activeSessionId
            ) {
                const updatedWorkbook =
                    updateWorksheetResult(
                        workbook,
                        activeSessionId,
                        {
                            studentInfo: {
                                ...studentInfo,
                                courseCode:
                                    semesterCourse.courseCode ||
                                    studentInfo.courseCode,
                            },
                            result:
                                validatedResult,
                        }
                    );
    
                const savedWorkbook =
                    writeLocalWorkbook(
                        updatedWorkbook
                    );
    
                setWorkbook(
                    savedWorkbook
                );
    
                if (token) {
                    void persistWorkbook(
                        savedWorkbook
                    );
                }
            }
        }
        catch (error) {
            console.error(
                'Grading failed:',
                error
            );
    
            alert(
                error instanceof Error
                    ? error.message
                    : 'Grading failed.'
            );
        }
        finally {
            setLoading(false);
            setIsGradingInProgress(false);
        }
    };
                // Handle selection from the grading choice modal
        
        // Auto mode: automatically grade an uploaded paper using AI.
        useEffect(() => {
            if (
                isAutoMode &&
                studentPaper &&
                user &&
                semesterCourse &&
                workbook
            ) {
                setMarkingModeState('ai');
        
                const timer = setTimeout(() => {
                    handleGrade().catch(err => {
                        console.error(
                            'Auto-grade failed:',
                            err
                        );
        
                        setIsAutoMode(false);
                    });
                }, 200);
        
                return () => clearTimeout(timer);
            }
        }, [
            isAutoMode,
            studentPaper,
            user,
            semesterCourse,
            workbook,
        ]);
        
        const [isSaving, setIsSaving] =
            useState(false);
        
        const handleSave = async (
            resultToSave?: GradingResult
        ) => {
            if (!token) {
                setHistorySaveState('error');
        
                alert(
                    'Please sign in before saving grading results.'
                );
        
                return;
            }
        
            if (!workbook) {
                alert(
                    'No workbook is open. Please open or create a workbook first.'
                );
        
                return;
            }
        
            if (!semesterCourse) {
                alert(
                    'No course is selected. Please select a course before saving.'
                );
        
                setShowCourseSelector(true);
        
                return;
            }
        
            const currentResult =
                resultToSave || result;
        
            if (!currentResult) {
                alert(
                    'No grading result to save. Grade a paper first.'
                );
        
                return;
            }
        
            const hasQuestions =
                Array.isArray(
                    currentResult.questions
                ) &&
                currentResult.questions.length > 0;
        
            if (hasQuestions) {
                const incompleteQuestions =
                    currentResult.questions.filter(q => {
                        const score =
                            typeof q.score === 'string'
                                ? q.score.trim()
                                : '';
        
                        return (
                            !score ||
                            !parseQuestionScore(score)
                        );
                    });
        
                if (
                    incompleteQuestions.length > 0
                ) {
                    alert(
                        'Cannot save this result. All question scores must be completed with valid scores such as 5/10.'
                    );
        
                    return;
                }
            }
        
            const missingResultFields = [
                !currentResult.totalScore &&
                    'Total Score',
        
                !currentResult.percentage &&
                    'Percentage',
        
                !currentResult.grade &&
                    'Grade',
            ].filter(Boolean);
        
            if (
                missingResultFields.length > 0
            ) {
                alert(
                    `Cannot save an incomplete result. Missing: ${missingResultFields.join(', ')}.`
                );
        
                return;
            }
        
            /*
             * The active worksheet/course is authoritative.
             * Always use its course code rather than allowing an older
             * studentInfo value to redirect the result to another course.
             */
            const activeCourseCode =
                semesterCourse.courseCode.trim();
        
            if (!activeCourseCode) {
                alert(
                    'The selected course does not have a valid course code.'
                );
        
                return;
            }
        
            const saveStudentInfo: StudentInfo = {
                ...studentInfo,
        
                courseCode:
                    activeCourseCode,
        
                semester:
                    semesterCourse.semester ||
                    studentInfo.semester,
        
                year:
                    semesterCourse.year ||
                    studentInfo.year,
            };
        
            const requiredFields = [
                'name',
                'regNo',
                'courseCode',
                'program'
            ];
        
            const missingFields =
                requiredFields.filter(
                    field =>
                        !saveStudentInfo[
                            field as keyof StudentInfo
                        ]
                );
        
            if (
                missingFields.length > 0
            ) {
                const missingFieldNames =
                    missingFields
                        .map(field =>
                            field === 'regNo'
                                ? 'Registration Number'
                                : field === 'courseCode'
                                    ? 'Course Code'
                                    : field === 'program'
                                        ? 'Program of Study'
                                        : field.charAt(0)
                                              .toUpperCase() +
                                          field.slice(1)
                        )
                        .join(', ');
        
                const userConfirmed =
                    confirm(
                        `The following required fields are missing: ${missingFieldNames}.\n\n` +
                        `You need to enter this information before saving.\n\n` +
                        `Go to the Identity Panel to enter the details, then try saving again.\n\n` +
                        `Do you want to proceed with saving anyway?`
                    );
        
                if (!userConfirmed) {
                    return;
                }
            }
        
            setIsSaving(true);
            setHistorySaveState('saving');
        
            const record: HistoryRecord = {
                id: Date.now().toString(),
        
                date:
                    new Date().toISOString(),
        
                studentInfo:
                    saveStudentInfo,
        
                result: {
                    ...currentResult,
        
                    feedback:
                        currentResult.feedback +
                        (
                            examinerRemarks
                                ? `\n\nExaminer Remarks: ${examinerRemarks}`
                                : ''
                        )
                }
            };
        
            setPendingHistoryRecord(record);
        
            try {
                /*
                 * Cloud history remains available as a compatibility layer,
                 * but the workbook is the authoritative grading data source.
                 */
                const cloudHistory =
                    await saveCloudHistory(
                        token,
                        record
                    );
        
                setHistory(
                    cloudHistory
                );
        
                writeLocalHistory(
                    cloudHistory
                );
        
                setPendingHistoryRecord(
                    null
                );
        
                setHistorySaveState(
                    'saved'
                );
        
                setHasUnsavedResult(
                    false
                );
        
                /*
                 * Update the active worksheet in the workbook.
                 */
                try {
                    /*
                     * The workbook's activeSheetId is the authoritative
                     * identifier for the worksheet being graded.
                     */
                    const activeWorksheetId =
                        workbook.activeSheetId;
                
                    if (!activeWorksheetId) {
                        throw new Error(
                            'No active worksheet is selected.'
                        );
                    }
                
                    const activeWorksheet =
                        workbook.sheets.find(
                            sheet =>
                                sheet.id ===
                                activeWorksheetId
                        );
                
                    if (!activeWorksheet) {
                        throw new Error(
                            'The active worksheet could not be found in the workbook.'
                        );
                    }
                
                    /*
                     * Add the saved grading result to the active worksheet.
                     */
                    const updatedRows = [
                        ...(activeWorksheet.rows || []),
                        {
                            id: record.id,
                            studentInfo: saveStudentInfo,
                            result: record.result,
                            gradedAt: record.date,
                        },
                    ];
                
                    const updatedWorkbook =
                        updateWorksheet(
                            workbook,
                            activeWorksheet.id,
                            {
                                rows: updatedRows,
                            }
                        );
                
                    /*
                     * Update the UI immediately.
                     */
                    setWorkbook(
                        updatedWorkbook
                    );
                
                    /*
                     * Persist the updated workbook to cloud/local storage.
                     */
                    const workbookResponse =
                        await saveCloudWorkbook(
                            token,
                            updatedWorkbook
                        );
                
                    setWorkbook(
                        workbookResponse.workbook
                    );
                
                    /*
                     * Export the marked paper PDF when a saved folder exists.
                     * Workbook persistence above is the important save operation.
                     */
                    const folder =
                        await getSavedFolder();
                
                    const paperImage =
                        paperCanvasRef.current
                            ?.captureFullPaper();
                
                    if (paperImage) {
                        const pdfBlob =
                            await buildPaperPdfBlob(
                                paperImage
                            );
                
                        const pdfFilename =
                            buildPaperPdfFilename(
                                saveStudentInfo
                            );
                
                        await writeFileToFolder(
                            folder,
                            pdfFilename,
                            pdfBlob
                        );
                    }
                
                    await appendResultToSessionExcel(
                        folder,
                        {
                            academicYear:
                                semesterCourse.academicYear || '',
                            semester:
                                semesterCourse.semester || '',
                            sessionLabel:
                                semesterCourse.sessionLabel || '',
                            customName:
                                semesterCourse.customName,
                        },
                        activeCourseCode,
                        saveStudentInfo,
                        currentResult
                    );
                }
                catch (exportError) {
                    console.error(
                        'Failed to persist/export workbook:',
                        exportError
                    );
        
                    alert(
                        'Your result was saved, but the workbook/PDF export could not be updated. Please retry the workbook save.'
                    );
                }
            }
            catch (error) {
                console.error(
                    'Failed to save grading history:',
                    error
                );
        
                const updated = [
                    record,
                    ...history.filter(
                        item =>
                            item.id !== record.id
                    )
                ].slice(0, 50);
        
                setHistory(
                    updated
                );
        
                writeLocalHistory(
                    updated
                );
        
                setPendingHistoryRecord(
                    record
                );
        
                setHistorySaveState(
                    'error'
                );
        
                setHasUnsavedResult(
                    true
                );
        
                alert(
                    'The result could not be saved to the cloud. Your result is still available locally. Please use Retry when your connection is available.'
                );
            }
            finally {
                setIsSaving(false);
            }
        };
        
        const handleLoadRecord = (
            record: HistoryRecord
        ) => {
            if (hasUnsavedResult) {
                const confirmed =
                    window.confirm(
                        'You have an unsaved grading result.\n\n' +
                        'Loading another result will replace it.\n\n' +
                        'Continue?'
                    );
        
                if (!confirmed) {
                    return;
                }
            }
        
            /*
             * If the record belongs to a known workbook course,
             * switch the active worksheet before loading the result.
             */
            const recordCourseCode =
                record.studentInfo?.courseCode
                    ?.trim()
                    .toUpperCase();
        
            if (
                recordCourseCode &&
                workbook
            ) {
                const matchingCourse =
                    workbook.worksheets?.find(
                        worksheet =>
                            worksheet.courseCode
                                ?.trim()
                                .toUpperCase() ===
                            recordCourseCode
                    );
        
                if (matchingCourse) {
                    setSemesterCourse(
                        matchingCourse
                    );
        
                    setActiveSessionId(
                        matchingCourse.id ||
                        sessionIdentityKey(
                            matchingCourse
                        )
                    );
                }
            }
        
            setStudentInfo(
                record.studentInfo
            );
        
            setResult(
                record.result
            );
        
            setHasUnsavedResult(
                false
            );
        
            setMarkingModeState(
                'self'
            );
        
            setActiveView(
                'grade'
            );
        };
        
        const handleDeleteRecord = async (
            id: string
        ) => {
            if (!token) {
                alert(
                    'Please sign in to delete grading history.'
                );
        
                return;
            }
        
            try {
                const cloudHistory =
                    await deleteCloudHistory(
                        token,
                        id
                    );
        
                setHistory(
                    cloudHistory
                );
        
                writeLocalHistory(
                    cloudHistory
                );
        
                if (
                    pendingHistoryRecord?.id ===
                    id
                ) {
                    setPendingHistoryRecord(
                        null
                    );
        
                    setHistorySaveState(
                        'idle'
                    );
                }
            }
            catch (error) {
                console.error(
                    'Failed to delete history record:',
                    error
                );
        
                alert(
                    'Could not delete this grading record. Please try again.'
                );
            }
        };
        
        const handleSaveRemarks = () => {
            if (
                examinerRemarks.trim()
            ) {
                setHasUnsavedResult(
                    true
                );
        
                alert(
                    "Remarks added. Use 'Save Results' to include them in the saved result."
                );
            }
        
            setActiveView(
                'dashboard'
            );
        };
        
        const handleNew = () => {
            if (
                hasUnsavedResult ||
                result ||
                markingScheme ||
                studentPaper
            ) {
                const confirmed =
                    window.confirm(
                        hasUnsavedResult
                            ? 'You have an unsaved grading result.\n\n' +
                              'Starting a new workspace will clear it.\n\n' +
                              'Continue?'
                            : 'Start a new workbook? Current work will be cleared.'
                    );
        
                if (!confirmed) {
                    return;
                }
            }
        
            clearYazaSessionHistory(
                'general'
            );
        
            setStudentInfo({
                name: '',
                regNo: '',
                program: '',
                year: '',
                semester: '',
                courseCode: '',
                examDate: ''
            });
        
            setMarkingScheme(
                null
            );
        
            setStudentPaper(
                null
            );
        
            setResult(
                null
            );
        
            setExaminerRemarks(
                ''
            );
        
            setSemesterCourse(
                null
            );
        
            setActiveSessionId(
                null
            );
        
            setHasUnsavedResult(
                false
            );
        
            setPendingHistoryRecord(
                null
            );
        
            setHistorySaveState(
                'idle'
            );
        
            setActiveView(
                'dashboard'
            );
        
            setMarkingModeState(
                'ai'
            );
        
            setActiveTool(
                null
            );
        
            setShowToolOptions(
                false
            );
        
            setZoom(
                1
            );
        
            setClearCount(
                c => c + 1
            );
        
            setIsMaximized(
                false
            );
        
            setIsAutoMode(
                false
            );
        };
        
        const handleRefresh = () => {
            if (
                hasUnsavedResult ||
                result ||
                markingScheme ||
                studentPaper
            ) {
                const confirmed = window.confirm(
                    hasUnsavedResult
                        ? 'You have an unsaved grading result.\n\n' +
                          'Refreshing will clear the current work, but your workbook and courses will remain.\n\n' +
                          'Continue?'
                        : 'Refresh the current grading workspace? Any current student work will be cleared.'
                );
        
                if (!confirmed) {
                    return;
                }
            }
        
            /*
             * Refresh the grading workspace only.
             *
             * IMPORTANT:
             * The workbook and its courses are persistent workspace state.
             * Refreshing must never destroy them.
             */
        
            setStudentInfo({
                name: '',
                regNo: '',
                program: '',
                year:
                    semesterCourse?.year ||
                    '',
                semester:
                    semesterCourse?.semester ||
                    '',
                courseCode:
                    semesterCourse?.courseCode ||
                    '',
                examDate: ''
            });
        
            setMarkingScheme(null);
            setStudentPaper(null);
            setResult(null);
            setExaminerRemarks('');
        
            setHasUnsavedResult(false);
            setPendingHistoryRecord(null);
            setHistorySaveState('idle');
        
            setActiveView('dashboard');
            setMarkingModeState('ai');
        
            setClearCount(
                c => c + 1
            );
        
            setZoom(1);
            setActiveTool(null);
            setShowToolOptions(false);
        
            setIsMaximized(false);
            setIsAutoMode(false);
        
            setShowRefresh(false);
        };
    
            // Auth handlers
            const handleAuthSuccess = (
                data: AuthResponse
            ) => {
                localStorage.setItem(
                    AUTH_TOKEN_KEY,
                    data.token
                );
    
                setToken(data.token);
                setUser(data.user);
                setShowAuth(false);
            };
    
            const handleLogout = () => {
                localStorage.removeItem(
                    AUTH_TOKEN_KEY
                );
    
                setToken(null);
                setUser(null);
                setShowProfile(false);
            };
    
            // Settings handlers
            const handleYazaEditQuestionScore = (
                questionNumber: number,
                score?: string,
                feedback?: string
            ) => {
                setResult(prev => {
                    if (!prev) {
                        return prev;
                    }
    
                    const questions =
                        (
                            prev.questions ||
                            []
                        ).map(q =>
                            q.q === questionNumber
                                ? {
                                    ...q,
    
                                    ...(score !== undefined && {
                                        score
                                    }),
    
                                    ...(feedback !== undefined && {
                                        feedback
                                    })
                                }
                                : q
                        );
    
                    return {
                        ...prev,
                        questions
                    };
                });
    
                setHasUnsavedResult(true);
            };
    
            // Profile handlers
            const handleSaveProfile = async (
                institution: string,
                role: string
            ) => {
                if (!user) {
                    return;
                }
    
                const res =
                    await fetch(
                        '/api/settings/profile',
                        {
                            method: 'POST',
                            headers:
                                authHeaders,
    
                            body: JSON.stringify({
                                institution,
                                role
                            }),
                        }
                    );
    
                if (!res.ok) {
                    const data =
                        await res
                            .json()
                            .catch(
                                () => ({})
                            );
    
                    alert(
                        data.message ||
                        'Failed to save profile'
                    );
    
                    return;
                }
    
                setUser(prev =>
                    prev
                        ? {
                            ...prev,
                            institution,
                            role
                        }
                        : prev
                );
            };
    
            // Avatar upload handler
            const handleUploadAvatar = async (
                file: File
            ): Promise<{
                success: boolean;
                message?: string
            }> => {
                if (!user) {
                    return {
                        success: false,
                        message: 'Not logged in'
                    };
                }
    
                return new Promise(resolve => {
                    const reader =
                        new FileReader();
    
                    reader.onload = async () => {
                        try {
                            const base64 =
                                reader.result as string;
    
                            const res =
                                await fetch(
                                    '/api/settings/avatar',
                                    {
                                        method: 'POST',
                                        headers:
                                            authHeaders(),
                                        body:
                                            JSON.stringify({
                                                imageBase64:
                                                    base64,
                                                filename:
                                                    file.name,
                                                mimeType:
                                                    file.type,
                                            }),
                                    }
                                );
    
                            const data =
                                await res
                                    .json()
                                    .catch(
                                        () => ({})
                                    );
    
                            if (!res.ok) {
                                resolve({
                                    success: false,
                                    message:
                                        data.message ||
                                        'Failed to upload image'
                                });
    
                                return;
                            }
    
                            setUser(prev =>
                                prev
                                    ? {
                                        ...prev,
                                        avatarUrl:
                                            data.avatarUrl
                                    }
                                    : prev
                            );
    
                            resolve({
                                success: true
                            });
                        }
                        catch (err) {
                            resolve({
                                success: false,
                                message:
                                    'Failed to upload image'
                            });
                        }
                    };
    
                    reader.onerror = () =>
                        resolve({
                            success: false,
                            message:
                                'Failed to read image file'
                        });
    
                    reader.readAsDataURL(file);
                });
            };
    
            // Change password handler
            const handleChangePassword = async (
                currentPassword: string,
                newPassword: string
            ): Promise<{
                success: boolean;
                message?: string
            }> => {
                try {
                    const res =
                        await fetch(
                            '/api/auth/change-password',
                            {
                                method: 'POST',
                                headers:
                                    authHeaders(),
                                body:
                                    JSON.stringify({
                                        currentPassword,
                                        newPassword
                                    }),
                            }
                        );
    
                    const data =
                        await res
                            .json()
                            .catch(
                                () => ({})
                            );
    
                    if (!res.ok) {
                        return {
                            success: false,
                            message:
                                data.message ||
                                'Failed to change password'
                        };
                    }
    
                    return {
                        success: true
                    };
                }
                catch (err) {
                    return {
                        success: false,
                        message:
                            'Failed to change password'
                    };
                }
            };
    
            // Delete account handler
            const handleDeleteAccount = async (
                password: string
            ): Promise<{
                success: boolean;
                message?: string
            }> => {
                try {
                    const res =
                        await fetch(
                            '/api/auth/delete-account',
                            {
                                method: 'POST',
                                headers:
                                    authHeaders(),
                                body:
                                    JSON.stringify({
                                        password
                                    }),
                            }
                        );
    
                    const data =
                        await res
                            .json()
                            .catch(
                                () => ({})
                            );
    
                    if (!res.ok) {
                        return {
                            success: false,
                            message:
                                data.message ||
                                'Failed to delete account'
                        };
                    }
    
                    // Account deleted successfully — log the user out locally.
                    handleLogout();
    
                    return {
                        success: true
                    };
                }
                catch (err) {
                    return {
                        success: false,
                        message:
                            'Failed to delete account'
                    };
                }
            };
    
            const handleUpgrade = () => {
                setShowSettings(true);
            };
    
            // Batch grading handlers
            const handleGradeSingle = async (
                paperBase64: string
            ): Promise<GradingResult> => {
                if (!user) {
                    throw new Error(
                        'Please sign in first'
                    );
                }
    
                const payload = {
                    studentInfo,
                    markingScheme:
                        markingScheme?.base64 ?? null,
                    studentPaper: paperBase64
                };
    
                const headers = {
                    ...authHeaders()
                };
    
                const response =
                    await fetch(
                        '/api/grade',
                        {
                            method: 'POST',
                            headers,
                            body:
                                JSON.stringify(
                                    payload
                                )
                        }
                    );
    
                if (response.status === 401) {
                    throw new Error(
                        'Authentication required'
                    );
                }
    
                if (response.status === 403) {
                    const data =
                        await response
                            .json()
                            .catch(
                                () => ({})
                            );
    
                    throw new Error(
                        data.message ||
                        'Access denied'
                    );
                }
    
                if (!response.ok) {
                    const data =
                        await response
                            .json()
                            .catch(
                                () => ({})
                            );
    
                    throw new Error(
                        data.message ||
                        `Grading request failed (${response.status})`
                    );
                }
    
                const apiResult:
                    ApiGradingResult =
                    await response.json();
    
                if (apiResult.error) {
                    throw new Error(
                        apiResult.message ||
                        'Grading failed'
                    );
                }
    
                const mappedResult:
                    GradingResult = {
                    totalScore:
                        apiResult.total_score ||
                        apiResult.totalScore,
                    score:
                        apiResult.score,
                    percentage:
                        apiResult.percentage,
                    grade:
                        apiResult.grade,
                    feedback:
                        apiResult.feedback ||
                        '',
                    questions:
                        apiResult.questions ||
                        [],
                    extracted_info:
                        apiResult.extracted_info ||
                        undefined,
                };
    
                const validatedResult =
                    validateAndNormalizeResult(
                        mappedResult
                    );
    
                if (!validatedResult) {
                    throw new Error(
                        'The grading service returned an invalid result.'
                    );
                }
    
                return validatedResult;
            };
        
            const handleSaveAllBatch = async (
                results: {
                    file: any;
                    result: GradingResult;
                }[]
            ) => {
                if (
                    !results ||
                    results.length === 0
                ) {
                    alert(
                        'There are no grading results to save.'
                    );
                    return;
                }
    
                if (!token) {
                    setShowAuth(true);
    
                    alert(
                        'Please sign in before saving grading history.'
                    );
    
                    return;
                }
    
                const records:
                    HistoryRecord[] =
                    results.map(
                        ({ file, result }, idx) => ({
                            id:
                                Date.now()
                                    .toString() +
                                '_' +
                                idx +
                                '_' +
                                Math.random()
                                    .toString(36)
                                    .slice(2, 9),
    
                            date:
                                new Date()
                                    .toISOString(),
    
                            studentInfo: {
                                ...studentInfo,
    
                                name:
                                    result
                                        .extracted_info
                                        ?.name ||
                                    studentInfo.name ||
                                    file.name,
    
                                regNo:
                                    result
                                        .extracted_info
                                        ?.regNo ||
                                    studentInfo.regNo,
                            },
    
                            result,
                        })
                    );
    
                setHistorySaveState('saving');
    
                try {
                    let cloudHistory =
                        await fetchCloudHistory(token);
    
                    for (const record of records) {
                        cloudHistory =
                            await saveCloudHistory(
                                token,
                                record
                            );
                    }
    
                    setHistory(cloudHistory);
                    writeLocalHistory(cloudHistory);
    
                    setHistorySaveState('saved');
    
                    alert(
                        `Saved ${records.length} grading result${
                            records.length === 1
                                ? ''
                                : 's'
                        } to history!`
                    );
    
                    setShowBatch(false);
                }
                catch (error) {
                    console.error(
                        'Batch history save failed:',
                        error
                    );
    
                    setHistorySaveState('error');
    
                    alert(
                        'Some grading results could not be saved to the cloud. Please retry.'
                    );
                }
            };
    
            const handlePrint = () => {
                const paperImage =
                    paperCanvasRef.current?.captureFullPaper();
    
                if (!paperImage) {
                    alert(
                        'No graded paper to print yet.'
                    );
                    return;
                }
    
                const printWindow =
                    window.open('', '_blank');
    
                if (!printWindow) {
                    alert(
                        'Please allow popups to print.'
                    );
                    return;
                }
    
                printWindow.document.write(`
                    <html>
                      <head>
                        <title>${studentInfo.courseCode || 'Graded Paper'} - ${studentInfo.name || ''}</title>
                        <style>
                          @page { margin: 0; }
                          body {
                            margin: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                          }
                          img {
                            max-width: 100%;
                            height: auto;
                            display: block;
                          }
                        </style>
                      </head>
                      <body>
                        <img
                          src="${paperImage}"
                          onload="window.focus(); window.print();"
                        />
                      </body>
                    </html>
                `);
    
                printWindow.document.close();
            };
    
            /*
             * Handle paper upload.
             *
             * Uploading a paper must not create a new session or course.
             * It belongs to the currently selected workbook worksheet.
             */
            const handlePaperUpload = useCallback(
                (
                    base64: string,
                    name: string
                ) => {
                    setStudentPaper({
                        base64,
                        name
                    });
    
                    // Every newly uploaded paper starts in AI mode.
                    setMarkingModeState('ai');
    
                    // Clear any result belonging to the previous paper.
                    setResult(null);
    
                    setExaminerRemarks('');
    
                    // Reset manual marking tools.
                    setActiveTool(null);
                    setShowToolOptions(false);
    
                    if (autoHideTimerRef.current) {
                        clearTimeout(
                            autoHideTimerRef.current
                        );
    
                        autoHideTimerRef.current = null;
                    }
    
                    // Reset canvas view.
                    setZoom(1);
                    setClearCount(
                        c => c + 1
                    );
    
                    setIsMaximized(false);
                    setIsAutoMode(false);
    
                    setActiveView('grade');
                },
                []
            );
    
            /*
             * Courses are workbook worksheets.
             *
             * Do not derive the course list from the legacy sessions array.
             * The workbook is the source of truth.
             */
            const workbookCourses =
                workbook?.sheets || [];
    
            const filteredCourses =
                workbookCourses.filter(sheet =>
                    searchTerm === '' ||
                    sheet.courseCode
                        .toLowerCase()
                        .includes(
                            searchTerm.toLowerCase()
                        ) ||
                    sheet.courseName
                        ?.toLowerCase()
                        .includes(
                            searchTerm.toLowerCase()
                        )
                );
    
            // Handle search term changes from TopBar.
            const handleSearchTermChange = (
                term: string
            ) => {
                setSearchTerm(term);
            };
    
            return (
                <div className="flex flex-col bg-bg-dark h-screen overflow-hidden text-ink border-4 border-gray-900 shadow-2xl">
    
                    <TopBar
                        sessions={sessions}
                        activeSession={semesterCourse}
                        onSelectSession={async (session) => {
                            /*
                             * Session switching is a workbook operation.
                             *
                             * persistSession() updates the workbook's activeSheetId,
                             * saves locally immediately, and syncs to the cloud when
                             * authenticated.
                             */
                            const savedSession =
                                await persistSession(session);
                        
                            const activeSession =
                                savedSession || session;
                        
                            setSemesterCourse(
                                activeSession
                            );
                        
                            setActiveSessionId(
                                activeSession.id ||
                                sessionIdentityKey(activeSession)
                            );

                            // Sync Identity Panel with the newly created session
                            setStudentInfo(prev => ({
                                ...prev,
                                courseCode: activeSession.courseCode || '',
                                program: activeSession.program || prev.program,
                                year: activeSession.year || '',
                                semester: activeSession.semester || '',
                                academicYear: activeSession.academicYear || '',
                            }));
                        
                            setStudentInfo(prev => ({
                                ...prev,
                        
                                courseCode:
                                    activeSession.courseCode ||
                                    prev.courseCode,
                        
                                year:
                                    activeSession.year ||
                                    prev.year,
                        
                                semester:
                                    activeSession.semester ||
                                    prev.semester,
                        
                                program:
                                    activeSession.program ||
                                    prev.program,
                            }));
                        
                            /*
                             * Switching courses must not carry the previous
                             * student's grading result into the new session.
                             */
                            setResult(null);
                            setExaminerRemarks('');
                            setHasUnsavedResult(false);
                            setPendingHistoryRecord(null);
                            setHistorySaveState('idle');
                        
                            setActiveView('grade');
                        }}
                        onLoadSessionFromFile={() =>
                            setShowOldSessionModal(
                                true
                            )
                        }
                        onNew={handleNew}
                        onSave={handleSave}
                        onPrint={handlePrint}
                        onClearResult={() =>
                            setResult(null)
                        }
                        onRefresh={() =>
                            setShowRefresh(true)
                        }
                        onSettings={() =>
                            setShowSettings(true)
                        }
                        onBatch={() => {
                            if (!user) {
                                setShowAuth(
                                    true
                                );
                                return;
                            }
    
                            setShowBatch(
                                true
                            );
                        }}
                        hasResult={!!result}
                        studentInfo={
                            studentInfo
                        }
                        onStudentInfoUpdate={(
                            updates
                        ) =>
                            setStudentInfo(
                                prev => ({
                                    ...prev,
                                    ...updates
                                })
                            )
                        }
                        history={history}
                        onShowOldSessions={() =>
                            setShowOldSessionModal(
                                true
                            )
                        }
                        onSearchTermChange={
                            handleSearchTermChange
                        }
                        onNewCourse={() =>
                            setShowNewCourseModal(
                                true
                            )
                        }
                        onNewSession={() =>
                            setShowNewSessionModal(
                                true
                            )
                        }
                        onNewPaper={
                            handleNewPaper
                        }
                        onToggleYaza={() =>
                            setShowYaza(
                                v => !v
                            )
                        }
                        isYazaOpen={
                            showYaza
                        }
                        isLoggedIn={
                            !!user
                        }
                        onLogin={() =>
                            setShowAuth(
                                true
                            )
                        }
                        onLogout={
                            handleLogout
                        }
                        onViewChange={
                            setActiveView
                        }
                        onProfile={() => {
                            if (!user) {
                                setShowAuth(
                                    true
                                );
                            }
                            else {
                                setShowProfile(
                                    true
                                );
                            }
                        }}
                        onLoadRecord={
                            handleLoadRecord
                        }
                    />
    
                    {user &&
                        activeView ===
                            'dashboard' && (
                        <div className="px-4 py-2 border-b">
                        </div>
                    )}
    
            <div className="flex-1 flex min-w-0 overflow-hidden">
            
                <Sidebar
                    activeView={activeView}
                    onViewChange={handleViewChange}
                    onSave={handleSave}
                    onHelp={() => setShowHelp(true)}
                    hasResult={!!result}
                    user={user}
                    isAutoMode={isAutoMode}
                    onProfile={() => {
                        if (!user) {
                            setShowAuth(true);
                        } else {
                            setShowProfile(true);
                        }
                    }}
                    onAutoModeToggle={() =>
                        setIsAutoMode(v => !v)
                    }
                />
            
                <main className="flex-1 flex overflow-hidden">
            
                    {activeView === 'dashboard' ? (
            
                        <PostsPage
                            history={history}
                            onGrade={() => {
                            handleViewChange('grade');
                            }}
                        />
            
                    ) : activeView === 'history' ? (
            
                        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                            <HistoryPanel
                                history={history}
                                onLoad={handleLoadRecord}
                                onDelete={handleDeleteRecord}
                                sessions={sessions}
                                onLoadSession={loadOldSemester}
                                onSessionsChanged={setSessions}
                            />
                        </div>
            
                    ) : activeView === 'remark' ? (
            
                        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                            <RemarkPanel
                                remarks={examinerRemarks}
                                onChange={setExaminerRemarks}
                                onSave={handleSaveRemarks}
                                studentName={studentInfo.name}
                            />
                        </div>
            
                    ) : (
            
                        <>
                            <div
                                className={`${
                                    isMaximized
                                        ? 'flex-1 p-0'
                                        : 'flex-[3] p-4'
                                } flex flex-col gap-4 overflow-hidden`}
                            >
            
                                {semesterCourse && !isMaximized && showSessionStatus && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-accent-blue/5 border border-accent-blue/20 rounded-xl shrink-0">
            
                                        <CloudSaveStatus
                                            state={sessionSaveState}
                                            onRetry={() => {
                                                if (semesterCourse) {
                                                    persistSession(semesterCourse);
                                                }
                                            }}
                                            onDismiss={() => {
                                                setShowSessionStatus(false);
                                            }}
                                            label="Session"
                                        />
            
                                        <div className="w-1.5 h-4 bg-accent-blue rounded-full" />
            
                                        <span className="text-[10px] font-black text-accent-blue uppercase tracking-wider">
                                            Session: {
                                                semesterCourse.customName ||
                                                semesterCourse.sessionLabel ||
                                                semesterCourse.semester ||
                                                'Session'
                                            }
                                        </span>
            
                                        <span className="text-[10px] text-gray-500">
                                            • Course: {semesterCourse.courseCode}
                                        </span>
            
                                        {sessionSaveState === 'saving' && (
                                            <span className="text-[9px] text-gray-500">
                                                Saving…
                                            </span>
                                        )}
            
                                        <button
                                            onClick={async () => {
                                                /*
                                                 * Clearing the active session must NOT
                                                 * delete the workbook or any worksheets.
                                                 *
                                                 * We only remove the active worksheet
                                                 * selection.
                                                 */
                                                const currentWorkbook =
                                                    workbook;
            
                                                if (!currentWorkbook) {
                                                    setSemesterCourse(null);
                                                    setActiveSessionId(null);
            
                                                    localStorage.removeItem(
                                                        'yaza_active_session_id'
                                                    );
            
                                                    return;
                                                }
            
                                                const clearedWorkbook: RedPenWorkbook = {
                                                    ...currentWorkbook,
                                                    activeSheetId: null,
                                                    updatedAt:
                                                        new Date().toISOString(),
                                                };
            
                                                const locallySaved =
                                                    writeLocalWorkbook(
                                                        clearedWorkbook
                                                    );
            
                                                setWorkbook(
                                                    locallySaved
                                                );
            
                                                setSemesterCourse(
                                                    null
                                                );
            
                                                setActiveSessionId(
                                                    null
                                                );
            
                                                localStorage.removeItem(
                                                    'yaza_active_session_id'
                                                );
            
                                                /*
                                                 * Keep cloud state in sync when logged in.
                                                 * A cloud failure must not destroy the
                                                 * locally saved workbook.
                                                 */
                                                if (!token) {
                                                    setSessionSaveState(
                                                        'saved'
                                                    );
                                                    return;
                                                }
            
                                                setSessionSaveState(
                                                    'saving'
                                                );
            
                                                try {
                                                    const response =
                                                        await saveCloudWorkbook(
                                                            token,
                                                            locallySaved
                                                        );
            
                                                    const savedWorkbook =
                                                        response.workbook;
            
                                                    setWorkbook(
                                                        savedWorkbook
                                                    );
            
                                                    setSessions(
                                                        savedWorkbook.sheets.map(
                                                            sheet =>
                                                                normalizeSession(
                                                                    sheet.course
                                                                )
                                                        )
                                                    );
            
                                                    setSessionSaveState(
                                                        'saved'
                                                    );
                                                }
                                                catch (error) {
                                                    console.error(
                                                        'Failed to clear active session:',
                                                        error
                                                    );
            
                                                    setSessionSaveState(
                                                        'error'
                                                    );
                                                }
                                            }}
                                            className="ml-auto text-[9px] text-gray-600 hover:text-gray-400 uppercase font-bold tracking-wider transition-colors"
                                        >
                                            Clear
                                        </button>
            
                                    </div>
                                )}
            
                                {!isMaximized && (
                                    <div className="flex gap-4 min-h-[180px]">
            
                                        <div className="w-[35%] shrink-0">
                                            <UploadZone
                                                ref={schemeRef}
                                                label="Marking Scheme"
                                                hasFile={!!markingScheme}
                                                onUpload={(base64, name) =>
                                                    setMarkingScheme({
                                                        base64,
                                                        name
                                                    })
                                                }
                                                fileName={markingScheme?.name}
                                                description="Upload Reference"
                                                variant="compact"
                                                optional
                                                onZoneClick={() =>
                                                    openUploadModal('scheme')
                                                }
                                            />
                                        </div>
            
                                        <div className="flex-1">
                                            <StudentForm
                                                info={studentInfo}
                                                onChange={(nextInfo) => {
                                                    const sessionChanged =
                                                        nextInfo.courseCode !==
                                                            studentInfo.courseCode ||
                                                        nextInfo.year !==
                                                            studentInfo.year ||
                                                        nextInfo.semester !==
                                                            studentInfo.semester ||
                                                        nextInfo.academicYear !==
                                                            studentInfo.academicYear;
            
                                                    if (
                                                        sessionChanged &&
                                                        hasUnsavedResult
                                                    ) {
                                                        /*
                                                         * StudentForm owns the
                                                         * confirmation flow for
                                                         * course/semester/workbook
                                                         * changes.
                                                         *
                                                         * Once confirmed, the current
                                                         * result is considered detached
                                                         * from the new session.
                                                         */
                                                        setHasUnsavedResult(
                                                            false
                                                        );
                                                    }
            
                                                    setStudentInfo(
                                                        nextInfo
                                                    );
                                                }}
                                                courses={courses}
                                                hasUnsavedResult={
                                                    hasUnsavedResult
                                                }
                                                onNewCourse={() =>
                                                    setShowNewCourseModal(
                                                        true
                                                    )
                                                }
                                            />
                                        </div>
            
                                    </div>
                                )}
            
                                <div className="flex-1 flex flex-col min-h-0 bg-card rounded-3xl border border-gray-800 shadow-xl relative overflow-hidden">
            
                                    <div className="h-10 border-b border-gray-800/50 flex items-center justify-between px-4 bg-sidebar/20">
            
                                        <div className="flex gap-0.5">
            
                                            <button
                                                onClick={() =>
                                                    setActiveTool(
                                                        activeTool === 'pan'
                                                            ? null
                                                            : 'pan'
                                                    )
                                                }
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                                                    activeTool === 'pan'
                                                        ? 'bg-accent-blue/20 text-accent-blue'
                                                        : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                }`}
                                            >
                                                <Hand size={14} />
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Pan
                                                </span>
                                            </button>
            
                                            <button
                                                onClick={() =>
                                                    setActiveTool(
                                                        activeTool === 'pen'
                                                            ? null
                                                            : 'pen'
                                                    )
                                                }
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                                                    activeTool === 'pen'
                                                        ? 'bg-accent-blue/20 text-accent-blue'
                                                        : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                }`}
                                            >
                                                <PenIcon size={14} />
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Pen
                                                </span>
                                            </button>
            
                                            <button
                                                onClick={() =>
                                                    setActiveTool(
                                                        activeTool === 'text'
                                                            ? null
                                                            : 'text'
                                                    )
                                                }
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                                                    activeTool === 'text'
                                                        ? 'bg-accent-blue/20 text-accent-blue'
                                                        : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                }`}
                                            >
                                                <Type size={14} />
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Text
                                                </span>
                                            </button>
            
                                            <button
                                                onClick={() =>
                                                    setActiveTool(
                                                        activeTool === 'shape'
                                                            ? null
                                                            : 'shape'
                                                    )
                                                }
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                                                    activeTool === 'shape'
                                                        ? 'bg-accent-blue/20 text-accent-blue'
                                                        : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                }`}
                                            >
                                                <Square size={14} />
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Shape
                                                </span>
                                            </button>
            
                                            <button
                                                onClick={() =>
                                                    setActiveTool(
                                                        activeTool === 'clear'
                                                            ? null
                                                            : 'clear'
                                                    )
                                                }
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                                                    activeTool === 'clear'
                                                        ? 'bg-red-500/20 text-red-400'
                                                        : 'text-gray-500 hover:bg-red-800/30 hover:text-red-400'
                                                }`}
                                            >
                                                <Eraser size={14} />
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Clear (click to erase)
                                                </span>
                                            </button>
            
                                            <div className="w-px h-5 bg-gray-800/50 mx-1 self-center" />
            
                                            <button
                                                onClick={() =>
                                                    setActiveTool(
                                                        activeTool === 'mark-right'
                                                            ? null
                                                            : 'mark-right'
                                                    )
                                                }
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                                                    activeTool === 'mark-right'
                                                        ? 'bg-accent-green/20 text-accent-green'
                                                        : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                }`}
                                            >
                                                <Check size={14} />
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Right Mark
                                                </span>
                                            </button>
            
                                            <button
                                                onClick={() =>
                                                    setActiveTool(
                                                        activeTool === 'mark-wrong'
                                                            ? null
                                                            : 'mark-wrong'
                                                    )
                                                }
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                                                    activeTool === 'mark-wrong'
                                                        ? 'bg-red-500/20 text-red-400'
                                                        : 'text-gray-500 hover:bg-red-800/30 hover:text-red-400'
                                                }`}
                                            >
                                                <X size={14} />
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Wrong Mark
                                                </span>
                                            </button>
            
                                            <div className="w-px h-5 bg-gray-800/50 mx-1 self-center" />
            
                                            <button
                                                onClick={() =>
                                                    paperCanvasRef.current?.undo()
                                                }
                                                className="relative w-8 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                                            >
                                                <Undo2 size={13} />
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Undo
                                                </span>
                                            </button>
            
                                            <button
                                                onClick={() =>
                                                    paperCanvasRef.current?.redo()
                                                }
                                                className="relative w-8 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                                            >
                                                <Redo2 size={13} />
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Redo
                                                </span>
                                            </button>
            
                                            <button
                                                onClick={() =>
                                                    paperCanvasRef.current?.restart()
                                                }
                                                className="relative w-8 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                                            >
                                                <RotateCcw size={13} />
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Restart
                                                </span>
                                            </button>
            
                                        </div>
            
                                        {studentPaper && (
                                            <div className="flex items-center gap-1 border-x border-gray-800/50 px-2 mx-1">
            
                                                <span className="text-[9px] text-gray-500 font-mono mr-1 w-10 text-center">
                                                    {Math.round(zoom * 100)}%
                                                </span>
            
                                                <button
                                                    onClick={() =>
                                                        setZoom(z =>
                                                            Math.max(
                                                                0.1,
                                                                +(z - 0.1).toFixed(2)
                                                            )
                                                        )
                                                    }
                                                    className="relative w-7 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                                                >
                                                    <ZoomOut size={13} />
            
                                                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                        Zoom Out
                                                    </span>
                                                </button>
            
                                                <button
                                                    onClick={() =>
                                                        setZoom(z =>
                                                            Math.min(
                                                                5,
                                                                +(z + 0.1).toFixed(2)
                                                            )
                                                        )
                                                    }
                                                    className="relative w-7 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                                                >
                                                    <ZoomIn size={13} />
            
                                                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-20">
                                                        Zoom In
                                                    </span>
                                                </button>
            
                                                <button
                                                    onClick={() =>
                                                        setZoom(1)
                                                    }
                                                    className="relative w-7 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                                                >
                                                    <span className="text-[10px] font-bold">
                                                        1:1
                                                    </span>
            
                                                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-20">
                                                        Fit to width
                                                    </span>
                                                </button>
            
                                            </div>
                                        )}
            
                                        {!markingScheme && studentPaper && (
                                            <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                                <AlertTriangle
                                                    size={10}
                                                    className="text-yellow-500"
                                                />
            
                                                <span className="text-[9px] font-bold text-yellow-500/80">
                                                    No scheme — AI uses general criteria
                                                </span>
                                            </div>
                                        )}
            
                                        <div className="flex gap-0.5">
            
                                            {studentPaper && (
                                                <button
                                                    onClick={handleClearStudentPaper}
                                                    className="relative w-8 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-accent-blue/20 hover:text-accent-blue"
                                                >
                                                    <Trash2 size={14} />
            
                                                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                        Clear
                                                    </span>
                                                </button>
                                            )}
            
                                            <button
                                                onClick={() => {
                                                    if (
                                                        !studentPaper ||
                                                        isAutoMode
                                                    ) {
                                                        return;
                                                    }
            
                                                    handleMarkingModeChange(
                                                        markingMode === 'ai'
                                                            ? 'self'
                                                            : 'ai'
                                                    );
                                                }}
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                                                    markingMode === 'self'
                                                        ? 'bg-accent-green/20 text-accent-green'
                                                        : markingMode === 'ai'
                                                        ? 'bg-accent-blue/20 text-accent-blue'
                                                        : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                }`}
                                            >
                                                <FileCheck size={14} />
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    {markingMode === 'self'
                                                        ? 'Manual Grading'
                                                        : 'AI Grading'}
                                                </span>
                                            </button>
            
                                            <button
                                                onClick={() =>
                                                    setIsMaximized(
                                                        !isMaximized
                                                    )
                                                }
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                                                    isMaximized
                                                        ? 'bg-accent-blue/20 text-accent-blue'
                                                        : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                }`}
                                            >
                                                {isMaximized ? (
                                                    <Minimize2 size={14} />
                                                ) : (
                                                    <Maximize2 size={14} />
                                                )}
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    {isMaximized
                                                        ? 'Minimize'
                                                        : 'Maximize'}
                                                </span>
                                            </button>
            
                                            <button
                                                onClick={() =>
                                                    setShowToolOptions(
                                                        !showToolOptions
                                                    )
                                                }
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                                                    showToolOptions
                                                        ? 'bg-accent-blue/20 text-accent-blue'
                                                        : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                }`}
                                            >
                                                {showToolOptions ? (
                                                    <ChevronLeft size={14} />
                                                ) : (
                                                    <ChevronRight size={14} />
                                                )}
            
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    {showToolOptions
                                                        ? 'Hide Options'
                                                        : 'Show Options'}
                                                </span>
                                            </button>
            
                                        </div>
                                    </div>
            
                                    {showToolOptions &&
                                        activeTool &&
                                        (
                                            activeTool === 'pen' ||
                                            activeTool === 'shape' ||
                                            activeTool === 'text' ||
                                            activeTool === 'mark' ||
                                            activeTool === 'mark-right' ||
                                            activeTool === 'mark-wrong'
                                        ) && (
                                            <div className="absolute top-10 left-0 right-0 z-10 px-4 py-3 bg-card border-b border-gray-800/50 bg-sidebar/10 transition-all">
            
                                                <ToolOptionsBar
                                                    activeTool={activeTool}
                                                    penColor={penColor}
                                                    penSize={penSize}
                                                    shapeColor={shapeColor}
                                                    shapeSize={shapeSize}
                                                    shapeType={shapeType}
                                                    textColor={textColor}
                                                    textSize={textSize}
                                                    textFont={textFont}
                                                    markingMode={
                                                        markingModeSetting
                                                    }
                                                    markSize={markSize}
                                                    markThickness={
                                                        markThickness
                                                    }
                                                    onPenColorChange={
                                                        setPenColor
                                                    }
                                                    onPenSizeChange={
                                                        setPenSize
                                                    }
                                                    onShapeColorChange={
                                                        setShapeColor
                                                    }
                                                    onShapeSizeChange={
                                                        setShapeSize
                                                    }
                                                    onShapeTypeChange={
                                                        setShapeType
                                                    }
                                                    onTextColorChange={
                                                        setTextColor
                                                    }
                                                    onTextSizeChange={
                                                        setTextSize
                                                    }
                                                    onTextFontChange={
                                                        setTextFont
                                                    }
                                                    onMarkingModeChange={
                                                        setMarkingModeSetting
                                                    }
                                                    onMarkSizeChange={
                                                        setMarkSize
                                                    }
                                                    onMarkThicknessChange={
                                                        setMarkThickness
                                                    }
                                                    onInteraction={
                                                        handleToolOptionInteraction
                                                    }
                                                />
            
                                            </div>
                                        )}
            
                                    <div className="flex-1 p-4 flex flex-col transition-all overflow-hidden">
            
                                        {studentPaper ? (
            
                                            <PaperCanvas
                                                ref={paperCanvasRef}
                                                paperBase64={
                                                    studentPaper.base64
                                                }
                                                activeTool={
                                                    activeTool
                                                }
                                                clearCount={
                                                    clearCount
                                                }
                                                showOverlay={
                                                    markingMode === 'ai' ||
                                                    markingMode === 'self'
                                                }
                                                markingMode={
                                                    markingMode
                                                }
                                                zoom={zoom}
                                                onZoomChange={
                                                    setZoom
                                                }
                                                isMaximized={
                                                    isMaximized
                                                }
                                                penColor={
                                                    penColor
                                                }
                                                penSize={
                                                    penSize
                                                }
                                                shapeColor={
                                                    shapeColor
                                                }
                                                shapeSize={
                                                    shapeSize
                                                }
                                                shapeType={
                                                    shapeType
                                                }
                                                textColor={
                                                    textColor
                                                }
                                                textSize={
                                                    textSize
                                                }
                                                textFont={
                                                    textFont
                                                }
                                                markingModeSetting={
                                                    markingModeSetting
                                                }
                                                markSize={
                                                    markSize
                                                }
                                                markThickness={
                                                    markThickness
                                                }
                                            />
            
                                        ) : (
            
                                            <UploadZone
                                                ref={paperRef}
                                                label="Student Answer Paper"
                                                hasFile={
                                                    !!studentPaper
                                                }
                                                onUpload={
                                                    handlePaperUpload
                                                }
                                                fileName={
                                                    undefined
                                                }
                                                description="Large Surface for Student Paper Upload"
                                                variant="large"
                                                onZoneClick={() =>
                                                    openUploadModal(
                                                        'paper'
                                                    )
                                                }
                                            />
            
                                        )}
            
                                    </div>
            
                                    <div className="absolute bottom-6 right-6 flex flex-col gap-2 items-end">
            
                                        <motion.button
                                            whileHover={{
                                                scale: 1.1,
                                                rotate: 5
                                            }}
                                            whileTap={{
                                                scale: 0.9
                                            }}
                                            onClick={
                                                handleGrade
                                            }
                                            disabled={
                                                loading ||
                                                !studentPaper
                                            }
                                            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl text-white disabled:grayscale disabled:opacity-50 transition-colors ${
                                                !markingScheme &&
                                                studentPaper &&
                                                markingMode === 'ai'
                                                    ? 'bg-yellow-600 hover:bg-yellow-500 shadow-yellow-600/40'
                                                    : 'bg-accent-blue hover:bg-blue-600 shadow-accent-blue/40'
                                            }`}
                                        >
                                            {loading ? (
                                                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <Play
                                                    size={24}
                                                    fill="currentColor"
                                                />
                                            )}
                                        </motion.button>
            
                                    </div>
            
                                </div>
                            </div>
            
                            <div
                                className={`${
                                    isMaximized
                                        ? 'hidden'
                                        : 'w-[400px]'
                                } p-4 shrink-0 overflow-hidden`}
                            >
                                <div className="flex items-center justify-end px-2 pb-1">
            
                                    <CloudSaveStatus
                                        state={
                                            historySaveState
                                        }
                                        onRetry={
                                            retryHistorySave
                                        }
                                        label="Result"
                                    />
            
                                </div>
            
                                <ResultsPanel
                                    result={result}
                                    loading={loading}
                                    onPrint={handlePrint}
                                    onSave={handleSave}
                                    isSaving={isSaving}
                                    onResultChange={(
                                        nextResult
                                    ) => {
                                        setResult(
                                            nextResult
                                        );
            
                                        setHasUnsavedResult(
                                            true
                                        );
                                    }}
                                />
                            </div>
                        </>
                    )}
                </main>
            </div>

            {/* Old Sessions Modal */}
            {showOldSessionModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">

                    <div className="bg-card rounded-3xl border border-gray-800 shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">

                        <div className="p-6 border-b border-gray-800 bg-sidebar/50 flex items-center justify-between">

                            <h2 className="text-lg font-bold uppercase tracking-widest text-gray-400">
                                Load Session
                            </h2>

                            <button
                                onClick={() => setShowOldSessionModal(false)}
                                className="text-gray-500 hover:text-gray-300"
                            >
                                Close
                            </button>

                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">

                            <div className="relative">

                                <Search
                                    size={16}
                                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500"
                                />

                                <input
                                    type="text"
                                    placeholder="Search sessions..."
                                    value={searchTerm}
                                    onChange={(e) =>
                                        setSearchTerm(e.target.value)
                                    }
                                    className="w-full pl-10 pr-4 py-2 bg-sidebar border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-accent-blue"
                                />

                            </div>

                            {filteredSessions.length > 0 ? (
                                filteredSessions.map((session, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-gray-900/30 rounded-xl border border-gray-800 hover:bg-gray-800/50 transition-colors cursor-pointer"
                                        onClick={() =>
                                            loadOldSemester(session)
                                        }
                                    >

                                        <div className="font-bold text-ink">
                                            {session.courseCode}
                                        </div>

                                        <div className="text-sm text-gray-400">
                                            {session.courseName || 'No course name'}
                                        </div>

                                        <div className="text-xs text-gray-500 mt-1">
                                            Program: {session.program || 'N/A'} |
                                            Year: {session.year || 'N/A'}
                                        </div>

                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    No sessions found
                                </div>
                            )}

                            <div className="border-t border-gray-800 pt-4 mt-4">

                                <button
                                    onClick={handleLoadFromFile}
                                    className="w-full bg-accent-green/20 text-accent-green py-3 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-accent-green/30 transition-all flex items-center justify-center gap-2"
                                >
                                    <Upload size={16} />
                                    Load from Excel File
                                </button>

                                <p className="text-xs text-gray-500 mt-2 text-center">
                                    Select a saved grading session file (.xlsx)
                                </p>

                            </div>

                        </div>

                        <div className="p-4 border-t border-gray-800 bg-sidebar/50">

                            <button
                                onClick={() => {
                                    setModalType('new');
                                    setShowOldSessionModal(false);
                                }}
                                className="w-full bg-accent-blue text-white py-2 rounded-lg font-bold text-sm uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
                            >
                                <Plus size={16} />
                                New Session
                            </button>

                        </div>

                    </div>
                </div>
            )}

            {/* Upgrade Prompt Modal */}
            {upgradePromptMessage && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">

                    <div className="bg-card rounded-3xl border border-gray-800 shadow-xl w-full max-w-sm">

                        <div className="p-6 border-b border-gray-800 bg-sidebar/50 flex items-center gap-3">

                            <div className="w-10 h-10 bg-yellow-500/10 rounded-xl flex items-center justify-center shrink-0">

                                <AlertTriangle
                                    size={18}
                                    className="text-yellow-500"
                                />

                            </div>

                            <div>

                                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-300">
                                    Grading Limit Reached
                                </h2>

                            </div>

                        </div>

                        <div className="p-6">

                            <p className="text-[13px] text-gray-400 leading-relaxed">
                                {upgradePromptMessage}
                            </p>

                        </div>

                        <div className="p-4 border-t border-gray-800 bg-sidebar/50 flex flex-col gap-2">

                            <button
                                onClick={() => {
                                    setUpgradePromptMessage(null);
                                    handleUpgrade();
                                }}
                                className="w-full bg-yellow-600 hover:bg-yellow-500 text-white py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-all"
                            >
                                Upgrade Plan
                            </button>

                            <button
                                onClick={() => {
                                    setUpgradePromptMessage(null);
                                    setShowSettings(true);
                                }}
                                className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-all"
                            >
                                Add My Own API Key
                            </button>

                            <button
                                onClick={() =>
                                    setUpgradePromptMessage(null)
                                }
                                className="w-full text-gray-500 hover:text-gray-300 py-2 text-xs font-bold uppercase tracking-widest transition-all"
                            >
                                Cancel
                            </button>

                        </div>

                    </div>
                </div>
            )}

            {/* Payment Status Modal */}
            {paymentStatusMessage && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">

                    <div className="bg-card rounded-3xl border border-gray-800 shadow-xl w-full max-w-sm">

                        <div className="p-6 border-b border-gray-800 bg-sidebar/50">

                            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-300">
                                Payment Status
                            </h2>

                        </div>

                        <div className="p-6">

                            <p className="text-[13px] text-gray-400 leading-relaxed">
                                {paymentStatusMessage}
                            </p>

                        </div>

                        <div className="p-4 border-t border-gray-800 bg-sidebar/50">

                            <button
                                onClick={() =>
                                    setPaymentStatusMessage(null)
                                }
                                className="w-full bg-accent-blue hover:bg-blue-600 text-white py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-all"
                            >
                                OK
                            </button>

                        </div>

                    </div>
                </div>
            )}

            <AnimatePresence>

                {showHelp && (
                    <HelpModal
                        onClose={() => setShowHelp(false)}
                    />
                )}

                {showRefresh && (
                    <RefreshModal
                        onConfirm={handleRefresh}
                        onCancel={() => setShowRefresh(false)}
                    />
                )}

                {showAuth && (
                    <AuthModal
                        onClose={() => setShowAuth(false)}
                        onAuthSuccess={handleAuthSuccess}
                    />
                )}

                {showYaza && (
                    <YazaPanel
                        onClose={() => setShowYaza(false)}
                        authHeaders={authHeaders}
                        studentInfo={studentInfo}
                        result={result}
                        activeView={activeView}
                        hasStudentPaper={!!studentPaper}
                        isLoggedIn={!!user}
                        onRequireLogin={() => setShowAuth(true)}
                        sessionKey={
                            semesterCourse?.courseCode || 'general'
                        }
                        onUpdateStudentInfo={(updates) =>
                            setStudentInfo(prev => ({
                                ...prev,
                                ...updates
                            }))
                        }
                        onTriggerGrading={(mode) => {
                            setMarkingModeState(mode);

                            setTimeout(() => handleGrade(), 100);
                        }}
                        onNavigateView={setActiveView}
                        onEditResultFeedback={(feedback) =>
                            setResult(prev =>
                                prev
                                    ? { ...prev, feedback }
                                    : prev
                            )
                        }
                        onEditQuestionScore={
                            handleYazaEditQuestionScore
                        }
                        onSaveResults={handleSave}
                        onOpenSettings={() =>
                            setShowSettings(true)
                        }
                        onOpenProfile={() =>
                            setShowProfile(true)
                        }
                    />
                )}

                {showProfile && user && (
                    <ProfileModal
                        user={user}
                        onClose={() => setShowProfile(false)}
                        onLogout={handleLogout}
                        onOpenSettings={() => {
                            setShowProfile(false);
                            setShowSettings(true);
                        }}
                        onSaveProfile={handleSaveProfile}
                        onChangePassword={handleChangePassword}
                        onDeleteAccount={handleDeleteAccount}
                        onUploadAvatar={handleUploadAvatar}
                        authHeaders={authHeaders}
                    />
                )}

                {showSettings && (
                    <SettingsModal
                        user={user}
                        onClose={() => setShowSettings(false)}
                        onSaveApiKeys={handleSaveApiKeys}
                        authHeaders={authHeaders}
                    />
                )}

                {showBatch && (
                    <BatchModal
                        onClose={() => setShowBatch(false)}
                        markingScheme={markingScheme}
                        onGradeSingle={handleGradeSingle}
                        onSaveAll={handleSaveAllBatch}
                    />
                )}

                {modalType === 'new' && (
                    <NewSemesterModal
                        courses={courses}
                        onConfirm={handleNewSemesterConfirm}
                        onSkip={handleSkipSemester}
                        onCancel={closeModal}
                    />
                )}

                {modalType === 'continue' && semesterCourse && (
                    <ContinueSemesterModal
                        semesterCourse={semesterCourse}
                        uploadLabel={
                            pendingUpload === 'scheme'
                                ? 'Uploading marking scheme'
                                : 'Uploading student paper'
                        }
                        onContinue={handleContinueSemester}
                        onNewSemester={handleStartNewFromContinue}
                        onCancel={closeModal}
                    />
                )}

                {showNewCourseModal && (
                    <NewCourseModal
                        currentSemesterCourse={semesterCourse}
                        onConfirm={handleNewCourse}
                        onCancel={() =>
                            setShowNewCourseModal(false)
                        }
                    />
                )}

                {showNewSessionModal && (
                    <NewSessionModal
                        currentSemesterCourse={semesterCourse}
                        courses={courses}
                        onConfirm={handleNewSession}
                        onCancel={() =>
                            setShowNewSessionModal(false)
                        }
                    />
                )}

            </AnimatePresence>
        </div>
    );
}
