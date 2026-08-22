import logo from '../assets/logo.png';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, SlidersHorizontal, RotateCw, Bot, Layers, FolderOpen, LogIn, LogOut, LayoutGrid, Zap, PenLine, History as HistoryIcon, User, Save, Printer, Plus, BookOpen, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StudentInfo, HistoryRecord, SemesterCourse } from '../types';
import { sessionIdentityKey } from '../lib/sessionStore';

interface TopBarProps {
  sessions: SemesterCourse[];
  activeSession: SemesterCourse | null;
  onSelectSession: (session: SemesterCourse) => void;
  onLoadSessionFromFile: () => void;
  onNew: () => void;
  onNewCourse: () => void;
  onNewSession: () => void;
  onNewPaper: () => void;
  onSave: () => void;
  onPrint: () => void;
  onClearResult: () => void;
  onRefresh: () => void;
  onSettings: () => void;
  onBatch: () => void;
  hasResult: boolean;
  studentInfo: StudentInfo;
  onStudentInfoUpdate: (updates: Partial<StudentInfo>) => void;
  history: HistoryRecord[];
  onShowOldSessions: () => void;
  onSearchTermChange: (term: string) => void;
  isLoggedIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onToggleYaza: () => void;
  isYazaOpen: boolean;
  onViewChange: (view: 'dashboard' | 'grade' | 'history' | 'remark') => void;
  onProfile: () => void;
  onLoadRecord: (record: HistoryRecord) => void;
}

interface DropdownItem {
  label?: string;
  action?: () => void;
  disabled?: boolean;
  divider?: boolean;
  active?: boolean;
}

const YEARS_OF_STUDY = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
const SEMESTERS = ['Semester 1', 'Semester 2'];

function getRecentCourses(history: HistoryRecord[]): string[] {
  if (!Array.isArray(history)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const r of history) {
    const code = r.studentInfo?.courseCode;
    if (code && !seen.has(code)) {
      seen.add(code);
      result.push(code);
      if (result.length >= 6) break;
    }
  }
  return result;
}

function sessionTitle(session: SemesterCourse): string {
  return session.courseCode || session.customName || 'Unnamed session';
}

function sessionMeta(session: SemesterCourse): string {
  return [session.year, session.semester, session.academicYear].filter(Boolean).join(' · ');
}

