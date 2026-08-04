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
import { SettingsModal } from './components/SettingsModal';
import { BatchModal } from './components/BatchModal';
import { PostsPage } from './components/PostsPage';
import { NewSessionModal, ContinueSessionModal, CourseSession } from './components/CourseSessionModal';
import { ToolOptionsBar } from './components/ToolOptionsBar';
import { StudentInfo, GradingResult, ApiGradingResult, HistoryRecord, ActiveView, User, AuthResponse } from './types';
import { Play, AlertTriangle, Hand, Pen as PenIcon, Type, Square, Eraser, Upload, FileCheck, FileX, Maximize2, Minimize2, ZoomIn, ZoomOut, Undo2, Redo2, RotateCcw, RotateCw, ChevronLeft, ChevronRight, Check, X, Plus, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const HISTORY_KEY = 'grading_history';
const AUTH_TOKEN_KEY = 'yaza_auth_token';
const SESSIONS_KEY = 'stored_sessions';
const SCHOOLS_KEY = 'stored_schools';
const DEPARTMENTS_KEY = 'stored_departments';

function loadHistory(): HistoryRecord[] {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch { return []; }
}

function saveHistory(records: HistoryRecord[]) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
}

// Session management functions
function loadSessions(): CourseSession[] {
    try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]'); }
    catch { return []; }
}

