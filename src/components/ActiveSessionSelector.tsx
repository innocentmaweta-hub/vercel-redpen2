import React from 'react';
import { BookOpen, ChevronDown, Check, Plus } from 'lucide-react';
import type { RedPenWorkbook } from '../types/workbook';

interface Props {
  workbooks: RedPenWorkbook[];
  activeWorkbook: RedPenWorkbook | null;
  onSelectWorkbook: (workbook: RedPenWorkbook) => void;
  onNewWorkbook: () => void;
  disabled?: boolean;
}

const workbookTitle = (workbook: RedPenWorkbook) => workbook.name?.trim() || 'Untitled Workbook';
const workbookMeta = (workbook: RedPenWorkbook) => {
  const courses = workbook.sheets?.length || 0;
  return `${courses} ${courses === 1 ? 'course' : 'courses'}`;
};

export const ActiveSessionSelector = ({ workbooks, activeWorkbook, onSelectWorkbook, onNewWorkbook, disabled = false }: Props) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-[220px] max-w-[320px]">
      <button type="button" disabled={disabled} onClick={() => setOpen(value => !value)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-950/80 border border-gray-800 hover:border-accent-blue/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" aria-haspopup="listbox" aria-expanded={open}>
        <BookOpen size={14} className="text-accent-blue shrink-0" />
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[9px] uppercase tracking-widest font-black text-gray-600">Active Workbook</div>
          <div className="text-[11px] font-bold text-white truncate">{activeWorkbook ? workbookTitle(activeWorkbook) : 'No workbook selected'}</div>
          {activeWorkbook && <div className="text-[9px] text-gray-600 truncate">{workbookMeta(activeWorkbook)}</div>}
        </div>
        <ChevronDown size={14} className={`text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && <div className="absolute left-0 right-0 top-full mt-2 z-[10000] bg-gray-950 border border-gray-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-800"><p className="text-[9px] uppercase tracking-widest font-black text-gray-600">Workbooks</p></div>
        <div className="max-h-[280px] overflow-y-auto p-1">
          {workbooks.length === 0 ? <div className="px-3 py-4 text-center text-[10px] text-gray-600">No workbooks yet.</div> : workbooks.map(workbook => {
            const selected = activeWorkbook?.id === workbook.id;
            return <button key={workbook.id} type="button" role="option" aria-selected={selected} onClick={() => { setOpen(false); onSelectWorkbook(workbook); }} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${selected ? 'bg-accent-blue/10' : 'hover:bg-white/5'}`}>
              <div className="min-w-0 flex-1"><div className={`text-[11px] font-bold truncate ${selected ? 'text-accent-blue' : 'text-gray-300'}`}>{workbookTitle(workbook)}</div><div className="text-[9px] text-gray-600 truncate">{workbookMeta(workbook)}</div></div>
              {selected && <Check size={13} className="text-accent-blue shrink-0" />}
            </button>;
          })}
        </div>
        <div className="border-t border-gray-800 p-1"><button type="button" onClick={() => { setOpen(false); onNewWorkbook(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors"><Plus size={13} />New Workbook</button></div>
      </div>}
    </div>
  );
};
