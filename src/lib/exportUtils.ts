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

const EXCEL_COLUMNS = [
    'Student Name',
    'Reg No',
    'Course Code',
    'Program',
    'Year',
    'Exam Date',
    'Total Score',
    'Grade',
    'Date Graded',
];

function resultRow(studentInfo: StudentInfo, result: GradingResult): (string | number)[] {
    return [
        studentInfo.name || '',
        studentInfo.regNo || '',
        studentInfo.courseCode || '',
        studentInfo.program || '',
        studentInfo.year || '',
        studentInfo.examDate || '',
        result.totalScore || result.score || '',
        result.grade || '',
        new Date().toLocaleString(),
    ];
}

/**
 * Build the filename for the session's Excel workbook, based on course code.
 */
export function buildSessionExcelFilename(sessionKey: string): string {
    return `${sanitizeFilename(sessionKey || 'general')}-session.xlsx`;
}

/**
 * Append a graded paper's details as a new row to the session's Excel workbook.
 * If a workbook already exists in the given folder with this filename, it reads
 * and appends to it; otherwise it creates a new one with headers.
 */
export async function appendResultToSessionExcel(
    folder: FileSystemDirectoryHandle | null,
    sessionKey: string,
    studentInfo: StudentInfo,
    result: GradingResult
): Promise<'written' | 'downloaded'> {
    const filename = buildSessionExcelFilename(sessionKey);
    const newRow = resultRow(studentInfo, result);

    let workbook: XLSX.WorkBook;
    let existingBuffer: ArrayBuffer | null = null;

    if (folder) {
        try {
            // @ts-ignore
            const fileHandle = await folder.getFileHandle(filename, { create: false });
            const file = await fileHandle.getFile();
            existingBuffer = await file.arrayBuffer();
        } catch {
            existingBuffer = null; // doesn't exist yet — will create fresh
        }
    }

    if (existingBuffer) {
        workbook = XLSX.read(existingBuffer, { type: 'array' });
    } else {
        workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.aoa_to_sheet([EXCEL_COLUMNS]);
        XLSX.utils.book_append_sheet(workbook, sheet, 'Session');
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const existingData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    // Ensure headers exist as the first row
    if (existingData.length === 0) {
        existingData.push(EXCEL_COLUMNS);
    }
    existingData.push(newRow);

    const updatedSheet = XLSX.utils.aoa_to_sheet(existingData);
    workbook.Sheets[sheetName] = updatedSheet;

    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    return writeFileToFolder(folder, filename, blob);
}
