// name=src/hooks/useGrading.ts
// Hook to centralize grading state and AI call.
// This version uses fetch to POST to /api/grade and reads token from localStorage.
// It purposely avoids filesystem/export responsibilities (App handles capture/export).

import { useCallback, useState } from 'react';
import { StudentInfo, GradingResult, HistoryRecord, SemesterCourse } from '../types';
import { validateAndNormalizeResult } from '../lib/validation';

const AUTH_TOKEN_KEY = 'yaza_auth_token';

export function useGrading(initialStudent?: StudentInfo, initialSession?: SemesterCourse) {
  const [studentInfo, setStudentInfo] = useState<StudentInfo>(initialStudent || {
    name: '', regNo: '', program: '', year: '', semester: '', courseCode: '', examDate: ''
  });

  const [markingScheme, setMarkingScheme] = useState<{ base64: string; name: string } | null>(null);
  const [studentPaper, setStudentPaper] = useState<{ base64: string; name: string } | null>(null);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handlePaperUpload = useCallback((base64: string, name: string) => {
    setStudentPaper({ base64, name });
    setResult(null);
  }, []);

  const handleGrade = useCallback(async () => {
    if (!studentPaper) {
      alert('Please upload a student paper before grading.');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const payload = {
        studentInfo,
        markingScheme: markingScheme?.base64 ?? null,
        studentPaper: studentPaper.base64
      };

      const res = await fetch('/api/grade', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (res.status === 401) {
        throw new Error('Authentication required. Please sign in.');
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data?.message || `Grading request failed (${res.status})`;
        throw new Error(message);
      }

      // Map API result (support snake_case or camelCase)
      const apiResult: any = data;
      if (apiResult.error) {
        throw new Error(apiResult.message || 'Grading failed');
      }

      const mapped: GradingResult = {
        totalScore: apiResult.total_score || apiResult.totalScore,
        score: apiResult.score,
        percentage: apiResult.percentage,
        grade: apiResult.grade,
        feedback: apiResult.feedback || '',
        questions: apiResult.questions || [],
        extracted_info: apiResult.extracted_info || undefined,
      };

      const validated = validateAndNormalizeResult(mapped);
      if (!validated) throw new Error('The grading service returned an invalid result.');

      setResult(validated.result);

      // update student info from extracted_info when present
      if (validated.result.extracted_info) {
        const ei: any = validated.result.extracted_info;
        setStudentInfo(prev => ({
          ...prev,
          name: ei.name || prev.name,
          regNo: ei.regNo || prev.regNo,
          program: ei.program || prev.program,
          year: ei.year || prev.year,
          courseCode: ei.courseCode || prev.courseCode,
          examDate: ei.examDate || prev.examDate
        }));
      }
    } catch (err) {
      console.error('Grading error', err);
      alert(err instanceof Error ? err.message : 'Grading failed');
    } finally {
      setLoading(false);
    }
  }, [studentPaper, studentInfo, markingScheme]);

  const handleSave = useCallback(async (resultToSave?: GradingResult) => {
    const current = resultToSave || result;
    if (!current) {
      alert('No grading result to save.');
      return null;
    }

    setIsSaving(true);
    try {
      const record: HistoryRecord = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        studentInfo,
        result: current
      };

      // Persistence to localStorage/history/export should be performed by App or SessionContext.
      // This hook returns the record so caller can store/export it.
      return record;
    } finally {
      setIsSaving(false);
    }
  }, [result, studentInfo]);

  const handlePrint = useCallback(() => {
    if (!result) {
      alert('No graded paper to print yet.');
      return;
    }
    // Printing requires the canvas image from PaperCanvas (App should capture it and open a print window).
  }, [result]);

  return {
    studentInfo,
    setStudentInfo,
    markingScheme,
    setMarkingScheme,
    studentPaper,
    setStudentPaper,
    result,
    setResult,
    loading,
    handlePaperUpload,
    handleGrade,
    handleSave,
    isSaving,
    handlePrint
  };
}
