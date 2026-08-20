import React, { useState, useEffect } from 'react';
import { GradingResult } from '../types';
import { Award, AlertCircle, Printer, Edit3, Save } from 'lucide-react';
import { motion } from 'motion/react';

// Mirrors the server's DEFAULT_GRADE_SCALE (grading-validation.js) so a manual
// edit to a question score recomputes the total/grade the same way the server would.
const GRADE_SCALE = [
  { min: 80, grade: 'A+' },
  { min: 75, grade: 'A' },
  { min: 70, grade: 'B+' },
  { min: 65, grade: 'B' },
  { min: 60, grade: 'C+' },
  { min: 55, grade: 'C' },
  { min: 50, grade: 'D' },
  { min: 0, grade: 'F' },
];

function parseQuestionScore(value: string | undefined): { score: number; maximum: number } | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  // Blank or incomplete input is allowed while the examiner is typing.
  if (!trimmed || trimmed.endsWith('/')) return null;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const score = Number(match[1]);
  const maximum = Number(match[2]);

  if (
    !Number.isFinite(score) ||
    !Number.isFinite(maximum) ||
    maximum <= 0 ||
    score < 0 ||
    score > maximum
  ) {
    return null;
  }

  return { score, maximum };
}

function validateQuestionScore(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) return null;

  if (/^\d+(?:\.\d+)?\s*\/$/.test(trimmed)) {
    return null;
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);

  if (!match) {
    return 'Enter the score in the format X/Y.';
  }

  const score = Number(match[1]);
  const maximum = Number(match[2]);

  if (!Number.isFinite(score) || !Number.isFinite(maximum)) {
    return 'Score must contain valid numbers.';
  }

  if (maximum <= 0) {
    return 'Maximum score must be greater than 0.';
  }

  if (score < 0) {
    return 'Score cannot be negative.';
  }

  if (score > maximum) {
    return `Score cannot exceed ${maximum}.`;
  }

  return null;
}

function parseTotalScore(value: string): { score: number; maximum: number } | null {
  return parseQuestionScore(value);
}

function parsePercentage(value: string): number | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().replace(/%$/, '');
  if (!normalized) return null;

  const percentage = Number(normalized);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    return null;
  }

  return percentage;
}

function calculateGrade(percentage: number): string {
  const scale = [...GRADE_SCALE].sort((a, b) => b.min - a.min);
  return (scale.find(entry => percentage >= entry.min) || scale[scale.length - 1]).grade;
}

// Recomputes totalScore/percentage/grade from the current set of question scores.
// A result is only recalculated when every question has a valid score.
function recalculateFromQuestions(questions: any[]): { totalScore: string; percentage: string; grade: string } | null {
  if (!Array.isArray(questions) || questions.length === 0) {
    return null;
  }

  const parsedQuestions = questions.map(q => parseQuestionScore(q?.score));

  // Do not recalculate while any question is blank or incomplete.
  if (parsedQuestions.some(parsed => parsed === null)) {
    return null;
  }

  const parsed = parsedQuestions.filter(
    (p): p is { score: number; maximum: number } => p !== null
  );

  if (parsed.length === 0) {
    return null;
  }

  const totalScore = parsed.reduce((sum, p) => sum + p.score, 0);
  const totalMaximum = parsed.reduce((sum, p) => sum + p.maximum, 0);

  if (totalMaximum <= 0 || totalScore < 0 || totalScore > totalMaximum) {
    return null;
  }

  const percentage = Number(((totalScore / totalMaximum) * 100).toFixed(2));

  return {
    totalScore: `${Number(totalScore.toFixed(2))}/${Number(totalMaximum.toFixed(2))}`,
    percentage: String(percentage),
    grade: calculateGrade(percentage),
  };
}

