import type { GradingResult } from '../types';

/**
 * Parse a question score such as "5/10" into a numeric score and maximum.
 * Returns null when the value is empty or not a valid score.
 */
export function parseQuestionScore(value: unknown): { score: number; max: number } | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }

    const text = String(value).trim();
    if (!text) return null;

    const match = text.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (!match) return null;

    const score = Number(match[1]);
    const max = Number(match[2]);

    if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0 || score < 0 || score > max) {
        return null;
    }

    return { score, max };
}

/**
 * Validate and normalize an AI grading result before it enters application state.
 * Keeps the existing result shape while making optional question fields safe.
 */
export function validateAndNormalizeResult(
    result: GradingResult | null | undefined
): GradingResult | null {
    if (!result || typeof result !== 'object') {
        return null;
    }

    const hasScore =
        result.totalScore !== undefined ||
        result.score !== undefined;

    const hasQuestions = Array.isArray(result.questions);

    if (!hasScore && !hasQuestions) {
        return null;
    }

    const questions = (result.questions || []).map((question, index) => ({
        q: Number.isFinite(Number(question?.q))
            ? Number(question.q)
            : index + 1,
        score: question?.score == null ? '' : String(question.score),
        feedback: question?.feedback == null ? '' : String(question.feedback),
    }));

    return {
        ...result,
        grade: result.grade == null ? '' : String(result.grade),
        feedback: result.feedback == null ? '' : String(result.feedback),
        questions,
        extracted_info: result.extracted_info,
    };
}
