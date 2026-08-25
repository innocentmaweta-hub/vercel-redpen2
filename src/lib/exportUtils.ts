import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { writeFileToFolder } from './fileStorage';
import { readExcelWorkbook, writeExcelWorkbook } from './excelCache';
import type { StudentInfo, GradingResult, HistoryRecord, SemesterCourse } from '../types';
import type { RedPenWorkbook, RedPenWorksheet } from '../types/workbook';
import { createWorkbook, worksheetFromCourse } from './workbookStore';

function sanitizeFilename(name: string): string {
    return (name || 'untitled').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 80) || 'untitled';
}

export function buildPaperPdfBlob(imageDataUrl: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const naturalW = img.naturalWidth;
            const naturalH = img.naturalHeight;
            if (!naturalW || !naturalH) return reject(new Error('Invalid paper image dimensions'));
            const pdf = new jsPDF({ orientation: naturalH >= naturalW ? 'portrait' : 'landscape', unit: 'pt', format: [naturalW, naturalH], compress: true });
            const imageFormat = imageDataUrl.startsWith('data:image/png') ? 'PNG' : imageDataUrl.startsWith('data:image/webp') ? 'WEBP' : 'JPEG';
            pdf.addImage(imageDataUrl, imageFormat, 0, 0, naturalW, naturalH, undefined, 'FAST');
            resolve(pdf.output('blob'));
        };
        img.onerror = () => reject(new Error('Failed to load paper image for PDF export'));
        img.src = imageDataUrl;
    });
}

export function buildPaperPdfFilename(studentInfo: StudentInfo): string {
    return `${sanitizeFilename(studentInfo.courseCode || 'course')}-${sanitizeFilename(studentInfo.name || 'student')}.pdf`;
}

const BASE_COLUMNS = ['Student Name', 'Reg No', 'Course Code', 'Program', 'Year', 'Semester', 'Exam Date', 'Total Score', 'Grade', 'Percentage', 'Summary Feedback', 'Date Graded'];
function questionColumns(count: number): string[] { const cols: string[] = []; for (let i = 1; i <= count; i++) cols.push(`Q${i} Score`, `Q${i} Feedback`); return cols; }
function fullColumns(questionCount: number): string[] { return [...BASE_COLUMNS, ...questionColumns(questionCount)]; }
function resultRow(studentInfo: StudentInfo, result: GradingResult, questionCount: number): (string | number)[] {
    const base = [studentInfo.name || '', studentInfo.regNo || '', studentInfo.courseCode || '', studentInfo.program || '', studentInfo.year || '', studentInfo.semester || '', studentInfo.examDate || '', result.totalScore || result.score || '', result.grade || '', result.percentage || '', result.feedback || '', new Date().toLocaleString()];
    const questions = result.questions || []; const cells: (string | number)[] = [];
    for (let i = 0; i < questionCount; i++) { const q = questions[i]; cells.push(q?.score || '', q?.feedback || ''); }
    return [...base, ...cells];
}
export function buildSessionExcelFilename(academicYear: string, semester: string, sessionLabel: string, customName?: string): string {
    if (customName && customName.trim()) return `${sanitizeFilename(customName)}.xlsx`;
    return `${sanitizeFilename(academicYear || 'academic-year')}-${sanitizeFilename(semester || 'semester')}-${sanitizeFilename(sessionLabel || 'workbook')}.xlsx`;
}
export function buildWorkbookExcelFilename(workbook: Pick<RedPenWorkbook, 'name' | 'fileName'>): string {
    const preferred = workbook.fileName || workbook.name || 'RedPen Workbook';
    return `${sanitizeFilename(preferred.replace(/\.xlsx$/i, ''))}.xlsx`;
}
function sanitizeSheetName(name: string): string { return ((name || 'Course').replace(/[:\\/?*[\]]/g, '').trim()).slice(0, 31) || 'Course'; }
function browserWorkbookKey(filename: string): string { return `redpen_excel_cache:${filename}`; }

export async function appendResultToSessionExcel(folder: FileSystemDirectoryHandle | null, workbookKey: { academicYear: string; semester: string; sessionLabel: string; customName?: string }, courseSheetKey: string, studentInfo: StudentInfo, result: GradingResult): Promise<'written' | 'downloaded'> {
    const filename = buildSessionExcelFilename(workbookKey.academicYear, workbookKey.semester, workbookKey.sessionLabel, workbookKey.customName);
    return appendResultToWorkbookExcel(folder, filename, courseSheetKey, studentInfo, result);
}

