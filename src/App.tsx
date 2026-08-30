/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { HistoryPanel } from './components/HistoryPanel';
import { RemarkPanel } from './components/RemarkPanel';
import { HelpModal } from './components/HelpModal';
import { RefreshModal } from './components/RefreshModal';
import { AuthModal } from './components/AuthModal';
import { ProfileModal } from './components/ProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { BatchModal } from './components/BatchModal';
import { PostsPage } from './components/PostsPage';
import { UploadZoneHandle } from './components/UploadZone';
import { PaperCanvasHandle } from './components/PaperCanvas';
import { YazaPanel } from './components/YazaPanel';
import { GradeWorkspace } from './components/GradeWorkspace';
import { OldSessionModal } from './components/OldSessionModal';
import { UpgradePromptModal } from './components/UpgradePromptModal';
import { PaymentStatusModal } from './components/PaymentStatusModal';

import {
    NewSemesterModal,
    ContinueSemesterModal,
    NewCourseModal,
    NewSessionModal,
} from './components/CourseSessionModal';

import { StudentInfo, ActiveView } from './types';

import { AnimatePresence } from 'motion/react';

import { useCanvasTools } from './hooks/useCanvasTools';
import { usePaymentCallback } from './hooks/usePaymentCallback';
import { useAuth } from './hooks/useAuth';
import { useWorkbook } from './hooks/useWorkbook';
import { useGrading } from './hooks/useGrading';
import { useHistory } from './hooks/useHistory';
import { useCourseSessionModals } from './hooks/useCourseSessionModals';
import { useWorkspaceActions } from './hooks/useWorkspaceActions';

