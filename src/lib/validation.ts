// name=src/lib/validation.ts
// Shared validation and normalization helpers for grading results.

import { GradingResult } from '../types';

/* Grade scale mirrors server defaults */
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

export function parseQuestionScore(value: string | undefined): { score: number; maximum: number } | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.endsWith('/')) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const score = Number(match[1]);
  const maximum = Number(match[2]);
  if (!Number.isFinite(score) || !Number.isFinite(maximum) || maximum <= 0 || score < 0 || score > maximum) {
    return null;
  }
  return { score, maximum };
}

export function validateQuestionScore(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // allow in-progress "12/" input
  if (/^\d+(?:\.\d+)?\s*\/$/.test(trimmed)) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!match) return 'Enter the score in the format X/Y.';
  const score = Number(match[1]);
  const maximum = Number(match[2]);
  if (!Number.isFinite(score) || !Number.isFinite(maximum)) return 'Score must contain valid numbers.';
  if (maximum <= 0) return 'Maximum score must be greater than 0.';
  if (score < 0) return 'Score cannot be negative.';
  if (score > maximum) return `Score cannot exceed ${maximum}.`;
  return null;
}

export function parseTotalScore(value: string): { score: number; maximum: number } | null {
  return parseQuestionScore(value);
}

export function parsePercentage(value: string): number | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/%$/, '');
  if (!normalized) return null;
  const percentage = Number(normalized);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;
  return percentage;
}

export function calculateGrade(percentage: number): string {
  const scale = [...GRADE_SCALE].sort((a, b) => b.min - a.min);
  return (scale.find(entry => percentage >= entry.min) || scale[scale.length - 1]).grade;
}

export function recalculateFromQuestions(questions: any[]): { totalScore: string; percentage: string; grade: string } | null {
  if (!Array.isArray(questions) || questions.length === 0) return null;
  const parsedQuestions = questions.map(q => parseQuestionScore(q?.score));
  // Do not recalc while any question is blank/incomplete
  if (parsedQuestions.some(parsed => parsed === null)) return null;
  const parsed = parsedQuestions.filter((p): p is { score: number; maximum: number } => p !== null);
  if (parsed.length === 0) return null;
  const totalScore = parsed.reduce((sum, p) => sum + p.score, 0);
  const totalMaximum = parsed.reduce((sum, p) => sum + p.maximum, 0);
  if (totalMaximum <= 0 || totalScore < 0 || totalScore > totalMaximum) return null;
  const percentage = Number(((totalScore / totalMaximum) * 100).toFixed(2));
  return {
    totalScore: `${Number(totalScore.toFixed(2))}/${Number(totalMaximum.toFixed(2))}`,
    percentage: String(percentage),
    grade: calculateGrade(percentage),
  };
}

/**
 * Normalize and validate a grading result object (AI output or manual)
 * Returns normalized result and a possible warning string when values were adjusted.
 */
export function validateAndNormalizeResult(result: GradingResult): { result: GradingResult; warning: string | null } | null {
  if (!result || typeof result !== 'object') return null;

  const questions = Array.isArray(result.questions) ? result.questions : [];

  const normalizedQuestions = questions
    .filter(q => q && typeof q === 'object')
    .map((q, index) => ({
      ...q,
      q: q.q ?? index + 1,
      score: typeof q.score === 'string' ? q.score.trim() : '',
      feedback: typeof q.feedback === 'string' ? q.feedback : '',
    }));

  let totalScore = typeof result.totalScore === 'string' ? result.totalScore.trim() : '';
  let percentage = typeof result.percentage === 'string' ? result.percentage.trim() : '';
  let grade = typeof result.grade === 'string' ? result.grade.trim() : '';

  const suppliedTotal = parseTotalScore(totalScore);
  const suppliedPercentage = parsePercentage(percentage);
  let warning: string | null = null;

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

/**
 * Validate that a GradingResult is ready to be saved to history/export.
 * Returns null when valid, otherwise an error message.
 */
export function validateResultForSave(result: GradingResult): string | null {
  if (!result || typeof result !== 'object') return 'There is no valid grading result to save.';
  if (!Array.isArray(result.questions) || result.questions.length === 0) return 'No question-level marks are available. Complete grading before saving.';

  const incompleteQuestion = result.questions.find((q: any) => !parseQuestionScore(q?.score));
  if (incompleteQuestion) return 'Every question must have a valid score before the result can be saved.';

  const total = parseTotalScore(typeof result.totalScore === 'string' ? result.totalScore : '');
  if (!total) return 'The total score is incomplete or invalid.';

  const percentage = parsePercentage(typeof result.percentage === 'string' ? result.percentage : '');
  if (percentage === null) return 'The percentage is incomplete or invalid.';

  if (!result.grade || typeof result.grade !== 'string' || !result.grade.trim()) return 'The final grade is missing.';

  const recalculated = recalculateFromQuestions(result.questions);
  if (!recalculated) return 'The question scores could not be used to calculate a valid result.';

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
