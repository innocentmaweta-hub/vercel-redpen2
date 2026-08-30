import { useRef } from 'react';
import { motion } from 'motion/react';
import { UploadZone, UploadZoneHandle } from './UploadZone';
import { StudentForm } from './StudentForm';
import { PaperCanvas, PaperCanvasHandle } from './PaperCanvas';
import { ResultsPanel } from './ResultsPanel';
import { ToolOptionsBar } from './ToolOptionsBar';
import { CloudSaveStatus } from './CloudSaveStatus';
import { CanvasToolbar } from './CanvasToolbar';
import { GradeFab } from './GradeFab';
import { SessionStatusBar } from './SessionStatusBar';
import { StudentInfo, GradingResult } from '../types';
import { SemesterCourse } from './CourseSessionModal';
import type { RedPenWorkbook } from '../types/workbook';

interface GradeWorkspaceProps {
    // layout
    isMaximized: boolean;
    setIsMaximized: (v: boolean) => void;

    // session status
    semesterCourse: SemesterCourse | null;
    showSessionStatus: boolean;
    sessionSaveState: 'idle' | 'saving' | 'saved' | 'error';
    onRetrySessionSave: () => void;
    onDismissSessionStatus: () => void;
    workbook: RedPenWorkbook | null;
    token: string | null;
    setWorkbook: (w: RedPenWorkbook | null) => void;
    setSessions: (s: SemesterCourse[]) => void;
    setSemesterCourse: (s: SemesterCourse | null) => void;
    setActiveSessionId: (id: string | null) => void;
    setSessionSaveState: (s: 'idle' | 'saving' | 'saved' | 'error') => void;

    // upload
    schemeRef: React.RefObject<UploadZoneHandle>;
    paperRef: React.RefObject<UploadZoneHandle>;
    markingScheme: { base64: string; name: string } | null;
    setMarkingScheme: (v: { base64: string; name: string } | null) => void;
    studentPaper: { base64: string; name: string } | null;
    onPaperUpload: (base64: string, name: string) => void;
    onOpenUploadModal: (type: 'scheme' | 'paper') => void;
    onClearStudentPaper: () => void;

    // student form
    studentInfo: StudentInfo;
    onStudentInfoChange: (info: StudentInfo) => void;
    courses: { courseCode: string; courseName: string }[];
    hasUnsavedResult: boolean;
    onNewCourse: () => void;

    // canvas / tools
    paperCanvasRef: React.RefObject<PaperCanvasHandle>;
    activeTool: string | null;
    setActiveTool: (t: string | null) => void;
    clearCount: number;
    markingMode: 'self' | 'ai';
    isAutoMode: boolean;
    zoom: number;
    setZoom: (fn: (z: number) => number) => void;
    showToolOptions: boolean;
    setShowToolOptions: (v: boolean) => void;
    onToggleMarkingMode: () => void;
    onToolOptionInteraction: () => void;

    penColor: string; setPenColor: (c: string) => void;
    penSize: number; setPenSize: (s: number) => void;
    shapeColor: string; setShapeColor: (c: string) => void;
    shapeSize: number; setShapeSize: (s: number) => void;
    shapeType: 'rectangle' | 'ellipse' | 'line' | 'triangle'; setShapeType: (t: any) => void;
    textColor: string; setTextColor: (c: string) => void;
    textSize: number; setTextSize: (s: number) => void;
    textFont: string; setTextFont: (f: string) => void;
    markingModeSetting: 'none' | 'right' | 'wrong'; setMarkingModeSetting: (m: any) => void;
    markSize: number; setMarkSize: (s: number) => void;
    markThickness: number; setMarkThickness: (t: number) => void;

    // grading
    loading: boolean;
    onGrade: () => void;

    // results
    result: GradingResult | null;
    historySaveState: 'idle' | 'saving' | 'saved' | 'error';
    onRetryHistorySave: () => void;
    onPrint: () => void;
    onSave: () => void;
    isSaving: boolean;
    onResultChange: (result: GradingResult) => void;
}

