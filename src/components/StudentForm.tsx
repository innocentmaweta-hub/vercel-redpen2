import React, { useState, useEffect } from 'react';
import { StudentInfo } from '../types';
import { AlertTriangle } from 'lucide-react';

interface Props {
  info: StudentInfo;
  onChange: (info: StudentInfo) => void;
  courses: { courseCode: string; courseName: string }[];
  hasUnsavedResult?: boolean;
  onNewCourse?: () => void;
}

const YEARS_OF_STUDY = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
const SEMESTERS = ['Semester 1', 'Semester 2'];

function getAcademicYearOptions(): string[] {
  const currentYear = new Date().getFullYear();
  const options: string[] = [];
  for (let y = currentYear - 10; y <= currentYear + 10; y++) {
    const shortNext = String((y + 1) % 100).padStart(2, '0');
    options.push(`${y}/${shortNext} academic year`);
  }
  return options;
}

const ACADEMIC_YEARS = getAcademicYearOptions();

export const StudentForm = ({ info, onChange, courses, hasUnsavedResult = false, onNewCourse }: Props) => {
  const [selectedDepartment, setSelectedDepartment] = useState<string>(() => localStorage.getItem('lastSelectedDepartment') || '');
  const [pendingCourseCode, setPendingCourseCode] = useState<string | null>(null);
  const [pendingWorkbookChange, setPendingWorkbookChange] = useState<{ field: 'academicYear' | 'semester'; value: string } | null>(null);

  useEffect(() => {
    if (selectedDepartment) localStorage.setItem('lastSelectedDepartment', selectedDepartment);
  }, [selectedDepartment]);

  const handleChange = (field: keyof StudentInfo, value: string) => {
    let validatedValue = value;
    if (field === 'regNo') validatedValue = validatedValue.toUpperCase().replace(/[^A-Z0-9/-]/g, '');
    else if (field === 'courseCode') validatedValue = validatedValue.toUpperCase().replace(/[^A-Z0-9]/g, '');
    onChange({ ...info, [field]: validatedValue });
  };

  const inputClass = "w-full bg-sidebar border border-gray-800 rounded-lg py-2 px-3 text-sm focus:border-accent-blue focus:outline-none transition-all placeholder:text-gray-600";
  const selectClass = `${inputClass} appearance-none cursor-pointer`;

  const requestCourseChange = (value: string) => {
    const trimmed = value.trim();
    const current = (info.courseCode || '').trim();
    if (trimmed === current || trimmed === '') return;
    setPendingCourseCode(trimmed);
  };

  const confirmCourseChange = () => {
    if (pendingCourseCode !== null) handleChange('courseCode', pendingCourseCode);
    setPendingCourseCode(null);
  };

  const requestWorkbookChange = (field: 'academicYear' | 'semester', value: string) => {
    const current = info[field] || '';
    if (value === current) return;
    if (value === '') { handleChange(field, ''); return; }
    setPendingWorkbookChange({ field, value });
  };

  const confirmWorkbookChange = () => {
    if (pendingWorkbookChange) handleChange(pendingWorkbookChange.field, pendingWorkbookChange.value);
    setPendingWorkbookChange(null);
  };

  const warning = hasUnsavedResult
    ? 'You have an unsaved grading result. Confirming this change will move your active session; save the result first if you want to keep it.'
    : 'This change affects where future grades are saved.';

  return (
    <>
      <div className="bg-card p-6 rounded-3xl border border-gray-800 shadow-xl space-y-1">
        <div className="flex items-center gap-2 mb-4"><div className="w-2 h-4 bg-accent-blue rounded-full" /><h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Identity Panel</h2></div>
        <div className="grid grid-cols-2 gap-4"><input type="text" placeholder="Student Name" className={inputClass} value={info.name} onChange={(e) => handleChange('name', e.target.value)} /><input type="text" placeholder="Registration Number" className={inputClass} value={info.regNo} onChange={(e) => handleChange('regNo', e.target.value)} /></div>
        <input type="text" placeholder="Program of Study" className={inputClass} value={info.program} onChange={(e) => handleChange('program', e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <div className="flex gap-2"><select className={selectClass} value={info.year} onChange={(e) => handleChange('year', e.target.value)}><option value="">Year of Study</option>{YEARS_OF_STUDY.map(y => <option key={y} value={y}>{y}</option>)}</select><select className={selectClass} value={(pendingWorkbookChange?.field === 'semester' ? pendingWorkbookChange.value : info.semester) || ''} onChange={(e) => requestWorkbookChange('semester', e.target.value)}><option value="">Semester</option>{SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <select className={selectClass} value={(pendingWorkbookChange?.field === 'academicYear' ? pendingWorkbookChange.value : info.academicYear) || ''} onChange={(e) => requestWorkbookChange('academicYear', e.target.value)}><option value="">Academic Year</option>{ACADEMIC_YEARS.map(ay => <option key={ay} value={ay}>{ay}</option>)}</select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <select
            className={selectClass}
            value={info.courseCode || ''}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '__new__') {
                onNewCourse?.();
                return;
              }
              requestCourseChange(value);
            }}
          >
            <option value="">Course</option>
            {courses.map(c => (
              <option key={c.courseCode} value={c.courseCode}>
                {c.courseCode}{c.courseName ? ` — ${c.courseName}` : ''}
              </option>
            ))}
            <option value="__new__">+ Add New Course</option>
          </select>
          <input type="date" placeholder="Date of Exams" className={`${inputClass} text-gray-400`} value={info.examDate} onChange={(e) => handleChange('examDate', e.target.value)} />
        </div>
      </div>

      {pendingCourseCode !== null && <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"><div className="bg-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"><div className="flex items-start gap-3"><div className="w-9 h-9 bg-yellow-500/10 rounded-xl flex items-center justify-center shrink-0"><AlertTriangle size={16} className="text-yellow-500" /></div><div><p className="text-sm font-bold text-white">Change Course?</p><p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{warning}</p></div></div><div className="flex gap-2"><button onClick={() => setPendingCourseCode(null)} className="flex-1 py-2 bg-gray-800 text-gray-300 text-[11px] font-bold rounded-lg hover:bg-gray-700">Cancel</button><button onClick={confirmCourseChange} className="flex-1 py-2 bg-accent-blue text-white text-[11px] font-bold rounded-lg hover:bg-blue-600">Confirm Change</button></div></div></div>}
      {pendingWorkbookChange !== null && <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"><div className="bg-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"><div className="flex items-start gap-3"><div className="w-9 h-9 bg-yellow-500/10 rounded-xl flex items-center justify-center shrink-0"><AlertTriangle size={16} className="text-yellow-500" /></div><div><p className="text-sm font-bold text-white">Change {pendingWorkbookChange.field === 'academicYear' ? 'Academic Year' : 'Semester'}?</p><p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{warning}</p></div></div><div className="flex gap-2"><button onClick={() => setPendingWorkbookChange(null)} className="flex-1 py-2 bg-gray-800 text-gray-300 text-[11px] font-bold rounded-lg hover:bg-gray-700">Cancel</button><button onClick={confirmWorkbookChange} className="flex-1 py-2 bg-accent-blue text-white text-[11px] font-bold rounded-lg hover:bg-blue-600">Confirm Change</button></div></div></div>}
    </>
  );
};
