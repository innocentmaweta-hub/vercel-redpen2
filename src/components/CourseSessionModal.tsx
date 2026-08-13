import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, X, ChevronRight, ArrowRight, AlertCircle, Search } from 'lucide-react';

export interface SemesterCourse {
  courseCode: string;
  courseName: string;
  program: string;
  year: string;
  semester: string;
  academicYear: string; // e.g. "2026/27 academic year"
  sessionLabel: string; // e.g. "Assignment", "End of Semester" — used in saved session filenames
  customName?: string; // Fully custom workbook name — overrides academicYear-semester-sessionLabel entirely when set
}

interface NewSemesterModalProps {
  courses: { courseCode: string; courseName: string }[];
  onConfirm: (semesterCourse: SemesterCourse) => void;
  onSkip: () => void;
  onCancel: () => void;
}

interface ContinueSemesterModalProps {
  semesterCourse: SemesterCourse;
  uploadLabel: string;
  onContinue: () => void;
  onNewSemester: () => void;
  onCancel: () => void;
}

interface NewCourseModalProps {
  currentSemesterCourse: SemesterCourse | null;
  onConfirm: (updates: { courseCode: string; courseName: string }) => void;
  onCancel: () => void;
}

interface NewSessionModalProps {
  currentSemesterCourse: SemesterCourse | null;
  courses: { courseCode: string; courseName: string }[];
  onConfirm: (updates: {
    academicYear: string;
    year: string;
    semester: string;
    sessionLabel: string;
    customName: string;
    courseCode: string;
    courseName: string;
  }) => void;
  onCancel: () => void;
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

const DEPARTMENTS = [
  'Computer Science & IT', 'Engineering', 'Business & Management',
  'Health Sciences', 'Education', 'Law', 'Social Sciences',
  'Natural Sciences', 'Agriculture', 'Arts & Humanities',
  'Mathematics & Statistics', 'Physics', 'Chemistry', 'Biology',
  'Psychology', 'Sociology', 'Economics', 'Political Science',
  'Architecture', 'Medicine', 'Pharmacy', 'Nursing', 'Dentistry',
  'Veterinary Science', 'Environmental Science', 'Geography', 'History',
  'Languages & Literature', 'Philosophy', 'Religious Studies'
];

const PROGRAMS = [
  'BSc Computer Science', 'BSc Software Engineering', 'BSc Information Technology',
  'BEng Electrical Engineering', 'BEng Civil Engineering',
  'BSc Business Administration', 'BSc Accounting & Finance',
  'BSc Nursing', 'Bachelor of Education', 'LLB Law',
  'BSc Mathematics', 'BSc Biology', 'Other'
];

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</label>
    {children}
  </div>
);

const inputCls = "bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-[12px] text-white focus:border-accent-blue focus:outline-none transition-colors placeholder:text-gray-700";

