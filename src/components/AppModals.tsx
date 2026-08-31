import { AnimatePresence } from 'motion/react';
import { HelpModal } from './HelpModal';
import { RefreshModal } from './RefreshModal';
import { AuthModal } from './AuthModal';
import { ProfileModal } from './ProfileModal';
import { SettingsModal } from './SettingsModal';
import { BatchModal } from './BatchModal';
import { YazaPanel } from './YazaPanel';
import { OldSessionModal } from './OldSessionModal';
import { UpgradePromptModal } from './UpgradePromptModal';
import { PaymentStatusModal } from './PaymentStatusModal';
import {
    NewSemesterModal, ContinueSemesterModal, NewCourseModal, NewSessionModal,
} from './CourseSessionModal';

interface AppModalsProps {
    app: ReturnType<typeof import('../hooks/useAppState').useAppState>;
}

export function AppModals({ app }: AppModalsProps) {
    const { auth, history, workbookState, tools, grading, modals, workspaceActions, paymentCallback } = app;

    return (
        <>
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
                        setStudentInfo: app.setStudentInfo,
                        setSemesterCourse: workbookState.setSemesterCourse,
                        setActiveSessionId: workbookState.setActiveSessionId,
                        resetForCourseSwitch: app.resetForCourseSwitch,
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
                        resetWorkspaceForImport: app.resetWorkspaceForImport,
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
                        app.handleUpgrade();
                    }}
                    onAddApiKey={() => {
                        grading.setUpgradePromptMessage(null);
                        app.setShowSettings(true);
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
                {app.showHelp && <HelpModal onClose={() => app.setShowHelp(false)} />}

                {app.showRefresh && (
                    <RefreshModal
                        onConfirm={() => {
                            workspaceActions.handleRefresh(
                                grading.hasUnsavedResult, grading.result, app.markingScheme,
                                app.studentPaper, workbookState.semesterCourse
                            );
                            app.setShowRefresh(false);
                        }}
                        onCancel={() => app.setShowRefresh(false)}
                    />
                )}

                {auth.showAuth && (
                    <AuthModal onClose={() => auth.setShowAuth(false)} onAuthSuccess={auth.handleAuthSuccess} />
                )}

                {app.showYaza && (
                    <YazaPanel
                        onClose={() => app.setShowYaza(false)}
                        authHeaders={auth.authHeaders}
                        studentInfo={app.studentInfo}
                        result={grading.result}
                        activeView={app.activeView}
                        hasStudentPaper={!!app.studentPaper}
                        isLoggedIn={!!auth.user}
                        onRequireLogin={() => auth.setShowAuth(true)}
                        sessionKey={workbookState.semesterCourse?.courseCode || 'general'}
                        onUpdateStudentInfo={(updates) => app.setStudentInfo(prev => ({ ...prev, ...updates }))}
                        onTriggerGrading={(mode) => {
                            grading.setMarkingModeState(mode);
                            setTimeout(() => grading.handleGrade(tools.resetTools), 100);
                        }}
                        onNavigateView={app.setActiveView}
                        onEditResultFeedback={(feedback) =>
                            grading.setResult(prev => prev ? { ...prev, feedback } : prev)
                        }
                        onEditQuestionScore={app.handleYazaEditQuestionScore}
                        onSaveResults={app.handleSave}
                        onOpenSettings={() => app.setShowSettings(true)}
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
                            app.setShowSettings(true);
                        }}
                        onSaveProfile={auth.handleSaveProfile}
                        onChangePassword={auth.handleChangePassword}
                        onDeleteAccount={auth.handleDeleteAccount}
                        onUploadAvatar={auth.handleUploadAvatar}
                        authHeaders={auth.authHeaders}
                    />
                )}

                {app.showSettings && (
                    <SettingsModal
                        user={auth.user}
                        onClose={() => app.setShowSettings(false)}
                        onSaveApiKeys={auth.handleSaveApiKeys}
                        authHeaders={auth.authHeaders}
                    />
                )}

                {app.showBatch && (
                    <BatchModal
                        onClose={() => app.setShowBatch(false)}
                        markingScheme={app.markingScheme}
                        onGradeSingle={grading.handleGradeSingle}
                        onSaveAll={(results) => history.handleSaveAllBatch(
                            results, auth.token, app.studentInfo, auth.setShowAuth, app.setShowBatch
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
                            setStudentInfo: app.setStudentInfo,
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
                            setStudentInfo: app.setStudentInfo,
                            resetWorkspaceForNewCourse: app.resetWorkspaceForNewCourse,
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
                            setStudentInfo: app.setStudentInfo,
                            setHasUnsavedResult: grading.setHasUnsavedResult,
                            resetWorkspaceForNewCourse: app.resetWorkspaceForNewCourse,
                        })}
                        onCancel={() => modals.setShowNewSessionModal(false)}
                    />
                )}
            </AnimatePresence>
        </>
    );
}
