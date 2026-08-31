import { TopBar } from './TopBar';
import { AppMainContent } from './AppMainContent';
import { AppModals } from './AppModals';

interface AppLayoutProps {
    app: ReturnType<typeof import('../hooks/useAppState').useAppState>;
}

export function AppLayout({ app }: AppLayoutProps) {
    const { auth, history, workbookState, grading, modals } = app;

    return (
        <div className="flex flex-col bg-bg-dark h-screen overflow-hidden text-ink border-4 border-gray-900 shadow-2xl">
            <TopBar
                sessions={workbookState.sessions}
                activeSession={workbookState.semesterCourse}
                onSelectSession={app.handleSelectSessionFromTopBar}
                onLoadSessionFromFile={() => modals.setShowOldSessionModal(true)}
                onNew={() => app.workspaceActions.handleNew(
                    grading.hasUnsavedResult, grading.result, app.markingScheme, app.studentPaper
                )}
                onSave={app.handleSave}
                onPrint={app.handlePrint}
                onClearResult={() => grading.setResult(null)}
                onRefresh={() => app.setShowRefresh(true)}
                onSettings={() => app.setShowSettings(true)}
                onBatch={() => {
                    if (!auth.user) {
                        auth.setShowAuth(true);
                        return;
                    }
                    app.setShowBatch(true);
                }}
                hasResult={!!grading.result}
                studentInfo={app.studentInfo}
                onStudentInfoUpdate={(updates) => app.setStudentInfo(prev => ({ ...prev, ...updates }))}
                history={history.history}
                onShowOldSessions={() => modals.setShowOldSessionModal(true)}
                onSearchTermChange={(term) => workbookState.setSearchTerm(term)}
                onNewCourse={() => modals.setShowNewCourseModal(true)}
                onNewSession={() => modals.setShowNewSessionModal(true)}
                onNewPaper={() => app.workspaceActions.handleNewPaper(
                    workbookState.semesterCourse, workbookState.activeSessionId, grading.result, app.studentPaper
                )}
                onToggleYaza={() => app.setShowYaza((v: boolean) => !v)}
                isYazaOpen={app.showYaza}
                isLoggedIn={!!auth.user}
                onLogin={() => auth.setShowAuth(true)}
                onLogout={auth.handleLogout}
                onViewChange={app.setActiveView}
                onProfile={() => {
                    if (!auth.user) auth.setShowAuth(true);
                    else auth.setShowProfile(true);
                }}
                onLoadRecord={app.handleLoadRecord}
            />

            {auth.user && app.activeView === 'dashboard' && (
                <div className="px-4 py-2 border-b" />
            )}

            <AppMainContent app={app} />
            <AppModals app={app} />
        </div>
    );
}
