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
// Raw response from the AI grading API (snake_case fields)
export interface ApiGradingResult {
    total_score?: string;
    totalScore?: string;
    score?: string;
    percentage?: string;
    grade?: string;
    questions?: QuestionResult[];
    feedback?: string;
    extracted_info?: ExtractedInfo;
    error?: boolean;
    message?: string;
}
export interface GradingResult {
    totalScore?: string;
    score?: string;
    percentage?: string;
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
    year: string; // Year of Study (e.g. "Year 1"–"Year 4")
    semester?: string; // Semester 1 / Semester 2
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
    apiKey?: string;
    apiProvider?: 'openai' | 'gemini';
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
    examDate?: string;
    duration?: number;
}
