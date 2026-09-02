import React, { useEffect, useState } from 'react';
import { Award, AlertCircle, Edit3, Printer, Save, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { GradingResult } from '../types';

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

type ParsedScore = { score: number; maximum: number };

function parseScore(value: unknown): ParsedScore | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const score = Number(match[1]);
  const maximum = Number(match[2]);
  if (!Number.isFinite(score) || !Number.isFinite(maximum)) return null;
  if (maximum <= 0 || score < 0 || score > maximum) return null;
  return { score, maximum };
}

function parseOverallScore(value: unknown): ParsedScore | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, '');
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const score = Number(match[1]);
  const maximum = Number(match[2]);
  if (!Number.isFinite(score) || !Number.isFinite(maximum)) return null;
  if (maximum <= 0 || score < 0 || score > maximum) return null;
  return { score, maximum };
}

function splitOverallScore(value: unknown): { total: string; outOf: string } {
  const parsed = parseOverallScore(value);
  if (!parsed) return { total: '', outOf: '' };
  return {
    total: String(Number(parsed.score.toFixed(2))),
    outOf: String(Number(parsed.maximum.toFixed(2))),
  };
}

function validateScore(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?\s*\/$/.test(trimmed)) return null;
  const parsed = parseScore(trimmed);
  if (!parsed) return 'Enter the score in the format X/Y.';
  return null;
}

function parsePercentage(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/%$/, '');
  if (!normalized) return null;
  const percentage = Number(normalized);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;
  return percentage;
}

function calculateGrade(percentage: number): string {
  return [...GRADE_SCALE]
    .sort((a, b) => b.min - a.min)
    .find(item => percentage >= item.min)?.grade || 'F';
}

function calculateOverall(totalValue: string, outOfValue: string): { totalScore: string; percentage: string; grade: string } | null {
  const total = Number(totalValue);
  const outOf = Number(outOfValue);
  if (!Number.isFinite(total) || !Number.isFinite(outOf)) return null;
  if (outOf <= 0 || total < 0 || total > outOf) return null;
  const percentage = Number(((total / outOf) * 100).toFixed(2));
  return {
    totalScore: `${Number(total.toFixed(2))}/${Number(outOf.toFixed(2))}`,
    percentage: String(percentage),
    grade: calculateGrade(percentage),
  };
}

function recalculateFromQuestions(questions: any[]): { totalScore: string; percentage: string; grade: string } | null {
  if (!Array.isArray(questions) || questions.length === 0) return null;
  const parsed = questions.map(question => parseScore(question?.score));
  if (parsed.some(item => item === null)) return null;
  const valid = parsed as ParsedScore[];
  const totalScore = valid.reduce((sum, item) => sum + item.score, 0);
  const totalMaximum = valid.reduce((sum, item) => sum + item.maximum, 0);
  if (totalMaximum <= 0 || totalScore < 0 || totalScore > totalMaximum) return null;
  const percentage = Number(((totalScore / totalMaximum) * 100).toFixed(2));
  return {
    totalScore: `${Number(totalScore.toFixed(2))}/${Number(totalMaximum.toFixed(2))}`,
    percentage: String(percentage),
    grade: calculateGrade(percentage),
  };
}

function normalizeResult(result: GradingResult): GradingResult {
  const questions = Array.isArray(result.questions)
    ? result.questions
        .filter(q => q && typeof q === 'object')
        .map((q: any, index) => ({
          ...q,
          q: q.q ?? index + 1,
          score: typeof q.score === 'string' ? q.score.trim() : '',
          feedback: typeof q.feedback === 'string' ? q.feedback : '',
        }))
    : [];
  const recalculated = recalculateFromQuestions(questions);
  return {
    ...result,
    questions,
    totalScore: recalculated?.totalScore ?? (typeof result.totalScore === 'string' ? result.totalScore : ''),
    percentage: recalculated?.percentage ?? (typeof result.percentage === 'string' ? result.percentage : ''),
    grade: recalculated?.grade ?? (typeof result.grade === 'string' ? result.grade : ''),
    feedback: typeof result.feedback === 'string' ? result.feedback : '',
  };
}

