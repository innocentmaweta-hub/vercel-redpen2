import React, { useState, useEffect } from 'react';
import { GradingResult } from '../types';
import { ChevronRight, Award, AlertCircle, Printer, Edit3, Save } from 'lucide-react';
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

  // Empty input is valid while editing.
  if (!trimmed) return null;

  // Allow an incomplete expression while the examiner is typing.
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
// Recomputes totalScore/percentage/grade from the current set of question scores.
// Only questions with a valid "X/Y" score are counted — a question left blank
// (e.g. still being typed) doesn't distort the running total.
function recalculateFromQuestions(questions: any[]): { totalScore: string; percentage: string; grade: string } | null {
  if (!Array.isArray(questions) || questions.length === 0) {
    return null;
  }

  const parsedQuestions = questions.map(q => parseQuestionScore(q?.score));

  // Do not recalculate while any question is blank or incomplete.
  // This prevents an unfinished entry such as "7/" from being treated
  // as a valid score or causing the total to change prematurely.
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

  const scale = [...GRADE_SCALE].sort((a, b) => b.min - a.min);
  const gradeEntry =
    scale.find(entry => percentage >= entry.min) ||
    scale[scale.length - 1];

  return {
    totalScore: `${Number(totalScore.toFixed(2))}/${Number(totalMaximum.toFixed(2))}`,
    percentage: String(percentage),
    grade: gradeEntry.grade,
  };
}

function validateAndNormalizeResult(result: GradingResult): GradingResult | null {
        if (!result || typeof result !== 'object') {
                return null;
        }

        const questions = Array.isArray(result.questions)
                ? result.questions
                : [];

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

        // If all question scores are valid, calculate the result from the
        // questions instead of blindly trusting the AI totals.
        const recalculated = recalculateFromQuestions(normalizedQuestions);

        if (recalculated) {
                totalScore = recalculated.totalScore;
                percentage = recalculated.percentage;
                grade = recalculated.grade;
        }

        return {
                ...result,
                questions: normalizedQuestions,
                totalScore,
                percentage,
                grade,
                feedback: typeof result.feedback === 'string'
                        ? result.feedback
                        : '',
        };
}

interface Props {
  result: GradingResult | null;
  loading: boolean;
  onPrint: () => void;
    onSave: (result: GradingResult) => void;
  isSaving?: boolean;
  onResultChange?: (result: GradingResult) => void; // Added callback for result changes
}

