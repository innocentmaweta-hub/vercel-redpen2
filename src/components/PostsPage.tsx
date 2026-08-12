import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  TrendingUp, Award, FileText, BookOpen, Bell,
  CheckCircle, Clock, Star, MessageSquare, ThumbsUp,
  BarChart2, Users, Zap, ChevronRight, Calendar
} from 'lucide-react';
import { HistoryRecord } from '../types';

interface PostsPageProps {
  history: HistoryRecord[];
  onGrade: () => void;
  activeCourseCode?: string; // When set, stats + activity scope to this course only
}

const GRADE_COLORS: Record<string, string> = {
  'A': 'text-emerald-400', 'A+': 'text-emerald-400', 'A-': 'text-emerald-400',
  'B': 'text-blue-400',   'B+': 'text-blue-400',   'B-': 'text-blue-400',
  'C': 'text-yellow-400', 'C+': 'text-yellow-400', 'C-': 'text-yellow-400',
  'D': 'text-orange-400', 'F': 'text-red-400',
};

const GRADE_BG: Record<string, string> = {
  'A': 'bg-emerald-400/10 border-emerald-400/20',
  'A+': 'bg-emerald-400/10 border-emerald-400/20',
  'B': 'bg-blue-400/10 border-blue-400/20',
  'B+': 'bg-blue-400/10 border-blue-400/20',
  'C': 'bg-yellow-400/10 border-yellow-400/20',
  'D': 'bg-orange-400/10 border-orange-400/20',
  'F': 'bg-red-400/10 border-red-400/20',
};

function getGradeColor(grade: string) {
  return GRADE_COLORS[grade] || 'text-gray-400';
}
function getGradeBg(grade: string) {
  return GRADE_BG[grade] || 'bg-gray-800/40 border-gray-700/30';
}

function getStats(history: HistoryRecord[]) {
  if (!history.length) return { total: 0, avgScore: 0, passRate: 0, topGrade: '—' };
  const scores = history.map(r => parseFloat(r.result.totalScore || '') || 0);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const passed = scores.filter(s => s >= 50).length;
  const grades = history.map(r => r.result.grade || '');
  const topGrade = grades.find(g => g.startsWith('A')) || grades[0] || '—';
  return {
    total: history.length,
    avgScore: Math.round(avg * 10) / 10,
    passRate: Math.round((passed / history.length) * 100),
    topGrade
  };
}

const ANNOUNCEMENTS = [
  {
    id: 'a1',
    type: 'tip',
    icon: Zap,
    iconColor: 'text-yellow-400',
    bg: 'bg-yellow-400/5 border-yellow-400/15',
    title: 'Pro Tip: Batch Grading',
    body: 'Use the Batch button in the title bar to queue multiple student papers and grade them all at once — saving significant time during exam season.',
    time: 'Pinned',
    likes: 12,
  },
  {
    id: 'a2',
    type: 'update',
    icon: Star,
    iconColor: 'text-accent-blue',
    bg: 'bg-accent-blue/5 border-accent-blue/15',
    title: 'AI Provider Active',
    body: 'Your grading engine is connected and ready. Upload a marking scheme and student paper to begin. Results include per-question scores and detailed feedback.',
    time: 'Today',
    likes: 5,
  },
  {
    id: 'a3',
    type: 'info',
    icon: BookOpen,
    iconColor: 'text-purple-400',
    bg: 'bg-purple-400/5 border-purple-400/15',
    title: 'Supported Formats',
    body: 'Upload marking schemes and student papers as PDF, JPG, PNG, or plain text. The AI extracts student identity information automatically from the answer sheet.',
    time: 'Yesterday',
    likes: 8,
  },
];