function saveSessions(sessions: CourseSession[]) {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

// School management functions
function loadSchools(): string[] {
    try { return JSON.parse(localStorage.getItem(SCHOOLS_KEY) || '[]'); }
    catch { return []; }
}

function saveSchools(schools: string[]) {
    localStorage.setItem(SCHOOLS_KEY, JSON.stringify(schools));
}

// Department management functions
function loadDepartments(): string[] {
    try { return JSON.parse(localStorage.getItem(DEPARTMENTS_KEY) || '[]'); }
    catch { return []; }
}

function saveDepartments(departments: string[]) {
    localStorage.setItem(DEPARTMENTS_KEY, JSON.stringify(departments));
}

// Define the default user
const DEFAULT_USER: User = {
    id: 'default-user-id',
    name: 'Inno Maweta',
    email: 'innomaweta1@gmail.com',
    tier: 'personal',
    gradingCount: 0,
    gradingLimit: 5,
    createdAt: new Date().toISOString()
};

export default function App() {
    const [studentInfo, setStudentInfo] = useState<StudentInfo>({
        name: '', regNo: '', program: '', year: '', courseCode: '', examDate: ''
    });
    const [markingScheme, setMarkingScheme] = useState<{ base64: string; name: string } | null>(null);
    const [studentPaper, setStudentPaper] = useState<{ base64: string; name: string } | null>(null);
    const [result, setResult] = useState<GradingResult | null>(null);
    const [loading, setLoading] = useState(false);

    const [activeView, setActiveView] = useState<ActiveView>('dashboard');
    const [history, setHistory] = useState<HistoryRecord[]>(loadHistory());
    const [examinerRemarks, setExaminerRemarks] = useState('');
    const [showHelp, setShowHelp] = useState(false);
    const [showRefresh, setShowRefresh] = useState(false);

    const [activeTool, setActiveTool] = useState<string | null>(null);
    // Updated viewMarked state to support three modes: self, ai, unmarked
    const [markingMode, setMarkingModeState] = useState<'self' | 'ai' | 'unmarked'>('unmarked');

    // Function to handle changing marking mode
    const handleMarkingModeChange = () => {
        // Cycle through the three marking modes: unmarked -> self -> ai -> unmarked
        if (markingMode === 'unmarked') {
            setMarkingModeState('self');
            // Initialize with placeholders for manual entry when switching to self mode
            if (studentPaper) {
                setResult({
                    score: '',
                    totalScore: '_/100',
                    percentage: '',
                    grade: '',
                    feedback: 'Manually type the recommendations of this paper here',
                    questions: [],
                    extracted_info: {
                        name: studentInfo.name || 'Enter student name',
                        regNo: studentInfo.regNo || 'Enter registration number',
                        program: studentInfo.program || 'Enter program',
                        year: studentInfo.year || 'Enter year',
                        courseCode: studentInfo.courseCode || 'Enter course code',
                        examDate: studentInfo.examDate || 'Enter exam date'
                    }
                });
            }
        } else if (markingMode === 'self') {
            setMarkingModeState('ai');
            // Clear results when switching from self to ai
            setResult(null);
        } else {
            setMarkingModeState('unmarked');
            // Clear results when switching from ai to unmarked
            setResult(null);
        }
    };
    const [isMaximized, setIsMaximized] = useState(false);
    const [clearCount, setClearCount] = useState(0);
    const [zoom, setZoom] = useState(1);

    // Tool options
    const [penColor, setPenColor] = useState('#FF0000');
    const [penSize, setPenSize] = useState(3);
    const [shapeColor, setShapeColor] = useState('#0000FF');
    const [shapeSize, setShapeSize] = useState(2);
    const [shapeType, setShapeType] = useState<'rectangle' | 'ellipse' | 'line' | 'triangle'>('rectangle');
    const [textColor, setTextColor] = useState('#000000');
    const [textSize, setTextSize] = useState(16);
    const [textFont, setTextFont] = useState('Arial');
    const [markingModeSetting, setMarkingModeSetting] = useState<'none' | 'right' | 'wrong'>('none');
    const [markSize, setMarkSize] = useState(28);
    const [markThickness, setMarkThickness] = useState(2);

    // Tool options panel visibility
    const [showToolOptions, setShowToolOptions] = useState(true);
    // Auto-hide timer for tool options bar
    const autoHideTimerRef = useRef<NodeJS.Timeout | null>(null);

    const [courseSession, setCourseSession] = useState<CourseSession | null>(null);
    const [pendingUpload, setPendingUpload] = useState<'scheme' | 'paper' | null>(null);
    const [modalType, setModalType] = useState<'new' | 'continue' | null>(null);
    const [showOldSessionModal, setShowOldSessionModal] = useState(false);

    // School and department management
    const [schools, setSchools] = useState<string[]>(loadSchools());
    const [departments, setDepartments] = useState<string[]>(loadDepartments());
    const [showAddSchoolModal, setShowAddSchoolModal] = useState(false);
    const [showAddDepartmentModal, setShowAddDepartmentModal] = useState(false);
    const [newSchoolName, setNewSchoolName] = useState('');
    const [newDepartmentName, setNewDepartmentName] = useState('');

    // Search functionality
    const [searchTerm, setSearchTerm] = useState('');

    // Auth state - Now enforcing login for a specific user
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [showAuth, setShowAuth] = useState(true); // Force login
    const [showProfile, setShowProfile] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showBatch, setShowBatch] = useState(false);

    // Auto mode
    const [isAutoMode, setIsAutoMode] = useState(false);
    const [isGradingInProgress, setIsGradingInProgress] = useState(false);
    const [showGradingChoice, setShowGradingChoice] = useState(false); // State for grading choice modal

    // Auth header helper
    const authHeaders = useCallback((): Record<string, string> => {
        const t = localStorage.getItem(AUTH_TOKEN_KEY);
        return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
    }, []);

    // Restore session by validating the stored token against the backend
    useEffect(() => {
        const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
        if (!storedToken) {
            setShowAuth(true);
            return;
        }

        setToken(storedToken);

        (async () => {
            try {
                const res = await fetch('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${storedToken}` }
                });

                if (!res.ok) throw new Error('Session expired');

                const data = await res.json();
                setUser({
                    id: data.user.id,
                    name: data.user.name || data.user.username || data.user.email,
                    email: data.user.email,
                    tier: 'free',
                    gradingCount: 0,
                    gradingLimit: 5,
                    createdAt: new Date().toISOString(),
                });
                setShowAuth(false);
            } catch (err) {
                console.error('Failed to restore session:', err);
                localStorage.removeItem(AUTH_TOKEN_KEY);
                setToken(null);
                setUser(null);
                setShowAuth(true);
            }
        })();
    }, []);

    // Load grading history from the backend once the user is authenticated
    useEffect(() => {
        if (!user || !token) return;

        (async () => {
            try {
                const res = await fetch('/api/history', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) return;
                const data = await res.json();
                if (Array.isArray(data.history)) {
                    setHistory(data.history);
                    saveHistory(data.history); // local cache for offline fallback
                }
            } catch (err) {
                console.error('Failed to load history from server:', err);
            }
        })();
    }, [user, token]);

    // Auto-hide tool options bar after 6 seconds of inactivity
    useEffect(() => {
        if (showToolOptions && activeTool && (activeTool === 'mark' || activeTool === 'mark-right' || activeTool === 'mark-wrong')) {
            if (autoHideTimerRef.current) {
                clearTimeout(autoHideTimerRef.current);
            }

            autoHideTimerRef.current = setTimeout(() => {
                setShowToolOptions(false);
            }, 6000); // 6 seconds

            return () => {
                if (autoHideTimerRef.current) {
                    clearTimeout(autoHideTimerRef.current);
                }
            };
        }
    }, [showToolOptions, activeTool]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (autoHideTimerRef.current) {
                clearTimeout(autoHideTimerRef.current);
            }
        };
    }, []);

    // Function to handle interaction with tool options to reset auto-hide timer
    const handleToolOptionInteraction = () => {
        if (autoHideTimerRef.current) {
            clearTimeout(autoHideTimerRef.current);
        }

        // Only reset the timer if options bar is hidden but should be shown for these tools
        if (!showToolOptions && (activeTool === 'mark' || activeTool === 'mark-right' || activeTool === 'mark-wrong')) {
            setShowToolOptions(true);
        }

        // Reset the timer
        autoHideTimerRef.current = setTimeout(() => {
            setShowToolOptions(false);
        }, 6000); // 6 seconds
    };

    // Load stored sessions on mount
    useEffect(() => {
        const storedSessions = loadSessions();
        if (storedSessions.length > 0) {
            // Pre-fill any available session data
            const latestSession = storedSessions[0]; // Most recent session
            if (latestSession) {
                setStudentInfo(prev => ({
                    ...prev,
                    program: latestSession.program || prev.program,
                    courseCode: latestSession.courseCode || prev.courseCode,
                    year: latestSession.year || prev.year,
                }));
            }
        }
    }, []);

    // Save schools and departments when they change
    useEffect(() => {
        saveSchools(schools);
    }, [schools]);

    useEffect(() => {
        saveDepartments(departments);
    }, [departments]);

    const schemeRef = useRef<UploadZoneHandle>(null);
    const paperRef = useRef<UploadZoneHandle>(null);
    const paperCanvasRef = useRef<PaperCanvasHandle>(null);

    const openUploadModal = (type: 'scheme' | 'paper') => {
        setPendingUpload(type);
        setModalType(courseSession ? 'continue' : 'new');
    };

    const triggerPendingUpload = () => {
        if (pendingUpload === 'scheme') schemeRef.current?.triggerInput();
        else if (pendingUpload === 'paper') paperRef.current?.triggerInput();
        setPendingUpload(null);
        setModalType(null);
    };

    const handleNewSessionConfirm = (session: CourseSession) => {
        setCourseSession(session);

        // Add to stored sessions
        const storedSessions = loadSessions();
        const updatedSessions = [session, ...storedSessions.filter(s => s.courseCode !== session.courseCode)];
        saveSessions(updatedSessions);

        setStudentInfo(prev => ({
            ...prev,
            courseCode: session.courseCode || prev.courseCode,
            program: session.program || prev.program,
            year: session.year || prev.year,
        }));
        triggerPendingUpload();
    };

    const handleSkipSession = () => {
        setPendingUpload(null);
        setModalType(null);
        if (pendingUpload === 'scheme') schemeRef.current?.triggerInput();
        else if (pendingUpload === 'paper') paperRef.current?.triggerInput();
    };

    const handleContinueSession = () => triggerPendingUpload();

    const handleStartNewFromContinue = () => {
        setModalType('new');
    };

    const closeModal = () => {
        setPendingUpload(null);
        setModalType(null);
    };

    // Function to load an old session
    const loadOldSession = (session: CourseSession) => {
        setCourseSession(session);
        setStudentInfo(prev => ({
            ...prev,
            courseCode: session.courseCode || prev.courseCode,
            program: session.program || prev.program,
            year: session.year || prev.year,
        }));
        setShowOldSessionModal(false);
    };

    // Function to handle loading from JSON file
    const handleLoadFromFile = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files[0]) {
                const file = target.files[0];
                const reader = new FileReader();

                reader.onload = (event) => {
                    try {
                        const content = event.target?.result as string;
                        const data = JSON.parse(content);

                        // Check if the file contains student info
                        if (data.studentInfo) {
                            setStudentInfo(data.studentInfo);
                        }

                        // Check if the file contains results
                        if (data.result) {
                            setResult(data.result);
                        }

                        // Check if the file contains remarks
                        if (data.examinerRemarks) {
                            setExaminerRemarks(data.examinerRemarks);
                        }

                        // If the file contains a paper image, handle it
                        if (data.studentPaper) {
                            setStudentPaper(data.studentPaper);
                        }

                        // If the file contains a marking scheme, handle it
                        if (data.markingScheme) {
                            setMarkingScheme(data.markingScheme);
                        }

                        // Close the modal
                        setShowOldSessionModal(false);

                        // Switch to the grading view to see the loaded data
                        setActiveView('grade');

                        alert('Session loaded successfully from file!');
                    } catch (error) {
                        console.error('Error parsing JSON file:', error);
                        alert('Error: Invalid file format. Please select a valid JSON file.');
                    }
                };

                reader.readAsText(file);
            }
        };

        input.click();
    };

    // Function to add a new school
    const addNewSchool = () => {
        if (newSchoolName.trim() && !schools.includes(newSchoolName.trim())) {
            setSchools([...schools, newSchoolName.trim()]);
            setNewSchoolName('');
            setShowAddSchoolModal(false);
        }
    };

    // Function to add a new department
    const addNewDepartment = () => {
        if (newDepartmentName.trim() && !departments.includes(newDepartmentName.trim())) {
            setDepartments([...departments, newDepartmentName.trim()]);
            setNewDepartmentName('');
            setShowAddDepartmentModal(false);
        }
    };

    const handleGrade = async () => {
        if (!user) {
            setShowAuth(true);
            return;
        }
        if (!studentPaper) {
            alert('Please upload a student paper before grading.');
            return;
        }

        // If in 'unmarked' mode, show choice between AI and Manual
        if (markingMode === 'unmarked') {
            setShowGradingChoice(true);
            return;
        }

        // If in 'self' mode, just open the results panel with placeholders
        if (markingMode === 'self') {
            // Minimize canvas if maximized
            if (isMaximized) {
                setIsMaximized(false);
            }

            setActiveView('grade');
            // Initialize result with placeholders for manual input, mimicking the AI result structure
            setResult({
                score: '',
                totalScore: '_/100',
                percentage: '',
                grade: '',
                feedback: 'Manually type the recommendations of this paper here',
                questions: [
                    { q: 1, score: '_/_', feedback: 'Enter feedback for question 1' },
                    { q: 2, score: '_/_', feedback: 'Enter feedback for question 2' },
                    { q: 3, score: '_/_', feedback: 'Enter feedback for question 3' },
                    { q: 4, score: '_/_', feedback: 'Enter feedback for question 4' }
                ],
                extracted_info: undefined  // Don't populate with placeholder student info
            });
            return;
        }

        // If in 'ai' mode, perform AI grading
        if (markingMode === 'ai') {
            // Minimize canvas if maximized
            if (isMaximized) {
                setIsMaximized(false);
            }

            setLoading(true);
            try {
                // Use REST API for web/browser app - proxy forwards /api/* to Express on port 3001
                const headers = {
                    'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`,
                    'Content-Type': 'application/json'
                };

                const response = await fetch('/api/grade', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        studentInfo,
                        markingScheme: markingScheme?.base64 ?? null,
                        studentPaper: studentPaper.base64
                    })
                });

                if (response.status === 401) {
                    setShowAuth(true);
                    throw new Error('Authentication required. Please sign in.');
                }
                if (response.status === 403) {
                    const data = await response.json();
                    throw new Error(data.message || 'Access denied');
                }
                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.message || 'Grading request failed');
                }

                const gradingResult: ApiGradingResult = await response.json();

                if (gradingResult.error) {
                    throw new Error(gradingResult.message || 'Grading failed');
                }

                // Map the response from the API (snake_case) to the frontend format (camelCase)
                const mappedResult: GradingResult = {
                    totalScore: gradingResult.total_score || gradingResult.totalScore,
                    score: gradingResult.score,
                    percentage: gradingResult.percentage,
                    grade: gradingResult.grade,
                    feedback: gradingResult.feedback || '',
                    questions: gradingResult.questions || [],
                    extracted_info: gradingResult.extracted_info || undefined,
                };

                setResult(mappedResult);
                setActiveView('grade');

                if (mappedResult.extracted_info) {
                    setStudentInfo(prev => ({
                        name: mappedResult.extracted_info?.name || prev.name,
                        program: mappedResult.extracted_info?.program || prev.program,
                        regNo: mappedResult.extracted_info?.regNo || prev.regNo,
                        year: mappedResult.extracted_info?.year || prev.year,
                        courseCode: mappedResult.extracted_info?.courseCode || prev.courseCode,
                        examDate: mappedResult.extracted_info?.examDate || prev.examDate,
                    }));
                }
            } catch (error) {
                console.error('Grading failed:', error);
                alert(error instanceof Error ? error.message : 'An error occurred during grading. Check the console for details.');
            } finally {
                setLoading(false);
            }
        }
    };

    // Function to handle selection from grading choice modal
    const handleGradingChoice = (choice: 'ai' | 'manual') => {
        setShowGradingChoice(false);

        if (choice === 'ai') {
            setMarkingModeState('ai');
            // Trigger grading again after setting the mode
            setTimeout(() => {
                if (isMaximized) {
                    setIsMaximized(false);
                }
                handleGrade();
            }, 100);
        } else if (choice === 'manual') {
            setMarkingModeState('self');
            // Trigger grading again after setting the mode
            setTimeout(() => {
                if (isMaximized) {
                    setIsMaximized(false);
                }
                handleGrade();
            }, 100);
        }
    };

    // Auto mode: trigger grading when paper is uploaded
    useEffect(() => {
        if (isAutoMode && studentPaper && user) {
            // Set marking mode to AI for auto-grading
            setMarkingModeState('ai');
            // Use a small delay to ensure state update propagates
            const timer = setTimeout(() => {
                handleGrade().catch(err => {
                    console.error('Auto-grade failed:', err);
                    setIsAutoMode(false);
                });
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [isAutoMode, studentPaper, user]);

    const handleSave = () => {
        if (!result) { alert('No grading result to save. Grade a paper first.'); return; }

        // Check if required student info is missing and prompt user to enter it
        const requiredFields = ['name', 'regNo', 'courseCode', 'program'];
        const missingFields = requiredFields.filter(field => !studentInfo[field as keyof StudentInfo]);

        if (missingFields.length > 0) {
            const missingFieldNames = missingFields.map(field =>
                field === 'regNo' ? 'Registration Number' :
                    field === 'courseCode' ? 'Course Code' :
                        field === 'program' ? 'Program of Study' :
                            field.charAt(0).toUpperCase() + field.slice(1)
            ).join(', ');

            const userConfirmed = confirm(`The following required fields are missing: ${missingFieldNames}.\n\nYou need to enter this information before saving.\n\nGo to the Identity Panel to enter the details, then try saving again.\n\nDo you want to proceed with saving anyway?`);

            if (!userConfirmed) {
                return; // Don't save if user doesn't confirm
            }
        }

        const record: HistoryRecord = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            studentInfo,
            result: { ...result, feedback: result.feedback + (examinerRemarks ? `\n\nExaminer Remarks: ${examinerRemarks}` : '') }
        };
        const updated = [record, ...history].slice(0, 50);
        setHistory(updated);
        saveHistory(updated);

        // Sync to backend so history persists across devices
        fetch('/api/history', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ studentInfo: record.studentInfo, result: record.result })
        }).catch(err => console.error('Failed to sync history to server:', err));

        const blob = new Blob([JSON.stringify({ studentInfo, result, examinerRemarks }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grading_${studentInfo.name || 'student'}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleLoadRecord = (record: HistoryRecord) => {
        setStudentInfo(record.studentInfo);
        setResult(record.result);
        setActiveView('grade');
    };

    const handleDeleteRecord = (id: string) => {
        const updated = history.filter(r => r.id !== id);
        setHistory(updated);
        saveHistory(updated);
    };

    const handleSaveRemarks = () => {
        if (examinerRemarks.trim()) alert("Remarks saved. Use 'Save Results' to include them in the export.");
        setActiveView('dashboard');
    };

    const handleNew = () => {
        if (result || markingScheme || studentPaper) {
            if (!window.confirm('Start a new session? Current work will be cleared.')) return;
        }
        setStudentInfo({ name: '', regNo: '', program: '', year: '', courseCode: '', examDate: '' });
        setMarkingScheme(null);
        setStudentPaper(null);
        setResult(null);
        setExaminerRemarks('');
        setCourseSession(null);
        setActiveView('dashboard');
        setMarkingModeState('unmarked'); // Reset to unmarked
    };

    const handleRefresh = () => {
        setStudentInfo({ name: '', regNo: '', program: '', year: '', courseCode: '', examDate: '' });
        setMarkingScheme(null);
        setStudentPaper(null);
        setResult(null);
        setExaminerRemarks('');
        setCourseSession(null);
        setActiveView('dashboard');
        setMarkingModeState('unmarked'); // Reset to unmarked
        setClearCount(c => c + 1);
        setZoom(1);
        setActiveTool(null);
        setIsMaximized(false);
        setIsAutoMode(false);
        setShowRefresh(false);
    };

    // Auth handlers
    const handleAuthSuccess = (data: AuthResponse) => {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        setToken(data.token);
        setUser(data.user);
        setShowAuth(false);
    };

    const handleLogout = () => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setToken(null);
        setUser(null);
        setShowAuth(true); // Force login again
        setShowProfile(false);
    };

    // Settings handlers
    const handleSaveApiKeys = async (openaiKey: string, geminiKey: string) => {
        if (!user) return;
        const res = await fetch('/api/settings/api-keys', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ openaiApiKey: openaiKey, geminiApiKey: geminiKey }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(data.message || 'Failed to save API keys');
            return;
        }
        alert('API keys saved successfully!');
    };

    const handleUpgrade = (tier: string) => {
        // Placeholder for future payment integration
        alert(`Upgrade to ${tier} plan coming soon with Airtel Money & TNM Mpamba payment.`);
    };

    // Batch grading handlers
    const handleGradeSingle = async (paperBase64: string): Promise<GradingResult> => {
        if (!user) throw new Error('Please sign in first');
        const payload = {
            studentInfo,
            markingScheme: markingScheme?.base64 ?? null,
            studentPaper: paperBase64
        };
        const headers = { ...authHeaders() };
        const response = await fetch('/api/grade', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        if (response.status === 401) throw new Error('Authentication required');
        if (response.status === 403) {
            const data = await response.json();
            throw new Error(data.message || 'Access denied');
        }
        const result = await response.json();
        if (result.error) throw new Error(result.message);
        return result;
    };

    const handleSaveAllBatch = (results: { file: any; result: GradingResult }[]) => {
        const records: HistoryRecord[] = results.map(({ file, result }, idx) => ({
            id: Date.now().toString() + '_' + idx + '_' + Math.random().toString(36).substr(2, 9),
            date: new Date().toISOString(),
            studentInfo: {
                ...studentInfo,
                name: result.extracted_info?.name || studentInfo.name || file.name,
                regNo: result.extracted_info?.regNo || studentInfo.regNo,
            },
            result,
        }));
        const updated = [...records, ...history].slice(0, 50);
        setHistory(updated);
        saveHistory(updated);

        // Sync each record to the backend so history persists across devices
        records.forEach(record => {
            fetch('/api/history', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ studentInfo: record.studentInfo, result: record.result })
            }).catch(err => console.error('Failed to sync history to server:', err));
        });

        alert(`Saved ${records.length} grading results to history!`);
        setShowBatch(false);
    };

    const handlePrint = () => window.print();

    // Handle paper upload and automatically switch to self-marked mode
    const handlePaperUpload = useCallback((base64: string, name: string) => {
        setStudentPaper({ base64, name });
        // Automatically switch to self-marked mode when a paper is loaded
        setMarkingModeState('self');
    }, []);

    // Filter sessions based on search term
    const filteredSessions = loadSessions().filter(session =>
        searchTerm === '' ||
        session.courseCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.courseName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.program?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Filter departments based on search term
    const filteredDepartments = departments.filter(dept =>
        searchTerm === '' || dept.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Handle search term changes from TopBar
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
                    if (!user) { setShowAuth(true); return; }
                    setShowBatch(true);
                }}
                hasResult={!!result}
                studentInfo={studentInfo}
                onStudentInfoUpdate={(updates) => setStudentInfo(prev => ({ ...prev, ...updates }))}
                history={history}
                onShowOldSessions={() => setShowOldSessionModal(true)}
                schools={schools}
                departments={departments}
                onShowAddSchool={() => setShowAddSchoolModal(true)}
                onShowAddDepartment={() => setShowAddDepartmentModal(true)}
                onSearchTermChange={handleSearchTermChange}
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
                        if (!user) setShowAuth(true);
                        else setShowProfile(true);
                    }}
                    onAutoModeToggle={() => setIsAutoMode(v => !v)}
                />

                <main className="flex-1 flex overflow-hidden">
                    {activeView === 'dashboard' ? (
                        <PostsPage history={history} onGrade={() => {
                            if (!user) { setShowAuth(true); return; }
                            setActiveView('grade');
                        }} />
                    ) : activeView === 'history' ? (
                        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                            <HistoryPanel history={history} onLoad={handleLoadRecord} onDelete={handleDeleteRecord} />
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
                            <div className={`${isMaximized ? 'flex-1 p-0' : 'flex-[3] p-4'} flex flex-col gap-4 overflow-hidden`}>

                                {courseSession && !isMaximized && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-accent-blue/5 border border-accent-blue/20 rounded-xl shrink-0">
                                        <div className="w-1.5 h-4 bg-accent-blue rounded-full" />
                                        <span className="text-[10px] font-black text-accent-blue uppercase tracking-wider">
                                            Session: {courseSession.courseCode}
                                        </span>
                                        {courseSession.courseName && (
                                            <span className="text-[10px] text-gray-500">— {courseSession.courseName}</span>
                                        )}
                                        <button
                                            onClick={() => setCourseSession(null)}
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
                                                onUpload={(base64, name) => setMarkingScheme({ base64, name })}
                                                fileName={markingScheme?.name}
                                                description="Upload Reference"
                                                variant="compact"
                                                optional
                                                onZoneClick={() => schemeRef.current?.triggerInput()}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <StudentForm info={studentInfo} onChange={setStudentInfo} />
                                        </div>
                                    </div>
                                )}

                                <div className="flex-1 flex flex-col min-h-0 bg-card rounded-3xl border border-gray-800 shadow-xl relative overflow-hidden">
                                    <div className="h-10 border-b border-gray-800/50 flex items-center justify-between px-4 bg-sidebar/20">
                                        <div className="flex gap-0.5">
                                            <button
                                                onClick={() => setActiveTool(activeTool === 'pan' ? null : 'pan')}
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${activeTool === 'pan' ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                    }`}
                                            >
                                                <Hand size={14} />
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Pan
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => setActiveTool(activeTool === 'pen' ? null : 'pen')}
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${activeTool === 'pen' ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                    }`}
                                            >
                                                <PenIcon size={14} />
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Pen
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => setActiveTool(activeTool === 'text' ? null : 'text')}
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${activeTool === 'text' ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                    }`}
                                            >
                                                <Type size={14} />
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Text
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => setActiveTool(activeTool === 'shape' ? null : 'shape')}
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${activeTool === 'shape' ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                    }`}
                                            >
                                                <Square size={14} />
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Shape
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => setActiveTool(activeTool === 'clear' ? null : 'clear')}
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${activeTool === 'clear' ? 'bg-red-500/20 text-red-400' : 'text-gray-500 hover:bg-red-800/30 hover:text-red-400'
                                                    }`}
                                            >
                                                <Eraser size={14} />
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Clear (click to erase)
                                                </span>
                                            </button>
                                            <div className="w-px h-5 bg-gray-800/50 mx-1 self-center" />
                                            {/* Right/Wrong buttons added as separate tools */}
                                            <button
                                                onClick={() => setActiveTool(activeTool === 'mark-right' ? null : 'mark-right')}
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${activeTool === 'mark-right' ? 'bg-accent-green/20 text-accent-green' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                    }`}
                                            >
                                                <Check size={14} />
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Right Mark
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => setActiveTool(activeTool === 'mark-wrong' ? null : 'mark-wrong')}
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${activeTool === 'mark-wrong' ? 'bg-red-500/20 text-red-400' : 'text-gray-500 hover:bg-red-800/30 hover:text-red-400'
                                                    }`}
                                            >
                                                <X size={14} />
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Wrong Mark
                                                </span>
                                            </button>
                                            <div className="w-px h-5 bg-gray-800/50 mx-1 self-center" />
                                            <button
                                                onClick={() => paperCanvasRef.current?.undo()}
                                                className="relative w-8 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                                            >
                                                <Undo2 size={13} />
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Undo
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => paperCanvasRef.current?.redo()}
                                                className="relative w-8 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                                            >
                                                <Redo2 size={13} />
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    Redo
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => paperCanvasRef.current?.restart()}
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
                                                <span className="text-[9px] text-gray-500 font-mono mr-1 w-10 text-center">{Math.round(zoom * 100)}%</span>
                                                <button
                                                    onClick={() => setZoom(z => Math.max(0.1, +(z - 0.1).toFixed(2)))}
                                                    className="relative w-7 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                                                >
                                                    <ZoomOut size={13} />
                                                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                        Zoom Out
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={() => setZoom(z => Math.min(5, +(z + 0.1).toFixed(2)))}
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
                                                    <span className="text-[10px] font-bold">1:1</span>
                                                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                        Fit to width
                                                    </span>
                                                </button>
                                            </div>
                                        )}
                                        {!markingScheme && studentPaper && (
                                            <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                                <AlertTriangle size={10} className="text-yellow-500" />
                                                <span className="text-[9px] font-bold text-yellow-500/80">No scheme — AI uses general criteria</span>
                                            </div>
                                        )}
                                        <div className="flex gap-0.5">
                                            {studentPaper && (
                                                <button
                                                    onClick={() => openUploadModal('paper')}
                                                    className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group text-gray-500 hover:bg-accent-blue/20 hover:text-accent-blue`}
                                                >
                                                    <Upload size={14} />
                                                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                        Change
                                                    </span>
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    // Cycle through the three marking modes: unmarked -> self -> ai -> unmarked
                                                    if (markingMode === 'unmarked') {
                                                        setMarkingModeState('self');
                                                        // Initialize with placeholders for manual entry when switching to self mode
                                                        if (studentPaper) {
                                                            setResult({
                                                                score: '',
                                                                totalScore: '_/100',
                                                                percentage: '',
                                                                grade: '',
                                                                feedback: 'Manually type the recommendations of this paper here',
                                                                questions: [],
                                                                extracted_info: {
                                                                    name: studentInfo.name || 'Enter student name',
                                                                    regNo: studentInfo.regNo || 'Enter registration number',
                                                                    program: studentInfo.program || 'Enter program',
                                                                    year: studentInfo.year || 'Enter year',
                                                                    courseCode: studentInfo.courseCode || 'Enter course code',
                                                                    examDate: studentInfo.examDate || 'Enter exam date'
                                                                }
                                                            });
                                                        }
                                                    } else if (markingMode === 'self') {
                                                        setMarkingModeState('ai');
                                                        // Clear results when switching from self to ai
                                                        setResult(null);
                                                    } else {
                                                        setMarkingModeState('unmarked');
                                                        // Clear results when switching from ai to unmarked
                                                        setResult(null);
                                                    }
                                                }}
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${markingMode === 'self' ? 'bg-accent-green/20 text-accent-green' :
                                                    markingMode === 'ai' ? 'bg-accent-blue/20 text-accent-blue' :
                                                        'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                    }`}
                                            >
                                                {markingMode === 'self' ? <FileCheck size={14} /> :
                                                    markingMode === 'ai' ? <FileCheck size={14} /> :
                                                        <FileX size={14} />}
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    {markingMode === 'self' ? 'Self Marked' :
                                                        markingMode === 'ai' ? 'AI Marked' :
                                                            'Unmarked'}
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => setIsMaximized(!isMaximized)}
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${isMaximized ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                    }`}
                                            >
                                                {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    {isMaximized ? 'Minimize' : 'Maximize'}
                                                </span>
                                            </button>
                                            {/* Show/Hide button moved back to original position (after maximize button) */}
                                            <button
                                                onClick={() => setShowToolOptions(!showToolOptions)}
                                                className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${showToolOptions ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                                    }`}
                                            >
                                                {showToolOptions ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                                                    {showToolOptions ? 'Hide Options' : 'Show Options'}
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tool Options Bar - appears when a tool is selected and showToolOptions is true, positioned absolutely to overlay on paper */}
                                    {showToolOptions && activeTool &&
                                        (activeTool === 'pen' ||
                                            activeTool === 'shape' ||
                                            activeTool === 'text' ||
                                            activeTool === 'mark' ||
                                            activeTool === 'mark-right' ||
                                            activeTool === 'mark-wrong') && (
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
                                                showOverlay={markingMode !== 'unmarked'} // Show overlay when not unmarked
                                                markingMode={markingMode} // Pass the marking mode
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
                                                onZoneClick={() => paperRef.current?.triggerInput()}
                                            />
                                        )}
                                    </div>

                                    <div className="absolute bottom-6 right-6 flex flex-col gap-2 items-end">
                                        <motion.button
                                            whileHover={{ scale: 1.1, rotate: 5 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={handleGrade}
                                            disabled={loading || !studentPaper}
                                            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl text-white disabled:grayscale disabled:opacity-50 transition-colors ${!markingScheme && studentPaper && markingMode === 'ai'
                                                ? 'bg-yellow-600 hover:bg-yellow-500 shadow-yellow-600/40'
                                                : 'bg-accent-blue hover:bg-blue-600 shadow-accent-blue/40'
                                                }`}
                                        >
                                            {loading ? (
                                                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <Play size={24} fill="currentColor" />
                                            )}
                                        </motion.button>
                                    </div>
                                </div>
                            </div>

                            <div className={`${isMaximized ? 'hidden' : 'w-[400px]'} p-4 shrink-0 overflow-hidden`}>
                                <ResultsPanel
                                    result={result}
                                    loading={loading}
                                    onPrint={handlePrint}
                                    onResultChange={setResult} // Allow manual editing of results
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
                            <h2 className="text-lg font-bold uppercase tracking-widest text-gray-400">Load Session</h2>
                            <button
                                onClick={() => setShowOldSessionModal(false)}
                                className="text-gray-500 hover:text-gray-300"
                            >
                                Close
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search sessions..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-sidebar border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-accent-blue"
                                />
                            </div>

                            {filteredSessions.length > 0 ? (
                                filteredSessions.map((session, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-gray-900/30 rounded-xl border border-gray-800 hover:bg-gray-800/50 transition-colors cursor-pointer"
                                        onClick={() => loadOldSession(session)}
                                    >
                                        <div className="font-bold text-ink">{session.courseCode}</div>
                                        <div className="text-sm text-gray-400">{session.courseName || 'No course name'}</div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            Program: {session.program || 'N/A'} | Year: {session.year || 'N/A'}
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
                                    Load from JSON File
                                </button>
                                <p className="text-xs text-gray-500 mt-2 text-center">
                                    Select a saved grading session file (.json)
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

            {/* Grading Choice Modal */}
            {showGradingChoice && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-3xl border border-gray-800 shadow-xl w-full max-w-md">
                        <div className="p-6 border-b border-gray-800 bg-sidebar/50">
                            <h2 className="text-lg font-bold uppercase tracking-widest text-gray-400">Choose Grading Method</h2>
                            <p className="text-sm text-gray-500 mt-1">Select how you'd like to grade this paper</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <button
                                onClick={() => handleGradingChoice('ai')}
                                className="w-full bg-accent-blue text-white py-4 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
                            >
                                <Play size={16} fill="currentColor" />
                                Use AI Grading
                            </button>
                            <button
                                onClick={() => handleGradingChoice('manual')}
                                className="w-full bg-accent-green text-white py-4 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-2"
                            >
                                <PenIcon size={16} />
                                Manual Grading
                            </button>
                        </div>
                        <div className="p-4 border-t border-gray-800 bg-sidebar/50">
                            <button
                                onClick={() => setShowGradingChoice(false)}
                                className="w-full bg-gray-700 text-white py-2 rounded-lg font-bold text-sm uppercase tracking-widest hover:bg-gray-600 transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

                {showRefresh && (
                    <RefreshModal
                        onConfirm={handleRefresh}
                        onCancel={() => setShowRefresh(false)}
                    />
                )}

                {showAuth && (
                    <AuthModal
                        onAuthSuccess={handleAuthSuccess}
                    />
                )}

                {showProfile && user && (
                    <ProfileModal
                        user={user}
                        onClose={() => setShowProfile(false)}
                        onLogout={handleLogout}
                        onUpgrade={() => handleUpgrade('personal')}
                    />
                )}

                {showSettings && (
                    <SettingsModal
                        user={user}
                        onClose={() => setShowSettings(false)}
                        onSaveApiKeys={handleSaveApiKeys}
                        onUpgrade={handleUpgrade}
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
                    <NewSessionModal
                        onConfirm={handleNewSessionConfirm}
                        onSkip={handleSkipSession}
                        onCancel={closeModal}
                    />
                )}

                {modalType === 'continue' && courseSession && (
                    <ContinueSessionModal
                        session={courseSession}
                        uploadLabel={pendingUpload === 'scheme' ? 'Uploading marking scheme' : 'Uploading student paper'}
                        onContinue={handleContinueSession}
                        onNewSession={handleStartNewFromContinue}
                        onCancel={closeModal}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
