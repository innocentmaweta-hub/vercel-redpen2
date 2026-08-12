import React, { useState, useEffect } from 'react';
import { StudentInfo } from '../types';
import { AlertTriangle } from 'lucide-react';

interface Props {
  info: StudentInfo;
  onChange: (info: StudentInfo) => void;
  courses: { courseCode: string; courseName: string }[];
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

export const StudentForm = ({ info, onChange, courses }: Props) => {
  const [selectedDepartment, setSelectedDepartment] = useState<string>(() => {
    return localStorage.getItem('lastSelectedDepartment') || '';
  });

  // Course is a dropdown of known courses, plus a custom-entry mode.
  // Selecting a different course is a deliberate action (unlike a text field's
  // blur, which can fire from clicking anything else — including Grade),
  // so onChange is the only trigger for the confirmation popup.
  const [pendingCourseCode, setPendingCourseCode] = useState<string | null>(null);
  const [courseFieldMode, setCourseFieldMode] = useState<'select' | 'custom'>(courses.length > 0 ? 'select' : 'custom');
  const [customCourseDraft, setCustomCourseDraft] = useState('');

  // Academic Year / Semester determine which workbook a result is saved into,
  // so a change is held here pending confirmation before being applied.
  const [pendingWorkbookChange, setPendingWorkbookChange] = useState<{ field: 'academicYear' | 'semester'; value: string } | null>(null);

  useEffect(() => {
    // Save department selection to localStorage when it changes
    if (selectedDepartment) {
      localStorage.setItem('lastSelectedDepartment', selectedDepartment);
    }
  }, [selectedDepartment]);

  const handleChange = (field: keyof StudentInfo, value: string) => {
    let validatedValue = value;

    if (field === 'regNo') {
      // Allow typing freely; just uppercase and strip characters that could never be valid
      validatedValue = validatedValue.toUpperCase().replace(/[^A-Z0-9/-]/g, '');
    } else if (field === 'courseCode') {
      // Allow typing freely; just uppercase and strip characters that could never be valid
      validatedValue = validatedValue.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    // 'examDate' comes from a native date input, which already enforces its own format —
    // no need to re-validate it here (the old check was blocking valid partial typing).
    // 'year' and 'semester' come from fixed dropdowns, so no regex needed.

    onChange({ ...info, [field]: validatedValue });
  };

  const inputClass = "w-full bg-sidebar border border-gray-800 rounded-lg py-2 px-3 text-sm focus:border-accent-blue focus:outline-none transition-all placeholder:text-gray-600";
  const selectClass = `${inputClass} appearance-none cursor-pointer`;

  const requestCourseChange = (value: string) => {
    const trimmed = value.trim();
    const current = (info.courseCode || '').trim();
    if (trimmed === current || trimmed === '') return; // no real change
    setPendingCourseCode(trimmed);
  };

  const confirmCourseChange = () => {
    if (pendingCourseCode !== null) {
      handleChange('courseCode', pendingCourseCode);
    }
    setPendingCourseCode(null);
  };

  const cancelCourseChange = () => {
    setPendingCourseCode(null);
  };

  const requestWorkbookChange = (field: 'academicYear' | 'semester', value: string) => {
    const current = info[field] || '';
    if (value === current) return; // reselecting the same value, nothing to confirm
    if (value === '') {
      handleChange(field, ''); // clearing doesn't create/route to a different workbook
      return;
    }
    setPendingWorkbookChange({ field, value });
  };

  const confirmWorkbookChange = () => {
    if (pendingWorkbookChange) {
      handleChange(pendingWorkbookChange.field, pendingWorkbookChange.value);
    }
    setPendingWorkbookChange(null);
  };

  const cancelWorkbookChange = () => {
    setPendingWorkbookChange(null);
  };

  return (
    <>
    <div className="bg-card p-6 rounded-3xl border border-gray-800 shadow-xl space-y-1">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-4 bg-accent-blue rounded-full" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Identity Panel</h2>
      </div>

      {/* Row 1: Name / Reg No */}
      <div className="grid grid-cols-2 gap-4">
        <input
          type="text"
          placeholder="Student Name"
          className={inputClass}
          value={info.name}
          onChange={(e) => handleChange('name', e.target.value)}
        />
        <input
          type="text"
          placeholder="Registration Number"
          className={inputClass}
          value={info.regNo}
          onChange={(e) => handleChange('regNo', e.target.value)}
        />
      </div>

      {/* Row 2: Program */}
      <input
        type="text"
        placeholder="Program of Study"
        className={inputClass}
        value={info.program}
        onChange={(e) => handleChange('program', e.target.value)}
      />

      {/* Row 3: Year of Study (+ Semester beside it once picked) / Academic Year */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex gap-2">
          <select
            className={selectClass}
            value={info.year}
            onChange={(e) => handleChange('year', e.target.value)}
          >
            <option value="">Year of Study</option>
            {YEARS_OF_STUDY.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            className={selectClass}
            value={(pendingWorkbookChange?.field === 'semester' ? pendingWorkbookChange.value : info.semester) || ''}
            onChange={(e) => requestWorkbookChange('semester', e.target.value)}
          >
            <option value="">Semester</option>
            {SEMESTERS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <select
          className={selectClass}
          value={(pendingWorkbookChange?.field === 'academicYear' ? pendingWorkbookChange.value : info.academicYear) || ''}
          onChange={(e) => requestWorkbookChange('academicYear', e.target.value)}
        >
          <option value="">Academic Year</option>
          {ACADEMIC_YEARS.map((ay) => (
            <option key={ay} value={ay}>{ay}</option>
          ))}
        </select>
      </div>

     {/* Row 4: Course / Exam Date */}
      <div className="grid grid-cols-2 gap-4">
       {courseFieldMode === 'select' && courses.length > 0 ? (
          <select
            className={selectClass}
            value={info.courseCode || ''}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                setCourseFieldMode('custom');
                return;
              }
              requestCourseChange(e.target.value);
            }}
          >
            <option value="">Course</option>
            {courses.map((c) => (
              <option key={c.courseCode} value={c.courseCode}>
                {c.courseCode}{c.courseName ? ` — ${c.courseName}` : ''}
              </option>
            ))}
            <option value="__new__">+ Add a new course</option>
          </select>
        ) : (
          <div className="flex flex-col gap-1">
            <input
              type="text"
              placeholder="Course"
              className={inputClass}
              value={customCourseDraft}
              onChange={(e) => setCustomCourseDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { requestCourseChange(customCourseDraft); setCustomCourseDraft(''); }}
                className="text-[10px] text-accent-blue hover:text-accent-blue/80 font-bold"
              >
                Set Course
              </button>
              {courses.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setCourseFieldMode('select'); setCustomCourseDraft(''); }}
                  className="text-[10px] text-gray-500 hover:text-gray-300 font-bold"
                >
                  ← Choose existing
                </button>
              )}
            </div>
          </div>
        )}
        <input
          type="date"
          placeholder="Date of Exams"
          className={`${inputClass} text-gray-400`}
          value={info.examDate}
          onChange={(e) => handleChange('examDate', e.target.value)}
        />
      </div>
    </div>

