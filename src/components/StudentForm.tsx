import React, { useState, useEffect, useRef } from 'react';
import { StudentInfo } from '../types';
import { AlertTriangle, LockKeyhole } from 'lucide-react';
import { loadLocalWorkbook } from '../lib/workbookStore';

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
  const infoRef = useRef(info);

  useEffect(() => {
    infoRef.current = info;
  }, [info]);

  useEffect(() => {
    if (selectedDepartment) localStorage.setItem('lastSelectedDepartment', selectedDepartment);
  }, [selectedDepartment]);

  // Sync only session/course context here. Program of Study belongs to the student
  // and must never be overwritten when the workbook/session changes.
  useEffect(() => {
    const syncFromActiveWorksheet = () => {
      const workbook = loadLocalWorkbook();
      if (!workbook?.activeSheetId) return;

      const worksheet = workbook.sheets.find(sheet => sheet.id === workbook.activeSheetId);
      if (!worksheet?.course) return;

      const course = worksheet.course;
      const current = infoRef.current;
      const next = {
        ...current,
        courseCode: course.courseCode || '',
        year: course.year || '',
        semester: course.semester || '',
        academicYear: course.academicYear || '',
      };

      const changed =
        next.courseCode !== current.courseCode ||
        next.year !== current.year ||
        next.semester !== current.semester ||
        next.academicYear !== current.academicYear;

      if (changed) onChange(next);
    };

    syncFromActiveWorksheet();
    window.addEventListener('redpen:workbook-updated', syncFromActiveWorksheet);
    return () => window.removeEventListener('redpen:workbook-updated', syncFromActiveWorksheet);
  }, [onChange]);

  const handleChange = (field: keyof StudentInfo, value: string) => {
    let validatedValue = value;
    if (field === 'regNo') validatedValue = validatedValue.toUpperCase().replace(/[^A-Z0-9/-]/g, '');
    else if (field === 'courseCode') validatedValue = validatedValue.toUpperCase().replace(/[^A-Z0-9]/g, '');
    onChange({ ...info, [field]: validatedValue });
  };

  const inputClass = "w-full bg-sidebar border border-gray-800 rounded-lg py-2 px-3 text-sm focus:border-accent-blue focus:outline-none transition-all placeholder:text-gray-600";
  const selectClass = `${inputClass} appearance-none cursor-pointer`;
  const contextSelectClass = `${inputClass} appearance-none cursor-not-allowed opacity-75 text-gray-300`;

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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><div className="w-2 h-4 bg-accent-blue rounded-full" /><h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Identity Panel</h2></div>
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-gray-600" title="Course and academic details come from the active session/course">
            <LockKeyhole size={10} /> Session context
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <input type="text" placeholder="Student Name" className={inputClass} value={info.name} onChange={(e) => handleChange('name', e.target.value)} />
          <input type="text" placeholder="Registration Number" className={inputClass} value={info.regNo} onChange={(e) => handleChange('regNo', e.target.value)} />
        </div>
        <input type="text" placeholder="Program of Study" className={inputClass} value={info.program} onChange={(e) => handleChange('program', e.target.value)} />

        {/* Session/course metadata is read-only here. Change context through the TopBar. */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex gap-2">
            <select className={contextSelectClass} value={info.year || ''} disabled aria-label="Year of Study">
              <option value="">Year of Study</option>
              {YEARS_OF_STUDY.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className={contextSelectClass} value={info.semester || ''} disabled aria-label="Semester">
              <option value="">Semester</option>
              {SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <select className={contextSelectClass} value={info.academicYear || ''} disabled aria-label="Academic Year">
            <option value="">Academic Year</option>
            {ACADEMIC_YEARS.map(ay => <option key={ay} value={ay}>{ay}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <select className={contextSelectClass} value={info.courseCode || ''} disabled aria-label="Course">
            <option value="">Course</option>
            {courses.map(c => (
              <option key={c.courseCode} value={c.courseCode}>
                {c.courseCode}{c.courseName ? ` — ${c.courseName}` : ''}
              </option>
            ))}
          </select>
          <input type="date" placeholder="Date of Exams" className={`${inputClass} text-gray-400`} value={info.examDate} onChange={(e) => handleChange('examDate', e.target.value)} />
        </div>
      </div>

      {pendingCourseCode !== null && <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"><div className="bg-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"><div className="flex items-start gap-3"><div className="w-9 h-9 bg-yellow-500/10 rounded-xl flex items-center justify-center shrink-0"><AlertTriangle size={16} className="text-yellow-500" /></div><div><p className="text-sm font-bold text-white">Change Course?</p><p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{warning}</p></div></div><div className="flex gap-2"><button onClick={() => setPendingCourseCode(null)} className="flex-1 py-2 bg-gray-800 text-gray-300 text-[11px] font-bold rounded-lg hover:bg-gray-700">Cancel</button><button onClick={confirmCourseChange} className="flex-1 py-2 bg-accent-blue text-white text-[11px] font-bold rounded-lg hover:bg-blue-600">Confirm Change</button></div></div></div>}
      {pendingWorkbookChange !== null && <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"><div className="bg-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"><div className="flex items-start gap-3"><div className="w-9 h-9 bg-yellow-500/10 rounded-xl flex items-center justify-center shrink-0"><AlertTriangle size={16} className="text-yellow-500" /></div><div><p className="text-sm font-bold text-white">Change {pendingWorkbookChange.field === 'academicYear' ? 'Academic Year' : 'Semester'}?</p><p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{warning}</p></div></div><div className="flex gap-2"><button onClick={() => setPendingWorkbookChange(null)} className="flex-1 py-2 bg-gray-800 text-gray-300 text-[11px] font-bold rounded-lg hover:bg-gray-700">Cancel</button><button onClick={confirmWorkbookChange} className="flex-1 py-2 bg-accent-blue text-white text-[11px] font-bold rounded-lg hover:bg-blue-600">Confirm Change</button></div></div></div>}
    </>
  );
};