export async function appendResultToWorkbookExcel(folder: FileSystemDirectoryHandle | null, filename: string, courseSheetKey: string, studentInfo: StudentInfo, result: GradingResult): Promise<'written' | 'downloaded'> {
    const sheetName = sanitizeSheetName(courseSheetKey);
    const incomingQuestionCount = (result.questions || []).length;
    let existingBuffer: ArrayBuffer | null = null;
    if (folder) {
        try {
            // @ts-ignore File System Access API
            const fileHandle = await folder.getFileHandle(filename, { create: false });
            const file = await fileHandle.getFile(); existingBuffer = await file.arrayBuffer();
        } catch { existingBuffer = null; }
    } else {
        existingBuffer = await readExcelWorkbook(browserWorkbookKey(filename));
    }
    const workbook = existingBuffer ? XLSX.read(existingBuffer, { type: 'array' }) : XLSX.utils.book_new();
    let existingData: any[][]; let existingQuestionCount = 0;
    if (workbook.SheetNames.includes(sheetName)) {
        existingData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' }) as any[][];
        if (!existingData.length) existingData = [fullColumns(incomingQuestionCount)]; else existingQuestionCount = Math.max(0, Math.floor((existingData[0].length - BASE_COLUMNS.length) / 2));
    } else existingData = [fullColumns(incomingQuestionCount)];
    const finalQuestionCount = Math.max(existingQuestionCount, incomingQuestionCount);
    if (finalQuestionCount > existingQuestionCount) { existingData[0] = fullColumns(finalQuestionCount); const extraCells = (finalQuestionCount - existingQuestionCount) * 2; for (let i = 1; i < existingData.length; i++) existingData[i] = [...existingData[i], ...Array(extraCells).fill('')]; }
    existingData.push(resultRow(studentInfo, result, finalQuestionCount));
    const updatedSheet = XLSX.utils.aoa_to_sheet(existingData);
    if (workbook.SheetNames.includes(sheetName)) workbook.Sheets[sheetName] = updatedSheet; else XLSX.utils.book_append_sheet(workbook, updatedSheet, sheetName);
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (!folder) await writeExcelWorkbook(browserWorkbookKey(filename), wbout);
    return writeFileToFolder(folder, filename, blob);
}

function excelText(value: unknown): string { return String(value ?? '').trim(); }
function excelDate(value: unknown): string { if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString(); const text = excelText(value); if (!text) return new Date().toISOString(); const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(); }

function parseWorksheet(sheetName: string, worksheet: XLSX.WorkSheet): { course: SemesterCourse; records: HistoryRecord[]; sheet: RedPenWorksheet } {
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true }) as any[][];
    const headers = (rows[0] || []).map((h: unknown) => excelText(h));
    const index = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
    const textAt = (row: any[], name: string) => { const i = index(name); return i < 0 ? '' : excelText(row[i]); };
    const qHeaders = headers.map((h, i) => ({ h, i, n: h.match(/^Q(\d+) Score$/i) })).filter(x => x.n).sort((a, b) => Number(a.n![1]) - Number(b.n![1]));
    const records: HistoryRecord[] = [];
    const courseCode = textAt(rows[1] || [], 'Course Code') || sheetName;
    const baseName = sheetName || courseCode;
    const course: SemesterCourse = {
        id: `sheet-${baseName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        courseCode,
        courseName: '',
        program: textAt(rows[1] || [], 'Program'),
        year: textAt(rows[1] || [], 'Year'),
        semester: textAt(rows[1] || [], 'Semester'),
        academicYear: '',
        sessionLabel: '',
        customName: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex]; const name = textAt(row, 'Student Name'); const regNo = textAt(row, 'Reg No');
        if (!name && !regNo) continue;
        const questions = qHeaders.map(({ i, n }) => { const number = Number(n![1]); return { q: number, score: excelText(row[i]), feedback: textAt(row, `Q${number} Feedback`) }; });
        const studentInfo: StudentInfo = { name, regNo, courseCode: textAt(row, 'Course Code') || sheetName, program: textAt(row, 'Program'), year: textAt(row, 'Year'), semester: textAt(row, 'Semester'), examDate: textAt(row, 'Exam Date') };
        const total = textAt(row, 'Total Score'); const result: GradingResult = { totalScore: total, score: total, grade: textAt(row, 'Grade'), percentage: textAt(row, 'Percentage'), feedback: textAt(row, 'Summary Feedback'), questions };
        records.push({ id: `excel-${sheetName}-${rowIndex}-${Math.random().toString(36).slice(2, 8)}`, date: excelDate(row[index('Date Graded')]), studentInfo, result });
    }
    const sheet = worksheetFromCourse(course, records.map(record => ({ id: record.id, studentInfo: record.studentInfo, result: record.result, gradedAt: record.date })));
    return { course, records, sheet };
}

/** Parse an Excel workbook into the RedPen workbook domain model. */
export async function loadWorkbookFromExcelFile(file: File): Promise<{ workbook: RedPenWorkbook; history: HistoryRecord[] }> {
    const buffer = await file.arrayBuffer();
    const workbookData = XLSX.read(buffer, { type: 'array', cellDates: true });
    if (!workbookData.SheetNames.length) throw new Error('This Excel file contains no worksheets.');
    const sheets: RedPenWorksheet[] = [];
    const history: HistoryRecord[] = [];
    for (const sheetName of workbookData.SheetNames) {
        const parsed = parseWorksheet(sheetName, workbookData.Sheets[sheetName]);
        sheets.push(parsed.sheet);
        history.push(...parsed.records);
    }
    const baseName = file.name.replace(/\.(xlsx|xls)$/i, '').trim() || 'RedPen Workbook';
    const workbook = createWorkbook(baseName, sheets);
    workbook.fileName = file.name;
    // Course selection is intentionally deferred to the UI after import.
    workbook.activeSheetId = null;
    return { workbook, history };
}

/** Parse a RedPen workbook's rows back into grading history. */
export async function loadHistoryFromExcelFile(file: File): Promise<HistoryRecord[]> {
    const imported = await loadWorkbookFromExcelFile(file);
    return imported.history;
}

/**
 * Backward-compatible loader for older App code. It returns the first
 * worksheet as the legacy session while exposing all workbook records in history.
 */
export async function loadSessionFromExcelFile(file: File): Promise<{ session: SemesterCourse; history: HistoryRecord[] }> {
    const imported = await loadWorkbookFromExcelFile(file);
    const first = imported.workbook.sheets[0];
    if (!first) throw new Error('This Excel file contains no course worksheets.');
    return { session: first.course, history: imported.history };
}
