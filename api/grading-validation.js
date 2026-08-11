/**
 * Deterministic validation and calculation for AI grading results.
 *
 * The AI is responsible for evaluating answers and proposing per-question
 * scores. The server is responsible for validating those scores and deriving
 * totals/percentages/grades so model arithmetic cannot corrupt a result.
 */

export const DEFAULT_GRADE_SCALE = [
  { min: 80, grade: 'A+' },
  { min: 75, grade: 'A' },
  { min: 70, grade: 'B+' },
  { min: 65, grade: 'B' },
  { min: 60, grade: 'C+' },
  { min: 55, grade: 'C' },
  { min: 50, grade: 'D' },
  { min: 0, grade: 'F' },
];

function finiteNonNegativeNumber(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseScore(value) {
  if (typeof value === 'number') {
    return finiteNonNegativeNumber(value);
  }

  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const score = finiteNonNegativeNumber(match[1]);
  const maximum = finiteNonNegativeNumber(match[2]);
  if (score === null || maximum === null || maximum <= 0 || score > maximum) return null;

  return { score, maximum };
}

function parseTotal(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const score = finiteNonNegativeNumber(match[1]);
  const maximum = finiteNonNegativeNumber(match[2]);
  if (score === null || maximum === null || maximum <= 0 || score > maximum) return null;
  return { score, maximum };
}

/**
 * Validate an AI result and replace all derived numerical fields with values
 * calculated from the question scores.
 *
 * Returns { ok: true, result } or { ok: false, error }.
 */
export function validateAndNormalizeGradingResult(rawResult, gradeScale = DEFAULT_GRADE_SCALE) {
  if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult)) {
    return { ok: false, error: 'AI returned an invalid grading object.' };
  }

  if (!Array.isArray(rawResult.questions) || rawResult.questions.length === 0) {
    return { ok: false, error: 'AI grading result contains no question scores.' };
  }

  const questions = rawResult.questions.map((question, index) => {
    if (!question || typeof question !== 'object') {
      throw new Error(`Question ${index + 1} is invalid.`);
    }

    const parsed = parseScore(question.score);
    if (!parsed) {
      throw new Error(`Question ${index + 1} has an invalid score.`);
    }

    return {
      ...question,
      q: question.q ?? index + 1,
      score: `${parsed.score}/${parsed.maximum}`,
      _score: parsed.score,
      _maximum: parsed.maximum,
    };
  });

  try {
    const totalScore = questions.reduce((sum, question) => sum + question._score, 0);
    const totalMaximum = questions.reduce((sum, question) => sum + question._maximum, 0);

    if (!Number.isFinite(totalScore) || !Number.isFinite(totalMaximum) || totalMaximum <= 0) {
      return { ok: false, error: 'AI grading result has an invalid total.' };
    }

    const percentage = Number(((totalScore / totalMaximum) * 100).toFixed(2));
    const scale = [...gradeScale].sort((a, b) => b.min - a.min);
    const gradeEntry = scale.find((entry) => percentage >= entry.min);
    if (!gradeEntry) {
      return { ok: false, error: 'No grade is defined for the calculated percentage.' };
    }

    const normalizedQuestions = questions.map(({ _score, _maximum, ...question }) => question);

    return {
      ok: true,
      result: {
        ...rawResult,
        total_score: `${Number(totalScore.toFixed(2))}/${Number(totalMaximum.toFixed(2))}`,
        percentage,
        grade: gradeEntry.grade,
        questions: normalizedQuestions,
      },
    };
  } catch (error) {
    return { ok: false, error: error.message || 'Invalid AI grading result.' };
  }
}

/**
 * Validate the optional total supplied by the model. This is intentionally
 * diagnostic only: the server must always use the recalculated total.
 */
export function compareModelTotal(rawResult, normalizedResult) {
  const supplied = parseTotal(rawResult?.total_score);
  if (!supplied) return { supplied: null, matches: false };

  const [scoreText, maximumText] = normalizedResult.total_score.split('/');
  return {
    supplied,
    matches:
      Math.abs(supplied.score - Number(scoreText)) < 0.001 &&
      Math.abs(supplied.maximum - Number(maximumText)) < 0.001,
  };
}
