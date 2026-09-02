import { Sidebar } from './Sidebar';
import { HistoryPanel } from './HistoryPanel';
import { RemarkPanel } from './RemarkPanel';
import { PostsPage } from './PostsPage';
import { GradeWorkspace } from './GradeWorkspace';

function normalizeEditedResult(nextResult: any) {
    if (!nextResult || !Array.isArray(nextResult.questions) || nextResult.questions.length === 0) {
        return nextResult;
    }

    const allQuestionsScored = nextResult.questions.every((question: any) => {
        const value = typeof question?.score === 'string' ? question.score.trim() : '';
        return /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.test(value);
    });

    if (!allQuestionsScored) {
        return { ...nextResult, totalScore: '', percentage: '', grade: '' };
    }

    return nextResult;
}

interface AppMainContentProps { app: ReturnType<typeof import('../hooks/useAppState').useAppState>; }

export function AppMainContent({ app }: AppMainContentProps) {
    const { auth, history, workbookState, tools, grading, modals } = app;
    const activeWorksheet = workbookState.workbook?.sheets.find(
        sheet => sheet.id === workbookState.activeWorksheetId
    ) || null;
    const handleMarkingModeToggle = () => {
        const nextMode = app.markingMode === 'ai' ? 'self' : 'ai';
        if (nextMode === 'ai' && !app.confirmDiscardUnsavedWork('switch to AI marking')) return;
        grading.handleMarkingModeChange(nextMode, tools.resetTools, grading.isAutoMode);
    };
    return <div className="flex-1 flex min-w-0 overflow-hidden">
        <Sidebar activeView={app.activeView} onViewChange={(view) => modals.handleViewChange(view, workbookState.semesterCourse, workbookState.activeSessionId, app.setActiveView)} onSave={app.handleSave} onHelp={() => app.setShowHelp(true)} hasResult={!!grading.result} user={auth.user} isAutoMode={grading.isAutoMode} onProfile={() => { if (!auth.user) auth.setShowAuth(true); else auth.setShowProfile(true); }} onAutoModeToggle={() => grading.setIsAutoMode((v: boolean) => !v)} markingMode={app.markingMode} onMarkingModeToggle={handleMarkingModeToggle} />
        <main className="flex-1 flex overflow-hidden">
            {app.activeView === 'dashboard' ? <PostsPage activeWorksheet={activeWorksheet} onGrade={() => modals.handleViewChange('grade', workbookState.semesterCourse, workbookState.activeSessionId, app.setActiveView)} history={history.history} /> : app.activeView === 'history' ? <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden"><HistoryPanel history={history.history} onLoad={app.handleLoadRecord} onDelete={(id) => history.handleDeleteRecord(id, auth.token)} workbooks={workbookState.workbooks} activeWorkbook={workbookState.activeWorkbook} onLoadWorkbook={app.handleSelectWorkbookFromTopBar} /></div> : app.activeView === 'remark' ? <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden"><RemarkPanel remarks={app.examinerRemarks} onChange={app.setExaminerRemarks} onSave={app.handleSaveRemarks} studentName={app.studentInfo.name} /></div> : <GradeWorkspace isMaximized={app.isMaximized} setIsMaximized={app.setIsMaximized} semesterCourse={workbookState.semesterCourse} showSessionStatus={workbookState.showSessionStatus} sessionSaveState={workbookState.sessionSaveState} onRetrySessionSave={() => { if (workbookState.semesterCourse) workbookState.persistSession(workbookState.semesterCourse); }} onDismissSessionStatus={() => workbookState.setShowSessionStatus(false)} workbook={workbookState.workbook} token={auth.token} setWorkbook={workbookState.setWorkbook} setSessions={workbookState.setSessions} setSemesterCourse={workbookState.setSemesterCourse} setActiveSessionId={workbookState.setActiveSessionId} setSessionSaveState={workbookState.setSessionSaveState} schemeRef={app.schemeRef} paperRef={app.paperRef} markingScheme={app.markingScheme} setMarkingScheme={app.setMarkingScheme} studentPaper={app.studentPaper} onPaperUpload={app.handlePaperUpload} onOpenUploadModal={(type) => modals.openUploadModal(type, workbookState.semesterCourse)} onClearStudentPaper={app.handleClearStudentPaper} studentInfo={app.studentInfo} onStudentInfoChange={app.handleStudentInfoChange} courses={workbookState.courses} hasUnsavedResult={grading.hasUnsavedResult} onNewCourse={app.handleNewCourse} paperCanvasRef={app.paperCanvasRef} activeTool={tools.activeTool} setActiveTool={tools.setActiveTool} clearCount={app.clearCount} markingMode={app.markingMode} isAutoMode={grading.isAutoMode} zoom={app.zoom} setZoom={app.setZoom} showToolOptions={tools.showToolOptions} setShowToolOptions={tools.setShowToolOptions} onToggleMarkingMode={handleMarkingModeToggle} onToolOptionInteraction={tools.handleToolOptionInteraction} penColor={tools.penColor} setPenColor={tools.setPenColor} penSize={tools.penSize} setPenSize={tools.setPenSize} shapeColor={tools.shapeColor} setShapeColor={tools.setShapeColor} shapeSize={tools.shapeSize} setShapeSize={tools.setShapeSize} shapeType={tools.shapeType} setShapeType={tools.setShapeType} textColor={tools.textColor} setTextColor={tools.setTextColor} textSize={tools.textSize} setTextSize={tools.setTextSize} textFont={tools.textFont} setTextFont={tools.setTextFont} markingModeSetting={tools.markingModeSetting} setMarkingModeSetting={tools.setMarkingModeSetting} markSize={tools.markSize} setMarkSize={tools.setMarkSize} markThickness={tools.markThickness} setMarkThickness={tools.setMarkThickness} loading={grading.loading} onGrade={app.handleGradeButtonClick} result={grading.result} historySaveState={history.historySaveState} onRetryHistorySave={() => history.retryHistorySave(auth.token)} onPrint={app.handlePrint} onSave={() => app.handleSave()} isSaving={history.isSaving} onResultChange={(nextResult) => { const safeResult = normalizeEditedResult(nextResult); grading.setResult(safeResult); grading.setHasUnsavedResult(true); }} />}
        </main>
    </div>;
}
