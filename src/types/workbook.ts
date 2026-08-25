import type { GradingResult, HistoryRecord, StudentInfo, SemesterCourse } from '../types';

/** A RedPen workbook is the user's complete grading workspace. */
export interface RedPenWorkbook {
  id: string;
  name: string;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
  activeSheetId: string | null;
  sheets: RedPenWorksheet[];
}

/** A worksheet is a course inside a RedPen workbook. */
export interface RedPenWorksheet {
  id: string;
  name: string;
  course: SemesterCourse;
  rows: RedPenStudentRow[];
  createdAt: string;
  updatedAt: string;
}

export interface RedPenStudentRow {
  id: string;
  studentInfo: StudentInfo;
  result: GradingResult;
  gradedAt?: string;
}

export interface WorkbookFileImport {
  workbook: RedPenWorkbook;
  history: HistoryRecord[];
}

export function worksheetIdentity(sheet: RedPenWorksheet): string {
  return sheet.id || sheet.course.id || sheet.course.courseCode;
}

export function workbookHasSheets(workbook: RedPenWorkbook | null): boolean {
  return Boolean(workbook?.sheets?.length);
}
