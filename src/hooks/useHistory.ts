import { useState } from 'react';
import { StudentInfo, GradingResult, HistoryRecord } from '../types';
import {
    fetchCloudHistory,
    saveCloudHistory,
    deleteCloudHistory,
    writeLocalHistory,
} from '../lib/historyStore';
import { saveCloudWorkbook, updateWorksheet } from '../lib/workbookStore';
import { getSavedFolder } from '../lib/fileStorage';
import { buildPaperPdfBlob, buildPaperPdfFilename, appendResultToSessionExcel } from '../lib/exportUtils';
import { writeFileToFolder } from '../lib/fileStorage';
import { parseQuestionScore } from '../lib/resultUtils';

export function useHistory() {
    const [history, setHistory] = useState<HistoryRecord[]>([]);
    const [historySaveState, setHistorySaveState] =
        useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [pendingHistoryRecord, setPendingHistoryRecord] = useState<HistoryRecord | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const retryHistorySave = async (token: string | null) => {
        if (!pendingHistoryRecord || !token) return;
        setHistorySaveState('saving');
        try {
            const cloudHistory = await saveCloudHistory(token, pendingHistoryRecord);
            setHistory(cloudHistory);
            writeLocalHistory(cloudHistory);
            setPendingHistoryRecord(null);
            setHistorySaveState('saved');
            return true;
        } catch (error) {
            console.error('History retry failed:', error);
            setHistorySaveState('error');
            return false;
        }
    };

    const handleSave = async ({
        token, workbook, semesterCourse, studentInfo, result, resultToSave,
        examinerRemarks, paperCanvasRef, setShowCourseSelector, setWorkbook,
        persistWorkbook, setHasUnsavedResult,
    }: any) => {
        if (!token) { setHistorySaveState('error'); alert('Please sign in before saving grading results.'); return false; }
        if (!workbook) { alert('No workbook is open. Please open or create a workbook first.'); return false; }
        if (!semesterCourse) { alert('No course is selected. Please select a course before saving.'); setShowCourseSelector(true); return false; }
        const currentResult = resultToSave || result;
        if (!currentResult) { alert('No grading result to save. Grade a paper first.'); return false; }

        const hasQuestions = Array.isArray(currentResult.questions) && currentResult.questions.length > 0;
        if (hasQuestions) {
            const incompleteQuestions = currentResult.questions.filter((q: any) => {
                const score = typeof q.score === 'string' ? q.score.trim() : '';
                return !score || !parseQuestionScore(score);
            });
            if (incompleteQuestions.length > 0) {
                alert('Cannot save this result. All question scores must be completed with valid scores such as 5/10.');
                return false;
            }
        }

        const missingResultFields = [
            !currentResult.totalScore && 'Total Score',
            !currentResult.percentage && 'Percentage',
            !currentResult.grade && 'Grade',
        ].filter(Boolean);
        if (missingResultFields.length > 0) {
            alert(`Cannot save an incomplete result. Missing: ${missingResultFields.join(', ')}.`);
            return false;
        }

        const activeCourseCode = semesterCourse.courseCode.trim();
        if (!activeCourseCode) { alert('The selected course does not have a valid course code.'); return false; }

        const saveStudentInfo: StudentInfo = {
            ...studentInfo,
            courseCode: activeCourseCode,
            semester: semesterCourse.semester || studentInfo.semester,
            year: semesterCourse.year || studentInfo.year,
        };

        const requiredFields = ['name', 'regNo', 'courseCode', 'program'];
        const missingFields = requiredFields.filter(field => !saveStudentInfo[field as keyof StudentInfo]);
        if (missingFields.length > 0) {
            const missingFieldNames = missingFields.map(field =>
                field === 'regNo' ? 'Registration Number' :
                field === 'courseCode' ? 'Course Code' :
                field === 'program' ? 'Program of Study' :
                field.charAt(0).toUpperCase() + field.slice(1)
            ).join(', ');
            const userConfirmed = confirm(
                `The following required fields are missing: ${missingFieldNames}.\n\n` +
                `You need to enter this information before saving.\n\n` +
                `Go to the Identity Panel to enter the details, then try saving again.\n\n` +
                `Do you want to proceed with saving anyway?`
            );
            if (!userConfirmed) return false;
        }

        setIsSaving(true);
        setHistorySaveState('saving');
        const record: HistoryRecord = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            studentInfo: saveStudentInfo,
            result: {
                ...currentResult,
                feedback: currentResult.feedback + (examinerRemarks ? `\n\nExaminer Remarks: ${examinerRemarks}` : '')
            }
        };
        setPendingHistoryRecord(record);

        try {
            const cloudHistory = await saveCloudHistory(token, record);
            setHistory(cloudHistory);
            writeLocalHistory(cloudHistory);
            setPendingHistoryRecord(null);
            setHistorySaveState('saved');

            try {
                const activeWorksheetId = workbook.activeSheetId;
                if (!activeWorksheetId) throw new Error('No active worksheet is selected.');
                const activeWorksheet = workbook.sheets.find((sheet: any) => sheet.id === activeWorksheetId);
                if (!activeWorksheet) throw new Error('The active worksheet could not be found in the workbook.');

                const updatedRows = [
                    ...(activeWorksheet.rows || []),
                    { id: record.id, studentInfo: saveStudentInfo, result: record.result, gradedAt: record.date },
                ];
                const updatedWorkbook = updateWorksheet(workbook, activeWorksheet.id, { rows: updatedRows });
                setWorkbook(updatedWorkbook);
                const workbookResponse = await saveCloudWorkbook(token, updatedWorkbook);
                setWorkbook(workbookResponse.workbook);

                const folder = await getSavedFolder();
                const paperImage = paperCanvasRef.current?.captureFullPaper();
                if (paperImage) {
                    const pdfBlob = await buildPaperPdfBlob(paperImage);
                    const pdfFilename = buildPaperPdfFilename(saveStudentInfo);
                    await writeFileToFolder(folder, pdfFilename, pdfBlob);
                }
                await appendResultToSessionExcel(
                    folder,
                    {
                        academicYear: semesterCourse.academicYear || '',
                        semester: semesterCourse.semester || '',
                        sessionLabel: semesterCourse.sessionLabel || '',
                        customName: semesterCourse.customName,
                    },
                    activeCourseCode,
                    saveStudentInfo,
                    currentResult
                );
            } catch (exportError) {
                console.error('Failed to persist/export workbook:', exportError);
                setHistorySaveState('error');
                setHasUnsavedResult(true);
                alert('Your result was saved, but the workbook/PDF export could not be updated. Please retry the workbook save.');
                return false;
            }

            setHasUnsavedResult(false);
            return true;
        } catch (error) {
            console.error('Failed to save grading history:', error);
            const updated = [record, ...history.filter(item => item.id !== record.id)].slice(0, 50);
            setHistory(updated);
            writeLocalHistory(updated);
            setPendingHistoryRecord(record);
            setHistorySaveState('error');
            setHasUnsavedResult(true);
            alert('The result could not be saved to the cloud. Your result is still available locally. Please use Retry when your connection is available.');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveAllBatch = async (
        results: { file: any; result: GradingResult }[], token: string | null,
        studentInfo: StudentInfo, setShowAuth: (v: boolean) => void,
        setShowBatch: (v: boolean) => void
    ) => {
        if (!results || results.length === 0) { alert('There are no grading results to save.'); return; }
        if (!token) { setShowAuth(true); alert('Please sign in before saving grading history.'); return; }
        const records: HistoryRecord[] = results.map(({ file, result }, idx) => ({
            id: Date.now().toString() + '_' + idx + '_' + Math.random().toString(36).slice(2, 9),
            date: new Date().toISOString(),
            studentInfo: { ...studentInfo, name: result.extracted_info?.name || studentInfo.name || file.name, regNo: result.extracted_info?.regNo || studentInfo.regNo },
            result,
        }));
        setHistorySaveState('saving');
        try {
            let cloudHistory = await fetchCloudHistory(token);
            for (const record of records) cloudHistory = await saveCloudHistory(token, record);
            setHistory(cloudHistory);
            writeLocalHistory(cloudHistory);
            setHistorySaveState('saved');
            alert(`Saved ${records.length} grading result${records.length === 1 ? '' : 's'} to history!`);
            setShowBatch(false);
        } catch (error) {
            console.error('Batch history save failed:', error);
            setHistorySaveState('error');
            alert('Some grading results could not be saved to the cloud. Please retry.');
        }
    };

    const handleLoadRecord = (record: HistoryRecord, hasUnsavedResult: boolean, workbook: any, setters: any) => {
        if (hasUnsavedResult) {
            const confirmed = window.confirm('You have an unsaved grading result.\n\nLoading another result will replace it.\n\nContinue?');
            if (!confirmed) return;
        }
        const recordCourseCode = record.studentInfo?.courseCode?.trim().toUpperCase();
        if (recordCourseCode && workbook) {
            const matchingCourse = workbook.sheets?.find(
                (sheet: any) => sheet.course?.courseCode?.trim().toUpperCase() === recordCourseCode ||
                    sheet.courseCode?.trim().toUpperCase() === recordCourseCode
            );
            if (matchingCourse) {
                const course = matchingCourse.course || matchingCourse;
                setters.setSemesterCourse(course);
                setters.setActiveSessionId(matchingCourse.id || course.id);
            }
        }
        setters.setStudentInfo(record.studentInfo);
        setters.setResult(record.result);
        setters.setHasUnsavedResult(false);
        setters.setMarkingModeState('self');
        setters.setActiveView('grade');
    };

    const handleDeleteRecord = async (id: string, token: string | null) => {
        if (!token) { alert('Please sign in to delete grading history.'); return; }
        try {
            const cloudHistory = await deleteCloudHistory(token, id);
            setHistory(cloudHistory);
            writeLocalHistory(cloudHistory);
            if (pendingHistoryRecord?.id === id) {
                setPendingHistoryRecord(null);
                setHistorySaveState('idle');
            }
        } catch (error) {
            console.error('Failed to delete history record:', error);
            alert('Could not delete this grading record. Please try again.');
        }
    };

    return {
        history, setHistory, historySaveState, setHistorySaveState,
        pendingHistoryRecord, setPendingHistoryRecord, isSaving,
        retryHistorySave, handleSave, handleSaveAllBatch, handleLoadRecord, handleDeleteRecord,
    };
}
