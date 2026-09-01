import React, { useEffect, useState } from 'react';
import { HistoryRecord } from '../types';
import type { RedPenWorkbook } from '../types/workbook';
import { Clock, Trash2, ChevronRight, BookOpen, ArrowLeft, ArrowRight, AlertTriangle } from 'lucide-react';

interface Props {
  history: HistoryRecord[];
  onLoad: (record: HistoryRecord) => void;
  onDelete: (id: string) => void;
  workbooks: RedPenWorkbook[];
  activeWorkbook: RedPenWorkbook | null;
  onLoadWorkbook: (workbook: RedPenWorkbook) => void;
}

type Tab = 'results' | 'workbooks';

const workbookTitle = (workbook: RedPenWorkbook) =>
  workbook.name?.trim() || 'Unnamed Workbook';

export const HistoryPanel = ({ history, onLoad, onDelete, workbooks, activeWorkbook, onLoadWorkbook }: Props) => {
  const [tab, setTab] = useState<Tab>('results');
  const [selectedWorkbook, setSelectedWorkbook] = useState<RedPenWorkbook | null>(null);
  const [workbookList, setWorkbookList] = useState<RedPenWorkbook[]>(workbooks);
  const [pendingDelete, setPendingDelete] = useState<HistoryRecord | null>(null);

  useEffect(() => setWorkbookList(workbooks), [workbooks]);

  useEffect(() => {
    const refresh = () => setWorkbookList(workbooks);
    window.addEventListener('redpen:workbooks-updated', refresh);
    return () => window.removeEventListener('redpen:workbooks-updated', refresh);
  }, [workbooks]);

  const requestDelete = (record: HistoryRecord) => setPendingDelete(record);
  const confirmDelete = () => {
    if (!pendingDelete) return;
    onDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  const loadWorkbook = (workbook: RedPenWorkbook) => {
    onLoadWorkbook(workbook);
    setSelectedWorkbook(null);
  };

  const tabBtnClass = (active: boolean) => `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${active ? 'bg-accent-blue text-white shadow-lg shadow-accent-blue/20' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`;

  return (
    <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
      <div className="flex items-center gap-2 shrink-0"><div className="w-2 h-4 bg-accent-blue rounded-full" /><h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">History</h2></div>
      <div className="flex items-center gap-1 shrink-0 border-b border-gray-800 pb-3">
        <button onClick={() => { setTab('results'); setSelectedWorkbook(null); }} className={tabBtnClass(tab === 'results')}><Clock size={12} /> Results <span className="ml-0.5 opacity-70">{history.length}</span></button>
        <button onClick={() => { setTab('workbooks'); setSelectedWorkbook(null); }} className={tabBtnClass(tab === 'workbooks')}><BookOpen size={12} /> Workbooks <span className="ml-0.5 opacity-70">{workbookList.length}</span></button>
      </div>
      <div className="flex-1 overflow-y-auto flex flex-col gap-3">
        {tab === 'results' ? (
          <div className="flex flex-col gap-3">
            {history.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-center p-8"><Clock size={48} className="text-gray-800 mb-4" /><h3 className="text-sm font-bold uppercase tracking-widest text-gray-600">No Results Yet</h3><p className="text-[10px] text-gray-700 mt-2 uppercase font-medium">Saved grading results will appear here</p></div> : history.map(record => (
              <div key={record.id} className="group bg-card border border-gray-800 rounded-2xl p-4 hover:border-accent-blue/40 hover:bg-accent-blue/5 transition-all duration-200 cursor-pointer" onClick={() => onLoad(record)}>
                <div className="flex items-center justify-between"><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1"><span className={`text-lg font-bold font-mono ${record.result.grade?.startsWith('A') ? 'text-accent-green' : 'text-accent-blue'}`}>{record.result.grade}</span><span className="text-xs font-mono text-gray-400">{record.result.totalScore}</span></div><p className="text-xs font-bold text-gray-300 truncate">{record.studentInfo.name || 'Unknown Student'}</p><p className="text-[10px] text-gray-600 mt-0.5 uppercase font-medium">{record.studentInfo.courseCode || '—'} · {record.date}</p></div><div className="flex items-center gap-2 ml-3"><button onClick={(e) => { e.stopPropagation(); requestDelete(record); }} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 text-gray-600 transition-all" aria-label="Delete grading record"><Trash2 size={13} /></button><ChevronRight size={16} className="text-gray-700 group-hover:text-accent-blue transition-colors" /></div></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {selectedWorkbook ? (
              <div className="bg-card border border-gray-800 rounded-2xl p-5">
                <button onClick={() => setSelectedWorkbook(null)} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors mb-4"><ArrowLeft size={12} /> Back to workbooks</button>
                <div className="flex items-center gap-2 mb-4"><span className="px-2 py-1 bg-accent-blue/10 text-accent-blue text-[12px] font-black rounded-lg border border-accent-blue/20">Workbook</span><span className="text-[13px] text-white font-semibold truncate">{workbookTitle(selectedWorkbook)}</span></div>
                <div className="space-y-2 mb-5">
                  <div className="flex items-center justify-between text-[11px]"><span className="text-gray-600 uppercase font-bold tracking-wider">Courses</span><span className="text-gray-300">{selectedWorkbook.sheets.length}</span></div>
                  <div className="flex items-center justify-between text-[11px]"><span className="text-gray-600 uppercase font-bold tracking-wider">Last updated</span><span className="text-gray-300">{selectedWorkbook.updatedAt ? new Date(selectedWorkbook.updatedAt).toLocaleDateString() : '—'}</span></div>
                </div>
                {selectedWorkbook.sheets.length > 0 && <div className="border-t border-gray-800 pt-4 mb-5"><p className="text-[10px] text-gray-600 uppercase font-bold tracking-wider mb-2">Courses in this workbook</p><div className="space-y-2">{selectedWorkbook.sheets.map(sheet => <div key={sheet.id} className="flex items-center justify-between gap-3 text-[11px]"><span className="text-gray-300 truncate">{[sheet.course.courseCode, sheet.course.courseName].filter(Boolean).join(' · ') || 'Unnamed Course'}</span><span className="text-gray-600 shrink-0">{sheet.rows.length} {sheet.rows.length === 1 ? 'student' : 'students'}</span></div>)}</div></div>}
                <button onClick={() => loadWorkbook(selectedWorkbook)} className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-blue text-white text-[12px] font-bold rounded-xl hover:bg-blue-600 transition-colors shadow-lg shadow-accent-blue/20">{activeWorkbook?.id === selectedWorkbook.id ? 'Open Current Workbook' : 'Load Workbook'} <ArrowRight size={14} /></button>
              </div>
            ) : workbookList.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8"><BookOpen size={48} className="text-gray-800 mb-4" /><h3 className="text-sm font-bold uppercase tracking-widest text-gray-600">No Workbooks Yet</h3><p className="text-[10px] text-gray-700 mt-2 uppercase font-medium">Your current workbooks will appear here</p></div>
            ) : workbookList.map(workbook => (
              <div key={workbook.id} className={`group bg-card border rounded-2xl p-4 hover:border-accent-blue/40 hover:bg-accent-blue/5 transition-all duration-200 cursor-pointer ${activeWorkbook?.id === workbook.id ? 'border-accent-blue/40' : 'border-gray-800'}`} onClick={() => setSelectedWorkbook(workbook)}>
                <div className="flex items-center justify-between"><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1"><BookOpen size={13} className="text-accent-blue shrink-0" /><p className="text-xs font-bold text-gray-200 truncate">{workbookTitle(workbook)}</p>{activeWorkbook?.id === workbook.id && <span className="text-[9px] uppercase font-bold text-accent-blue shrink-0">Current</span>}</div><p className="text-[10px] text-gray-600 mt-0.5 uppercase font-medium">{workbook.sheets.length} {workbook.sheets.length === 1 ? 'course' : 'courses'} · {workbook.updatedAt ? new Date(workbook.updatedAt).toLocaleDateString() : '—'}</p></div><ChevronRight size={16} className="text-gray-700 group-hover:text-accent-blue transition-colors shrink-0" /></div>
              </div>
            ))}
          </div>
        )}
      </div>
      {pendingDelete && <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-history-title"><div className="w-full max-w-sm bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl p-5" onClick={e => e.stopPropagation()}><div className="flex items-start gap-3"><div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0"><AlertTriangle size={17} className="text-red-400" /></div><div><h3 id="delete-history-title" className="text-sm font-bold text-white">Delete grading result?</h3><p className="text-[11px] text-gray-500 mt-1 leading-relaxed">This will permanently remove the saved result for <span className="text-gray-300 font-semibold">{pendingDelete.studentInfo.name || 'this student'}</span> from History.</p><p className="text-[10px] text-gray-600 mt-2">This does not delete the student's paper or workbook.</p></div></div><div className="flex gap-2 mt-5"><button onClick={() => setPendingDelete(null)} className="flex-1 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 text-[11px] font-bold hover:text-white">Cancel</button><button onClick={confirmDelete} className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold hover:bg-red-500/20">Delete Result</button></div></div></div>}
    </div>
  );
};
