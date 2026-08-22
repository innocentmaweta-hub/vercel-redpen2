import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { writeFileToFolder } from './fileStorage';
import type { StudentInfo, GradingResult, HistoryRecord } from '../types';
import type { SemesterCourse } from '../components/CourseSessionModal';

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

function questionColumns(count: number): string[] {
    const cols: string[] = [];
    for (let i = 1; i <= count; i++) cols.push(`Q${i} Score`, `Q${i} Feedback`);
    return cols;
}

function fullColumns(questionCount: number): string[] { return [...BASE_COLUMNS, ...questionColumns(questionCount)]; }

function resultRow(studentInfo: StudentInfo, result: GradingResult, questionCount: number): (string | number)[] {
    const base = [studentInfo.name || '', studentInfo.regNo || '', studentInfo.courseCode || '', studentInfo.program || '', studentInfo.year || '', studentInfo.semester || '', studentInfo.examDate || '', result.totalScore || result.score || '', result.grade || '', result.percentage || '', result.feedback || '', new Date().toLocaleString()];
    const questions = result.questions || [];
    const cells: (string | number)[] = [];
    for (let i = 0; i < questionCount; i++) { const q = questions[i]; cells.push(q?.score || '', q?.feedback || ''); }
    return [...base, ...cells];
}

export function buildSessionExcelFilename(academicYear: string, semester: string, sessionLabel: string, customName?: string): string {
    if (customName && customName.trim()) return `${sanitizeFilename(customName)}.xlsx`;
    return `${sanitizeFilename(academicYear || 'academic-year')}-${sanitizeFilename(semester || 'semester')}-${sanitizeFilename(sessionLabel || 'session')}.xlsx`;
}

function sanitizeSheetName(name: string): string { return ((name || 'Course').replace(/[:\\/?*[\]]/g, '').trim()).slice(0, 31) || 'Course'; }
function browserWorkbookKey(filename: string): string { return `redpen_excel_cache:${filename}`; }
function readBrowserWorkbook(filename: string): ArrayBuffer | null {
    try { const encoded = localStorage.getItem(browserWorkbookKey(filename)); if (!encoded) return null; const binary = atob(encoded); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes.buffer; } catch { return null; }
}
function writeBrowserWorkbook(filename: string, data: ArrayBuffer): void {
    try { const bytes = new Uint8Array(data); let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); localStorage.setItem(browserWorkbookKey(filename), btoa(binary)); } catch (error) { console.warn('Could not cache Excel workbook locally:', error); }
}

export async function appendResultToSessionExcel(folder: FileSystemDirectoryHandle | null, workbookKey: { academicYear: string; semester: string; sessionLabel: string; customName?: string }, courseSheetKey: string, studentInfo: StudentInfo, result: GradingResult): Promise<'written' | 'downloaded'> {
    const filename = buildSessionExcelFilename(workbookKey.academicYear, workbookKey.semester, workbookKey.sessionLabel, workbookKey.customName);
    const sheetName = sanitizeSheetName(courseSheetKey);
    const incomingQuestionCount = (result.questions || []).length;
    let existingBuffer: ArrayBuffer | null = null;
    if (folder) { try { // @ts-ignore
        const fileHandle = await folder.getFileHandle(filename, { create: false }); const file = await fileHandle.getFile(); existingBuffer = await file.arrayBuffer();
    } catch { existingBuffer = null; } } else existingBuffer = readBrowserWorkbook(filename);
    const workbook = existingBuffer ? XLSX.read(existingBuffer, { type: 'array' }) : XLSX.utils.book_new();
    let existingData: any[][];
    let existingQuestionCount = 0;
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
    if (!folder) writeBrowserWorkbook(filename, wbout);
    return writeFileToFolder(folder, filename, blob);
}

function excelText(value: unknown): string { return String(value ?? '').trim(); }
function excelDate(value: unknown): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    const text = excelText(value); if (!text) return new Date().toISOString();
    const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/** Parse workbooks generated by RedPen's Excel exporter back into grading history. */
export async function loadHistoryFromExcelFile(file: File): Promise<HistoryRecord[]> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const records: HistoryRecord[] = [];
    for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true }) as any[][];
        if (rows.length < 2) continue;
        const headers = rows[0].map((h: unknown) => excelText(h));
        const index = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
        const textAt = (row: any[], name: string) => { const i = index(name); return i < 0 ? '' : excelText(row[i]); };
        const qHeaders = headers.map((h, i) => ({ h, i, n: h.match(/^Q(\d+) Score$/i) })).filter(x => x.n).sort((a, b) => Number(a.n![1]) - Number(b.n![1]));
        for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            const name = textAt(row, 'Student Name'); const regNo = textAt(row, 'Reg No'); const courseCode = textAt(row, 'Course Code') || sheetName;
            if (!name && !regNo) continue;
            const questions = qHeaders.map(({ i, n }) => { const number = Number(n![1]); return { q: number, score: excelText(row[i]), feedback: textAt(row, `Q${number} Feedback`) }; });
            const studentInfo: StudentInfo = { name, regNo, courseCode, program: textAt(row, 'Program'), year: textAt(row, 'Year'), semester: textAt(row, 'Semester'), examDate: textAt(row, 'Exam Date') };
            const total = textAt(row, 'Total Score');
            const result: GradingResult = { totalScore: total, score: total, grade: textAt(row, 'Grade'), percentage: textAt(row, 'Percentage'), feedback: textAt(row, 'Summary Feedback'), questions };
            records.push({ id: `excel-${Date.now()}-${sheetName}-${rowIndex}-${Math.random().toString(36).slice(2, 8)}`, date: excelDate(row[index('Date Graded')]), studentInfo, result });
        }
    }
    return records;
}

/** Reconstruct the active RedPen session plus its imported history from an exported workbook. */
export async function loadSessionFromExcelFile(file: File): Promise<{ session: SemesterCourse; history: HistoryRecord[] }> {
    const history = await loadHistoryFromExcelFile(file);
    if (!history.length) throw new Error('This Excel file contains no RedPen grading records.');
    const first = history[0];
    const baseName = file.name.replace(/\.(xlsx|xls)$/i, '').trim();
    const parts = baseName.split('-').map(s => s.trim()).filter(Boolean);
    const session: SemesterCourse = {
        id: `excel-session-${Date.now()}`,
        courseCode: first.studentInfo.courseCode,
        courseName: '',
        program: first.studentInfo.program,
        year: first.studentInfo.year,
        semester: first.studentInfo.semester,
        academicYear: parts[0] || '',
        sessionLabel: parts.slice(2).join(' - ') || '',
        customName: baseName || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    return { session, history };
}