export const ResultsPanel = ({ result, loading, onPrint, onSave, isSaving, onResultChange }: Props) => {
  const [editableResult, setEditableResult] = useState<GradingResult | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Sync from parent when a fresh result arrives (e.g. new grading, loaded history record)
  useEffect(() => {
        if (result) {
                const validatedResult = validateAndNormalizeResult(result);
                setEditableResult(validatedResult);
        } else {
                setEditableResult(null);
        }
}, [result]);

  // Every edit updates local state AND immediately propagates to the parent,
  // so whatever is on screen is exactly what Save will persist.
  const updateResult = (updated: GradingResult) => {
    setEditableResult(updated);
    onResultChange?.(updated);
  };

  const handleInputChange = (field: keyof GradingResult, value: string) => {
    if (editableResult) {
      updateResult({
        ...editableResult,
        [field]: value
      });
    }
  };

  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
  const [scoreErrors, setScoreErrors] = useState<Record<string, string>>({});

  const handleTypingStart = (field: string) => {
    setIsTyping(prev => ({ ...prev, [field]: true }));
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

  // Determine if this is a self-marked result based on placeholder values
  const isSelfMarked = currentResult?.feedback === 'Manually type the recommendations of this paper here' ||
    currentResult?.totalScore === '_/100';

  if (!currentResult) {
    return (
      <div className="bg-card h-full rounded-3xl border border-gray-800 shadow-xl flex flex-col items-center justify-center p-8 text-center border-dashed">
        <Award size={48} className="text-gray-800 mb-4" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-600">No Analysis Data</h3>
        <p className="text-[10px] text-gray-700 mt-2 uppercase font-medium">Upload documents and click "Evaluate" to begin</p>
      </div>
    );
  }

  // Ghosted styling for unfilled placeholder text — dimmer + italic, so it reads
  // as "not filled in yet" rather than real content.
  const ghostClass = "text-gray-600 italic opacity-60";

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
              onClick={() => setIsEditing(!isEditing)}
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

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900/50 p-4 rounded-2xl border border-gray-800">
            <span className="text-[10px] uppercase font-bold text-gray-600 block mb-1">Total Score</span>
            {isEditing ? (
              <input
                type="text"
                value={currentResult?.totalScore || ''}
                onChange={(e) => handleInputChange('totalScore', e.target.value)}
                placeholder={isSelfMarked ? '_/100' : undefined}
                className="text-3xl font-mono font-bold text-ink bg-transparent border-b border-gray-700 focus:border-accent-blue focus:outline-none w-full placeholder:text-gray-600 placeholder:italic placeholder:opacity-60"
              />
            ) : (
              <span className={`text-3xl font-mono font-bold ${isSelfMarked && !currentResult?.totalScore ? ghostClass : 'text-ink'}`}>
                {isSelfMarked && !isEditing && !currentResult?.totalScore ? '_/100' : currentResult?.totalScore}
              </span>
            )}
          </div>
          <div className="bg-gray-900/50 p-4 rounded-2xl border border-gray-800">
            <span className="text-[10px] uppercase font-bold text-gray-600 block mb-1">Final Grade</span>
            {isEditing ? (
              <input
                type="text"
                value={isSelfMarked && !currentResult?.grade ? '' : currentResult?.grade || ''}
                onChange={(e) => handleInputChange('grade', e.target.value)}
                placeholder={isSelfMarked && !currentResult?.grade ? '_' : undefined}
                className="text-3xl font-bold text-ink bg-transparent border-b border-gray-700 focus:border-accent-blue focus:outline-none w-full placeholder:text-gray-600 placeholder:italic placeholder:opacity-60"
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
                {isSelfMarked && !isEditing && !currentResult?.grade ? '_' : currentResult?.grade}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto desktop-scroll p-6 space-y-4">
        {currentResult && currentResult.questions && currentResult.questions.length > 0 && currentResult.questions.map((q: any, idx: number) => (
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

                      // Keep blank/in-progress input editable without treating it as a
                      // valid score. Invalid completed values are not committed.
                      if (error && !/^\d+(?:\.\d+)?\s*\/?$/.test(value.trim())) {
                        return;
                      }

                      const parsed = value.trim().endsWith('/')
                        ? null
                        : parseQuestionScore(value);

                      // Reject impossible completed scores such as 12/10.
                      if (value.trim() && !value.trim().endsWith('/') && !parsed) {
                        return;
                      }

                      const updatedQuestions = [...(currentResult?.questions || [])];

                      updatedQuestions[idx] = {
                        ...updatedQuestions[idx],
                        score: value
                      };

                      updateResult({
                        ...currentResult!,
                        questions: updatedQuestions,
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
                  {isSelfMarked && !isEditing && !q.score ? '_/_' : q.score} pts
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
                "{isSelfMarked && !isEditing && !q.feedback ? 'Enter feedback for question' : q.feedback}"
              </p>
            )}
          </motion.div>
        ))}

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
              {isSelfMarked && !isEditing && !currentResult?.feedback ? 'Manually type the recommendations of this paper here' : currentResult?.feedback}
            </p>
          )}
        </div>
      </div>

      <div className="p-6 border-t border-gray-800 bg-sidebar/50 flex gap-2.5">
        <button
          onClick={() => {
            if (currentResult) {
              onSave(currentResult);
            }
          }}
          disabled={isSaving || !currentResult}
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
