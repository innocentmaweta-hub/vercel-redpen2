export interface QuestionResult {
    q: number;
    score: string;
    feedback: string;
}
export interface ExtractedInfo {
    name: string;
    regNo: string;
    program: string;
    year: string;
    courseCode: string;
    examDate: string;
}
export interface ApiGradingResult {
    total_score?: string | number;
    totalScore?: string | number;
    score?: string | number;
    percentage?: string | number;
    grade?: string;
    questions?: QuestionResult[];
    feedback?: string;
    extracted_info?: ExtractedInfo;
    error?: boolean;
    message?: string;
}
export interface GradingResult {
    totalScore?: string | number;
    score?: string | number;
    percentage?: string | number;
    grade?: string;
    questions?: QuestionResult[];
    feedback?: string;
    extracted_info?: ExtractedInfo;
    error?: boolean;
    message?: string;
}
export interface StudentInfo {
    name: string;
    regNo: string;
    program: string;
    year: string;
    semester?: string;
    courseCode: string;
    examDate: string;
}
export interface HistoryRecord {
    id: string;
    date: string;
    studentInfo: StudentInfo;
    result: GradingResult;
}
export type ActiveView = 'dashboard' | 'grade' | 'remark' | 'history';
export type SubscriptionTier = 'free' | 'personal' | 'corporate';
export interface User {
    id: string;
    name: string;
    email: string;
    tier: SubscriptionTier;
    gradingCount: number;
    gradingLimit: number;
    googleId?: string;
    createdAt: string;
    institution?: string;
    role?: string;
    activeProvider?: 'gemini' | 'openai' | 'server';
    totalGraded?: number;
    avatarUrl?: string;
}
export interface AuthResponse {
    token: string;
    user: User;
}
export interface SemesterCourse {
    courseCode: string;
    courseName?: string;
    program?: string;
    year?: string;
    semester?: string;
    academicYear?: string;
    sessionLabel?: string;
    customName?: string;
    examDate?: string;
    duration?: number;
}

export function parseScore(value: string | number | undefined): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    if (typeof value === 'string') {
        const match = value.match(/-?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : 0;
    }

    return 0;
}
