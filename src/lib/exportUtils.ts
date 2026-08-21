import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { writeFileToFolder } from './fileStorage';
import type { StudentInfo, GradingResult, HistoryRecord } from '../types';

function sanitizeFilename(name: string): string {
    return (name || 'untitled').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 80) || 'untitled';
}

export function buildPaperPdfBlob(imageDataUrl: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const naturalW = img.naturalWidth;
            const naturalH = img.naturalHeight;
            if (!naturalW || !naturalH) {
                reject(new Error('Invalid paper image dimensions'));
                return;
            }

            const pdf = new jsPDF({
                orientation: naturalH >= naturalW ? 'portrait' : 'landscape',
                unit: 'pt',
                format: [naturalW, naturalH],
                compress: true,
            });

            const imageFormat = imageDataUrl.startsWith('data:image/png')
                ? 'PNG'
                : imageDataUrl.startsWith('data:image/webp')
                    ? 'WEBP'
                    : 'JPEG';

            pdf.addImage(imageDataUrl, imageFormat, 0, 0, naturalW, naturalH, undefined, 'FAST');
            resolve(pdf.output('blob'));
        };
        img.onerror = () => reject(new Error('Failed to load paper image for PDF export'));
        img.src = imageDataUrl;
    });
}

export function buildPaperPdfFilename(studentInfo: StudentInfo): string {
    const course = sanitizeFilename(studentInfo.courseCode || 'course');
    const name = sanitizeFilename(studentInfo.name || 'student');
    return `${course}-${name}.pdf`;
}

const BASE_COLUMNS = [
    'Student Name', 'Reg No', 'Course Code', 'Program', 'Year', 'Semester',
    'Exam Date', 'Total Score', 'Grade', 'Percentage', 'Summary Feedback', 'Date Graded',
];

function questionColumns(count: number): string[] {
    const cols: string[] = [];
    for (let i = 1; i <= count; i++) cols.push(`Q${i} Score`, `Q${i} Feedback`);
    return cols;
}

function fullColumns(questionCount: number): string[] {
    return [...BASE_COLUMNS, ...questionColumns(questionCount)];
}

function resultRow(studentInfo: StudentInfo, result: GradingResult, questionCount: number): (string | number)[] {
    const base = [
        studentInfo.name || '', studentInfo.regNo || '', studentInfo.courseCode || '',
        studentInfo.program || '', studentInfo.year || '', studentInfo.semester || '',
        studentInfo.examDate || '', result.totalScore || result.score || '', result.grade || '',
        result.percentage || '', result.feedback || '', new Date().toLocaleString(),
    ];
    const questions = result.questions || [];
    const questionCells: (string | number)[] = [];
    for (let i = 0; i < questionCount; i++) {
        const q = questions[i];
        questionCells.push(q?.score || '', q?.feedback || '');
    }
    return [...base, ...questionCells];
}

export function buildSessionExcelFilename(academicYear: string, semester: string, sessionLabel: string, customName?: string): string {
    if (customName && customName.trim()) return `${sanitizeFilename(customName)}.xlsx`;
    const yr = sanitizeFilename(academicYear || 'academic-year');
    const sem = sanitizeFilename(semester || 'semester');
    const label = sanitizeFilename(sessionLabel || 'session');
    return `${yr}-${sem}-${label}.xlsx`;
}

function sanitizeSheetName(name: string): string {
    const cleaned = (name || 'Course').replace(/[:\\/?*[\]]/g, '').trim();
    return cleaned.slice(0, 31) || 'Course';
}

function browserWorkbookKey(filename: string): string {
    return `redpen_excel_cache:${filename}`;
}

function readBrowserWorkbook(filename: string): ArrayBuffer | null {
    try {
        const encoded = localStorage.getItem(browserWorkbookKey(filename));
        if (!encoded) return null;
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    } catch {
        return null;
    }
}

function writeBrowserWorkbook(filename: string, data: ArrayBuffer): void {
    try {
        const bytes = new Uint8Array(data);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        localStorage.setItem(browserWorkbookKey(filename), btoa(binary));
    } catch (error) {
        console.warn('Could not cache Excel workbook locally:', error);
    }
}

