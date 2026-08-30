import { useState, useEffect } from 'react';
import { StudentInfo, GradingResult, ApiGradingResult } from '../types';
import type { RedPenWorkbook } from '../types/workbook';
import { writeLocalWorkbook, updateWorksheet } from '../lib/workbookStore';
import { validateAndNormalizeResult } from '../lib/exportUtils'; // adjust import path to wherever this actually lives

const AUTH_TOKEN_KEY = 'yaza_auth_token';

function updateWorksheetResult(
    workbook: RedPenWorkbook,
    activeSessionId: string,
    payload: { studentInfo: StudentInfo; result: GradingResult }
) {
    // Same helper your original code called — kept as-is,
    // just centralized here since only grading uses it.
    return updateWorksheet(workbook, activeSessionId, {
        rows: [
            ...(workbook.sheets.find(s => s.id === activeSessionId)?.rows || []),
            { studentInfo: payload.studentInfo, result: payload.result, gradedAt: new Date().toISOString() }
        ]
    });
}

export function useGrading({
    studentPaper,
    semesterCourse,
    workbook,
    activeSessionId,
    user,
    token,
    setUser,
    persistWorkbook,
    studentInfo,
    setStudentInfo,
    markingScheme,
    isMaximized,
    setIsMaximized,
    setActiveView,
    setShowAuth,
    setShowCourseSelector,
    setWorkbook,
    autoHideTimerRef,
}: any) {
    const [result, setResult] = useState<GradingResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [markingMode, setMarkingModeState] = useState<'self' | 'ai'>('ai');
    const [isGradingInProgress, setIsGradingInProgress] = useState(false);
    const [isAutoMode, setIsAutoMode] = useState(false);
    const [hasUnsavedResult, setHasUnsavedResult] = useState(false);
    const [upgradePromptMessage, setUpgradePromptMessage] = useState<string | null>(null);

    const handleMarkingModeChange = (mode: 'ai' | 'self', resetTools: () => void, isAutoModeActive: boolean) => {
        if (isAutoModeActive) {
            setMarkingModeState('ai');
            return;
        }

        setMarkingModeState(mode);
        resetTools();

        if (mode === 'ai') {
            setResult(null);
            return;
        }

        if (studentPaper) {
            setResult({
                score: '', totalScore: '', percentage: '', grade: '', feedback: '', questions: [],
                extracted_info: {
                    name: studentInfo.name || '',
                    regNo: studentInfo.regNo || '',
                    program: studentInfo.program || '',
                    year: studentInfo.year || '',
                    courseCode: studentInfo.courseCode || '',
                    examDate: studentInfo.examDate || ''
                }
            });
        }

        setHasUnsavedResult(true);
    };

    const applyGradingResult = (validatedResult: GradingResult) => {
        setResult(validatedResult);
        setHasUnsavedResult(true);
        setActiveView('grade');

        setUser((prev: any) => prev ? { ...prev, gradingCount: prev.gradingCount + 1 } : prev);

        if (validatedResult.extracted_info) {
            setStudentInfo((prev: StudentInfo) => ({
                ...prev,
                name: validatedResult.extracted_info?.name || prev.name,
                program: validatedResult.extracted_info?.program || prev.program,
                regNo: validatedResult.extracted_info?.regNo || prev.regNo,
                year: validatedResult.extracted_info?.year || prev.year,
                courseCode: semesterCourse.courseCode || validatedResult.extracted_info?.courseCode || prev.courseCode,
                examDate: validatedResult.extracted_info?.examDate || prev.examDate,
                semester: prev.semester,
            }));
        }

        if (workbook && activeSessionId) {
            const updatedWorkbook = updateWorksheetResult(workbook, activeSessionId, {
                studentInfo: {
                    ...studentInfo,
                    courseCode: semesterCourse.courseCode || studentInfo.courseCode,
                },
                result: validatedResult,
            });

            const savedWorkbook = writeLocalWorkbook(updatedWorkbook);
            setWorkbook(savedWorkbook);

            if (token) {
                void persistWorkbook(savedWorkbook);
            }
        }
    };

    const requestGrading = async (): Promise<GradingResult> => {
        const response = await fetch('/api/grade', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                studentInfo: {
                    ...studentInfo,
                    courseCode: semesterCourse.courseCode || studentInfo.courseCode,
                },
                markingScheme: markingScheme?.base64 ?? null,
                studentPaper: studentPaper.base64
            })
        });

        if (response.status === 401) {
            setShowAuth(true);
            throw new Error('Authentication required. Please sign in.');
        }

        const data = await response.json().catch(() => ({}));

        if (response.status === 403 && data.code === 'LIMIT_REACHED') {
            setUpgradePromptMessage(data.message || 'You have reached your grading limit.');
            throw new Error('LIMIT_REACHED_HANDLED'); // sentinel, caller checks for this
        }

        if (!response.ok) {
            throw new Error(data.message || `Grading request failed (${response.status})`);
        }

        const gradingResult: ApiGradingResult = data;

        if (gradingResult.error) {
            throw new Error(gradingResult.message || 'Grading failed');
        }

        const mappedResult: GradingResult = {
            totalScore: gradingResult.total_score || gradingResult.totalScore,
            score: gradingResult.score,
            percentage: gradingResult.percentage,
            grade: gradingResult.grade,
            feedback: gradingResult.feedback || '',
            questions: gradingResult.questions || [],
            extracted_info: gradingResult.extracted_info || undefined,
        };

        const validatedResult = validateAndNormalizeResult(mappedResult);

        if (!validatedResult) {
            throw new Error('The grading service returned an invalid result. Please try grading again.');
        }

        return validatedResult;
    };

    const handleGrade = async (resetTools: () => void) => {
        if (!studentPaper) {
            alert('Please upload a student paper before grading.');
            return;
        }

        if (!semesterCourse || !workbook) {
            alert('Please select a course before grading.');
            setShowCourseSelector(true);
            return;
        }

        if (markingMode === 'self') {
            if (isMaximized) setIsMaximized(false);
            setActiveView('grade');

            if (!result) {
                setResult({
                    score: '', totalScore: '', percentage: '', grade: '', feedback: '', questions: [],
                    extracted_info: {
                        name: studentInfo.name || '',
                        regNo: studentInfo.regNo || '',
                        program: studentInfo.program || '',
                        year: studentInfo.year || '',
                        courseCode: studentInfo.courseCode || semesterCourse.courseCode || '',
                        examDate: studentInfo.examDate || ''
                    }
                });
            }

            setHasUnsavedResult(true);
            return;
        }

        if (!user) {
            setShowAuth(true);
            return;
        }

        if (markingMode !== 'ai') {
            return;
        }

        if (isMaximized) setIsMaximized(false);

        setLoading(true);
        resetTools();

        try {
            const validatedResult = await requestGrading();
            applyGradingResult(validatedResult);
        }
        catch (error) {
            if ((error as Error).message !== 'LIMIT_REACHED_HANDLED') {
                console.error('Grading failed:', error);
                alert(error instanceof Error ? error.message : 'An error occurred during grading. Check the console for details.');
            }
        }
        finally {
            setLoading(false);
        }
    };

    const handleGradeWithMode = async (mode: 'ai' | 'self', resetTools: () => void) => {
        if (isGradingInProgress || !studentPaper) {
            return;
        }

        if (!semesterCourse || !workbook) {
            alert('Please select a course before grading.');
            setShowCourseSelector(true);
            return;
        }

        setIsGradingInProgress(true);
        setMarkingModeState(mode);

        if (mode === 'ai') {
            resetTools();
        }

        if (mode === 'self') {
            if (isMaximized) setIsMaximized(false);
            setActiveView('grade');

            setResult({
                score: '', totalScore: '', percentage: '', grade: '', feedback: '', questions: [],
                extracted_info: {
                    name: studentInfo.name || '',
                    regNo: studentInfo.regNo || '',
                    program: studentInfo.program || '',
                    year: studentInfo.year || '',
                    courseCode: semesterCourse.courseCode || studentInfo.courseCode || '',
                    examDate: studentInfo.examDate || ''
                }
            });

            setHasUnsavedResult(true);
            setIsGradingInProgress(false);
            return;
        }

        if (!user) {
            setShowAuth(true);
            setIsGradingInProgress(false);
            return;
        }

        setLoading(true);

        try {
            const validatedResult = await requestGrading();
            applyGradingResult(validatedResult);
        }
        catch (error) {
            if ((error as Error).message !== 'LIMIT_REACHED_HANDLED') {
                console.error('Grading failed:', error);
                alert(error instanceof Error ? error.message : 'Grading failed.');
            }
        }
        finally {
            setLoading(false);
            setIsGradingInProgress(false);
        }
    };

    const handleGradeSingle = async (paperBase64: string): Promise<GradingResult> => {
        if (!user) {
            throw new Error('Please sign in first');
        }

        const response = await fetch('/api/grade', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentInfo,
                markingScheme: markingScheme?.base64 ?? null,
                studentPaper: paperBase64
            })
        });

        if (response.status === 401) {
            throw new Error('Authentication required');
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || `Grading request failed (${response.status})`);
        }

        const apiResult: ApiGradingResult = data;

        if (apiResult.error) {
            throw new Error(apiResult.message || 'Grading failed');
        }

        const mappedResult: GradingResult = {
            totalScore: apiResult.total_score || apiResult.totalScore,
            score: apiResult.score,
            percentage: apiResult.percentage,
            grade: apiResult.grade,
            feedback: apiResult.feedback || '',
            questions: apiResult.questions || [],
            extracted_info: apiResult.extracted_info || undefined,
        };

        const validatedResult = validateAndNormalizeResult(mappedResult);

        if (!validatedResult) {
            throw new Error('The grading service returned an invalid result.');
        }

        return validatedResult;
    };

    // Auto mode: automatically grade an uploaded paper using AI.
    useEffect(() => {
        if (isAutoMode && studentPaper && user && semesterCourse && workbook) {
            setMarkingModeState('ai');

            const timer = setTimeout(() => {
                handleGrade(() => {
                    setResult(null);
                    if (autoHideTimerRef?.current) {
                        clearTimeout(autoHideTimerRef.current);
                        autoHideTimerRef.current = null;
                    }
                }).catch(err => {
                    console.error('Auto-grade failed:', err);
                    setIsAutoMode(false);
                });
            }, 200);

            return () => clearTimeout(timer);
        }
    }, [isAutoMode, studentPaper, user, semesterCourse, workbook]);

    return {
        result, setResult,
        loading, setLoading,
        markingMode, setMarkingModeState,
        isGradingInProgress,
        isAutoMode, setIsAutoMode,
        hasUnsavedResult, setHasUnsavedResult,
        upgradePromptMessage, setUpgradePromptMessage,
        handleMarkingModeChange,
        handleGrade,
        handleGradeWithMode,
        handleGradeSingle,
    };
}