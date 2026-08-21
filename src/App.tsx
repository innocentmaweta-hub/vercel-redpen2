import React, { useRef } from 'react';
import { GradeView } from './components/GradeView/GradeView';
import { useGrading } from './hooks/useGrading';
import { getSavedFolder, writeFileToFolder } from './lib/fileStorage';
import { buildPaperPdfBlob, buildPaperPdfFilename, appendResultToSessionExcel } from './lib/exportUtils';
import { SessionCourse } from './types';

export default function App() {
  const grading = useGrading();
  const paperCanvasRef = useRef<any>(null);

  // Minimal stub to save API keys from SettingsModal
  const handleSaveApiKeys = async (keys: { openaiKey?: string }) => {
    try {
      // Persist to localStorage for now; SettingsModal is expected to POST to server as well.
      if (keys.openaiKey) {
        localStorage.setItem('openai_api_key', keys.openaiKey);
      }
      alert('API keys saved (local).');
    } catch (err) {
      console.error('Failed to save API keys', err);
      alert('Failed to save API keys');
    }
  };

  const handleSaveRecord = async (record: any) => {
    try {
      const folder = await getSavedFolder();
      const paperImage = paperCanvasRef.current?.captureFullPaper();

      if (paperImage) {
        const pdfBlob = await buildPaperPdfBlob(paperImage);
        const pdfFilename = buildPaperPdfFilename(record.studentInfo);
        await writeFileToFolder(folder, pdfFilename, pdfBlob);
      }

      const workbookKey = {
        academicYear: record.studentInfo.academicYear || '',
        semester: record.studentInfo.semester || '',
        sessionLabel: record.studentInfo.sessionLabel || '',
        customName: record.studentInfo.customName || ''
      } as any;

      const courseSheetKey = record.studentInfo.courseCode || 'general';

      await appendResultToSessionExcel(folder, workbookKey, courseSheetKey, record.studentInfo, record.result);

      alert('Saved record and exported files.');
    } catch (err) {
      console.error('Export failed', err);
      alert('Saved to history but export failed.');
    }
  };

  return (
    <div className="app-root">
      <GradeView grading={grading} paperCanvasRef={paperCanvasRef} toolbarProps={{}} />
    </div>
  );
}
