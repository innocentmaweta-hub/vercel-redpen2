import { useCallback } from 'react';

export function useWorkspaceActions({
    authHeaders,
    setStudentInfo, setMarkingScheme, setStudentPaper, setResult, setExaminerRemarks,
    setSemesterCourse, setActiveSessionId, setHasUnsavedResult, setPendingHistoryRecord,
    setHistorySaveState, setActiveView, setMarkingModeState, resetTools,
    setZoom, setClearCount, setIsMaximized, setIsAutoMode,
    paperCanvasRef, setPendingGradeNavigation, setShowOldSessionModal,
}: any) {
    const clearYazaSessionHistory = useCallback((key: string) => {
        fetch(`/api/yaza/history?sessionKey=${encodeURIComponent(key)}`, {
            method: 'DELETE',
            headers: authHeaders(),
        }).catch(err =>
            console.error('Failed to reset Yaza history for new session:', err)
        );
    }, [authHeaders]);

    const handleClearStudentPaper = () => {
        paperCanvasRef.current?.clear();
        setStudentPaper(null);
    };

    const handlePaperUpload = useCallback((base64: string, name: string) => {
        setStudentPaper({ base64, name });
        setMarkingModeState('ai');
        setResult(null);
        setExaminerRemarks('');
        resetTools();
        setZoom(1);
        setClearCount((c: number) => c + 1);
        setIsMaximized(false);
        setIsAutoMode(false);
        setActiveView('grade');
    }, []);

    const handleNewPaper = (semesterCourse: any, activeSessionId: string | null, result: any, studentPaper: any) => {
        if (!semesterCourse || !activeSessionId) {
            setPendingGradeNavigation(true);
            setShowOldSessionModal(true);
            return;
        }

        if (result || studentPaper) {
            if (!window.confirm('Start a new paper? Current student work will be cleared.')) {
                return;
            }
        }

        setStudentInfo((prev: any) => ({ ...prev, name: '', regNo: '', program: '' }));
        setStudentPaper(null);
        setResult(null);
        setHasUnsavedResult(false);
        setPendingHistoryRecord(null);
        setHistorySaveState('idle');
        setExaminerRemarks('');
        setMarkingModeState('ai');
        resetTools();
        setZoom(1);
        setClearCount((c: number) => c + 1);
        setIsMaximized(false);
        setIsAutoMode(false);
        setActiveView('grade');
    };

    const handleNew = (hasUnsavedResult: boolean, result: any, markingScheme: any, studentPaper: any) => {
        if (hasUnsavedResult || result || markingScheme || studentPaper) {
            const confirmed = window.confirm(
                hasUnsavedResult
                    ? 'You have an unsaved grading result.\n\nStarting a new workspace will clear it.\n\nContinue?'
                    : 'Start a new workbook? Current work will be cleared.'
            );

            if (!confirmed) {
                return;
            }
        }

        clearYazaSessionHistory('general');

        setStudentInfo({ name: '', regNo: '', program: '', year: '', semester: '', courseCode: '', examDate: '' });
        setMarkingScheme(null);
        setStudentPaper(null);
        setResult(null);
        setExaminerRemarks('');
        setSemesterCourse(null);
        setActiveSessionId(null);
        setHasUnsavedResult(false);
        setPendingHistoryRecord(null);
        setHistorySaveState('idle');
        setActiveView('dashboard');
        setMarkingModeState('ai');
        resetTools();
        setZoom(1);
        setClearCount((c: number) => c + 1);
        setIsMaximized(false);
        setIsAutoMode(false);
    };

    const handleRefresh = (_hasUnsavedResult: boolean, _result: any, _markingScheme: any, _studentPaper: any, semesterCourse: any) => {
        // The RefreshModal is the single confirmation point. Once the user
        // clicks its Reload button, clear only transient grading state and
        // leave the persistent workbook/courses untouched.
        setStudentInfo({
            name: '', regNo: '', program: '',
            year: semesterCourse?.year || '',
            semester: semesterCourse?.semester || '',
            courseCode: semesterCourse?.courseCode || '',
            examDate: ''
        });

        setMarkingScheme(null);
        setStudentPaper(null);
        setResult(null);
        setExaminerRemarks('');
        setHasUnsavedResult(false);
        setPendingHistoryRecord(null);
        setHistorySaveState('idle');
        setActiveView('dashboard');
        setMarkingModeState('ai');
        setClearCount((c: number) => c + 1);
        setZoom(1);
        resetTools();
        setIsMaximized(false);
        setIsAutoMode(false);
    };

    return {
        clearYazaSessionHistory,
        handleClearStudentPaper,
        handlePaperUpload,
        handleNewPaper,
        handleNew,
        handleRefresh,
    };
}