export default function App() {
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

    const schemeRef = useRef<UploadZoneHandle>(null);
    const paperRef = useRef<UploadZoneHandle>(null);
    const paperCanvasRef = useRef<PaperCanvasHandle>(null);

    // --- Composed hooks, in dependency order ---

    const auth = useAuth();

    const history = useHistory();

    const workbookState = useWorkbook(auth.user, auth.token, setStudentInfo, history.setHistory);

    const tools = useCanvasTools(/* markingMode injected below once grading exists */ 'ai');

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
        setShowCourseSelector: (value: boolean) => modals.setShowCourseSelector(value),
        setWorkbook: workbookState.setWorkbook,
        autoHideTimerRef: tools.autoHideTimerRef,
    });

    const workspaceActions = useWorkspaceActions({
        authHeaders: auth.authHeaders,
        setStudentInfo, setMarkingScheme, setStudentPaper,
        setResult: grading.setResult, setExaminerRemarks,
        setSemesterCourse: workbookState.setSemesterCourse,
        setActiveSessionId: workbookState.setActiveSessionId,
        setHasUnsavedResult: grading.setHasUnsavedResult,
        setPendingHistoryRecord: history.setPendingHistoryRecord,
        setHistorySaveState: history.setHistorySaveState,
        setActiveView,
        setMarkingModeState: grading.setMarkingModeState,
        resetTools: tools.resetTools,
        setZoom, setClearCount, setIsMaximized, setIsAutoMode: grading.setIsAutoMode,
        paperCanvasRef,
        setPendingGradeNavigation: (v: boolean) => modals.setPendingGradeNavigation(v),
        setShowOldSessionModal: (v: boolean) => modals.setShowOldSessionModal(v),
    });

    const modals = useCourseSessionModals({
        schemeRef, paperRef,
        authHeaders: auth.authHeaders,
        clearYazaSessionHistory: workspaceActions.clearYazaSessionHistory,
    });

    const paymentCallback = usePaymentCallback();

    // --- Derived / convenience ---

    const paperImage = () => paperCanvasRef.current?.captureFullPaper();

    const handlePrint = () => {
        const image = paperImage();

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

    const handleSaveWrapper = (resultToSave?: any) => {
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

    const handleLoadRecordWrapper = (record: any) => {
        history.handleLoadRecord(record, grading.hasUnsavedResult, workbookState.workbook, {
            setSemesterCourse: workbookState.setSemesterCourse,
            setActiveSessionId: workbookState.setActiveSessionId,
            setStudentInfo,
            setResult: grading.setResult,
            setHasUnsavedResult: grading.setHasUnsavedResult,
            setMarkingModeState: grading.setMarkingModeState,
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

    // Wraps StudentForm's onChange: clears hasUnsavedResult when the
    // session-identifying fields change (originally inline in App.tsx's JSX).
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
        workbookState.setActiveSessionId(activeSession.id || activeSession.courseCode);

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

    const workbookCourses = workbookState.workbookCourses;

    const handleSearchTermChange = (term: string) => workbookState.setSearchTerm(term);

    return (
        <div className="flex flex-col bg-bg-dark h-screen overflow-hidden text-ink border-4 border-gray-900 shadow-2xl">
            <TopBar
                sessions={workbookState.sessions}
                activeSession={workbookState.semesterCourse}
                onSelectSession={handleSelectSessionFromTopBar}
                onLoadSessionFromFile={() => modals.setShowOldSessionModal(true)}
                onNew={() => workspaceActions.handleNew(
                    grading.hasUnsavedResult, grading.result, markingScheme, studentPaper
                )}
                onSave={handleSaveWrapper}
                onPrint={handlePrint}
                onClearResult={() => grading.setResult(null)}
                onRefresh={() => setShowRefresh(true)}
                onSettings={() => setShowSettings(true)}
                onBatch={() => {
                    if (!auth.user) {
                        auth.setShowAuth(true);
                        return;
                    }
                    setShowBatch(true);
                }}
                hasResult={!!grading.result}
                studentInfo={studentInfo}
                onStudentInfoUpdate={(updates) => setStudentInfo(prev => ({ ...prev, ...updates }))}
                history={history.history}
                onShowOldSessions={() => modals.setShowOldSessionModal(true)}
                onSearchTermChange={handleSearchTermChange}
                onNewCourse={() => modals.setShowNewCourseModal(true)}
                onNewSession={() => modals.setShowNewSessionModal(true)}
                onNewPaper={() => workspaceActions.handleNewPaper(
                    workbookState.semesterCourse, workbookState.activeSessionId, grading.result, studentPaper
                )}
                onToggleYaza={() => setShowYaza(v => !v)}
                isYazaOpen={showYaza}
                isLoggedIn={!!auth.user}
                onLogin={() => auth.setShowAuth(true)}
                onLogout={auth.handleLogout}
                onViewChange={setActiveView}
                onProfile={() => {
                    if (!auth.user) auth.setShowAuth(true);
                    else auth.setShowProfile(true);
                }}
                onLoadRecord={handleLoadRecordWrapper}
            />

            {auth.user && activeView === 'dashboard' && (
                <div className="px-4 py-2 border-b" />
            )}

            <div className="flex-1 flex min-w-0 overflow-hidden">
                <Sidebar
                    activeView={activeView}
                    onViewChange={(view) => modals.handleViewChange(
                        view, workbookState.semesterCourse, workbookState.activeSessionId, setActiveView
                    )}
                    onSave={handleSaveWrapper}
                    onHelp={() => setShowHelp(true)}
                    hasResult={!!grading.result}
                    user={auth.user}
                    isAutoMode={grading.isAutoMode}
                    onProfile={() => {
                        if (!auth.user) auth.setShowAuth(true);
                        else auth.setShowProfile(true);
                    }}
                    onAutoModeToggle={() => grading.setIsAutoMode(v => !v)}
                />

                <main className="flex-1 flex overflow-hidden">
                    {activeView === 'dashboard' ? (
                        <PostsPage
                            history={history.history}
                            onGrade={() => modals.handleViewChange(
                                'grade', workbookState.semesterCourse, workbookState.activeSessionId, setActiveView
                            )}
                        />
                    ) : activeView === 'history' ? (
                        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                            <HistoryPanel
                                history={history.history}
                                onLoad={handleLoadRecordWrapper}
                                onDelete={(id) => history.handleDeleteRecord(id, auth.token)}
                                sessions={workbookState.sessions}
                                onLoadSession={(session) => modals.loadOldSemester(session, {
                                    hasUnsavedResult: grading.hasUnsavedResult,
                                    workbook: workbookState.workbook,
                                    token: auth.token,
                                    setHasUnsavedResult: grading.setHasUnsavedResult,
                                    setWorkbook: workbookState.setWorkbook,
                                    setStudentInfo,
                                    setSemesterCourse: workbookState.setSemesterCourse,
                                    setActiveSessionId: workbookState.setActiveSessionId,
                                    resetForCourseSwitch: () => {
                                        grading.setMarkingModeState('ai');
                                        tools.resetTools();
                                        grading.setResult(null);
                                        setStudentPaper(null);
                                        setExaminerRemarks('');
                                        if (modals.pendingGradeNavigation) {
                                            modals.setPendingGradeNavigation(false);
                                            setActiveView('grade');
                                        }
                                    },
                                    persistWorkbook: workbookState.persistWorkbook,
                                })}
                                onSessionsChanged={workbookState.setSessions}
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
                        <GradeWorkspace
                            isMaximized={isMaximized}
                            setIsMaximized={setIsMaximized}
                            semesterCourse={workbookState.semesterCourse}
                            showSessionStatus={workbookState.showSessionStatus}
                            sessionSaveState={workbookState.sessionSaveState}
                            onRetrySessionSave={() => {
                                if (workbookState.semesterCourse) {
                                    workbookState.persistSession(workbookState.semesterCourse);
                                }
                            }}
                            onDismissSessionStatus={() => workbookState.setShowSessionStatus(false)}
                            workbook={workbookState.workbook}
                            token={auth.token}
                            setWorkbook={workbookState.setWorkbook}
                            setSessions={workbookState.setSessions}
                            setSemesterCourse={workbookState.setSemesterCourse}
                            setActiveSessionId={workbookState.setActiveSessionId}
                            setSessionSaveState={workbookState.setSessionSaveState}
                            schemeRef={schemeRef}
                            paperRef={paperRef}
                            markingScheme={markingScheme}
                            setMarkingScheme={setMarkingScheme}
                            studentPaper={studentPaper}
                            onPaperUpload={workspaceActions.handlePaperUpload}
                            onOpenUploadModal={(type) => modals.openUploadModal(type, workbookState.semesterCourse)}
                            onClearStudentPaper={workspaceActions.handleClearStudentPaper}
                            studentInfo={studentInfo}
                            onStudentInfoChange={handleStudentInfoChange}
                            courses={workbookState.courses}
                            hasUnsavedResult={grading.hasUnsavedResult}
                            onNewCourse={() => modals.setShowNewCourseModal(true)}
                            paperCanvasRef={paperCanvasRef}
                            activeTool={tools.activeTool}
                            setActiveTool={tools.setActiveTool}
                            clearCount={clearCount}
                            markingMode={grading.markingMode}
                            isAutoMode={grading.isAutoMode}
                            zoom={zoom}
                            setZoom={setZoom}
                            showToolOptions={tools.showToolOptions}
                            setShowToolOptions={tools.setShowToolOptions}
                            onToggleMarkingMode={() => grading.handleMarkingModeChange(
                                grading.markingMode === 'ai' ? 'self' : 'ai', tools.resetTools, grading.isAutoMode
                            )}
                            onToolOptionInteraction={tools.handleToolOptionInteraction}
                            penColor={tools.penColor} setPenColor={tools.setPenColor}
                            penSize={tools.penSize} setPenSize={tools.setPenSize}
                            shapeColor={tools.shapeColor} setShapeColor={tools.setShapeColor}
                            shapeSize={tools.shapeSize} setShapeSize={tools.setShapeSize}
                            shapeType={tools.shapeType} setShapeType={tools.setShapeType}
                            textColor={tools.textColor} setTextColor={tools.setTextColor}
                            textSize={tools.textSize} setTextSize={tools.setTextSize}
                            textFont={tools.textFont} setTextFont={tools.setTextFont}
                            markingModeSetting={tools.markingModeSetting} setMarkingModeSetting={tools.setMarkingModeSetting}
                            markSize={tools.markSize} setMarkSize={tools.setMarkSize}
                            markThickness={tools.markThickness} setMarkThickness={tools.setMarkThickness}
                            loading={grading.loading}
                            onGrade={handleGradeButtonClick}
                            result={grading.result}
                            historySaveState={history.historySaveState}
                            onRetryHistorySave={() => history.retryHistorySave(auth.token)}
                            onPrint={handlePrint}
                            onSave={() => handleSaveWrapper()}
                            isSaving={history.isSaving}
                            onResultChange={(nextResult) => {
                                grading.setResult(nextResult);
                                grading.setHasUnsavedResult(true);
                            }}
                        />
                    )}
                </main>
            </div>

            {modals.showOldSessionModal && (
                <OldSessionModal
                    searchTerm={workbookState.searchTerm}
                    onSearchTermChange={workbookState.setSearchTerm}
                    filteredSessions={workbookState.filteredSessions}
                    onSelectSession={(session) => modals.loadOldSemester(session, {
                        hasUnsavedResult: grading.hasUnsavedResult,
                        workbook: workbookState.workbook,
                        token: auth.token,
                        setHasUnsavedResult: grading.setHasUnsavedResult,
                        setWorkbook: workbookState.setWorkbook,
                        setStudentInfo,
                        setSemesterCourse: workbookState.setSemesterCourse,
                        setActiveSessionId: workbookState.setActiveSessionId,
                        resetForCourseSwitch: () => {
                            grading.setMarkingModeState('ai');
                            tools.resetTools();
                            grading.setResult(null);
                            setStudentPaper(null);
                            setExaminerRemarks('');
                            if (modals.pendingGradeNavigation) {
                                modals.setPendingGradeNavigation(false);
                                setActiveView('grade');
                            }
                        },
                        persistWorkbook: workbookState.persistWorkbook,
                    })}
                    onLoadFromFile={() => modals.handleLoadFromFile({
                        token: auth.token,
                        persistWorkbook: workbookState.persistWorkbook,
                        setWorkbook: workbookState.setWorkbook,
                        setSessions: workbookState.setSessions,
                        setSemesterCourse: workbookState.setSemesterCourse,
                        setActiveSessionId: workbookState.setActiveSessionId,
                        setSessionSaveState: workbookState.setSessionSaveState,
                        resetWorkspaceForImport: () => {
                            setStudentInfo({ name: '', regNo: '', program: '', year: '', semester: '', courseCode: '', examDate: '' });
                            setMarkingScheme(null);
                            setStudentPaper(null);
                            grading.setResult(null);
                            setExaminerRemarks('');
                            grading.setMarkingModeState('ai');
                            tools.resetTools();
                            setZoom(1);
                            setClearCount(c => c + 1);
                            setIsMaximized(false);
                            grading.setIsAutoMode(false);
                        },
                    })}
                    onNewSession={() => {
                        modals.setModalType('new');
                        modals.setShowOldSessionModal(false);
                    }}
                    onClose={() => modals.setShowOldSessionModal(false)}
                />
            )}

            {grading.upgradePromptMessage && (
                <UpgradePromptModal
                    message={grading.upgradePromptMessage}
                    onUpgrade={() => {
                        grading.setUpgradePromptMessage(null);
                        handleUpgrade();
                    }}
                    onAddApiKey={() => {
                        grading.setUpgradePromptMessage(null);
                        setShowSettings(true);
                    }}
                    onCancel={() => grading.setUpgradePromptMessage(null)}
                />
            )}

            {paymentCallback.paymentStatusMessage && (
                <PaymentStatusModal
                    message={paymentCallback.paymentStatusMessage}
                    onClose={() => paymentCallback.setPaymentStatusMessage(null)}
                />
            )}

            <AnimatePresence>
                {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

                {showRefresh && (
                    <RefreshModal
                        onConfirm={() => {
                            workspaceActions.handleRefresh(
                                grading.hasUnsavedResult, grading.result, markingScheme, studentPaper, workbookState.semesterCourse
                            );
                            setShowRefresh(false);
                        }}
                        onCancel={() => setShowRefresh(false)}
                    />
                )}

                {auth.showAuth && (
                    <AuthModal onClose={() => auth.setShowAuth(false)} onAuthSuccess={auth.handleAuthSuccess} />
                )}

                {showYaza && (
                    <YazaPanel
                        onClose={() => setShowYaza(false)}
                        authHeaders={auth.authHeaders}
                        studentInfo={studentInfo}
                        result={grading.result}
                        activeView={activeView}
                        hasStudentPaper={!!studentPaper}
                        isLoggedIn={!!auth.user}
                        onRequireLogin={() => auth.setShowAuth(true)}
                        sessionKey={workbookState.semesterCourse?.courseCode || 'general'}
                        onUpdateStudentInfo={(updates) => setStudentInfo(prev => ({ ...prev, ...updates }))}
                        onTriggerGrading={(mode) => {
                            grading.setMarkingModeState(mode);
                            setTimeout(() => grading.handleGrade(tools.resetTools), 100);
                        }}
                        onNavigateView={setActiveView}
                        onEditResultFeedback={(feedback) =>
                            grading.setResult(prev => prev ? { ...prev, feedback } : prev)
                        }
                        onEditQuestionScore={handleYazaEditQuestionScore}
                        onSaveResults={handleSaveWrapper}
                        onOpenSettings={() => setShowSettings(true)}
                        onOpenProfile={() => auth.setShowProfile(true)}
                    />
                )}

                {auth.showProfile && auth.user && (
                    <ProfileModal
                        user={auth.user}
                        onClose={() => auth.setShowProfile(false)}
                        onLogout={auth.handleLogout}
                        onOpenSettings={() => {
                            auth.setShowProfile(false);
                            setShowSettings(true);
                        }}
                        onSaveProfile={auth.handleSaveProfile}
                        onChangePassword={auth.handleChangePassword}
                        onDeleteAccount={auth.handleDeleteAccount}
                        onUploadAvatar={auth.handleUploadAvatar}
                        authHeaders={auth.authHeaders}
                    />
                )}

                {showSettings && (
                    <SettingsModal
                        user={auth.user}
                        onClose={() => setShowSettings(false)}
                        onSaveApiKeys={auth.handleSaveApiKeys}
                        authHeaders={auth.authHeaders}
                    />
                )}

                {showBatch && (
                    <BatchModal
                        onClose={() => setShowBatch(false)}
                        markingScheme={markingScheme}
                        onGradeSingle={grading.handleGradeSingle}
                        onSaveAll={(results) => history.handleSaveAllBatch(
                            results, auth.token, studentInfo, auth.setShowAuth, setShowBatch
                        )}
                    />
                )}

                {modals.modalType === 'new' && (
                    <NewSemesterModal
                        courses={workbookState.courses}
                        onConfirm={(semester) => modals.handleNewSemesterConfirm(semester, {
                            setSemesterCourse: workbookState.setSemesterCourse,
                            setSessions: workbookState.setSessions,
                            persistSession: workbookState.persistSession,
                            setStudentInfo,
                            resetForNewSession: () => {
                                grading.setMarkingModeState('ai');
                                tools.resetTools();
                            },
                        })}
                        onSkip={() => modals.handleSkipSemester(() => {
                            grading.setMarkingModeState('ai');
                            tools.resetTools();
                        })}
                        onCancel={modals.closeModal}
                    />
                )}

                {modals.modalType === 'continue' && workbookState.semesterCourse && (
                    <ContinueSemesterModal
                        semesterCourse={workbookState.semesterCourse}
                        uploadLabel={modals.pendingUpload === 'scheme' ? 'Uploading marking scheme' : 'Uploading student paper'}
                        onContinue={modals.handleContinueSemester}
                        onNewSemester={modals.handleStartNewFromContinue}
                        onCancel={modals.closeModal}
                    />
                )}

                {modals.showNewCourseModal && (
                    <NewCourseModal
                        currentSemesterCourse={workbookState.semesterCourse}
                        onConfirm={(updates) => modals.handleNewCourse(updates, {
                            workbook: workbookState.workbook,
                            token: auth.token,
                            setWorkbook: workbookState.setWorkbook,
                            setSemesterCourse: workbookState.setSemesterCourse,
                            setActiveSessionId: workbookState.setActiveSessionId,
                            setStudentInfo,
                            resetWorkspaceForNewCourse: () => {
                                setMarkingScheme(null);
                                setStudentPaper(null);
                                grading.setResult(null);
                                setExaminerRemarks('');
                                grading.setMarkingModeState('ai');
                                tools.resetTools();
                                setZoom(1);
                                setClearCount(c => c + 1);
                                setIsMaximized(false);
                                grading.setIsAutoMode(false);
                                setActiveView('grade');
                            },
                            persistWorkbook: workbookState.persistWorkbook,
                        })}
                        onCancel={() => modals.setShowNewCourseModal(false)}
                    />
                )}

                {modals.showNewSessionModal && (
                    <NewSessionModal
                        currentSemesterCourse={workbookState.semesterCourse}
                        courses={workbookState.courses}
                        onConfirm={(updates) => modals.handleNewSession(updates, {
                            hasUnsavedResult: grading.hasUnsavedResult,
                            token: auth.token,
                            setWorkbook: workbookState.setWorkbook,
                            setSemesterCourse: workbookState.setSemesterCourse,
                            setSessions: workbookState.setSessions,
                            setActiveSessionId: workbookState.setActiveSessionId,
                            setStudentInfo,
                            setHasUnsavedResult: grading.setHasUnsavedResult,
                            resetWorkspaceForNewCourse: () => {
                                setMarkingScheme(null);
                                setStudentPaper(null);
                                grading.setResult(null);
                                setExaminerRemarks('');
                                grading.setMarkingModeState('ai');
                                tools.resetTools();
                                setZoom(1);
                                setClearCount(c => c + 1);
                                setIsMaximized(false);
                                grading.setIsAutoMode(false);
                                setActiveView('grade');
                            },
                        })}
                        onCancel={() => modals.setShowNewSessionModal(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
