import React from 'react';
import { BookOpen, Check, FileSpreadsheet } from 'lucide-react';
import type { RedPenWorkbook, RedPenWorksheet } from '../types/workbook';

interface Props {
  workbook: RedPenWorkbook;
  onSelect: (sheet: RedPenWorksheet) => void;
  onCancel?: () => void;
}

export const WorkbookCoursePicker = ({ workbook, onSelect, onCancel }: Props) => {
  const [selectedId, setSelectedId] = React.useState(workbook.sheets[0]?.id || '');
  const selected = workbook.sheets.find(sheet => sheet.id === selectedId) || null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-6">
      <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-blue/10 flex items-center justify-center">
              <FileSpreadsheet size={19} className="text-accent-blue" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-black text-gray-600">Workbook loaded</p>
              <h2 className="text-base font-black text-white truncate">{workbook.name}</h2>
            </div>
          </div>
          <p className="mt-4 text-[12px] text-gray-400">Choose the course you want to start with. You can switch courses at any time without leaving this workbook.</p>
        </div>

        <div className="p-4 max-h-[360px] overflow-y-auto space-y-1.5">
          {workbook.sheets.map((sheet, index) => {
            const selectedRow = sheet.id === selectedId;
            const course = sheet.course;
            return (
              <button
                key={sheet.id}
                type="button"
                onClick={() => setSelectedId(sheet.id)}
                className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${selectedRow ? 'border-accent-blue/40 bg-accent-blue/10' : 'border-gray-800 bg-gray-900/40 hover:bg-white/5 hover:border-gray-700'}`}
              >
                <span className="w-7 h-7 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center text-[10px] font-black text-gray-500">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[12px] font-black truncate ${selectedRow ? 'text-accent-blue' : 'text-gray-200'}`}>{course.courseCode || sheet.name}</div>
                  {course.courseName && <div className="text-[10px] text-gray-600 truncate">{course.courseName}</div>}
                </div>
                {selectedRow && <Check size={15} className="text-accent-blue shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-between gap-3">
          {onCancel ? <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-[11px] font-bold text-gray-500 hover:text-white">Cancel</button> : <div />}
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onSelect(selected)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-blue text-white text-[11px] font-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
          >
            <BookOpen size={14} />
            Start with {selected?.course.courseCode || 'course'}
          </button>
        </div>
      </div>
    </div>
  );
};
