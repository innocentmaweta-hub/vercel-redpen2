import React, { forwardRef } from 'react';
import UploadZone from '../components/UploadZone';
import StudentForm from '../components/StudentForm';
import PaperCanvas from '../components/PaperCanvas';
import ResultsPanel from '../components/ResultsPanel';

interface GradeViewProps {
  // The hook return from useGrading; keeping it loose to avoid coupling in this initial split
  grading: any;
  paperCanvasRef: any;
  toolbarProps?: any;
}

export const GradeView = forwardRef<HTMLDivElement, GradeViewProps>(({ grading, paperCanvasRef, toolbarProps }, ref) => {
  return (
    <div ref={ref} className="flex-1 flex flex-col gap-4">
      <div className="flex gap-4 min-h-[180px]">
        <div className="w-[35%] shrink-0">
          <UploadZone
            label="Marking Scheme"
            hasFile={!!grading.markingScheme}
            onUpload={(base64: string, name: string) => grading.setMarkingScheme({ base64, name })}
            fileName={grading.markingScheme?.name}
            description="Upload Reference"
            variant="compact"
            optional
            onZoneClick={() => { /* pass-through */ }}
          />
        </div>

        <div className="flex-1">
          <StudentForm info={grading.studentInfo} onChange={grading.setStudentInfo} courses={[]} />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-card rounded-3xl border border-gray-800 shadow-xl relative overflow-hidden">
        <div className="flex-1 p-4 flex flex-col transition-all overflow-hidden">
          {grading.studentPaper ? (
            <PaperCanvas
              ref={paperCanvasRef}
              paperBase64={grading.studentPaper.base64}
              activeTool={toolbarProps?.activeTool}
              clearCount={toolbarProps?.clearCount}
              showOverlay={true}
              markingMode={'ai'}
              zoom={1}
              onZoomChange={() => {}}
              isMaximized={false}
              penColor="#FF0000"
              penSize={3}
              shapeColor="#FF0000"
              shapeSize={2}
              shapeType={'rectangle'}
              textColor="#FF0000"
              textSize={16}
              textFont={'Arial'}
              markingModeSetting={'none'}
              markSize={28}
              markThickness={2}
            />
          ) : (
            <UploadZone
              label="Student Answer Paper"
              hasFile={!!grading.studentPaper}
              onUpload={grading.handlePaperUpload}
              description="Large Surface for Student Paper Upload"
              variant="large"
              onZoneClick={() => {}}
            />
          )}
        </div>

        <div className="absolute bottom-6 right-6 flex flex-col gap-2 items-end">
          <button onClick={() => grading.handleGrade()} disabled={grading.loading || !grading.studentPaper} className="w-14 h-14 rounded-full bg-accent-blue text-white">{grading.loading ? '...' : 'Grade'}</button>
        </div>
      </div>

      <div className="w-[400px] p-4 shrink-0">
        <ResultsPanel result={grading.result} loading={grading.loading} onPrint={() => {}} onSave={grading.handleSave} isSaving={false} onResultChange={grading.setResult} />
      </div>
    </div>
  );
});

export default GradeView;