function validateAndNormalizeResult(
  result: GradingResult
): { result: GradingResult; warning: string | null } | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const questions = Array.isArray(result.questions) ? result.questions : [];

  const normalizedQuestions = questions
    .filter(q => q && typeof q === 'object')
    .map((q, index) => ({
      ...q,
      q: q.q ?? index + 1,
      score: typeof q.score === 'string' ? q.score.trim() : '',
      feedback: typeof q.feedback === 'string' ? q.feedback : '',
    }));

  let totalScore = typeof result.totalScore === 'string'
    ? result.totalScore.trim()
    : '';

  let percentage = typeof result.percentage === 'string'
    ? result.percentage.trim()
    : '';

  let grade = typeof result.grade === 'string'
    ? result.grade.trim()
    : '';

  const suppliedTotal = parseTotalScore(totalScore);
  const suppliedPercentage = parsePercentage(percentage);
  let warning: string | null = null;

  // If every question score is valid, the question-level scores are the source
  // of truth. Detect conflicts with the AI values before replacing them.
  const recalculated = recalculateFromQuestions(normalizedQuestions);

  if (recalculated) {
    const calculatedTotal = parseTotalScore(recalculated.totalScore);
    const calculatedPercentage = parsePercentage(recalculated.percentage);
    const calculatedGrade = recalculated.grade;

    const totalConflict = suppliedTotal && calculatedTotal && (
      Math.abs(suppliedTotal.score - calculatedTotal.score) > 0.001 ||
      Math.abs(suppliedTotal.maximum - calculatedTotal.maximum) > 0.001
    );

    const percentageConflict = suppliedPercentage !== null && calculatedPercentage !== null &&
      Math.abs(suppliedPercentage - calculatedPercentage) > 0.01;

    const gradeConflict = !!grade && grade.toUpperCase() !== calculatedGrade.toUpperCase();

    if (totalConflict || percentageConflict || gradeConflict) {
      warning = 'The grading response contained inconsistent totals. The result was recalculated from the question scores.';
    }

    totalScore = recalculated.totalScore;
    percentage = recalculated.percentage;
    grade = recalculated.grade;
  } else if (suppliedPercentage !== null) {
    // When question scores are incomplete, still reject impossible percentage
    // values and keep the displayed grade consistent with the percentage when possible.
    const calculatedGrade = calculateGrade(suppliedPercentage);

    if (grade && grade.toUpperCase() !== calculatedGrade.toUpperCase()) {
      warning = 'The grading response contains an inconsistent percentage and grade.';
    }
  }

  return {
    result: {
      ...result,
      questions: normalizedQuestions,
      totalScore,
      percentage,
      grade,
      feedback: typeof result.feedback === 'string' ? result.feedback : '',
    },
    warning,
  };
}

function validateResultForSave(result: GradingResult): string | null {
  if (!result || typeof result !== 'object') {
    return 'There is no valid grading result to save.';
  }

  if (!Array.isArray(result.questions) || result.questions.length === 0) {
    return 'No question-level marks are available. Complete grading before saving.';
  }

  const incompleteQuestion = result.questions.find((q: any) => !parseQuestionScore(q?.score));
  if (incompleteQuestion) {
    return 'Every question must have a valid score before the result can be saved.';
  }

  const total = parseTotalScore(typeof result.totalScore === 'string' ? result.totalScore : '');
  if (!total) {
    return 'The total score is incomplete or invalid.';
  }

  const percentage = parsePercentage(typeof result.percentage === 'string' ? result.percentage : '');
  if (percentage === null) {
    return 'The percentage is incomplete or invalid.';
  }

  if (!result.grade || typeof result.grade !== 'string' || !result.grade.trim()) {
    return 'The final grade is missing.';
  }

  const recalculated = recalculateFromQuestions(result.questions);
  if (!recalculated) {
    return 'The question scores could not be used to calculate a valid result.';
  }

  const calculatedTotal = parseTotalScore(recalculated.totalScore);
  const calculatedPercentage = parsePercentage(recalculated.percentage);

  if (
    !calculatedTotal ||
    Math.abs(total.score - calculatedTotal.score) > 0.001 ||
    Math.abs(total.maximum - calculatedTotal.maximum) > 0.001
  ) {
    return 'The total score does not match the question scores. Recheck the marks before saving.';
  }

  if (
    calculatedPercentage === null ||
    Math.abs(percentage - calculatedPercentage) > 0.01
  ) {
    return 'The percentage does not match the question scores. Recheck the marks before saving.';
  }

  const calculatedGrade = calculateGrade(calculatedPercentage);
  if (result.grade.trim().toUpperCase() !== calculatedGrade.toUpperCase()) {
    return 'The final grade does not match the percentage. Recheck the result before saving.';
  }

  return null;
}

interface Props {
  result: GradingResult | null;
  loading: boolean;
  onPrint: () => void;
  onSave: (result: GradingResult) => void;
  isSaving?: boolean;
  onResultChange?: (result: GradingResult) => void;
}