const Dropdown = ({ x, items, onClose, wide = false }: { x: number; items: DropdownItem[]; onClose: () => void; wide?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const timerId = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(timerId);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.13 }}
      style={{ position: 'fixed', top: 40, left: x, zIndex: 9999, minWidth: wide ? 280 : 200, maxWidth: wide ? 340 : undefined }}
      className="bg-gray-950 border border-gray-800 rounded-xl shadow-2xl py-1 overflow-hidden"
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="my-1 border-t border-gray-800/70" />
        ) : (
          <button
            key={i}
            onClick={() => { if (!item.disabled && item.action) { item.action(); onClose(); } }}
            className={`w-full text-left px-4 py-1.5 text-[11px] font-medium flex items-center justify-between transition-colors ${item.disabled
              ? 'text-gray-700 cursor-not-allowed'
              : item.active
                ? 'text-accent-blue bg-accent-blue/10'
                : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
          >
            <span className="truncate">{item.label}</span>
            {item.active && <Check size={13} className="text-accent-blue shrink-0 ml-2" />}
          </button>
        )
      )}
    </motion.div>
  );
};

interface SearchAction {
  label: string;
  icon: any;
  action: () => void;
}

const SearchDropdown = ({ query, actions, historyResults, onSelectAction, onSelectHistory, onClose }: {
  query: string;
  actions: SearchAction[];
  historyResults: HistoryRecord[];
  onSelectAction: (action: SearchAction) => void;
  onSelectHistory: (record: HistoryRecord) => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const timerId = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(timerId);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  const hasResults = actions.length > 0 || historyResults.length > 0;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.13 }}
      className="absolute top-full left-0 right-0 mt-1 z-[9999] bg-gray-950 border border-gray-800 rounded-xl shadow-2xl overflow-hidden max-h-[400px] overflow-y-auto"
    >
      {!hasResults ? (
        <div className="px-4 py-6 text-center text-[11px] text-gray-600">No matches for "{query}"</div>
      ) : (
        <>
          {actions.length > 0 && (
            <div className="py-1.5">
              <p className="px-4 pb-1 text-[9px] font-black uppercase tracking-widest text-gray-600">Actions</p>
              {actions.map((a, i) => (
                <button key={i} onClick={() => onSelectAction(a)} className="w-full text-left px-4 py-1.5 text-[11px] font-medium flex items-center gap-2.5 text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                  <a.icon size={13} className="text-gray-500 shrink-0" />
                  {a.label}
                </button>
              ))}
            </div>
          )}
          {historyResults.length > 0 && (
            <div className="py-1.5 border-t border-gray-800/70">
              <p className="px-4 pb-1 text-[9px] font-black uppercase tracking-widest text-gray-600">History</p>
              {historyResults.map((r) => (
                <button key={r.id} onClick={() => onSelectHistory(r)} className="w-full text-left px-4 py-1.5 flex items-center justify-between text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                  <span className="text-[11px] font-medium truncate">{r.studentInfo?.name || 'Unnamed'}</span>
                  <span className="text-[9px] text-gray-600 shrink-0 ml-2">{r.studentInfo?.courseCode || ''}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
};

const SettingsDropdown = ({ onClose }: { onClose: () => void }) => {
  const [status, setStatus] = useState<{ provider: string; model: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => setStatus({ provider: 'unknown', model: 'unknown' }));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.13 }}
      style={{ position: 'fixed', top: 40, right: 120, zIndex: 9999, minWidth: 230 }}
      className="bg-gray-950 border border-gray-800 rounded-xl shadow-2xl p-4"
    >
      <p className="text-[9px] uppercase font-black tracking-widest text-gray-600 mb-3">AI Provider</p>
      {status ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-[10px] text-gray-500 font-medium">Provider</span><span className="text-[10px] font-bold text-accent-green uppercase tracking-wider">{status.provider}</span></div>
          <div className="flex items-center justify-between"><span className="text-[10px] text-gray-500 font-medium">Model</span><span className="text-[10px] font-bold text-gray-300 font-mono">{status.model}</span></div>
        </div>
      ) : <p className="text-[10px] text-gray-600">Loading…</p>}
      <div className="mt-3 pt-3 border-t border-gray-800">
        <p className="text-[9px] text-gray-700 leading-relaxed">Switch providers by editing <span className="text-gray-500 font-mono">.env</span> and restarting.</p>
      </div>
    </motion.div>
  );
};

export const TopBar = ({
  sessions, activeSession, onSelectSession, onLoadSessionFromFile,
  onNew, onNewCourse, onNewSession, onNewPaper, onSave, onPrint,
  onClearResult, onRefresh, onSettings, onBatch, hasResult, studentInfo,
  onStudentInfoUpdate, history, onShowOldSessions, onSearchTermChange,
  isLoggedIn, onLogin, onLogout, onToggleYaza, isYazaOpen,
  onViewChange, onProfile, onLoadRecord
}: TopBarProps) => {
  const [activeMenu, setActiveMenu] = useState<{ name: string; x: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  useEffect(() => {
    const handler = () => onShowOldSessions();
    window.addEventListener('redpen:open-load-session', handler);
    return () => window.removeEventListener('redpen:open-load-session', handler);
  }, [onShowOldSessions]);

  useEffect(() => {
    document.documentElement.dataset.redpenSessionActive = activeSession ? 'true' : 'false';
    return () => {
      delete document.documentElement.dataset.redpenSessionActive;
    };
  }, [activeSession]);

  const handleMenuClick = (name: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (activeMenu?.name === name) { setActiveMenu(null); return; }
    setShowSettings(false);
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveMenu({ name, x: rect.left });
  };

  const closeMenu = useCallback(() => setActiveMenu(null), []);
  const recentCourses = getRecentCourses(history);

  const allActions: SearchAction[] = [
    { label: 'Dashboard', icon: LayoutGrid, action: () => onViewChange('dashboard') },
    { label: 'Grade', icon: Zap, action: () => onViewChange('grade') },
    { label: 'Remark', icon: PenLine, action: () => onViewChange('remark') },
    { label: 'History', icon: HistoryIcon, action: () => onViewChange('history') },
    { label: 'Profile', icon: User, action: onProfile },
    { label: 'Save Results', icon: Save, action: onSave },
    { label: 'Print Report', icon: Printer, action: onPrint },
    { label: 'Settings', icon: SlidersHorizontal, action: onSettings },
    { label: 'Batch Grading', icon: Layers, action: onBatch },
    { label: 'Refresh', icon: RotateCw, action: onRefresh },
    { label: 'New Session', icon: BookOpen, action: onNewSession },
    { label: 'New Course', icon: Plus, action: onNewCourse },
    { label: 'New Paper', icon: FolderOpen, action: onNewPaper },
    { label: 'Yaza AI', icon: Bot, action: onToggleYaza },
    { label: isLoggedIn ? 'Logout' : 'Login', icon: isLoggedIn ? LogOut : LogIn, action: isLoggedIn ? onLogout : onLogin },
  ];

  const matchedActions = searchQuery.trim()
    ? allActions.filter(a => a.label.toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0, 6)
    : [];

  const matchedHistory = searchQuery.trim()
    ? history.filter(r => {
        const q = searchQuery.trim().toLowerCase();
        return r.studentInfo?.name?.toLowerCase().includes(q) || r.studentInfo?.regNo?.toLowerCase().includes(q) || r.studentInfo?.courseCode?.toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

  const handleSelectSearchAction = (a: SearchAction) => {
    a.action();
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleSelectSearchHistory = (r: HistoryRecord) => {
    onLoadRecord(r);
    onViewChange('grade');
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const sessionItems: DropdownItem[] = sessions.map(session => ({
    label: `${sessionTitle(session)}${sessionMeta(session) ? ` · ${sessionMeta(session)}` : ''}`,
    action: () => onSelectSession(session),
    active: activeSession ? sessionIdentityKey(activeSession) === sessionIdentityKey(session) : false,
  }));

  const newMenuItems: DropdownItem[] = [
    { label: 'New Session', action: onNewSession },
    { label: 'New Course', action: onNewCourse },
    { label: 'New Paper', action: onNewPaper },
    { divider: true },
    { label: 'Sessions', disabled: true },
    ...(sessionItems.length > 0 ? sessionItems : [{ label: 'No saved sessions yet', disabled: true }]),
    { divider: true },
    { label: 'Load Session from File', action: onLoadSessionFromFile },
  ];

  const menus: Record<string, DropdownItem[]> = {
    File: [
      { label: 'Save Results', action: onSave, disabled: !hasResult },
      { divider: true },
      { label: 'Save As...', action: onSave, disabled: !hasResult },
      { label: 'Print Report', action: onPrint, disabled: !hasResult },
    ],
    New: newMenuItems,
    Edit: [
      { label: 'Clear Student Info', action: () => onStudentInfoUpdate({ name: '', regNo: '', program: '', year: '', semester: '', courseCode: '', examDate: '' }) },
      { label: 'Clear Results', action: onClearResult, disabled: !hasResult },
      { divider: true },
      { label: 'Reset All', action: onNew },
    ],
    Course: (() => {
      const codeList = Array.from(new Set(recentCourses));
      return codeList.length > 0
        ? [...codeList.map(code => ({ label: code, action: () => onStudentInfoUpdate({ courseCode: code }), active: studentInfo.courseCode === code })), { divider: true }, { label: 'Add New Course...', action: onNewCourse }]
        : [{ label: 'No courses yet — add one below', disabled: true }, { divider: true }, { label: 'Add New Course...', action: onNewCourse }];
    })(),
    'Year of Study': YEARS_OF_STUDY.map(yr => ({ label: yr, action: () => onStudentInfoUpdate({ year: yr }), active: studentInfo.year === yr })),
    Semester: SEMESTERS.map(sem => ({ label: sem, action: () => onStudentInfoUpdate({ semester: sem }), active: studentInfo.semester === sem })),
  };

  const menuNames = ['File', 'New', 'Edit', 'Course', 'Year of Study', 'Semester'];

  return (
    <div className="h-10 bg-sidebar border-b border-gray-800 flex items-center px-4 gap-4 select-none">
      <div className="flex items-center gap-1.5 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <img src={logo} alt="Logo" className="w-18 h-8 object-contain" />
        <div className="flex gap-0.5 text-[11px] font-medium text-gray-400 ml-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {menuNames.map(name => (
            <button key={name} onClick={(e) => handleMenuClick(name, e)} className={`px-2 py-1 rounded transition-colors ${activeMenu?.name === name ? 'text-white bg-white/10' : 'hover:text-white hover:bg-white/5'}`}>
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex justify-center">
        <div className="relative w-full max-w-lg" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Search className="absolute left-3 top-1.5 text-gray-500" size={12} />
          <input
            type="text"
            placeholder="Search actions, students, or courses"
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              setSearchQuery(value);
              onSearchTermChange(value);
              setShowSearchResults(value.trim().length > 0);
            }}
            onFocus={() => { if (searchQuery.trim()) setShowSearchResults(true); }}
            className="w-full bg-[#252526] border border-[#3e3e42] rounded-md py-1 pl-9 pr-3 text-[11px] focus:border-accent-blue focus:outline-none transition-all text-ink"
          />
          <AnimatePresence>
            {showSearchResults && <SearchDropdown query={searchQuery} actions={matchedActions} historyResults={matchedHistory} onSelectAction={handleSelectSearchAction} onSelectHistory={handleSelectSearchHistory} onClose={() => setShowSearchResults(false)} />}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button onClick={isLoggedIn ? onLogout : onLogin} className="px-3 py-1 bg-gray-700 text-white text-[11px] font-bold rounded-md hover:bg-gray-600 hover:scale-105 hover:shadow-xl active:scale-95 transition-all duration-150 shadow-lg flex items-center gap-1.5 cursor-pointer">
          {isLoggedIn ? <LogOut size={12} /> : <LogIn size={12} />}
          {isLoggedIn ? 'Logout' : 'Login'}
        </button>
        <button onClick={onToggleYaza} className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all duration-150 flex items-center gap-1.5 shadow-lg cursor-pointer ${isYazaOpen ? 'bg-accent-blue text-white scale-105 shadow-accent-blue/30' : 'bg-gray-700 text-white hover:bg-gray-600 hover:scale-105 hover:shadow-xl active:scale-95'}`}>
          <Bot size={12} /> Yaza AI
        </button>
        <button onClick={onBatch} className="px-3 py-1 bg-accent-blue text-white text-[11px] font-bold rounded-md hover:bg-blue-600 hover:scale-105 hover:shadow-xl active:scale-95 transition-all duration-150 shadow-lg flex items-center gap-1.5 cursor-pointer">
          <Layers size={12} /> Batch
        </button>
        <button onClick={onRefresh} className="px-3 py-1 bg-yellow-600 text-white text-[11px] font-bold rounded-md hover:bg-yellow-500 hover:scale-105 hover:shadow-xl active:scale-95 transition-all duration-150 shadow-lg flex items-center gap-1.5 cursor-pointer">
          <RotateCw size={10} /> Refresh
        </button>
        <button onClick={onSettings} className="px-3 py-1 bg-accent-blue text-white text-[11px] font-bold rounded-md hover:bg-blue-600 hover:scale-105 hover:shadow-xl active:scale-95 transition-all duration-150 shadow-lg flex items-center gap-1 cursor-pointer">
          <SlidersHorizontal size={10} /> Settings
        </button>
      </div>

      <AnimatePresence>
        {activeMenu && <Dropdown key={activeMenu.name} x={activeMenu.x} items={menus[activeMenu.name]} onClose={closeMenu} wide={activeMenu.name === 'New'} />}
        {showSettings && <SettingsDropdown key="settings" onClose={() => setShowSettings(false)} />}
      </AnimatePresence>
    </div>
  );
};