export async function appendResultToSessionExcel(
    folder: FileSystemDirectoryHandle | null,
    workbookKey: { academicYear: string; semester: string; sessionLabel: string; customName?: string },
    courseSheetKey: string,
    studentInfo: StudentInfo,
    result: GradingResult
): Promise<'written' | 'downloaded'> {
    const filename = buildSessionExcelFilename(workbookKey.academicYear, workbookKey.semester, workbookKey.sessionLabel, workbookKey.customName);
    const sheetName = sanitizeSheetName(courseSheetKey);
    const incomingQuestionCount = (result.questions || []).length;

    let workbook: XLSX.WorkBook;
    let existingBuffer: ArrayBuffer | null = null;

    if (folder) {
        try {
            // @ts-ignore
            const fileHandle = await folder.getFileHandle(filename, { create: false });
            const file = await fileHandle.getFile();
            existingBuffer = await file.arrayBuffer();
        } catch {
            existingBuffer = null;
        }
    } else {
        existingBuffer = readBrowserWorkbook(filename);
    }

    workbook = existingBuffer ? XLSX.read(existingBuffer, { type: 'array' }) : XLSX.utils.book_new();

    let existingData: any[][];
    let existingQuestionCount = 0;

    if (workbook.SheetNames.includes(sheetName)) {
        const sheet = workbook.Sheets[sheetName];
        existingData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (existingData.length === 0) {
            existingData = [fullColumns(incomingQuestionCount)];
            existingQuestionCount = incomingQuestionCount;
        } else {
            existingQuestionCount = Math.max(0, Math.floor((existingData[0].length - BASE_COLUMNS.length) / 2));
        }
    } else {
        existingData = [fullColumns(incomingQuestionCount)];
        existingQuestionCount = incomingQuestionCount;
    }

    const finalQuestionCount = Math.max(existingQuestionCount, incomingQuestionCount);
    if (finalQuestionCount > existingQuestionCount) {
        existingData[0] = fullColumns(finalQuestionCount);
        const extraCells = (finalQuestionCount - existingQuestionCount) * 2;
        for (let i = 1; i < existingData.length; i++) existingData[i] = [...existingData[i], ...Array(extraCells).fill('')];
    }

    existingData.push(resultRow(studentInfo, result, finalQuestionCount));
    const updatedSheet = XLSX.utils.aoa_to_sheet(existingData);
    if (workbook.SheetNames.includes(sheetName)) workbook.Sheets[sheetName] = updatedSheet;
    else XLSX.utils.book_append_sheet(workbook, updatedSheet, sheetName);

    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    if (!folder) writeBrowserWorkbook(filename, wbout);
    return writeFileToFolder(folder, filename, blob);
}

export async function loadHistoryFromExcelFile(file: File): Promise<HistoryRecord[]> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const records: HistoryRecord[] = [];

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
        if (rows.length < 2) continue;

        const headers = rows[0].map((header: any) => String(header || '').trim());
        const indexOf = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
        const valueAt = (row: any[], name: string): string => {
            const index = indexOf(name);
            return index >= 0 ? String(row[index] ?? '').trim() : '';
        };

        const questionHeaders = headers.map((header, index) => ({ header, index })).filter(({ header }) => /^Q\d+ Score$/i.test(header));

        for (const row of rows.slice(1)) {
            const name = valueAt(row, 'Student Name');
            const regNo = valueAt(row, 'Reg No');
            const courseCode = valueAt(row, 'Course Code') || sheetName;
            if (!name && !regNo && !courseCode) continue;

            const questions = questionHeaders.map(({ header, index }) => {
                const match = header.match(/^Q(\d+) Score$/i);
                const qNumber = match ? Number(match[1]) : 0;
                const feedbackIndex = headers.findIndex(h => h.toLowerCase() === `q${qNumber} feedback`);
                return { q: qNumber, score: String(row[index] ?? '').trim(), feedback: feedbackIndex >= 0 ? String(row[feedbackIndex] ?? '').trim() : '' };
            });

            const gradedDate = valueAt(row, 'Date Graded');
            const studentInfo: StudentInfo = { name, regNo, courseCode, program: valueAt(row, 'Program'), year: valueAt(row, 'Year'), semester: valueAt(row, 'Semester'), examDate: valueAt(row, 'Exam Date') };
            const result: GradingResult = { totalScore: valueAt(row, 'Total Score'), grade: valueAt(row, 'Grade'), percentage: valueAt(row, 'Percentage'), feedback: valueAt(row, 'Summary Feedback'), questions };
            records.push({ id: `excel-${Date.now()}-${records.length}`, date: gradedDate || new Date().toISOString(), studentInfo, result });
        }
    }
    return records;
}