export const NewSemesterModal = ({ courses, onConfirm, onSkip, onCancel }: NewSemesterModalProps) => {
  const [form, setForm] = useState<SemesterCourse>({ courseCode: '', courseName: '', program: '', year: '', semester: '', academicYear: '', sessionLabel: '' });
  const [error, setError] = useState('');
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [courseMode, setCourseMode] = useState<'select' | 'custom'>(courses.length > 0 ? 'select' : 'custom');

  const set = (k: keyof SemesterCourse) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

    const handleConfirm = () => {
    if (!form.courseCode.trim()) {
      setError('Course code is required.');
      return;
    }

    if (!form.academicYear.trim()) {
      setError('Academic year is required.');
      return;
    }

    if (!form.year.trim()) {
      setError('Year of study is required.');
      return;
    }

    if (!form.semester.trim() && !form.customName?.trim() && !form.sessionLabel.trim()) {
      setError('Select a semester or enter a custom session name.');
      return;
    }

    onConfirm(form);
  };

  const filteredDepartments = DEPARTMENTS.filter(dept =>
    dept.toLowerCase().includes(departmentSearch.toLowerCase())
  );

  return (
    <Backdrop onClose={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 20 }}
        transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
        className="bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-accent-blue/10 rounded-xl flex items-center justify-center">
              <BookOpen size={16} className="text-accent-blue" />
            </div>
            <div>
              <p className="text-[13px] font-black text-white">New Semester</p>
              <p className="text-[10px] text-gray-500">Enter course details before uploading</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {courseMode === 'select' && courses.length > 0 ? (
            <Field label="Course *">
              <select
                className={inputCls}
                value={form.courseCode}
                onChange={(e) => {
                  const chosen = courses.find(c => c.courseCode === e.target.value);
                  setForm(prev => ({
                    ...prev,
                    courseCode: chosen?.courseCode || '',
                    courseName: chosen?.courseName || '',
                  }));
                }}
                autoFocus
              >
                <option value="">Select a course…</option>
                {courses.map(c => (
                  <option key={c.courseCode} value={c.courseCode}>
                    {c.courseCode}{c.courseName ? ` — ${c.courseName}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => { setCourseMode('custom'); setForm(prev => ({ ...prev, courseCode: '', courseName: '' })); }}
                className="text-[10px] text-accent-blue hover:text-accent-blue/80 font-bold mt-1"
              >
                + Add a new course instead
              </button>
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Course Code *">
                <input
                  className={inputCls}
                  placeholder="e.g. CS301"
                  value={form.courseCode}
                  onChange={set('courseCode')}
                  autoFocus
                />
              </Field>
              <Field label="Course Name">
                <input
                  className={inputCls}
                  placeholder="e.g. Data Structures"
                  value={form.courseName}
                  onChange={set('courseName')}
                />
              </Field>
              {courses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCourseMode('select')}
                  className="col-span-2 text-[10px] text-accent-blue hover:text-accent-blue/80 font-bold text-left"
                >
                  ← Choose an existing course instead
                </button>
              )}
            </div>
          )}

          <Field label="Department">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={14} />
              <input
                type="text"
                className={`${inputCls} pl-9`}
                placeholder="Search department..."
                value={departmentSearch}
                onChange={(e) => setDepartmentSearch(e.target.value)}
              />
            </div>
            <div className="mt-2 max-h-32 overflow-y-auto border border-gray-700 rounded-lg">
              {filteredDepartments.length > 0 ? (
                filteredDepartments.map((dept, index) => (
                  <div
                    key={index}
                    className={`px-3 py-2 text-[12px] cursor-pointer hover:bg-gray-800 ${form.program === dept ? 'bg-accent-blue/20' : ''
                      }`}
                    onClick={() => setForm({ ...form, program: dept })}
                  >
                    {dept}
                  </div>
                ))
              ) : (
                <div className="px-3 py-2 text-[12px] text-gray-500">No departments found</div>
              )}
            </div>
          </Field>

          <Field label="Program of Study">
            <select className={inputCls} value={form.program} onChange={set('program')}>
              <option value="">Select program…</option>
              {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Year of Study">
              <select className={inputCls} value={form.year} onChange={set('year')}>
                <option value="">Select year…</option>
                {YEARS_OF_STUDY.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Semester">
              <select className={inputCls} value={form.semester} onChange={set('semester')}>
                <option value="">Select semester…</option>
                {SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

                    <Field label="Academic Year">
            <select className={inputCls} value={form.academicYear} onChange={set('academicYear')}>
              <option value="">Select academic year…</option>
              {ACADEMIC_YEARS.map(ay => (
                <option key={ay} value={ay}>{ay}</option>
              ))}
            </select>
          </Field>

          <Field label="Custom Session Name">
            <input
              className={inputCls}
              placeholder="e.g. Midterm Examination"
              value={form.customName || ''}
              onChange={set('customName')}
            />
            <span className="text-[9px] text-gray-600">
              Use this for a custom session instead of a semester.
            </span>
          </Field>

          <Field label="Session Label">
            <input
              className={inputCls}
              placeholder="e.g. Assignment, End of Semester"
              value={form.sessionLabel}
              onChange={set('sessionLabel')}
            />
          </Field>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle size={12} className="text-red-400 shrink-0" />
              <p className="text-[11px] text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex items-center gap-2">
          <button
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent-blue text-white text-[12px] font-bold rounded-xl hover:bg-blue-600 transition-colors shadow-lg shadow-accent-blue/20"
          >
            Start Semester & Upload
            <ArrowRight size={14} />
          </button>
          <button
            onClick={onSkip}
            className="px-4 py-2.5 text-[11px] font-bold text-gray-500 hover:text-gray-300 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700 transition-colors"
          >
            Skip
          </button>
        </div>
      </motion.div>
    </Backdrop>
  );
};

export const ContinueSemesterModal = ({
  semesterCourse, uploadLabel, onContinue, onNewSemester, onCancel
}: ContinueSemesterModalProps) => (
  <Backdrop onClose={onCancel}>
    <motion.div
      initial={{ opacity: 0, scale: 0.93, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.93, y: 20 }}
      transition={{ duration: 0.2 }}
      onClick={e => e.stopPropagation()}
      className="bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-accent-blue/10 rounded-xl flex items-center justify-center">
            <BookOpen size={16} className="text-accent-blue" />
          </div>
          <div>
            <p className="text-[13px] font-black text-white">Continue Session</p>
            <p className="text-[10px] text-gray-500">{uploadLabel}</p>
          </div>
        </div>
        <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-colors">
          <X size={15} />
        </button>
      </div>

      <div className="p-5">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">Active Session</p>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-accent-blue/10 text-accent-blue text-[11px] font-black rounded-lg border border-accent-blue/20">
              {semesterCourse.courseCode}
            </span>
            {semesterCourse.courseName && (
              <span className="text-[12px] text-white font-semibold">{semesterCourse.courseName}</span>
            )}
          </div>
          {(semesterCourse.program || semesterCourse.year || semesterCourse.semester) && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {semesterCourse.program && (
                <span className="text-[10px] text-gray-500">{semesterCourse.program}</span>
              )}
              {semesterCourse.year && (
                <span className="text-[10px] text-gray-600">• {semesterCourse.year}</span>
              )}
              {semesterCourse.semester && (
                <span className="text-[10px] text-gray-600">• {semesterCourse.semester}</span>
              )}
            </div>
          )}
        </div>

        <p className="text-[12px] text-gray-400 mb-4">
          Proceed uploading in this session?
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={onContinue}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-blue text-white text-[12px] font-bold rounded-xl hover:bg-blue-600 transition-colors"
          >
            Continue in this session
            <ChevronRight size={14} />
          </button>
          <button
            onClick={onNewSemester}
            className="w-full py-2 text-[11px] font-bold text-gray-500 hover:text-gray-300 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700 transition-colors"
          >
            Start new session
          </button>
        </div>
      </div>
    </motion.div>
  </Backdrop>
);

export const NewCourseModal = ({ currentSemesterCourse, onConfirm, onCancel }: NewCourseModalProps) => {
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!courseCode.trim()) { setError('Course code is required.'); return; }
    onConfirm({ courseCode, courseName });
  };

  return (
    <Backdrop onClose={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 20 }}
        transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
        className="bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-accent-blue/10 rounded-xl flex items-center justify-center">
              <BookOpen size={16} className="text-accent-blue" />
            </div>
            <div>
              <p className="text-[13px] font-black text-white">New Course</p>
              <p className="text-[10px] text-gray-500">
                {currentSemesterCourse?.year && currentSemesterCourse?.semester
                  ? `Staying in ${currentSemesterCourse.year} • ${currentSemesterCourse.semester}`
                  : 'Switch to a different course'}
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Course Code *">
              <input
                className={inputCls}
                placeholder="e.g. CS301"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Course Name">
              <input
                className={inputCls}
                placeholder="e.g. Data Structures"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
              />
            </Field>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle size={12} className="text-red-400 shrink-0" />
              <p className="text-[11px] text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={handleConfirm}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-blue text-white text-[12px] font-bold rounded-xl hover:bg-blue-600 transition-colors shadow-lg shadow-accent-blue/20"
          >
            Switch Course
            <ArrowRight size={14} />
          </button>
        </div>
      </motion.div>
    </Backdrop>
  );
};

export const NewSessionModal = ({
  currentSemesterCourse,
  courses,
  onConfirm,
  onCancel,
}: NewSessionModalProps) => {
  const [courseMode, setCourseMode] = useState<'select' | 'custom'>(
    courses.length > 0 ? 'select' : 'custom'
  );

  const [courseCode, setCourseCode] = useState(
    currentSemesterCourse?.courseCode || ''
  );
  const [courseName, setCourseName] = useState(
    currentSemesterCourse?.courseName || ''
  );
  const [academicYear, setAcademicYear] = useState('');
  const [year, setYear] = useState('');
  const [semester, setSemester] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
  const [customName, setCustomName] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!courseCode.trim()) {
      setError('Course code is required.');
      return;
    }

    const hasAcademicSession = academicYear.trim() && semester.trim();
    const hasCustomSession = customName.trim();

    if (!hasAcademicSession && !hasCustomSession) {
      setError('Enter Academic Year + Semester, or a Custom Session Name.');
      return;
    }

    onConfirm({
      academicYear,
      year,
      semester,
      sessionLabel,
      customName,
      courseCode,
      courseName,
    });
  };

  return (
    <Backdrop onClose={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 20 }}
        transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
        className="bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-accent-blue/10 rounded-xl flex items-center justify-center">
              <BookOpen size={16} className="text-accent-blue" />
            </div>
            <div>
              <p className="text-[13px] font-black text-white">New Session</p>
              <p className="text-[10px] text-gray-500">
                Start a new session and course
              </p>
            </div>
          </div>

          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {courseMode === 'select' && courses.length > 0 ? (
            <Field label="Course *">
              <select
                className={inputCls}
                value={courseCode}
                onChange={(e) => {
                  const chosen = courses.find(
                    c => c.courseCode === e.target.value
                  );

                  setCourseCode(chosen?.courseCode || '');
                  setCourseName(chosen?.courseName || '');
                }}
                autoFocus
              >
                <option value="">Select a course…</option>

                {courses.map(c => (
                  <option key={c.courseCode} value={c.courseCode}>
                    {c.courseCode}
                    {c.courseName ? ` — ${c.courseName}` : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  setCourseMode('custom');
                  setCourseCode('');
                  setCourseName('');
                }}
                className="text-[10px] text-accent-blue hover:text-accent-blue/80 font-bold mt-1 text-left"
              >
                + Add a new course instead
              </button>
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Course Code *">
                <input
                  className={inputCls}
                  placeholder="e.g. CS301"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  autoFocus
                />
              </Field>

              <Field label="Course Name">
                <input
                  className={inputCls}
                  placeholder="e.g. Data Structures"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                />
              </Field>

              {courses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCourseMode('select')}
                  className="col-span-2 text-[10px] text-accent-blue hover:text-accent-blue/80 font-bold text-left"
                >
                  ← Choose an existing course instead
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Academic Year">
              <select
                className={inputCls}
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
              >
                <option value="">Select academic year…</option>
                {ACADEMIC_YEARS.map(ay => (
                  <option key={ay} value={ay}>
                    {ay}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Year of Study">
              <select
                className={inputCls}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">Select year…</option>
                {YEARS_OF_STUDY.map(y => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Semester">
            <select
              className={inputCls}
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            >
              <option value="">Select semester…</option>
              {SEMESTERS.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Custom Session Name">
            <input
              className={inputCls}
              placeholder="e.g. Midterm Examination"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
            <span className="text-[9px] text-gray-600">
              Use this instead of a semester for a custom session.
            </span>
          </Field>

          <Field label="Session Label">
            <input
              className={inputCls}
              placeholder="e.g. Assignment, End of Semester"
              value={sessionLabel}
              onChange={(e) => setSessionLabel(e.target.value)}
            />
          </Field>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle size={12} className="text-red-400 shrink-0" />
              <p className="text-[11px] text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={handleConfirm}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-blue text-white text-[12px] font-bold rounded-xl hover:bg-blue-600 transition-colors shadow-lg shadow-accent-blue/20"
          >
            Start New Session
            <ArrowRight size={14} />
          </button>
        </div>
      </motion.div>
    </Backdrop>
  );
};

const Backdrop = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[9998] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
    onClick={onClose}
  >
    {children}
  </motion.div>
);
