import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { writeFileToFolder } from './fileStorage';
import type { StudentInfo, GradingResult } from '../types';

// Sanitize a string for safe use in filenames
function sanitizeFilename(name: string): string {
    return (name || 'untitled').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 80) || 'untitled';
}

/**
 * Generate a single-page PDF from a full-paper image (paper + annotations),
 * sized to exactly match the image's real pixel dimensions/aspect ratio.
 */
export function buildPaperPdfBlob(imageDataUrl: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const naturalW = img.naturalWidth;
            const naturalH = img.naturalHeight;

            const pdf = new jsPDF({
                orientation: naturalH >= naturalW ? 'portrait' : 'landscape',
                unit: 'pt',
                format: [naturalW, naturalH],
            });

            pdf.addImage(imageDataUrl, 'JPEG', 0, 0, naturalW, naturalH);

            resolve(pdf.output('blob'));
        };
        img.onerror = () => reject(new Error('Failed to load paper image for PDF export'));
        img.src = imageDataUrl;
    });
}

/**
 * Build the filename for a graded paper's PDF: "{courseCode}-{studentName}.pdf"
 */
export function buildPaperPdfFilename(studentInfo: StudentInfo): string {
    const course = sanitizeFilename(studentInfo.courseCode || 'course');
    const name = sanitizeFilename(studentInfo.name || 'student');
    return `${course}-${name}.pdf`;
}

// Fixed columns that always appear first, regardless of question count
const BASE_COLUMNS = [
    'Student Name',
    'Reg No',
    'Course Code',
    'Program',
    'Year',
    'Semester',
    'Exam Date',
    'Total Score',
    'Grade',
    'Percentage',
    'Summary Feedback',
    'Date Graded',
];

// Builds "Q1 Score", "Q1 Feedback", "Q2 Score", "Q2 Feedback", ... for N questions
function questionColumns(count: number): string[] {
    const cols: string[] = [];
    for (let i = 1; i <= count; i++) {
        cols.push(`Q${i} Score`, `Q${i} Feedback`);
    }
    return cols;
}

function fullColumns(questionCount: number): string[] {
    return [...BASE_COLUMNS, ...questionColumns(questionCount)];
}

function resultRow(studentInfo: StudentInfo, result: GradingResult, questionCount: number): (string | number)[] {
    const base = [
        studentInfo.name || '',
        studentInfo.regNo || '',
        studentInfo.courseCode || '',
        studentInfo.program || '',
        studentInfo.year || '',
        studentInfo.semester || '',
        studentInfo.examDate || '',
        result.totalScore || result.score || '',
        result.grade || '',
        result.percentage || '',
        result.feedback || '',
        new Date().toLocaleString(),
    ];

    const questions = result.questions || [];
    const questionCells: (string | number)[] = [];
    for (let i = 0; i < questionCount; i++) {
        const q = questions[i];
        questionCells.push(q?.score || '', q?.feedback || '');
    }

    return [...base, ...questionCells];
}

/**
 * Build the filename for the semester's Excel workbook.
 * If customName is set, it fully replaces the academicYear-semester-label naming.
 * Otherwise: "{academicYear}-{semester}-{label}.xlsx"
 */
export function buildSessionExcelFilename(academicYear: string, semester: string, sessionLabel: string, customName?: string): string {
    if (customName && customName.trim()) {
        return `${sanitizeFilename(customName)}.xlsx`;
    }
    const yr = sanitizeFilename(academicYear || 'academic-year');
    const sem = sanitizeFilename(semester || 'semester');
    const label = sanitizeFilename(sessionLabel || 'session');
    return `${yr}-${sem}-${label}.xlsx`;
}

// Excel sheet names have their own restrictions (max 31 chars, no : \ / ? * [ ])
// — separate from filename sanitization above.
function sanitizeSheetName(name: string): string {
    const cleaned = (name || 'Course').replace(/[:\\/?*[\]]/g, '').trim();
    return cleaned.slice(0, 31) || 'Course';
}

/**
 * Append a graded paper's details as a new row to the correct course sheet,
 * inside the semester's Excel workbook ("{academicYear}-{semester}-{label}.xlsx").
 *
 * One workbook per academicYear+semester+sessionLabel combination. Within that
 * workbook, each course gets its own sheet — matched by sanitized course name,
 * so re-grading a paper for the same course appends to its existing sheet
 * instead of creating a duplicate.
 */
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
            existingBuffer = null; // workbook doesn't exist yet — will create fresh
        }
    }

    if (existingBuffer) {
        workbook = XLSX.read(existingBuffer, { type: 'array' });
    } else {
        workbook = XLSX.utils.book_new();
    }

    let existingData: any[][];
    let existingQuestionCount = 0;

    if (workbook.SheetNames.includes(sheetName)) {
        // Course sheet already exists — figure out how many question-columns it currently has,
        // so we can grow the header (and pad older rows) if this paper has more questions.
        const sheet = workbook.Sheets[sheetName];
        existingData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (existingData.length === 0) {
            existingData = [fullColumns(incomingQuestionCount)];
            existingQuestionCount = incomingQuestionCount;
        } else {
            existingQuestionCount = Math.max(0, Math.floor((existingData[0].length - BASE_COLUMNS.length) / 2));
        }
    } else {
        // First result for this course in this workbook — create its sheet with headers
        existingData = [fullColumns(incomingQuestionCount)];
        existingQuestionCount = incomingQuestionCount;
    }

    const finalQuestionCount = Math.max(existingQuestionCount, incomingQuestionCount);

    // If this paper has more questions than the sheet currently supports, widen the
    // header and pad every existing row with blank cells for the new question columns.
    if (finalQuestionCount > existingQuestionCount) {
        existingData[0] = fullColumns(finalQuestionCount);
        const extraCells = (finalQuestionCount - existingQuestionCount) * 2;
        for (let i = 1; i < existingData.length; i++) {
            existingData[i] = [...existingData[i], ...Array(extraCells).fill('')];
        }
    }

    const newRow = resultRow(studentInfo, result, finalQuestionCount);
    existingData.push(newRow);

    const updatedSheet = XLSX.utils.aoa_to_sheet(existingData);

    if (workbook.SheetNames.includes(sheetName)) {
        workbook.Sheets[sheetName] = updatedSheet;
    } else {
        XLSX.utils.book_append_sheet(workbook, updatedSheet, sheetName);
    }

    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    return writeFileToFolder(folder, filename, blob);
}