    {pendingCourseCode !== null && (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
        <div className="bg-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-yellow-500/10 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle size={16} className="text-yellow-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Change Course?</p>
              <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                Switching the course code to <span className="text-gray-300 font-mono">{pendingCourseCode}</span> will route
                future grades into that course's worksheet within this semester's workbook — creating a new sheet if it
                doesn't already exist.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={cancelCourseChange}
              className="flex-1 py-2 bg-gray-800 text-gray-300 text-[11px] font-bold rounded-lg hover:bg-gray-700 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={confirmCourseChange}
              className="flex-1 py-2 bg-accent-blue text-white text-[11px] font-bold rounded-lg hover:bg-blue-600 transition-all"
            >
              Confirm Change
            </button>
          </div>
        </div>
      </div>
    )}

    {pendingWorkbookChange !== null && (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
        <div className="bg-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-yellow-500/10 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle size={16} className="text-yellow-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Change {pendingWorkbookChange.field === 'academicYear' ? 'Academic Year' : 'Semester'}?</p>
              <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                Switching to <span className="text-gray-300 font-mono">{pendingWorkbookChange.value}</span> will route future
                grades into a different semester workbook — creating a new one if it doesn't already exist.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={cancelWorkbookChange}
              className="flex-1 py-2 bg-gray-800 text-gray-300 text-[11px] font-bold rounded-lg hover:bg-gray-700 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={confirmWorkbookChange}
              className="flex-1 py-2 bg-accent-blue text-white text-[11px] font-bold rounded-lg hover:bg-blue-600 transition-all"
            >
              Confirm Change
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
