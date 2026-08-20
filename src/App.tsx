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
    appendResultToSessionExcel
} from './lib/exportUtils';
import { writeFileToFolder } from './lib/fileStorage';

const HISTORY_KEY = 'grading_history';
const AUTH_TOKEN_KEY = 'yaza_auth_token';
const SESSIONS_KEY = 'stored_sessions';
const SCHOOLS_KEY = 'stored_schools';
const DEPARTMENTS_KEY = 'stored_departments';
const COURSES_KEY = 'stored_courses';

function loadHistory(): HistoryRecord[] {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    }
    catch {
        return [];
    }
}

function saveHistory(records: HistoryRecord[]) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
}

// Session management functions
function loadSessions(): SemesterCourse[] {
    try {
        return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
    }
    catch {
        return [];
    }
}

function saveSessions(sessions: SemesterCourse[]) {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

// School management functions
function loadSchools(): string[] {
    try {
        return JSON.parse(localStorage.getItem(SCHOOLS_KEY) || '[]');
    }
    catch {
        return [];
    }
}

function saveSchools(schools: string[]) {
    localStorage.setItem(SCHOOLS_KEY, JSON.stringify(schools));
}

// Department management functions
function loadDepartments(): string[] {
    try {
        return JSON.parse(localStorage.getItem(DEPARTMENTS_KEY) || '[]');
    }
    catch {
        return [];
    }
}

function saveDepartments(departments: string[]) {
    localStorage.setItem(DEPARTMENTS_KEY, JSON.stringify(departments));
}

// Course list management functions
interface StoredCourse {
    courseCode: string;
    courseName: string;
}

function loadCourses(): StoredCourse[] {
    try {
        return JSON.parse(localStorage.getItem(COURSES_KEY) || '[]');
    }
    catch {
        return [];
    }
}

function saveCourses(courses: StoredCourse[]) {
    localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}

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

    const [history, setHistory] =
        useState<HistoryRecord[]>(loadHistory());

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
     *
     * AI mode:
     * - clears any manually-created result
     * - removes active marking tools
     * - hides tool options
     *
     * Manual mode:
     * - prepares an editable result when a student paper exists
     * - removes active tools first so the examiner can then select
     *   the appropriate manual marking tool.
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

            // AI mode should not expose manual marking tools.
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

    const [semesterCourse, setSemesterCourse] =
        useState<SemesterCourse | null>(null);

    const [pendingUpload, setPendingUpload] =
        useState<'scheme' | 'paper' | null>(null);

    const [modalType, setModalType] =
        useState<'new' | 'continue' | null>(null);

    const [showOldSessionModal, setShowOldSessionModal] =
        useState(false);

    const [showNewCourseModal, setShowNewCourseModal] =
        useState(false);

    const [showNewSessionModal, setShowNewSessionModal] =
        useState(false);

    // School and department management
    const [schools, setSchools] =
        useState<string[]>(loadSchools());

    const [departments, setDepartments] =
        useState<string[]>(loadDepartments());

    const [courses, setCourses] =
        useState<StoredCourse[]>(loadCourses());

    const [showAddSchoolModal, setShowAddSchoolModal] =
        useState(false);

    const [showAddDepartmentModal, setShowAddDepartmentModal] =
        useState(false);

    const [newSchoolName, setNewSchoolName] =
        useState('');

    const [newDepartmentName, setNewDepartmentName] =
        useState('');

    // Search functionality
    const [searchTerm, setSearchTerm] = useState('');

    // Auth state
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);

    // Only shown when a gated action is attempted.
    const [showAuth, setShowAuth] = useState(false);

    const [showProfile, setShowProfile] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showYaza, setShowYaza] = useState(false);
    const [showBatch, setShowBatch] = useState(false);

    // Auto mode
    const [isAutoMode, setIsAutoMode] = useState(false);
    const [isGradingInProgress, setIsGradingInProgress] =
        useState(false);

    const [upgradePromptMessage, setUpgradePromptMessage] =
        useState<string | null>(null);

    const [paymentStatusMessage, setPaymentStatusMessage] =
        useState<string | null>(null);

    // Auth header helper
    const authHeaders = useCallback(
        (): Record<string, string> => {
            const t = localStorage.getItem(AUTH_TOKEN_KEY);

            return t
                ? {
                    'Authorization': `Bearer ${t}`,
                    'Content-Type': 'application/json'
                }
                : {
                    'Content-Type': 'application/json'
                };
        },
        []
    );

    // Restore session by validating the stored token against the backend
    useEffect(() => {
        const storedToken =
            localStorage.getItem(AUTH_TOKEN_KEY);

        if (!storedToken) {
            return;
        }

        setToken(storedToken);

        (async () => {
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
                console.error(
                    'Failed to restore session:',
                    err
                );

                localStorage.removeItem(AUTH_TOKEN_KEY);
                setToken(null);
                setUser(null);
            }
        })();
    }, []);

    // Load grading history from the backend once authenticated
    useEffect(() => {
        if (!user || !token) return;

        (async () => {
            try {
                const res = await fetch('/api/history', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!res.ok) return;

                const data = await res.json();

                if (Array.isArray(data.history)) {
                    setHistory(data.history);
                    saveHistory(data.history);
                }
            }
            catch (err) {
                console.error(
                    'Failed to load history from server:',
                    err
                );
            }
        })();
    }, [user, token]);

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

    // Load stored sessions on mount
    useEffect(() => {
        const storedSessions = loadSessions();

        if (storedSessions.length > 0) {
            const latestSession =
                storedSessions[0];

            if (latestSession) {
                setStudentInfo(prev => ({
                    ...prev,
                    program:
                        latestSession.program ||
                        prev.program,
                    courseCode:
                        latestSession.courseCode ||
                        prev.courseCode,
                    year:
                        latestSession.year ||
                        prev.year,
                }));
            }
        }
    }, []);

    // Save schools and departments
    useEffect(() => {
        saveSchools(schools);
    }, [schools]);

    useEffect(() => {
        saveDepartments(departments);
    }, [departments]);

    const schemeRef =
        useRef<UploadZoneHandle>(null);

    const paperRef =
        useRef<UploadZoneHandle>(null);

    const paperCanvasRef =
        useRef<PaperCanvasHandle>(null);

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

        const storedSessions =
            loadSessions();

        const updatedSessions = [
            semester,
            ...storedSessions.filter(
                s =>
                    s.courseCode !==
                    semester.courseCode
            )
        ];

        saveSessions(updatedSessions);

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
     * Keeps the active session but starts
     * a fresh course context.
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

        if (!courseCode) return;

        setSemesterCourse(prev =>
            prev
                ? {
                    ...prev,
                    courseCode,
                    courseName,
                }
                : {
                    courseCode,
                    courseName,
                    program: '',
                    year: '',
                    semester: '',
                    academicYear: '',
                    sessionLabel: '',
                }
        );

        clearYazaSessionHistory(
            courseCode || 'general'
        );

        setCourses(prev => {
            const withoutDupe =
                prev.filter(
                    c =>
                        c.courseCode !==
                        courseCode
                );

            const updated = [
                {
                    courseCode,
                    courseName
                },
                ...withoutDupe,
            ];

            saveCourses(updated);
            return updated;
        });

        setStudentInfo(prev => ({
            ...prev,
            name: '',
            regNo: '',
            program: '',
            courseCode,
            examDate: '',
        }));

        setMarkingScheme(null);
        setStudentPaper(null);
        setResult(null);
        setExaminerRemarks('');

        // AI is the default for every new paper/course.
        setMarkingModeState('ai');

        setActiveTool(null);
        setShowToolOptions(false);

        setZoom(1);
        setClearCount(c => c + 1);
        setIsMaximized(false);
        setIsAutoMode(false);
        setActiveView('grade');

        setShowNewCourseModal(false);
    };

    /*
     * New Session
     *
     * Completely clears previous marking work.
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

        setSemesterCourse(newSession);

        clearYazaSessionHistory(
            newSession.courseCode ||
            'general'
        );

        const storedSessions =
            loadSessions();

        const updatedSessions = [
            newSession,
            ...storedSessions.filter(
                s =>
                    !(
                        s.courseCode ===
                            newSession.courseCode &&
                        s.academicYear ===
                            newSession.academicYear &&
                        s.semester ===
                            newSession.semester &&
                        s.sessionLabel ===
                            newSession.sessionLabel &&
                        s.customName ===
                            newSession.customName
                    )
            ),
        ];

        saveSessions(updatedSessions);

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

        // AI is the default marking method.
        setMarkingModeState('ai');

        setActiveTool(null);
        setShowToolOptions(false);

        setZoom(1);
        setClearCount(c => c + 1);
        setIsMaximized(false);
        setIsAutoMode(false);
        setActiveView('grade');

        setShowNewSessionModal(false);
    };

    /*
     * New Paper
     *
     * Keeps:
     * - session
     * - course
     * - marking scheme
     * - academic information
     *
     * Clears:
     * - student
     * - previous paper
     * - grading result
     * - annotations
     *
     * The user can then click Upload again.
     */
    const handleNewPaper = () => {
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

        // Keep the session/course/marking scheme.

        setStudentPaper(null);
        setResult(null);
        setExaminerRemarks('');

        // New paper always starts in AI mode.
        setMarkingModeState('ai');

        // Clear canvas and all manual tools.
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
     * Load a previously used semester/course.
     */
    const loadOldSemester = (
        semester: SemesterCourse
    ) => {
        setSemesterCourse(semester);

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

        // Loaded sessions use AI as the default
        // unless the user explicitly switches to manual.
        setMarkingModeState('ai');
        setActiveTool(null);
        setShowToolOptions(false);

        setShowOldSessionModal(false);
    };

    /*
     * Load a previously saved Excel session.
     *
     * IMPORTANT:
     * We intentionally do NOT pretend to parse the Excel file here.
     *
     * The picker now accepts Excel files only. The actual reconstruction
     * of session/student/result data must use the Excel structure produced
     * by exportUtils.ts.
     *
     * This prevents the old JSON-file behaviour from coming back.
     */
    const handleLoadFromFile = () => {
        const input =
            document.createElement('input');

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

            /*
             * Do not attempt JSON.parse().
             *
             * The Excel parser should be connected to the
             * existing export/session format in exportUtils.ts.
             */
            console.info(
                'Excel session selected:',
                file.name
            );

            /*
             * For now, close the session picker after a valid
             * Excel file has been selected.
             *
             * The actual XLSX -> application-state loader is
             * intentionally handled separately so we don't
             * introduce an incorrect data mapping here.
             */
            setShowOldSessionModal(false);
        };

        input.click();
    };

    // Function to add a new school
    const addNewSchool = () => {
        if (
            newSchoolName.trim() &&
            !schools.includes(
                newSchoolName.trim()
            )
        ) {
            setSchools([
                ...schools,
                newSchoolName.trim()
            ]);

            setNewSchoolName('');
            setShowAddSchoolModal(false);
        }
    };

    // Function to add a new department
    const addNewDepartment = () => {
        if (
            newDepartmentName.trim() &&
            !departments.includes(
                newDepartmentName.trim()
            )
        ) {
            setDepartments([
                ...departments,
                newDepartmentName.trim()
            ]);

            setNewDepartmentName('');
            setShowAddDepartmentModal(false);
        }
    };

    /*
     * Main grading handler.
     *
     * There is no longer an "unmarked" branch.
     */
    const handleGrade = async () => {
        if (!studentPaper) {
            alert('Please upload a student paper before grading.');
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
                        courseCode: studentInfo.courseCode || '',
                        examDate: studentInfo.examDate || ''
                    }
                });
            }
    
            return;
        }
    
        // AI grading requires authentication.
        if (!user) {
            setShowAuth(true);
            return;
        }
    
        // AI grading continues below...

        /*
         * AI grading.
         */
        if (markingMode === 'ai') {
            if (isMaximized) {
                setIsMaximized(false);
            }

            setLoading(true);

            // AI mode must not expose manual tools.
            setActiveTool(null);
            setShowToolOptions(false);

            try {
                const headers = {
                    'Authorization':
                        `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`,
                    'Content-Type':
                        'application/json'
                };

                const response = await fetch(
                    '/api/grade',
                    {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            studentInfo,
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

                /*
                 * Map API response from snake_case
                 * to frontend format.
                 */
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

                /*
                 * Validate AI result before allowing
                 * it into application state.
                 */
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
        }
    };

    /*
     * Grade using an explicitly selected mode.
     *
     * Batch + Auto functionality is intentionally left unchanged.
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

        setIsGradingInProgress(true);

        /*
         * Explicitly set the selected mode.
         * There is no unmarked state.
         */
        setMarkingModeState(mode);

        /*
         * AI mode immediately removes manual tools.
         */
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

        /*
         * The remainder of the original
         * handleGradeWithMode implementation
         * should continue below this point.
         */
        
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
                        name: studentInfo.name || '',
                        regNo: studentInfo.regNo || '',
                        program: studentInfo.program || '',
                        year: studentInfo.year || '',
                        courseCode: studentInfo.courseCode || '',
                        examDate: studentInfo.examDate || ''
                    }
                });
        
                setIsGradingInProgress(false);
                return;
            }
        
            setLoading(true);
        
            try {
                const response = await fetch('/api/grade', {
                    method: 'POST',
                    headers: {
                        'Authorization':
                            `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        studentInfo,
                        markingScheme: markingScheme?.base64 ?? null,
                        studentPaper: studentPaper.base64
                    })
                });
        
                const data = await response.json().catch(() => ({}));
        
                if (!response.ok) {
                    if (response.status === 401) {
                        setShowAuth(true);
                        throw new Error(
                            'Authentication required. Please sign in.'
                        );
                    }
        
                    if (
                        response.status === 403 &&
                        data.code === 'LIMIT_REACHED'
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
        
                const gradingResult: ApiGradingResult = data;
        
                if (gradingResult.error) {
                    throw new Error(
                        gradingResult.message || 'Grading failed'
                    );
                }
        
                const mappedResult: GradingResult = {
                    totalScore:
                        gradingResult.total_score ||
                        gradingResult.totalScore,
                    score: gradingResult.score,
                    percentage: gradingResult.percentage,
                    grade: gradingResult.grade,
                    feedback: gradingResult.feedback || '',
                    questions: gradingResult.questions || [],
                    extracted_info:
                        gradingResult.extracted_info || undefined,
                };
        
                // Validate and normalize AI output before saving it into state.
                const validatedResult =
                    validateAndNormalizeResult(mappedResult);
        
                if (!validatedResult) {
                    throw new Error(
                        'The grading service returned an invalid result. Please try grading again.'
                    );
                }
        
                setResult(validatedResult);
                setActiveView('grade');
        
                setUser(prev =>
                    prev
                        ? {
                            ...prev,
                            gradingCount: prev.gradingCount + 1
                        }
                        : prev
                );
        
                if (validatedResult.extracted_info) {
                    setStudentInfo(prev => ({
                        ...prev,
                        name:
                            validatedResult.extracted_info?.name ||
                            prev.name,
                        program:
                            validatedResult.extracted_info?.program ||
                            prev.program,
                        regNo:
                            validatedResult.extracted_info?.regNo ||
                            prev.regNo,
                        year:
                            validatedResult.extracted_info?.year ||
                            prev.year,
                        courseCode:
                            validatedResult.extracted_info?.courseCode ||
                            prev.courseCode,
                        examDate:
                            validatedResult.extracted_info?.examDate ||
                            prev.examDate,
                    }));
                }
            }
            catch (error) {
                console.error('Grading failed:', error);
        
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
            if (isAutoMode && studentPaper && user) {
                setMarkingModeState('ai');
        
                const timer = setTimeout(() => {
                    handleGrade().catch(err => {
                        console.error('Auto-grade failed:', err);
                        setIsAutoMode(false);
                    });
                }, 200);
        
                return () => clearTimeout(timer);
            }
        }, [isAutoMode, studentPaper, user]);
        
        const [isSaving, setIsSaving] = useState(false);
        
        const handleSave = async (
            resultToSave?: GradingResult
        ) => {
            const currentResult = resultToSave || result;
        
            if (!currentResult) {
                alert(
                    'No grading result to save. Grade a paper first.'
                );
                return;
            }
        
            const hasQuestions =
                Array.isArray(currentResult.questions) &&
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
        
                if (incompleteQuestions.length > 0) {
                    alert(
                        'Cannot save this result. All question scores must be completed with valid scores such as 5/10.'
                    );
                    return;
                }
            }
        
            const missingResultFields = [
                !currentResult.totalScore && 'Total Score',
                !currentResult.percentage && 'Percentage',
                !currentResult.grade && 'Grade',
            ].filter(Boolean);
        
            if (missingResultFields.length > 0) {
                alert(
                    `Cannot save an incomplete result. Missing: ${missingResultFields.join(', ')}.`
                );
                return;
            }
        
            // Check if required student information is missing.
            const requiredFields = [
                'name',
                'regNo',
                'courseCode',
                'program'
            ];
        
            const missingFields = requiredFields.filter(
                field =>
                    !studentInfo[
                        field as keyof StudentInfo
                    ]
            );
        
            if (missingFields.length > 0) {
                const missingFieldNames = missingFields
                    .map(field =>
                        field === 'regNo'
                            ? 'Registration Number'
                            : field === 'courseCode'
                                ? 'Course Code'
                                : field === 'program'
                                    ? 'Program of Study'
                                    : field.charAt(0).toUpperCase() +
                                      field.slice(1)
                    )
                    .join(', ');
        
                const userConfirmed = confirm(
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
        
            try {
                const record: HistoryRecord = {
                    id: Date.now().toString(),
                    date: new Date().toISOString(),
                    studentInfo,
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
        
                const updated = [
                    record,
                    ...history
                ].slice(0, 50);
        
                setHistory(updated);
                saveHistory(updated);
        
                // Sync to backend so history persists across devices.
                fetch('/api/history', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        studentInfo: record.studentInfo,
                        result: record.result
                    })
                }).catch(err =>
                    console.error(
                        'Failed to sync history to server:',
                        err
                    )
                );
        
                // Generate the marked-paper PDF and append the result
                // to the session Excel workbook.
                try {
                    const folder = await getSavedFolder();
                    const paperImage =
                        paperCanvasRef.current?.captureFullPaper();
        
                    if (paperImage) {
                        const pdfBlob =
                            await buildPaperPdfBlob(paperImage);
        
                        const pdfFilename =
                            buildPaperPdfFilename(studentInfo);
        
                        await writeFileToFolder(
                            folder,
                            pdfFilename,
                            pdfBlob
                        );
                    }
        
                    const workbookKey = {
                        academicYear:
                            semesterCourse?.academicYear || '',
                        semester:
                            semesterCourse?.semester ||
                            studentInfo.semester ||
                            '',
                        sessionLabel:
                            semesterCourse?.sessionLabel || '',
                        customName:
                            semesterCourse?.customName || '',
                    };
        
                    const courseSheetKey =
                        semesterCourse?.courseCode ||
                        studentInfo.courseCode ||
                        'general';
        
                    await appendResultToSessionExcel(
                        folder,
                        workbookKey,
                        courseSheetKey,
                        studentInfo,
                        currentResult
                    );
                }
                catch (exportError) {
                    console.error(
                        'Failed to export PDF/Excel:',
                        exportError
                    );
        
                    alert(
                        'Saved to history, but exporting the PDF/Excel file failed. Check the console for details.'
                    );
                }
            }
            finally {
                setIsSaving(false);
            }
        };
        
        const handleLoadRecord = (
            record: HistoryRecord
        ) => {
            setStudentInfo(record.studentInfo);
            setResult(record.result);
            setMarkingModeState('self');
            setActiveView('grade');
        };
        
        const handleDeleteRecord = (
            id: string
        ) => {
            const updated = history.filter(
                r => r.id !== id
            );
        
            setHistory(updated);
            saveHistory(updated);
        };
        
        const handleSaveRemarks = () => {
            if (examinerRemarks.trim()) {
                alert(
                    "Remarks saved. Use 'Save Results' to include them in the export."
                );
            }
        
            setActiveView('dashboard');
        };
        
        const handleNew = () => {
            if (result || markingScheme || studentPaper) {
                if (
                    !window.confirm(
                        'Start a new semester? Current work will be cleared.'
                    )
                ) {
                    return;
                }
            }
        
            clearYazaSessionHistory('general');
        
            setStudentInfo({
                name: '',
                regNo: '',
                program: '',
                year: '',
                semester: '',
                courseCode: '',
                examDate: ''
            });
        
            setMarkingScheme(null);
            setStudentPaper(null);
            setResult(null);
            setExaminerRemarks('');
            setSemesterCourse(null);
            setActiveView('dashboard');
            setMarkingModeState('ai');
            setActiveTool(null);
            setShowToolOptions(false);
            setZoom(1);
            setClearCount(c => c + 1);
            setIsMaximized(false);
            setIsAutoMode(false);
        };
        
        const handleRefresh = () => {
            setStudentInfo({
                name: '',
                regNo: '',
                program: '',
                year: '',
                semester: '',
                courseCode: '',
                examDate: ''
            });
        
            setMarkingScheme(null);
            setStudentPaper(null);
            setResult(null);
            setExaminerRemarks('');
            setSemesterCourse(null);
            setActiveView('dashboard');
            setMarkingModeState('ai');
            setClearCount(c => c + 1);
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
            localStorage.removeItem(AUTH_TOKEN_KEY);
            setToken(null);
            setUser(null);
            setShowProfile(false);
        
            // No forced re-login — user drops back to guest browsing.
        };
        
        // Settings handlers
        const handleYazaEditQuestionScore = (
            questionNumber: number,
            score?: string,
            feedback?: string
        ) => {
            setResult(prev => {
                if (!prev) return prev;
        
                const questions =
                    (prev.questions || []).map(q =>
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
        };
        
        // Profile handlers (institution/role)
        const handleSaveProfile = async (
            institution: string,
            role: string
        ) => {
            if (!user) return;
        
            const res = await fetch(
                '/api/settings/profile',
                {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        institution,
                        role
                    }),
                }
            );
        
            if (!res.ok) {
                const data =
                    await res.json().catch(() => ({}));
        
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
                const reader = new FileReader();
        
                reader.onload = async () => {
                    try {
                        const base64 =
                            reader.result as string;
        
                        const res = await fetch(
                            '/api/settings/avatar',
                            {
                                method: 'POST',
                                headers: authHeaders(),
                                body: JSON.stringify({
                                    imageBase64: base64,
                                    filename: file.name,
                                    mimeType: file.type,
                                }),
                            }
                        );
        
                        const data =
                            await res.json().catch(() => ({}));
        
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
                const res = await fetch(
                    '/api/auth/change-password',
                    {
                        method: 'POST',
                        headers: authHeaders(),
                        body: JSON.stringify({
                            currentPassword,
                            newPassword
                        }),
                    }
                );
        
                const data =
                    await res.json().catch(() => ({}));
        
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
                const res = await fetch(
                    '/api/auth/delete-account',
                    {
                        method: 'POST',
                        headers: authHeaders(),
                        body: JSON.stringify({
                            password
                        }),
                    }
                );
        
                const data =
                    await res.json().catch(() => ({}));
        
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
        
            const response = await fetch(
                '/api/grade',
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                }
            );
        
            if (response.status === 401) {
                throw new Error(
                    'Authentication required'
                );
            }
        
            if (response.status === 403) {
                const data =
                    await response.json().catch(() => ({}));
        
                throw new Error(
                    data.message ||
                    'Access denied'
                );
            }
        
            if (!response.ok) {
                const data =
                    await response.json().catch(() => ({}));
        
                throw new Error(
                    data.message ||
                    `Grading request failed (${response.status})`
                );
            }
        
            const apiResult: ApiGradingResult =
                await response.json();
        
            if (apiResult.error) {
                throw new Error(
                    apiResult.message ||
                    'Grading failed'
                );
            }
        
            const mappedResult: GradingResult = {
                totalScore:
                    apiResult.total_score ||
                    apiResult.totalScore,
                score: apiResult.score,
                percentage: apiResult.percentage,
                grade: apiResult.grade,
                feedback: apiResult.feedback || '',
                questions:
                    apiResult.questions || [],
                extracted_info:
                    apiResult.extracted_info ||
                    undefined,
            };
        
            const validatedResult =
                validateAndNormalizeResult(mappedResult);
        
            if (!validatedResult) {
                throw new Error(
                    'The grading service returned an invalid result.'
                );
            }
        
            return validatedResult;
        };
        
        const handleSaveAllBatch = (
            results: {
                file: any;
                result: GradingResult
            }[]
        ) => {
            const records: HistoryRecord[] =
                results.map(
                    ({ file, result }, idx) => ({
                        id:
                            Date.now().toString() +
                            '_' +
                            idx +
                            '_' +
                            Math.random()
                                .toString(36)
                                .substr(2, 9),
        
                        date:
                            new Date().toISOString(),
        
                        studentInfo: {
                            ...studentInfo,
                            name:
                                result.extracted_info?.name ||
                                studentInfo.name ||
                                file.name,
        
                            regNo:
                                result.extracted_info?.regNo ||
                                studentInfo.regNo,
                        },
        
                        result,
                    })
                );
        
            const updated = [
                ...records,
                ...history
            ].slice(0, 50);
        
            setHistory(updated);
            saveHistory(updated);
        
            // Sync each record to the backend so history
            // persists across devices.
            records.forEach(record => {
                fetch('/api/history', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        studentInfo:
                            record.studentInfo,
                        result: record.result
                    })
                }).catch(err =>
                    console.error(
                        'Failed to sync history to server:',
                        err
                    )
                );
            });
        
            alert(
                `Saved ${records.length} grading results to history!`
            );
        
            setShowBatch(false);
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

    // Handle paper upload.
    //
    // IMPORTANT:
    // Uploading a paper must NOT automatically select Manual Marking.
    // The user must explicitly choose a grading method through the
    // "Choose Grading Method" flow.
    //
    // This also prevents the paper from appearing as already marked.
    const handlePaperUpload = useCallback(
        (base64: string, name: string) => {
            setStudentPaper({
                base64,
                name
            });
    
            // A newly uploaded paper has no grading method selected yet.
            // The user will choose AI or Manual when they click Grade.
            setMarkingModeState('ai')
    
            // Clear any previous result belonging to another paper.
            setResult(null);
    
            // Clear previous examiner remarks.
            setExaminerRemarks('');
    
            // Reset marking tools for the new paper.
            setActiveTool(null);
            setShowToolOptions(false);
    
            // Reset canvas view.
            setZoom(1);
            setClearCount(c => c + 1);
    
            // Make sure the grading view is active.
            setActiveView('grade');
        },
        []
    );
    
    // Filter sessions based on search term.
    const filteredSessions = loadSessions().filter(session =>
        searchTerm === '' ||
        session.courseCode
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
        session.courseName
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
        session.program
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase())
    );
    
    // Filter departments based on search term.
    const filteredDepartments = departments.filter(dept =>
        searchTerm === '' ||
        dept.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Handle search term changes from TopBar.
    const handleSearchTermChange = (term: string) => {
        setSearchTerm(term);
    };
    
    return (
        <div className="flex flex-col bg-bg-dark h-screen overflow-hidden text-ink border-4 border-gray-900 shadow-2xl">
    
            <TopBar
                onNew={handleNew}
                onSave={handleSave}
                onPrint={handlePrint}
                onClearResult={() => setResult(null)}
                onRefresh={() => setShowRefresh(true)}
                onSettings={() => setShowSettings(true)}
                onBatch={() => {
                    if (!user) {
                        setShowAuth(true);
                        return;
                    }
    
                    setShowBatch(true);
                }}
                hasResult={!!result}
                studentInfo={studentInfo}
                onStudentInfoUpdate={(updates) =>
                    setStudentInfo(prev => ({
                        ...prev,
                        ...updates
                    }))
                }
                history={history}
                onShowOldSessions={() =>
                    setShowOldSessionModal(true)
                }
                schools={schools}
                departments={departments}
                courses={courses}
                onShowAddSchool={() =>
                    setShowAddSchoolModal(true)
                }
                onShowAddDepartment={() =>
                    setShowAddDepartmentModal(true)
                }
                onSearchTermChange={handleSearchTermChange}
                onNewCourse={() =>
                    setShowNewCourseModal(true)
                }
                onNewSession={() =>
                    setShowNewSessionModal(true)
                }
                onNewPaper={handleNewPaper}
                onToggleYaza={() =>
                    setShowYaza(v => !v)
                }
                isYazaOpen={showYaza}
                isLoggedIn={!!user}
                onLogin={() =>
                    setShowAuth(true)
                }
                onLogout={handleLogout}
                onViewChange={setActiveView}
                onProfile={() => {
                    if (!user) {
                        setShowAuth(true);
                    } else {
                        setShowProfile(true);
                    }
                }}
                onLoadRecord={handleLoadRecord}
            />
    
            <div className="flex-1 flex min-w-0 overflow-hidden">
    
                <Sidebar
                    activeView={activeView}
                    onViewChange={setActiveView}
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
                                if (!user) {
                                    setShowAuth(true);
                                    return;
                                }
    
                                setActiveView('grade');
                            }}
                        />
    
                    ) : activeView === 'history' ? (
    
                        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                            <HistoryPanel
                                history={history}
                                onLoad={handleLoadRecord}
                                onDelete={handleDeleteRecord}
                                sessions={loadSessions()}
                                onLoadSession={loadOldSemester}
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
    
                                {semesterCourse && !isMaximized && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-accent-blue/5 border border-accent-blue/20 rounded-xl shrink-0">
    
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

                                        <button
                                            onClick={() =>
                                                setSemesterCourse(null)
                                            }
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
                                                onChange={setStudentInfo}
                                                courses={courses}
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

                                                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                        Zoom In
                                                    </span>
                                                </button>

                                                <button
                                                    onClick={() => setZoom(1)}
                                                    className="relative w-7 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                                                >
                                                    <span className="text-[10px] font-bold">
                                                        1:1
                                                    </span>

                                                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
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
                                                    onClick={() =>
                                                        openUploadModal('paper')
                                                    }
                                                    className="relative w-8 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-accent-blue/20 hover:text-accent-blue"
                                                >
                                                    <Upload size={14} />

                                                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                        Change
                                                    </span>
                                                </button>
                                            )}

                                            {/* Grading method selector */}
                                            <button
                                                onClick={() => {
                                                    if (!studentPaper || isAutoMode) {
                                                        return;
                                                    }
                                            
                                                    handleMarkingModeChange(
                                                        markingMode === 'ai' ? 'self' : 'ai'
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
                                                {markingMode === 'self' ? (
                                                    <FileCheck size={14} />
                                                ) : (
                                                    <FileCheck size={14} />
                                                )}

                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    {markingMode === 'self'
                                                        ? 'Manual Grading'
                                                        : 'AI Grading'
                                                    }
                                                </span>
                                            </button>

                                            <button
                                                onClick={() =>
                                                    setIsMaximized(!isMaximized)
                                                }
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                                                    isMaximized
                                                        ? 'bg-accent-blue/20 text-accent-blue'
                                                        : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                }`}
                                            >
                                                {isMaximized
                                                    ? <Minimize2 size={14} />
                                                    : <Maximize2 size={14} />
                                                }

                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    {isMaximized
                                                        ? 'Minimize'
                                                        : 'Maximize'
                                                    }
                                                </span>
                                            </button>

                                            <button
                                                onClick={() =>
                                                    setShowToolOptions(!showToolOptions)
                                                }
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                                                    showToolOptions
                                                        ? 'bg-accent-blue/20 text-accent-blue'
                                                        : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                }`}
                                            >
                                                {showToolOptions
                                                    ? <ChevronLeft size={14} />
                                                    : <ChevronRight size={14} />
                                                }

                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    {showToolOptions
                                                        ? 'Hide Options'
                                                        : 'Show Options'
                                                    }
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
                                                    markingMode={markingModeSetting}
                                                    markSize={markSize}
                                                    markThickness={markThickness}
                                                    onPenColorChange={setPenColor}
                                                    onPenSizeChange={setPenSize}
                                                    onShapeColorChange={setShapeColor}
                                                    onShapeSizeChange={setShapeSize}
                                                    onShapeTypeChange={setShapeType}
                                                    onTextColorChange={setTextColor}
                                                    onTextSizeChange={setTextSize}
                                                    onTextFontChange={setTextFont}
                                                    onMarkingModeChange={setMarkingModeSetting}
                                                    onMarkSizeChange={setMarkSize}
                                                    onMarkThicknessChange={setMarkThickness}
                                                    onInteraction={handleToolOptionInteraction}
                                                />

                                            </div>
                                        )}

                                    <div className="flex-1 p-4 flex flex-col transition-all overflow-hidden">

                                        {studentPaper ? (
                                            <PaperCanvas
                                                ref={paperCanvasRef}
                                                paperBase64={studentPaper.base64}
                                                activeTool={activeTool}
                                                clearCount={clearCount}
                                                showOverlay={
                                                    markingMode === 'ai' ||
                                                    markingMode === 'self'
                                                }
                                                markingMode={markingMode}
                                                zoom={zoom}
                                                onZoomChange={setZoom}
                                                isMaximized={isMaximized}
                                                penColor={penColor}
                                                penSize={penSize}
                                                shapeColor={shapeColor}
                                                shapeSize={shapeSize}
                                                shapeType={shapeType}
                                                textColor={textColor}
                                                textSize={textSize}
                                                textFont={textFont}
                                                markingModeSetting={markingModeSetting}
                                                markSize={markSize}
                                                markThickness={markThickness}
                                            />
                                        ) : (
                                            <UploadZone
                                                ref={paperRef}
                                                label="Student Answer Paper"
                                                hasFile={!!studentPaper}
                                                onUpload={handlePaperUpload}
                                                fileName={undefined}
                                                description="Large Surface for Student Paper Upload"
                                                variant="large"
                                                onZoneClick={() =>
                                                    openUploadModal('paper')
                                                }
                                            />
                                        )}

                                    </div>

                                    <div className="absolute bottom-6 right-6 flex flex-col gap-2 items-end">

                                        <motion.button
                                            whileHover={{ scale: 1.1, rotate: 5 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={handleGrade}
                                            disabled={loading || !studentPaper}
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
                                <ResultsPanel
                                    result={result}
                                    loading={loading}
                                    onPrint={handlePrint}
                                    onSave={handleSave}
                                    isSaving={isSaving}
                                    onResultChange={setResult}
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
