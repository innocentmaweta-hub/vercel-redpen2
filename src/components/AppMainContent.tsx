import { Sidebar } from './Sidebar';
import { HistoryPanel } from './HistoryPanel';
import { RemarkPanel } from './RemarkPanel';
import { PostsPage } from './PostsPage';
import { GradeWorkspace } from './GradeWorkspace';

interface AppMainContentProps {
    app: ReturnType<typeof import('../hooks/useAppState').useAppState>;
}

export function AppMainContent({ app }: AppMainContentProps) {
    const { auth, history, workbookState, tools, grading, modals, workspaceActions } = app;

    return (
        <div className="flex-1 flex min-w-0 overflow-hidden">
            <Sidebar
                activeView={app.activeView}
                onViewChange={(view) => modals.handleViewChange(
                    view, workbookState.semesterCourse, workbookState.activeSessionId, app.setActiveView
                )}
                onSave={app.handleSave}
                onHelp={() => app.setShowHelp(true)}
                hasResult={!!grading.result}
                user={auth.user}
                isAutoMode={grading.isAutoMode}
                onProfile={() => {
                    if (!auth.user) auth.setShowAuth(true);
                    else auth.setShowProfile(true);
                }}
                onAutoModeToggle={() => grading.setIsAutoMode((v: boolean) => !v)}
            />

            <main className="flex-1 flex overflow-hidden">
                {app.activeView === 'dashboard' ? (
                    <PostsPage
                        history={history.history}
                        onGrade={() => modals.handleViewChange(
                            'grade', workbookState.semesterCourse, workbookState.activeSessionId, app.setActiveView
                        )}
                    />
                ) : app.activeView === 'history' ? (
                    <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                        <HistoryPanel
                            history={history.history}
                            onLoad={app.handleLoadRecord}
                            onDelete={(id) => history.handleDeleteRecord(id, auth.token)}
                            sessions={workbookState.sessions}
                            onLoadSession={(session) => modals.loadOldSemester(session, {
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
                            onSessionsChanged={workbookState.setSessions}
                        />
                    </div>
                ) : app.activeView === 'remark' ? (
                    <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                        <RemarkPanel
                            remarks={app.examinerRemarks}
                            onChange={app.setExaminerRemarks}
                            onSave={app.handleSaveRemarks}
                            studentName={app.studentInfo.name}
                        />
                    </div>
                ) : (
                    <GradeWorkspace
                        isMaximized={app.isMaximized}
                        setIsMaximized={app.setIsMaximized}
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
                        schemeRef={app.schemeRef}
                        paperRef={app.paperRef}
                        markingScheme={app.markingScheme}
                        setMarkingScheme={app.setMarkingScheme}
                        studentPaper={app.studentPaper}
                        onPaperUpload={workspaceActions.handlePaperUpload}
                        onOpenUploadModal={(type) => modals.openUploadModal(type, workbookState.semesterCourse)}
                        onClearStudentPaper={workspaceActions.handleClearStudentPaper}
                        studentInfo={app.studentInfo}
                        onStudentInfoChange={app.handleStudentInfoChange}
                        courses={workbookState.courses}
                        hasUnsavedResult={grading.hasUnsavedResult}
                        onNewCourse={() => modals.setShowNewCourseModal(true)}
                        paperCanvasRef={app.paperCanvasRef}
                        activeTool={tools.activeTool}
                        setActiveTool={tools.setActiveTool}
                        clearCount={app.clearCount}
                        markingMode={app.markingMode}
                        isAutoMode={grading.isAutoMode}
                        zoom={app.zoom}
                        setZoom={app.setZoom}
                        showToolOptions={tools.showToolOptions}
                        setShowToolOptions={tools.setShowToolOptions}
                        onToggleMarkingMode={() => grading.handleMarkingModeChange(
                            app.markingMode === 'ai' ? 'self' : 'ai', tools.resetTools, grading.isAutoMode
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
                        onGrade={app.handleGradeButtonClick}
                        result={grading.result}
                        historySaveState={history.historySaveState}
                        onRetryHistorySave={() => history.retryHistorySave(auth.token)}
                        onPrint={app.handlePrint}
                        onSave={() => app.handleSave()}
                        isSaving={history.isSaving}
                        onResultChange={(nextResult) => {
                            grading.setResult(nextResult);
                            grading.setHasUnsavedResult(true);
                        }}
                    />
                )}
            </main>
        </div>
    );
}
