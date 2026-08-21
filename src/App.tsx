import React, { useRef } from 'react';
import { GradeView } from './components/GradeView/GradeView';
import { useGrading } from './hooks/useGrading';
import { SessionProvider, useSession } from './contexts/SessionContext';

function InnerApp() {
  const grading = useGrading();
  const paperCanvasRef = useRef<any>(null);
  const session = useSession();

  // Wrap grading.handleSave to persist via SessionContext + export using PaperCanvas capture
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

  // Minimal stub to save API keys from SettingsModal — leave as before
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
    <div className="app-root">
      <GradeView grading={gradingWrapped} paperCanvasRef={paperCanvasRef} toolbarProps={{}} />
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