export function GradeWorkspace(props: GradeWorkspaceProps) {
    const {
        isMaximized, setIsMaximized,
        semesterCourse, showSessionStatus, sessionSaveState, onRetrySessionSave, onDismissSessionStatus,
        workbook, token, setWorkbook, setSessions, setSemesterCourse, setActiveSessionId, setSessionSaveState,
        schemeRef, paperRef, markingScheme, setMarkingScheme, studentPaper, onPaperUpload,
        onOpenUploadModal, onClearStudentPaper,
        studentInfo, onStudentInfoChange, courses, hasUnsavedResult, onNewCourse,
        paperCanvasRef, activeTool, setActiveTool, clearCount, markingMode, isAutoMode,
        zoom, setZoom, showToolOptions, setShowToolOptions, onToggleMarkingMode, onToolOptionInteraction,
        penColor, setPenColor, penSize, setPenSize, shapeColor, setShapeColor, shapeSize, setShapeSize,
        shapeType, setShapeType, textColor, setTextColor, textSize, setTextSize, textFont, setTextFont,
        markingModeSetting, setMarkingModeSetting, markSize, setMarkSize, markThickness, setMarkThickness,
        loading, onGrade,
        result, historySaveState, onRetryHistorySave, onPrint, onSave, isSaving, onResultChange,
    } = props;

    const showWarning = !markingScheme && !!studentPaper && markingMode === 'ai';

    const handleStudentFormChange = (nextInfo: StudentInfo) => {
        const sessionChanged =
            nextInfo.courseCode !== studentInfo.courseCode ||
            nextInfo.year !== studentInfo.year ||
            nextInfo.semester !== studentInfo.semester ||
            nextInfo.academicYear !== studentInfo.academicYear;

        // StudentForm owns the confirmation flow for course/semester/workbook
        // changes; once confirmed, the result is treated as detached.
        // (hasUnsavedResult reset happens in the parent via onStudentInfoChange
        // — see the note in App.tsx wiring.)
        onStudentInfoChange(nextInfo);
    };

    return (
        <>
            <div className={`${isMaximized ? 'flex-1 p-0' : 'flex-[3] p-4'} flex flex-col gap-4 overflow-hidden`}>
                {semesterCourse && !isMaximized && showSessionStatus && (
                    <SessionStatusBar
                        semesterCourse={semesterCourse}
                        sessionSaveState={sessionSaveState}
                        onRetry={onRetrySessionSave}
                        onDismiss={onDismissSessionStatus}
                        workbook={workbook}
                        token={token}
                        setWorkbook={setWorkbook}
                        setSessions={setSessions}
                        setSemesterCourse={setSemesterCourse}
                        setActiveSessionId={setActiveSessionId}
                        setSessionSaveState={setSessionSaveState}
                    />
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
                                onZoneClick={() => onOpenUploadModal('scheme')}
                            />
                        </div>

                        <div className="flex-1">
                            <StudentForm
                                info={studentInfo}
                                onChange={handleStudentFormChange}
                                courses={courses}
                                hasUnsavedResult={hasUnsavedResult}
                                onNewCourse={onNewCourse}
                            />
                        </div>
                    </div>
                )}

                <div className="flex-1 flex flex-col min-h-0 bg-card rounded-3xl border border-gray-800 shadow-xl relative overflow-hidden">
                    <CanvasToolbar
                        activeTool={activeTool}
                        setActiveTool={setActiveTool}
                        zoom={zoom}
                        setZoom={setZoom}
                        studentPaper={studentPaper}
                        markingScheme={markingScheme}
                        markingMode={markingMode}
                        isAutoMode={isAutoMode}
                        isMaximized={isMaximized}
                        setIsMaximized={setIsMaximized}
                        showToolOptions={showToolOptions}
                        setShowToolOptions={setShowToolOptions}
                        onUndo={() => paperCanvasRef.current?.undo()}
                        onRedo={() => paperCanvasRef.current?.redo()}
                        onRestart={() => paperCanvasRef.current?.restart()}
                        onClearStudentPaper={onClearStudentPaper}
                        onToggleMarkingMode={onToggleMarkingMode}
                    />

                    {showToolOptions && activeTool &&
                        (activeTool === 'pen' || activeTool === 'shape' || activeTool === 'text' ||
                         activeTool === 'mark' || activeTool === 'mark-right' || activeTool === 'mark-wrong') && (
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
                                onInteraction={onToolOptionInteraction}
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
                                showOverlay={markingMode === 'ai' || markingMode === 'self'}
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
                                onUpload={onPaperUpload}
                                fileName={undefined}
                                description="Large Surface for Student Paper Upload"
                                variant="large"
                                onZoneClick={() => onOpenUploadModal('paper')}
                            />
                        )}
                    </div>

                    <GradeFab
                        onClick={onGrade}
                        loading={loading}
                        disabled={loading || !studentPaper}
                        showWarning={showWarning}
                    />
                </div>
            </div>

            <div className={`${isMaximized ? 'hidden' : 'w-[400px]'} p-4 shrink-0 overflow-hidden`}>
                <div className="flex items-center justify-end px-2 pb-1">
                    <CloudSaveStatus state={historySaveState} onRetry={onRetryHistorySave} label="Result" />
                </div>

                <ResultsPanel
                    result={result}
                    loading={loading}
                    onPrint={onPrint}
                    onSave={onSave}
                    isSaving={isSaving}
                    onResultChange={onResultChange}
                />
            </div>
        </>
    );
}
