import React from 'react';
import { FileSpreadsheet, FolderOpen, Plus } from 'lucide-react';

interface Props {
  onOpen: () => void;
  onCreate: () => void;
}

export const WorkbookWelcome = ({ onOpen, onCreate }: Props) => (
  <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
    <div className="w-full max-w-xl text-center">
      <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
        <FileSpreadsheet size={30} className="text-accent-blue" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.25em] font-black text-accent-blue mb-2">RedPen</p>
      <h1 className="text-3xl font-black text-white">Welcome to RedPen</h1>
      <p className="mt-3 text-sm text-gray-500 max-w-md mx-auto">Your grading workspace starts with an Excel workbook. Open an existing workbook or create a new one.</p>

      <div className="grid sm:grid-cols-2 gap-3 mt-8">
        <button type="button" onClick={onOpen} className="group rounded-2xl border border-gray-800 bg-gray-900/60 p-5 text-left hover:border-accent-blue/40 hover:bg-white/5 transition-colors">
          <FolderOpen size={20} className="text-accent-blue mb-4" />
          <div className="text-sm font-black text-white">Open Workbook</div>
          <div className="text-[11px] text-gray-600 mt-1">Open an existing .xlsx file and choose a course.</div>
        </button>
        <button type="button" onClick={onCreate} className="group rounded-2xl border border-gray-800 bg-gray-900/60 p-5 text-left hover:border-accent-blue/40 hover:bg-white/5 transition-colors">
          <Plus size={20} className="text-accent-blue mb-4" />
          <div className="text-sm font-black text-white">Create Workbook</div>
          <div className="text-[11px] text-gray-600 mt-1">Start a new workbook and add your first course.</div>
        </button>
      </div>
    </div>
  </div>
);
