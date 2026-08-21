import React, { useRef, useState, useMemo } from 'react';
import { GradeView } from './components/GradeView/GradeView';
import { useGrading } from './hooks/useGrading';
import { SessionProvider, useSession } from './contexts/SessionContext';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { YazaPanel } from './components/YazaPanel';
import { SettingsModal } from './components/SettingsModal';
import { ProfileModal } from './components/ProfileModal';
import { AuthModal } from './components/AuthModal';
import { BatchModal } from './components/BatchModal';
import { HelpModal } from './components/HelpModal';
import { RefreshModal } from './components/RefreshModal';
// Course/session related modals are exported from CourseSessionModal
import { NewSemesterModal, ContinueSemesterModal, NewCourseModal, NewSessionModal } from './components/CourseSessionModal';
import { AnimatePresence } from 'motion/react';

const AUTH_TOKEN_KEY = 'yaza_auth_token';

function InnerApp() {
  const grading = useGrading();
  const paperCanvasRef = useRef<any>(null);
  const session = useSession();

  const [activeView, setActiveView] = useState<'grade' | 'dashboard' | 'history' | 'remark'>('grade');
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showYaza, setShowYaza] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showRefresh, setShowRefresh] = useState(false);
  const [modalType, setModalType] = useState<'new' | 'continue' | null>(null);
  const [showNewCourseModal, setShowNewCourseModal] = useState(false);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);

  const handleSaveAndExport = async (resultToSave?: any) => {
    const record = await grading.handleSave(resultToSave);
    if (!record) return;

    const paperImage = paperCanvasRef.current?.captureFullPaper?.();

    try {
      await session.saveRecord(record, paperImage || null);
      alert('Saved to history and exported files.');
    } catch (err) {
      console.error('Save/export failed', err);
      alert('Saved to history but export failed.');
    }
  };

  const gradingWrapped = {
    ...grading,
    handleSave: handleSaveAndExport
  };

  const authHeaders = useMemo(() => {
    return () => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return headers;
    };
  }, []);

  const isLoggedIn = !!localStorage.getItem(AUTH_TOKEN_KEY);

  const handleLogin = () => setShowAuth(true);
  const handleLogout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.location.reload();
  };

  const handleLoadRecord = (r: any) => {
    if (!r) return;
    if (r.studentInfo) grading.setStudentInfo(r.studentInfo);
    if (r.result) grading.setResult(r.result);
    setActiveView('grade');
  };

  const handleNew = () => setModalType('new');
  const handleShowContinue = () => setModalType('continue');

  const handleSaveApiKeys = async (keys: { openaiKey?: string }) => {
    try {
      if (keys.openaiKey) {
        localStorage.setItem('openai_api_key', keys.openaiKey);
      }
      alert('API keys saved (local).');
    } catch (err) {
      console.error('Failed to save API keys', err);
      alert('Failed to save API keys');
    }
  };

  return (
    <div className="w-full h-screen flex bg-app-bg text-white">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        onSave={() => gradingWrapped.handleSave()}
        onHelp={() => setShowHelp(true)}
        hasResult={!!grading.result}
        user={null}
        isAutoMode={false}
        onProfile={() => setShowProfile(true)}
        onAutoModeToggle={() => {}}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          onNew={handleNew}
          onNewCourse={() => setShowNewCourseModal(true)}
          onNewSession={() => setShowNewSessionModal(true)}
          onNewPaper={() => { /* could trigger global upload handlers */ }}
          onSave={() => gradingWrapped.handleSave()}
          onPrint={() => grading.handlePrint()}
          onClearResult={() => grading.setResult(null)}
          onRefresh={() => setShowRefresh(true)}
          onSettings={() => setShowSettings(true)}
          onBatch={() => setShowBatch(true)}
          hasResult={!!grading.result}
          studentInfo={grading.studentInfo}
          onStudentInfoUpdate={(u) => grading.setStudentInfo({ ...grading.studentInfo, ...u })}
          history={session.history}
          courses={[]}
          onShowOldSessions={handleShowContinue}
          schools={[]}
          departments={[]}
          onShowAddSchool={() => {}}
          onShowAddDepartment={() => {}}
          onSearchTermChange={() => {}}
          isLoggedIn={isLoggedIn}
          onLogin={handleLogin}
          onLogout={handleLogout}
          onToggleYaza={() => setShowYaza(v => !v)}
          isYazaOpen={showYaza}
          onViewChange={setActiveView}
          onProfile={() => setShowProfile(true)}
          onLoadRecord={handleLoadRecord}
        />

        <main className="flex-1 overflow-hidden p-6">
          <AnimatePresence>
            {activeView === 'grade' && (
              <GradeView grading={gradingWrapped} paperCanvasRef={paperCanvasRef} toolbarProps={{}} />
            )}

            {activeView === 'history' && (
              <div className="p-6">History view not yet implemented in this refactor.</div>
            )}

            {activeView === 'dashboard' && (
              <div className="p-6">Dashboard view not yet implemented in this refactor.</div>
            )}

            {activeView === 'remark' && (
              <div className="p-6">Remark view not yet implemented in this refactor.</div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {showYaza && (
          <YazaPanel
            onClose={() => setShowYaza(false)}
            authHeaders={authHeaders}
            studentInfo={grading.studentInfo}
            result={grading.result}
            activeView={activeView}
            hasStudentPaper={!!grading.studentPaper}
            isLoggedIn={isLoggedIn}
            onRequireLogin={() => setShowAuth(true)}
            sessionKey={grading.studentInfo?.courseCode || 'general'}
            onUpdateStudentInfo={(updates: any) => grading.setStudentInfo({ ...grading.studentInfo, ...updates })}
            onTriggerGrading={(mode: any) => { /* trigger grading mode - simple call */ grading.handleGrade(); }}
            onNavigateView={setActiveView}
            onEditResultFeedback={(feedback: string) => grading.setResult(prev => prev ? { ...prev, feedback } : prev)}
            onEditQuestionScore={(qIdx: number, score: string) => { /* not wired */ }}
            onSaveResults={(res: any) => gradingWrapped.handleSave(res)}
            onOpenSettings={() => setShowSettings(true)}
            onOpenProfile={() => setShowProfile(true)}
          />
        )}

        {showProfile && (
          <ProfileModal
            user={null}
            onClose={() => setShowProfile(false)}
            onLogout={handleLogout}
            onOpenSettings={() => { setShowProfile(false); setShowSettings(true); }}
            onSaveProfile={() => {}}
            onChangePassword={() => {}}
            onDeleteAccount={() => {}}
            onUploadAvatar={() => {}}
            authHeaders={authHeaders}
          />
        )}

        {showAuth && (
          <AuthModal onClose={() => setShowAuth(false)} onAuthSuccess={() => setShowAuth(false)} />
        )}

        {showSettings && (
          <SettingsModal user={null} onClose={() => setShowSettings(false)} onSaveApiKeys={handleSaveApiKeys} authHeaders={authHeaders} />
        )}

        {showBatch && (
          <BatchModal onClose={() => setShowBatch(false)} markingScheme={grading.markingScheme} onGradeSingle={(b64: string) => grading.handleGrade()} onSaveAll={(arr: any[]) => { /* not implemented */ }} />
        )}

        {showHelp && (
          <HelpModal onClose={() => setShowHelp(false)} />
        )}

        {showRefresh && (
          <RefreshModal onConfirm={() => window.location.reload()} onCancel={() => setShowRefresh(false)} />
        )}

        {modalType === 'new' && (
          <NewSemesterModal courses={[]} onConfirm={() => setModalType(null)} onSkip={() => setModalType(null)} onCancel={() => setModalType(null)} />
        )}

        {modalType === 'continue' && (
          <ContinueSemesterModal semesterCourse={null as any} uploadLabel={''} onContinue={() => setModalType(null)} onNewSemester={() => setModalType('new')} onCancel={() => setModalType(null)} />
        )}

        {showNewCourseModal && (
          <NewCourseModal currentSemesterCourse={null as any} onConfirm={() => setShowNewCourseModal(false)} onCancel={() => setShowNewCourseModal(false)} />
        )}

        {showNewSessionModal && (
          <NewSessionModal currentSemesterCourse={null as any} courses={[]} onConfirm={() => setShowNewSessionModal(false)} onCancel={() => setShowNewSessionModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <InnerApp />
    </SessionProvider>
  );
}
