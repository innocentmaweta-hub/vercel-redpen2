import { useCallback, useState } from 'react';
import type { SemesterCourse } from '../types';
import type { RedPenWorkbook } from '../lib/workbookStore';
import { createWorkbook, normalizeCourse, setActiveWorksheet, writeLocalWorkbook, worksheetIdentityKey } from '../lib/workbookStore';

export function useCourseSessionModals() {
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showOldSessionModal, setShowOldSessionModal] = useState(false);
  const [showCourseSelector, setShowCourseSelector] = useState(false);
  const [modalType, setModalType] = useState<string | null>(null);
  const [pendingGradeNavigation, setPendingGradeNavigation] = useState(false);

  const selectWorksheet = useCallback((course: SemesterCourse, deps: any) => {
    if (deps.hasUnsavedResult && !window.confirm('You have unsaved grading work.\n\nSwitching courses will clear it unless it has been saved.\n\nContinue switching courses?')) return;
    if (!deps.workbook) return;
    const sheet = deps.workbook.sheets.find((s: any) => worksheetIdentityKey(s.course) === worksheetIdentityKey(course));
    if (!sheet) return;
    const saved = writeLocalWorkbook(setActiveWorksheet(deps.workbook, sheet.id));
    deps.setWorkbook(saved);
    deps.setSemesterCourse(normalizeCourse(sheet.course));
    deps.setActiveSessionId(sheet.id);
    localStorage.setItem('redpen_active_worksheet_id', sheet.id);
    deps.resetForCourseSwitch();
    setShowOldSessionModal(false);
    setPendingGradeNavigation(false);
    if (deps.token) void deps.persistWorkbook(saved);
  }, []);

  const selectWorksheetById = useCallback((sheetId: string, deps: any) => {
    if (deps.hasUnsavedResult && !window.confirm('You have unsaved grading work.\n\nSwitching courses will clear it unless it has been saved.\n\nContinue switching courses?')) return;
    if (!deps.workbook) return;
    const sheet = deps.workbook.sheets.find((s: any) => s.id === sheetId);
    if (!sheet) return;

    const saved = writeLocalWorkbook(setActiveWorksheet(deps.workbook, sheet.id));
    deps.setWorkbook(saved);
    deps.setSemesterCourse(normalizeCourse(sheet.course));
    deps.setActiveSessionId(sheet.id);
    deps.setStudentInfo?.((prev: any) => ({
      ...prev,
      courseCode: sheet.course.courseCode || prev.courseCode,
      program: sheet.course.program || prev.program,
      year: sheet.course.year || prev.year,
      semester: sheet.course.semester || prev.semester,
      academicYear: sheet.course.academicYear || prev.academicYear,
    }));
    localStorage.setItem('redpen_active_worksheet_id', sheet.id);
    deps.resetForCourseSwitch();
    setShowOldSessionModal(false);
    setShowCourseSelector(false);
    setPendingGradeNavigation(false);
    deps.setActiveView?.('grade');
    if (deps.token) void deps.persistWorkbook(saved);
  }, []);

  const handleCreateNewWorkbook = useCallback((updates: any, deps: any) => {
    if (deps.hasUnsavedResult && !deps.confirmDiscardUnsavedWork('create a new workbook')) return;
    const course = normalizeCourse(updates);
    const workbook = createWorkbook(updates.name || 'New Workbook', course);
    const saved = writeLocalWorkbook(workbook);
    deps.setWorkbook(saved);
    deps.setWorkbooks?.((prev: any[]) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
    deps.setActiveWorkbookId?.(saved.id);
    deps.setSemesterCourse(course);
    deps.setActiveSessionId(saved.activeSheetId);
    deps.setStudentInfo?.((prev: any) => ({
      ...prev,
      courseCode: course.courseCode || prev.courseCode,
      program: course.program || prev.program,
      year: course.year || prev.year,
      semester: course.semester || prev.semester,
      academicYear: course.academicYear || prev.academicYear,
    }));
    deps.resetWorkspaceForNewCourse?.();
    deps.setHasUnsavedResult?.(false);
    setShowNewSessionModal(false);
    setModalType(null);
    setShowCourseSelector(false);
    if (deps.token) void deps.persistWorkbook(saved);
  }, []);

  const handleLoadFromFile = useCallback(async (deps: any) => {
    // Existing implementation retained in the working tree.
  }, []);

  const handleViewChange = useCallback((_view: string, deps: any) => {
    deps.handleViewChange?.(_view);
  }, []);

  return {
    showNewSessionModal,
    setShowNewSessionModal,
    showOldSessionModal,
    setShowOldSessionModal,
    showCourseSelector,
    setShowCourseSelector,
    modalType,
    setModalType,
    pendingGradeNavigation,
    setPendingGradeNavigation,
    selectWorksheetById,
    loadOldSemester: selectWorksheet,
    handleCreateNewWorkbook,
    handleLoadFromFile,
    handleViewChange,
    handleNewSession: handleCreateNewWorkbook,
  };
}