const StatCard = ({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex-1 bg-card border border-gray-800 rounded-2xl p-4 flex items-center gap-3 hover:border-gray-700 transition-colors"
  >
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
      <Icon size={18} />
    </div>
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{label}</p>
      <p className="text-xl font-black text-white leading-none mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  </motion.div>
);

const PostCard = ({ record, index }: { record: HistoryRecord; index: number }) => {
  const [liked, setLiked] = useState(false);
  const score = parseFloat(record.result.totalScore || '') || 0;
  const grade = record.result.grade || '?';
  const dateStr = new Date(record.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="bg-card border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black border flex-shrink-0 ${getGradeBg(grade)}`}>
          <span className={getGradeColor(grade)}>{grade}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-bold text-white truncate">
              {record.studentInfo?.name || 'Unknown Student'}
            </p>
            <span className="text-[10px] text-gray-600 font-mono">{record.studentInfo?.regNo || '—'}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            {record.studentInfo?.courseCode && (
              <span className="px-2 py-0.5 bg-accent-blue/10 text-accent-blue text-[10px] font-bold rounded-full border border-accent-blue/20">
                {record.studentInfo.courseCode}
              </span>
            )}
            {record.studentInfo?.program && (
              <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-[10px] rounded-full border border-gray-700">
                {record.studentInfo.program}
              </span>
            )}
            {record.studentInfo?.year && (
              <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-[10px] rounded-full border border-gray-700">
                {record.studentInfo.year}
              </span>
            )}
          </div>
          {record.result.feedback && (
            <p className="mt-2 text-[11px] text-gray-500 leading-relaxed line-clamp-2">
              {record.result.feedback}
            </p>
          )}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <BarChart2 size={11} className="text-gray-600" />
                <span className={`text-[11px] font-black ${score >= 70 ? 'text-emerald-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {record.result.totalScore || '—'}%
                </span>
              </div>
              <button
                onClick={() => setLiked(v => !v)}
                className={`flex items-center gap-1 text-[10px] transition-colors ${liked ? 'text-accent-blue' : 'text-gray-600 hover:text-gray-400'}`}
              >
                <ThumbsUp size={11} />
                <span>{liked ? 'Liked' : 'Like'}</span>
              </button>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-700">
              <Calendar size={10} />
              <span>{dateStr}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const AnnouncementCard = ({ post, index }: { post: typeof ANNOUNCEMENTS[0]; index: number }) => {
  const [liked, setLiked] = useState(false);
  const Icon = post.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className={`border rounded-2xl p-4 hover:opacity-90 transition-all ${post.bg}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center flex-shrink-0">
          <Icon size={18} className={post.iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold text-white">{post.title}</p>
            <span className="text-[10px] text-gray-600 shrink-0">{post.time}</span>
          </div>
          <p className="mt-1 text-[11px] text-gray-400 leading-relaxed">{post.body}</p>
          <button
            onClick={() => setLiked(v => !v)}
            className={`mt-3 flex items-center gap-1 text-[10px] transition-colors ${liked ? 'text-accent-blue' : 'text-gray-600 hover:text-gray-400'}`}
          >
            <ThumbsUp size={10} />
            <span>{post.likes + (liked ? 1 : 0)}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export const PostsPage = ({ history, onGrade, activeCourseCode }: PostsPageProps) => {
  const normalizedCode = activeCourseCode?.trim().toUpperCase();

  // Scope to the active course when one is set; otherwise fall back to all-time history
  const scopedHistory = normalizedCode
    ? history.filter(r => (r.studentInfo?.courseCode || '').trim().toUpperCase() === normalizedCode)
    : history;

  const stats = getStats(scopedHistory);
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex-1 flex overflow-hidden bg-bg-dark">
      <div className="flex-1 flex flex-col overflow-y-auto px-6 py-5 gap-5">

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-xl font-black text-white">{greeting} 👋</h1>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {normalizedCode
                ? `Showing activity for ${normalizedCode}.`
                : "Here's what's happening with your grading activity."}
            </p>
          </div>
          <button
            onClick={onGrade}
            className="flex items-center gap-2 px-4 py-2 bg-accent-blue text-white text-[11px] font-bold rounded-xl hover:bg-blue-600 transition-all shadow-lg"
          >
            <Zap size={13} />
            Start Grading
            <ChevronRight size={13} />
          </button>
        </motion.div>

        <div className="flex gap-3">
          <StatCard icon={FileText} label="Papers Graded" value={stats.total} sub={normalizedCode ? normalizedCode : 'all time'} color="bg-accent-blue/10 text-accent-blue" />
          <StatCard icon={BarChart2} label="Avg Score" value={stats.total ? `${stats.avgScore}%` : '—'} sub="across all papers" color="bg-purple-400/10 text-purple-400" />
          <StatCard icon={CheckCircle} label="Pass Rate" value={stats.total ? `${stats.passRate}%` : '—'} sub="≥ 50% threshold" color="bg-emerald-400/10 text-emerald-400" />
          <StatCard icon={Award} label="Best Grade" value={stats.topGrade} sub="highest achieved" color="bg-yellow-400/10 text-yellow-400" />
        </div>

        <div className="flex gap-5 min-h-0">
          <div className="flex-[3] flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Bell size={13} className="text-gray-500" />
              <h2 className="text-[11px] font-black uppercase tracking-widest text-gray-500">Announcements</h2>
            </div>
            {ANNOUNCEMENTS.map((post, i) => (
              <AnnouncementCard key={post.id} post={post} index={i} />
            ))}
          </div>

          <div className="flex-[4] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-gray-500" />
                <h2 className="text-[11px] font-black uppercase tracking-widest text-gray-500">
                  Recent Activity{normalizedCode ? ` · ${normalizedCode}` : ''}
                </h2>
              </div>
              {scopedHistory.length > 0 && (
                <span className="text-[10px] text-gray-700">{scopedHistory.length} record{scopedHistory.length !== 1 ? 's' : ''}</span>
              )}
            </div>

            {scopedHistory.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col items-center justify-center gap-3 bg-card border border-gray-800 rounded-2xl py-12"
              >
                <FileText size={32} className="text-gray-700" />
                <p className="text-[12px] text-gray-600 font-medium">
                  {normalizedCode ? `No graded papers for ${normalizedCode} yet` : 'No grading activity yet'}
                </p>
                <button
                  onClick={onGrade}
                  className="px-4 py-1.5 bg-accent-blue/10 text-accent-blue text-[11px] font-bold rounded-lg border border-accent-blue/20 hover:bg-accent-blue/20 transition-colors"
                >
                  Grade your first paper →
                </button>
              </motion.div>
            ) : (
              <div className="flex flex-col gap-3 overflow-y-auto">
                {[...scopedHistory].reverse().map((rec, i) => (
                  <PostCard key={rec.id} record={rec} index={i} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
