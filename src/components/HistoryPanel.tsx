import React, { useEffect, useState } from 'react';
import { HistoryRecord, SemesterCourse } from '../types';
import { Clock, Trash2, ChevronRight, BookOpen, ArrowLeft, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  history: HistoryRecord[];
  onLoad: (record: HistoryRecord) => void;
  onDelete: (id: string) => void;
  sessions: SemesterCourse[];
  onLoadSession: (session: SemesterCourse) => void;
}

type Tab = 'grading' | 'sessions';

const SESSION_STORAGE_KEY = 'stored_sessions';
const AUTH_TOKEN_KEY = 'yaza_auth_token';

const sessionKey = (session: SemesterCourse) => [
  (session.courseCode || '').trim().toUpperCase(),
  (session.academicYear || '').trim(),
  (session.year || '').trim(),
  (session.semester || '').trim(),
  (session.sessionLabel || '').trim(),
  (session.customName || '').trim(),
].join('|');

export const HistoryPanel = ({ history, onLoad, onDelete, sessions, onLoadSession }: Props) => {
  const [tab, setTab] = useState<Tab>('grading');
  const [selectedSession, setSelectedSession] = useState<SemesterCourse | null>(null);
  const [sessionList, setSessionList] = useState<SemesterCourse[]>(sessions);

  useEffect(() => {
    setSessionList(sessions);
  }, [sessions]);

  useEffect(() => {
    const sync = () => {
      try {
        setSessionList(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]'));
      } catch {
        setSessionList(sessions);
      }
    };
    window.addEventListener('redpen:sessions-updated', sync);
    return () => window.removeEventListener('redpen:sessions-updated', sync);
  }, [sessions]);

  const deleteSession = async (session: SemesterCourse) => {
    const label = `${session.courseCode}${session.courseName ? ` — ${session.courseName}` : ''}`;
    if (!window.confirm(`Delete session "${label}"? This removes it from your saved sessions.`)) return;

    const id = (session as SemesterCourse & { id?: string }).id;
    const key = sessionKey(session);

    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) {
        const params = new URLSearchParams(id ? { id } : { key });
        const response = await fetch(`/api/sessions?${params.toString()}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
      }

      const next = sessionList.filter((item) => sessionKey(item) !== key);
      setSessionList(next);
      setSelectedSession((current) => current && sessionKey(current) === key ? null : current);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('redpen:sessions-updated'));
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Could not delete this session. Please try again.');
    }
  };

  const tabBtnClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${active
      ? 'bg-accent-blue text-white shadow-lg shadow-accent-blue/20'
      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
    }`;

  return (
    <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-2 h-4 bg-accent-blue rounded-full" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">History</h2>
      </div>

      <div className="flex items-center gap-1 shrink-0 border-b border-gray-800 pb-3">
        <button onClick={() => { setTab('grading'); setSelectedSession(null); }} className={tabBtnClass(tab === 'grading')}>
          <Clock size={12} /> Grading <span className="ml-0.5 opacity-70">{history.length}</span>
        </button>
        <button onClick={() => { setTab('sessions'); setSelectedSession(null); }} className={tabBtnClass(tab === 'sessions')}>
          <BookOpen size={12} /> Sessions <span className="ml-0.5 opacity-70">{sessionList.length}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-3">
        <AnimatePresence mode="wait">
          {tab === 'grading' ? (
            <motion.div key="grading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
              {history.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <Clock size={48} className="text-gray-800 mb-4" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-600">No History Yet</h3>
                  <p className="text-[10px] text-gray-700 mt-2 uppercase font-medium">Graded papers will appear here after you save them</p>
                </div>
              ) : (
                history.map((record, idx) => (
                  <motion.div key={record.id} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: idx * 0.05 }} className="group bg-card border border-gray-800 rounded-2xl p-4 hover:border-accent-blue/40 hover:bg-accent-blue/5 transition-all duration-200 cursor-pointer" onClick={() => onLoad(record)}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-lg font-bold font-mono ${record.result.grade?.startsWith('A') ? 'text-accent-green' : 'text-accent-blue'}`}>{record.result.grade}</span>
                          <span className="text-xs font-mono text-gray-400">{record.result.totalScore}</span>
                        </div>
                        <p className="text-xs font-bold text-gray-300 truncate">{record.studentInfo.name || 'Unknown Student'}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5 uppercase font-medium">{record.studentInfo.courseCode || '—'} · {record.date}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <button onClick={(e) => { e.stopPropagation(); onDelete(record.id); }} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 text-gray-600 transition-all" aria-label="Delete grading record">
                          <Trash2 size={13} />
                        </button>
                        <ChevronRight size={16} className="text-gray-700 group-hover:text-accent-blue transition-colors" />
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          ) : (
            <motion.div key="sessions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
              {selectedSession ? (
                <div className="bg-card border border-gray-800 rounded-2xl p-5">
                  <button onClick={() => setSelectedSession(null)} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors mb-4">
                    <ArrowLeft size={12} /> Back to sessions
                  </button>

                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-2 py-1 bg-accent-blue/10 text-accent-blue text-[12px] font-black rounded-lg border border-accent-blue/20">{selectedSession.courseCode}</span>
                    {selectedSession.courseName && <span className="text-[13px] text-white font-semibold">{selectedSession.courseName}</span>}
                  </div>

                  <div className="space-y-2 mb-5">
                    <div className="flex items-center justify-between text-[11px]"><span className="text-gray-600 uppercase font-bold tracking-wider">Program</span><span className="text-gray-300">{selectedSession.program || '—'}</span></div>
                    <div className="flex items-center justify-between text-[11px]"><span className="text-gray-600 uppercase font-bold tracking-wider">Year</span><span className="text-gray-300">{selectedSession.year || '—'}</span></div>
                    <div className="flex items-center justify-between text-[11px]"><span className="text-gray-600 uppercase font-bold tracking-wider">Semester</span><span className="text-gray-300">{selectedSession.semester || '—'}</span></div>
                    <div className="flex items-center justify-between text-[11px]"><span className="text-gray-600 uppercase font-bold tracking-wider">Academic Year</span><span className="text-gray-300">{selectedSession.academicYear || '—'}</span></div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => onLoadSession(selectedSession)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent-blue text-white text-[12px] font-bold rounded-xl hover:bg-blue-600 transition-colors shadow-lg shadow-accent-blue/20">
                      Load Session <ArrowRight size={14} />
                    </button>
                    <button onClick={() => deleteSession(selectedSession)} className="px-3 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors" aria-label="Delete session">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ) : sessionList.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <BookOpen size={48} className="text-gray-800 mb-4" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-600">No Sessions Yet</h3>
                  <p className="text-[10px] text-gray-700 mt-2 uppercase font-medium">Course sessions you start will appear here</p>
                </div>
              ) : (
                sessionList.map((session, idx) => (
                  <motion.div key={(session as SemesterCourse & { id?: string }).id || `${sessionKey(session)}-${idx}`} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: idx * 0.05 }} className="group bg-card border border-gray-800 rounded-2xl p-4 hover:border-accent-blue/40 hover:bg-accent-blue/5 transition-all duration-200 cursor-pointer" onClick={() => setSelectedSession(session)}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-accent-blue/10 text-accent-blue text-[11px] font-black rounded-md border border-accent-blue/20">{session.courseCode}</span>
                        </div>
                        <p className="text-xs font-bold text-gray-300 truncate">{session.courseName || 'No course name'}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5 uppercase font-medium">
                          {session.year || '—'} {session.semester ? `· ${session.semester}` : ''} {session.academicYear ? `· ${session.academicYear}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); deleteSession(session); }} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 text-gray-600 transition-all" aria-label="Delete session">
                          <Trash2 size={13} />
                        </button>
                        <ChevronRight size={16} className="text-gray-700 group-hover:text-accent-blue transition-colors" />
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
