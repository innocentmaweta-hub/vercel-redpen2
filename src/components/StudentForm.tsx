import React, { useState, useEffect } from 'react';
import { StudentInfo } from '../types';

interface Props {
  info: StudentInfo;
  onChange: (info: StudentInfo) => void;
}

const YEARS_OF_STUDY = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
const SEMESTERS = ['Semester 1', 'Semester 2'];

export const StudentForm = ({ info, onChange }: Props) => {
  const [selectedDepartment, setSelectedDepartment] = useState<string>(() => {
    return localStorage.getItem('lastSelectedDepartment') || '';
  });

  useEffect(() => {
    // Save department selection to localStorage when it changes
    if (selectedDepartment) {
      localStorage.setItem('lastSelectedDepartment', selectedDepartment);
    }
  }, [selectedDepartment]);

  const handleChange = (field: keyof StudentInfo, value: string) => {
    // Basic input validation
    let validatedValue = value.trim();

    if (field === 'regNo') {
      validatedValue = validatedValue.toUpperCase();
      if (validatedValue && !/^[A-Z0-9/-]{3,15}$/.test(validatedValue)) return;
    } else if (field === 'courseCode') {
      validatedValue = validatedValue.toUpperCase();
      if (validatedValue && !/^[A-Z]{2,4}\d{3,4}$/.test(validatedValue)) return;
    } else if (field === 'examDate') {
      if (validatedValue && !/^\d{4}-\d{2}-\d{2}$/.test(validatedValue)) return;
    }
    // 'year' and 'semester' come from fixed dropdowns below, so no regex needed

    onChange({ ...info, [field]: validatedValue });
  };

  const inputClass = "w-full bg-sidebar border border-gray-800 rounded-lg py-2 px-3 text-sm focus:border-accent-blue focus:outline-none transition-all placeholder:text-gray-600";
  const selectClass = `${inputClass} appearance-none cursor-pointer`;

  return (
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

      {/* Row 3: Year of Study / Semester */}
      <div className="grid grid-cols-2 gap-4">
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
          value={info.semester || ''}
          onChange={(e) => handleChange('semester', e.target.value)}
        >
          <option value="">Semester</option>
          {SEMESTERS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Row 4: Course Code / Exam Date */}
      <div className="grid grid-cols-2 gap-4">
        <input
          type="text"
          placeholder="Course Code"
          className={inputClass}
          value={info.courseCode}
          onChange={(e) => handleChange('courseCode', e.target.value)}
        />
        <input
          type="date"
          placeholder="Date of Exams"
          className={`${inputClass} text-gray-400`}
          value={info.examDate}
          onChange={(e) => handleChange('examDate', e.target.value)}
        />
      </div>
    </div>
  );
};
