import { TopBar } from './TopBar';
import { AppMainContent } from './AppMainContent';
import { AppModals } from './AppModals';

interface AppLayoutProps { app: ReturnType<typeof import('../hooks/useAppState').useAppState>; }

export function AppLayout({ app }: AppLayoutProps) {
    const { auth, history, workbookState, grading, modals } = app;

    return (
        <div className="flex flex-col bg-bg-dark h-screen overflow-hidden text-ink border-4 border-gray-900 shadow-2xl">
            <TopBar
                sessions={workbookState.sessions}
                activeSession={workbookState.semesterCourse}
                onSelectSession={app.handleSelectSessionFromTopBar}
                onLoadSessionFromFile={app.handleLoadSessions}
                onNew={app.handleNew}
                onSave={app.handleSave}
                onPrint={app.handlePrint}
                onClearResult={app.handleClearResult}
                onRefresh={() => app.setShowRefresh(true)}
                onSettings={() => app.setShowSettings(true)}
                onBatch={() => {
                    if (!auth.user) { auth.setShowAuth(true); return; }
                    app.setShowBatch(true);
                }}
                hasResult={!!grading.result}
                studentInfo={app.studentInfo}
                onStudentInfoUpdate={(updates) => app.setStudentInfo(prev => ({ ...prev, ...updates }))}
                history={history.history}
                onShowOldSessions={app.handleLoadSessions}
                onSearchTermChange={(term) => workbookState.setSearchTerm(term)}
                onNewCourse={app.handleNewCourse}
                onNewSession={app.handleNewSession}
                onNewPaper={app.handleNewPaper}
                onToggleYaza={() => app.setShowYaza((v: boolean) => !v)}
                isYazaOpen={app.showYaza}
                isLoggedIn={!!auth.user}
                onLogin={() => auth.setShowAuth(true)}
                onLogout={app.handleLogout}
                onViewChange={app.handleViewChange}
                onProfile={() => {
                    if (!auth.user) auth.setShowAuth(true);
                    else auth.setShowProfile(true);
                }}
                onLoadRecord={app.handleLoadRecord}
            />

            {auth.user && app.activeView === 'dashboard' && <div className="px-4 py-2 border-b" />}

            <AppMainContent app={app} />
            <AppModals app={app} />
        </div>
    );
}