export const ResultsPanel = ({ result, loading, onPrint, onSave, isSaving, onResultChange }: Props) => {
  const [editableResult, setEditableResult] = useState<GradingResult | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [scoreErrors, setScoreErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync from parent when a fresh result arrives.
  useEffect(() => {
    if (result) {
      const validation = validateAndNormalizeResult(result);

      if (validation) {
        setEditableResult(validation.result);
        setValidationWarning(validation.warning);
        setValidationError(null);
      } else {
        setEditableResult(null);
        setValidationWarning(null);
        setValidationError('The grading result is invalid or incomplete. Please grade the paper again.');
      }
    } else {
      setEditableResult(null);
      setValidationWarning(null);
      setValidationError(null);
    }

    setScoreErrors({});
    setSaveError(null);
    setIsEditing(false);
  }, [result]);

  const updateResult = (updated: GradingResult) => {
    setEditableResult(updated);
    setSaveError(null);
    onResultChange?.(updated);
  };

  const handleInputChange = (field: keyof GradingResult, value: string) => {
    if (!editableResult) return;

    updateResult({
      ...editableResult,
      [field]: value,
    });
  };

  const handleEditToggle = () => {
    if (isEditing) {
      const error = validateResultForSave(currentResult);
      if (error) {
        setSaveError(error);
        return;
      }
    }

    setSaveError(null);
    setIsEditing(prev => !prev);
  };

  const handleSaveClick = () => {
    const error = validateResultForSave(currentResult);

    if (error) {
      setSaveError(error);
      return;
    }

    setSaveError(null);
    onSave(currentResult);
  };

  if (loading) {
    return (
      <div className="bg-card h-full rounded-3xl border border-gray-800 shadow-xl flex flex-col items-center justify-center p-8 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-accent-blue border-t-transparent rounded-full mb-4"
        />
        <h3 className="text-sm font-bold uppercase tracking-widest text-accent-blue">AI Analysis in Progress</h3>
        <p className="text-[10px] text-gray-500 mt-2 uppercase font-medium">Evaluating student paper against marking scheme...</p>
      </div>
    );
  }

  if (validationError) {
    return (
      <div className="bg-card h-full rounded-3xl border border-red-900/40 shadow-xl flex flex-col items-center justify-center p-8 text-center border-dashed">
        <AlertCircle size={48} className="text-red-500/70 mb-4" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-red-400">Grading Result Unavailable</h3>
        <p className="text-[10px] text-gray-500 mt-2 uppercase font-medium max-w-xs">{validationError}</p>
      </div>
    );
  }

  if (!result && !editableResult) {
    return (
      <div className="bg-card h-full rounded-3xl border border-gray-800 shadow-xl flex flex-col items-center justify-center p-8 text-center border-dashed">
        <Award size={48} className="text-gray-800 mb-4" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-600">No Analysis Data</h3>
        <p className="text-[10px] text-gray-700 mt-2 uppercase font-medium">Upload documents and click "Evaluate" to begin</p>
      </div>
    );
  }

  const currentResult = editableResult || result;

  if (!currentResult) {
    return (
      <div className="bg-card h-full rounded-3xl border border-gray-800 shadow-xl flex flex-col items-center justify-center p-8 text-center border-dashed">
        <Award size={48} className="text-gray-800 mb-4" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-600">No Analysis Data</h3>
        <p className="text-[10px] text-gray-700 mt-2 uppercase font-medium">Upload documents and click "Evaluate" to begin</p>
      </div>
    );
  }

  const isSelfMarked = currentResult?.feedback === 'Manually type the recommendations of this paper here' ||
    currentResult?.totalScore === '_/100';

  const ghostClass = "text-gray-600 italic opacity-60";

  const allQuestionsScored = Array.isArray(currentResult.questions) &&
    currentResult.questions.length > 0 &&
    currentResult.questions.every((q: any) => parseQuestionScore(q?.score) !== null);

  const hasIncompleteQuestions = Array.isArray(currentResult.questions) &&
    currentResult.questions.length > 0 &&
    !allQuestionsScored;

  const hasCompleteOverallResult = !!currentResult.totalScore &&
    !!currentResult.percentage &&
    !!currentResult.grade;

  return (
    <div className="bg-card h-full rounded-3xl border border-gray-800 shadow-xl flex flex-col overflow-hidden">
      <div className="p-6 border-b border-gray-800 bg-sidebar/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-4 bg-accent-green rounded-full" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Analysis Summary</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleEditToggle}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            >
              <Edit3 size={12} />
              {isEditing ? 'Done' : 'Edit'}
            </button>
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className={`px-3 py-1 rounded-full border ${isSelfMarked
                ? 'bg-accent-green/10 border-accent-green/20'
                : 'bg-accent-blue/10 border-accent-blue/20'
                }`}
            >
              <span className={`text-[10px] font-bold uppercase font-mono ${isSelfMarked ? 'text-accent-green' : 'text-accent-blue'
                }`}>
                {isSelfMarked ? 'Manual Entry' : 'AI Analyzed'}
              </span>
            </motion.div>
          </div>
        </div>

        {validationWarning && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
            <AlertCircle size={14} className="text-yellow-500 mt-0.5 shrink-0" />
            <span className="text-[10px] leading-relaxed text-yellow-500/80">{validationWarning}</span>
          </div>
        )}

        {saveError && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2">
            <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <span className="text-[10px] leading-relaxed text-red-400">{saveError}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900/50 p-4 rounded-2xl border border-gray-800">
            <span className="text-[10px] uppercase font-bold text-gray-600 block mb-1">Total Score</span>
            {isEditing ? (
              <input
                type="text"
                value={currentResult?.totalScore || ''}
                readOnly
                className="text-3xl font-mono font-bold text-ink bg-transparent border-b border-gray-700 focus:outline-none w-full cursor-default"
              />
            ) : (
              <span className={`text-3xl font-mono font-bold ${isSelfMarked && !currentResult?.totalScore ? ghostClass : 'text-ink'}`}>
                {isSelfMarked && !isEditing && !currentResult?.totalScore ? '_/100' : currentResult?.totalScore || '—'}
              </span>
            )}
          </div>

          <div className="bg-gray-900/50 p-4 rounded-2xl border border-gray-800">
            <span className="text-[10px] uppercase font-bold text-gray-600 block mb-1">Final Grade</span>
            {isEditing ? (
              <input
                type="text"
                value={isSelfMarked && !currentResult?.grade ? '' : currentResult?.grade || ''}
                readOnly
                className="text-3xl font-bold text-ink bg-transparent border-b border-gray-700 focus:outline-none w-full cursor-default"
              />
            ) : (
              <span className={`text-3xl font-bold ${isSelfMarked && !currentResult?.grade
                ? ghostClass
                : currentResult?.grade?.startsWith('A')
                  ? 'text-accent-green'
                  : isSelfMarked
                    ? 'text-gray-400'
                    : 'text-accent-blue'
                }`}>
                {isSelfMarked && !isEditing && !currentResult?.grade ? '_' : currentResult?.grade || '—'}
              </span>
            )}
          </div>
        </div>

        {isEditing && hasIncompleteQuestions && (
          <p className="mt-3 text-[10px] text-yellow-500/70">
            Complete every question score before the total, percentage, and grade can be recalculated.
          </p>
        )}

        {!isSelfMarked && !hasCompleteOverallResult && !hasIncompleteQuestions && (
          <p className="mt-3 text-[10px] text-red-400/80">
            The grading result is missing required overall marks and cannot be saved until it is completed.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto desktop-scroll p-6 space-y-4">
        {currentResult.questions && currentResult.questions.length > 0 ? currentResult.questions.map((q: any, idx: number) => (
          <motion.div
            key={idx}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: idx * 0.1 }}
            whileHover={{ x: 4, scale: 1.02 }}
            className="group bg-gray-950/40 p-5 rounded-2xl border border-white/5 hover:border-accent-blue/30 hover:bg-accent-blue/5 transition-all duration-300 shadow-lg hover:shadow-accent-blue/10"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-accent-blue rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="text-[10px] uppercase font-black tracking-tighter text-gray-500 group-hover:text-accent-blue transition-colors">Question {q.q}</span>
              </div>
              {isEditing ? (
                <div className="flex flex-col items-end gap-1">
                  <input
                    type="text"
                    value={isSelfMarked && !q.score ? '' : q.score || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      const error = validateQuestionScore(value);
                      const errorKey = String(q.q ?? idx);

                      setScoreErrors(prev => {
                        const next = { ...prev };
                        if (error) {
                          next[errorKey] = error;
                        } else {
                          delete next[errorKey];
                        }
                        return next;
                      });

                      // Keep blank/in-progress input editable without treating it as valid.
                      if (error && !/^\d+(?:\.\d+)?\s*\/?$/.test(value.trim())) {
                        return;
                      }

                      const updatedQuestions = [...(currentResult?.questions || [])];
                      updatedQuestions[idx] = { ...updatedQuestions[idx], score: value };

                      const recalculated = recalculateFromQuestions(updatedQuestions);

                      updateResult({
                        ...currentResult!,
                        questions: updatedQuestions,
                        ...(recalculated
                          ? recalculated
                          : { totalScore: '', percentage: '', grade: '' }),
                      });
                    }}
                    placeholder={isSelfMarked && !q.score ? '_/_' : undefined}
                    className={`text-xs font-mono font-bold text-ink bg-gray-900 px-2 py-0.5 rounded border ${
                      scoreErrors[String(q.q ?? idx)]
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-gray-700 focus:border-accent-blue'
                    } focus:outline-none w-16 text-center placeholder:text-gray-600 placeholder:italic placeholder:opacity-60`}
                  />

                  {scoreErrors[String(q.q ?? idx)] && (
                    <span className="text-[9px] text-red-400 whitespace-nowrap">
                      {scoreErrors[String(q.q ?? idx)]}
                    </span>
                  )}
                </div>
              ) : (
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${isSelfMarked && !q.score
                  ? `${ghostClass} bg-gray-900/50 border-gray-800`
                  : 'text-ink bg-gray-900 border-gray-800'
                  }`}>
                  {isSelfMarked && !isEditing && !q.score ? '_/_' : q.score || '—'} pts
                </span>
              )}
            </div>

            {isEditing ? (
              <textarea
                value={isSelfMarked && !q.feedback ? '' : q.feedback || ''}
                onChange={(e) => {
                  const updatedQuestions = [...(currentResult?.questions || [])];
                  updatedQuestions[idx] = { ...updatedQuestions[idx], feedback: e.target.value };
                  updateResult({ ...currentResult!, questions: updatedQuestions });
                }}
                placeholder={isSelfMarked && !q.feedback ? 'Enter feedback for question' : undefined}
                className="w-full text-xs text-gray-400 group-hover:text-gray-200 leading-relaxed italic transition-colors font-medium bg-transparent border-b border-gray-700 focus:border-accent-blue focus:outline-none placeholder:text-gray-600 placeholder:opacity-60"
                rows={2}
              />
            ) : (
              <p className={`text-xs leading-relaxed italic transition-colors font-medium ${isSelfMarked && !q.feedback
                ? ghostClass
                : 'text-gray-400 group-hover:text-gray-200'
                }`}>
                "{isSelfMarked && !isEditing && !q.feedback ? 'Enter feedback for question' : q.feedback || 'No feedback provided.'}"
              </p>
            )}
          </motion.div>
        )) : (
          <div className="py-8 text-center text-gray-600">
            <AlertCircle size={28} className="mx-auto mb-2 opacity-50" />
            <p className="text-[10px] uppercase tracking-widest">No question-level results</p>
          </div>
        )}

        <div className="mt-8 p-5 bg-accent-blue/[0.03] rounded-2xl border border-accent-blue/10 hover:border-accent-blue/20 transition-all group">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={16} className={`group-hover:scale-110 transition-transform ${isSelfMarked ? 'text-accent-green' : 'text-accent-blue'
              }`} />
            <span className={`text-[10px] uppercase font-black tracking-widest ${isSelfMarked ? 'text-accent-green' : 'text-accent-blue'
              }`}>Summary Report</span>
          </div>
          {isEditing ? (
            <textarea
              value={isSelfMarked && !currentResult?.feedback ? '' : currentResult?.feedback || ''}
              onChange={(e) => handleInputChange('feedback', e.target.value)}
              placeholder={isSelfMarked && !currentResult?.feedback ? 'Manually type the recommendations of this paper here' : undefined}
              className="w-full text-[11px] text-gray-500 group-hover:text-gray-300 leading-relaxed font-medium transition-colors bg-transparent border-b border-gray-700 focus:border-accent-blue focus:outline-none placeholder:text-gray-600 placeholder:opacity-60"
              rows={3}
            />
          ) : (
            <p className={`text-[11px] leading-relaxed font-medium transition-colors ${isSelfMarked && !currentResult?.feedback
              ? ghostClass
              : 'text-gray-500 group-hover:text-gray-300'
              }`}>
              {isSelfMarked && !isEditing && !currentResult?.feedback ? 'Manually type the recommendations of this paper here' : currentResult?.feedback || 'No summary feedback provided.'}
            </p>
          )}
        </div>
      </div>

      <div className="p-6 border-t border-gray-800 bg-sidebar/50 flex gap-2.5">
        <button
          onClick={handleSaveClick}
          disabled={isSaving}
          className="flex-1 bg-accent-green text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onPrint}
          className="flex-1 bg-accent-blue text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-lg"
        >
          <Printer size={16} />
          Print
        </button>
      </div>
    </div>
  );
};