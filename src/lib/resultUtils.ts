import type { GradingResult } from '../types';

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