function validateResultForSave(result: GradingResult): string | null {
  if (!result) return 'There is no valid grading result to save.';
  const total = parseOverallScore(result.totalScore);
  const percentage = parsePercentage(result.percentage);
  if (!total) return 'The total score is incomplete or invalid.';
  if (percentage === null) return 'The percentage is incomplete or invalid.';
  if (!result.grade?.trim()) return 'The final grade is missing.';
  if (result.grade.trim().toUpperCase() !== calculateGrade(percentage).toUpperCase()) {
    return 'The final grade does not match the percentage.';
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

export const ResultsPanel = ({ result, loading, onPrint, onSave, isSaving = false, onResultChange }: Props) => {
  const [editableResult, setEditableResult] = useState<GradingResult | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);
  const [scoreErrors, setScoreErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [manualTotal, setManualTotal] = useState('');
  const [manualOutOf, setManualOutOf] = useState('');

  useEffect(() => {
    if (!result) {
      setEditableResult(null);
      setIsEditing(false);
      setShowQuestionEditor(false);
      setScoreErrors({});
      setSaveError(null);
      setManualTotal('');
      setManualOutOf('');
      return;
    }
    if (!isEditing) {
      const normalized = normalizeResult(result);
      setEditableResult(normalized);
      const parts = splitOverallScore(normalized.totalScore);
      setManualTotal(parts.total);
      setManualOutOf(parts.outOf);
      setScoreErrors({});
      setSaveError(null);
      setShowQuestionEditor(false);
    }
  }, [result, isEditing]);

  const currentResult = editableResult || result;
    const isSelfMarked =
      currentResult?.feedback === 'Manually type the recommendations of this paper here' ||
      currentResult?.totalScore === '_/100' ||
      (!!currentResult?.extracted_info &&
        !currentResult?.totalScore &&
        Array.isArray(currentResult?.questions) &&
        currentResult.questions.length === 0) ||
      (isEditing &&
        Array.isArray(currentResult?.questions));

  const updateResult = (next: GradingResult) => {
    setEditableResult(next);
    setSaveError(null);
    onResultChange?.(next);
  };

  const updateQuestion = (index: number, patch: Record<string, unknown>) => {
    if (!currentResult) return;
    const questions = [...(currentResult.questions || [])];
    questions[index] = { ...questions[index], ...patch };
    const recalculated = recalculateFromQuestions(questions);
    if (recalculated) {
      const parts = splitOverallScore(recalculated.totalScore);
      setManualTotal(parts.total);
      setManualOutOf(parts.outOf);
    }
    updateResult({
      ...currentResult,
      questions,
      ...(recalculated ? recalculated : {
        totalScore: currentResult.totalScore,
        percentage: currentResult.percentage,
        grade: currentResult.grade,
      }),
    });
  };

  const addQuestion = () => {
    if (!currentResult || !isSelfMarked) return;
    const questions = [...(currentResult.questions || [])];
    const nextNumber = questions.reduce((max, q: any) => Math.max(max, Number(q?.q) || 0), 0) + 1;
    updateResult({
      ...currentResult,
      questions: [...questions, { q: nextNumber, score: '', feedback: '' }],
      totalScore: '',
      percentage: '',
      grade: '',
    });
    setShowQuestionEditor(true);
    setIsEditing(true);
  };

  const removeQuestion = (index: number) => {
    if (!currentResult || !isSelfMarked) return;
    const questions = [...(currentResult.questions || [])].filter((_, i) => i !== index)
      .map((q: any, i) => ({ ...q, q: i + 1 }));
    const recalculated = recalculateFromQuestions(questions);
    updateResult({
      ...currentResult,
      questions,
      ...(recalculated ? recalculated : { totalScore: '', percentage: '', grade: '' }),
    });
    if (recalculated) {
      const parts = splitOverallScore(recalculated.totalScore);
      setManualTotal(parts.total);
      setManualOutOf(parts.outOf);
    } else {
      setManualTotal('');
      setManualOutOf('');
    }
  };

  const handleScoreChange = (index: number, value: string) => {
    if (!isSelfMarked) return;
    const key = String(currentResult?.questions?.[index]?.q ?? index);
    const error = validateScore(value);
    setScoreErrors(previous => {
      const next = { ...previous };
      if (error) next[key] = error;
      else delete next[key];
      return next;
    });
    updateQuestion(index, { score: value });
  };

  const handleFeedbackChange = (index: number, value: string) => updateQuestion(index, { feedback: value });

  const handleSummaryChange = (value: string) => {
    if (!currentResult) return;
    updateResult({ ...currentResult, feedback: value });
  };

  const updateManualOverall = (totalValue: string, outOfValue: string) => {
    if (!currentResult) return;
    setManualTotal(totalValue);
    setManualOutOf(outOfValue);
    const recalculated = calculateOverall(totalValue, outOfValue);
    if (recalculated) updateResult({ ...currentResult, ...recalculated });
    else updateResult({ ...currentResult, totalScore: totalValue || outOfValue ? `${totalValue}/${outOfValue}` : '', percentage: '', grade: '' });
  };

  const handleTotalChange = (value: string) => updateManualOverall(value, manualOutOf);
  const handleOutOfChange = (value: string) => updateManualOverall(manualTotal, value);

  const handleEditToggle = () => {
    if (isEditing) {
      setIsEditing(false);
      return;
    }
    if (!currentResult) return;
    setSaveError(null);
    setScoreErrors({});
    const normalized = normalizeResult(currentResult);
    setEditableResult(normalized);
    const parts = splitOverallScore(normalized.totalScore);
    setManualTotal(parts.total);
    setManualOutOf(parts.outOf);
    setIsEditing(true);
  };

  const handleSaveClick = () => {
    if (!currentResult) return;
    const error = validateResultForSave(currentResult);
    if (error) {
      setSaveError(error);
      setIsEditing(true);
      return;
    }
    setSaveError(null);
    onSave(currentResult);
  };

  if (loading) {
    return (
      <div className="bg-card h-full rounded-3xl border border-gray-800 shadow-xl flex flex-col items-center justify-center p-8 text-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-12 h-12 border-4 border-accent-blue border-t-transparent rounded-full mb-4" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-accent-blue">AI Analysis in Progress</h3>
        <p className="text-[10px] text-gray-500 mt-2 uppercase font-medium">Evaluating student paper against marking scheme...</p>
      </div>
    );
  }

  if (!currentResult) {
    return (
      <div className="bg-card h-full rounded-3xl border border-gray-800 shadow-xl flex flex-col items-center justify-center p-8 text-center border-dashed">
        <Award size={48} className="text-gray-800 mb-4" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-600">No Analysis Data</h3>
        <p className="text-[10px] text-gray-700 mt-2 uppercase font-medium">Upload documents and click "Evaluate" to begin</p>
      </div>
    );
  }

  const ghostClass = 'text-gray-600 italic opacity-60';
  const hasQuestions = Array.isArray(currentResult.questions) && currentResult.questions.length > 0;
  const allQuestionsScored = hasQuestions && currentResult.questions.every((q: any) => parseScore(q?.score) !== null);
  const hasIncompleteQuestions = hasQuestions && !allQuestionsScored;
  const hasCompleteOverallResult = !!parseOverallScore(currentResult.totalScore) && parsePercentage(currentResult.percentage) !== null && !!currentResult.grade?.trim();

  return (
    <div className="bg-card h-full rounded-3xl border border-gray-800 shadow-xl flex flex-col overflow-hidden">
      <div className="p-6 border-b border-gray-800 bg-sidebar/50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Award size={16} className="text-accent-blue" />
              <span className="text-[10px] uppercase font-black tracking-widest text-accent-blue">{isSelfMarked ? 'Manual Grading' : 'Grading Result'}</span>
            </div>
            <h2 className="text-lg font-bold text-white">Student Assessment</h2>
          </div>
          <button type="button" onClick={handleEditToggle} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${isEditing ? 'bg-accent-green/20 text-accent-green border border-accent-green/30' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
            {isEditing ? <Save size={13} /> : <Edit3 size={13} />}
            {isEditing ? 'Done' : 'Edit'}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
          <div className="rounded-xl bg-gray-950/50 border border-gray-800 p-3">
            <span className="text-[9px] uppercase tracking-widest text-gray-500">Total</span>
            <input type="number" min="0" step="any" value={isEditing ? manualTotal : splitOverallScore(currentResult.totalScore).total} readOnly={!isEditing} onChange={e => handleTotalChange(e.target.value)} className={`mt-1 text-lg font-bold text-ink bg-transparent w-full focus:outline-none ${isEditing ? 'cursor-text border-b border-gray-700 focus:border-accent-blue' : 'cursor-default'}`} aria-label="Total score" />
          </div>
          <div className="rounded-xl bg-gray-950/50 border border-gray-800 p-3">
            <span className="text-[9px] uppercase tracking-widest text-gray-500">Out of</span>
            <input type="number" min="0" step="any" value={isEditing ? manualOutOf : splitOverallScore(currentResult.totalScore).outOf} readOnly={!isEditing} onChange={e => handleOutOfChange(e.target.value)} className={`mt-1 text-lg font-bold text-ink bg-transparent w-full focus:outline-none ${isEditing ? 'cursor-text border-b border-gray-700 focus:border-accent-blue' : 'cursor-default'}`} aria-label="Maximum score" />
          </div>
          <div className="rounded-xl bg-gray-950/50 border border-gray-800 p-3">
            <span className="text-[9px] uppercase tracking-widest text-gray-500">Percentage</span>
            <div className="mt-1 text-lg font-bold text-ink w-full">{currentResult.percentage ? `${currentResult.percentage}%` : '—'}</div>
            <span className="text-[8px] text-gray-600">Automatic</span>
          </div>
          <div className="rounded-xl bg-gray-950/50 border border-gray-800 p-3">
            <span className="text-[9px] uppercase tracking-widest text-gray-500">Grade</span>
            <div className="mt-1 text-lg font-bold text-accent-green uppercase w-full">{currentResult.grade || '—'}</div>
            <span className="text-[8px] text-gray-600">Automatic</span>
          </div>
        </div>

        {isSelfMarked && isEditing && (
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={() => { setShowQuestionEditor(true); addQuestion(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-blue/10 text-accent-blue border border-accent-blue/20 text-[10px] font-bold uppercase tracking-wider hover:bg-accent-blue/20 transition-colors">
              <Plus size={13} /> Add question
            </button>
            {hasQuestions && <button type="button" onClick={() => setShowQuestionEditor(value => !value)} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-white transition-colors">
              {showQuestionEditor ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showQuestionEditor ? 'Hide question marks' : 'Show question marks'}
            </button>}
          </div>
        )}

        {saveError && <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2"><AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" /><p className="text-[10px] text-red-400">{saveError}</p></div>}
      </div>

      <div className="flex-1 overflow-y-auto desktop-scroll p-6 space-y-4">
        {hasQuestions && (!isSelfMarked || showQuestionEditor) ? (
          currentResult.questions.map((q: any, idx: number) => {
            const errorKey = String(q.q ?? idx);
            return (
              <motion.div key={idx} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: idx * 0.05 }} className="group bg-gray-950/40 p-5 rounded-2xl border border-white/5 hover:border-accent-blue/30 hover:bg-accent-blue/5 transition-all duration-300 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-accent-blue rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="text-[10px] uppercase font-black tracking-tighter text-gray-500 group-hover:text-accent-blue transition-colors">Question {q.q}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    {isEditing && isSelfMarked && <button type="button" onClick={() => removeQuestion(idx)} className="p-1 text-gray-600 hover:text-red-400 transition-colors" aria-label={`Remove question ${q.q}`}><Trash2 size={12} /></button>}
                    {isEditing && (!isSelfMarked || showQuestionEditor) ? (
                      <div className="flex flex-col items-end gap-1">
                        <input type="text" value={q.score || ''} onChange={e => handleScoreChange(idx, e.target.value)} placeholder={isSelfMarked && !q.score ? '_/_' : undefined} className={`text-xs font-mono font-bold text-ink bg-gray-900 px-2 py-0.5 rounded border ${scoreErrors[errorKey] ? 'border-red-500 focus:border-red-500' : 'border-gray-700 focus:border-accent-blue'} focus:outline-none w-20 text-center placeholder:text-gray-600`} />
                        {scoreErrors[errorKey] && <span className="text-[9px] text-red-400 whitespace-nowrap">{scoreErrors[errorKey]}</span>}
                      </div>
                    ) : (
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${isSelfMarked && !q.score ? `${ghostClass} bg-gray-900/50 border-gray-800` : 'text-ink bg-gray-900 border-gray-800'}`}>{isSelfMarked && !q.score ? '_/_' : q.score || '—'} pts</span>
                    )}
                  </div>
                </div>
                {isEditing && (!isSelfMarked || showQuestionEditor) ? (
                  <textarea value={q.feedback || ''} onChange={e => handleFeedbackChange(idx, e.target.value)} placeholder={isSelfMarked && !q.feedback ? 'Optional feedback for this question' : undefined} className="w-full text-xs text-gray-400 group-hover:text-gray-200 leading-relaxed italic transition-colors font-medium bg-transparent border-b border-gray-700 focus:border-accent-blue focus:outline-none placeholder:text-gray-600" rows={2} />
                ) : (
                  <p className={`text-xs leading-relaxed italic transition-colors font-medium ${isSelfMarked && !q.feedback ? ghostClass : 'text-gray-400 group-hover:text-gray-200'}`}>"{isSelfMarked && !q.feedback ? 'No feedback provided.' : q.feedback || 'No feedback provided.'}"</p>
                )}
              </motion.div>
            );
          })
        ) : (
          <div className="py-8 text-center text-gray-600">
            <AlertCircle size={28} className="mx-auto mb-2 opacity-50" />
            <p className="text-[10px] uppercase tracking-widest">{isSelfMarked ? 'Add questions to mark this paper' : 'No question-level results'}</p>
          </div>
        )}

        <div className="mt-8 p-5 bg-accent-blue/[0.03] rounded-2xl border border-accent-blue/10 hover:border-accent-blue/20 transition-all group">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={16} className={isSelfMarked ? 'text-accent-green' : 'text-accent-blue'} />
            <span className={`text-[10px] uppercase font-black tracking-widest ${isSelfMarked ? 'text-accent-green' : 'text-accent-blue'}`}>Summary Report</span>
          </div>
          {isEditing ? (
            <textarea value={currentResult.feedback || ''} onChange={e => handleSummaryChange(e.target.value)} placeholder={isSelfMarked && !currentResult.feedback ? 'Enter recommendations or overall feedback for this paper' : undefined} className="w-full text-[11px] text-gray-500 group-hover:text-gray-300 leading-relaxed font-medium transition-colors bg-transparent border-b border-gray-700 focus:border-accent-blue focus:outline-none placeholder:text-gray-600" rows={3} />
          ) : (
            <p className={`text-[11px] leading-relaxed font-medium transition-colors ${isSelfMarked && !currentResult.feedback ? ghostClass : 'text-gray-500 group-hover:text-gray-300'}`}>{currentResult.feedback || (isSelfMarked ? 'No summary feedback provided.' : 'No summary feedback provided.')}</p>
          )}
        </div>
      </div>

      <div className="p-6 border-t border-gray-800 bg-sidebar/50 flex gap-2.5">
        <button type="button" onClick={handleSaveClick} disabled={isSaving} className="flex-1 bg-accent-green text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">
          {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onPrint} className="flex-1 bg-accent-blue text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-lg">
          <Printer size={16} />
          Next
        </button>
      </div>
    </div>
  );
};