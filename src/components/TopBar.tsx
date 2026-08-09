import logo from '../assets/logo.png';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, SlidersHorizontal, RotateCw, Bot, Layers, FolderOpen, LogIn, LogOut, LayoutGrid, Zap, PenLine, Clock, User as UserIcon, Command } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StudentInfo, HistoryRecord, CourseSession, ActiveView } from '../types';

interface TopBarProps {
  onNew: () => void;
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
  onShowOldSessions: () => void; // Added new prop
  schools: string[]; // Added schools prop
  departments: string[]; // Added departments prop
  onShowAddSchool: () => void; // Added new prop
  onShowAddDepartment: () => void; // Added new prop
  onSearchTermChange: (term: string) => void; // Added new prop
  isLoggedIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onToggleYaza: () => void;
  isYazaOpen: boolean;
  onViewChange: (view: ActiveView) => void;
  onProfile: () => void;
  onLoadHistoryRecord: (record: HistoryRecord) => void;
}

interface DropdownItem {
  label?: string;
  action?: () => void;
  disabled?: boolean;
  divider?: boolean;
  active?: boolean;
}

interface SearchAction {
  id: string;
  label: string;
  keywords: string;
  icon: any;
  action: () => void;
}

const SEMESTERS = ['Semester 1', 'Semester 2', 'Year 1', 'Year 2', 'Year 3', 'Year 4'];
const PROGRAMS = [
  'BSc Computer Science', 'BSc Software Engineering', 'BSc Information Technology',
  'BEng Electrical Engineering', 'BEng Civil Engineering',
  'BSc Business Administration', 'BSc Accounting & Finance',
  'BSc Nursing', 'Bachelor of Education', 'LLB Law',
  'BSc Mathematics', 'BSc Biology', 'Other'
];

const DEPARTMENTS = [
  'Computer Science & IT', 'Engineering', 'Business & Management',
  'Health Sciences', 'Education', 'Law', 'Social Sciences',
  'Natural Sciences', 'Agriculture', 'Arts & Humanities',
  'Mathematics & Statistics', 'Physics', 'Chemistry', 'Biology',
  'Psychology', 'Sociology', 'Economics', 'Political Science',
  'Architecture', 'Medicine', 'Pharmacy', 'Nursing', 'Dentistry',
  'Veterinary Science', 'Environmental Science', 'Geography', 'History',
  'Languages & Literature', 'Philosophy', 'Religious Studies'
];

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

const Dropdown = ({
  x, items, onClose
}: {
  x: number;
  items: DropdownItem[];
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

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.13 }}
      style={{ position: 'fixed', top: 40, left: x, zIndex: 9999, minWidth: 200 }}
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
            {item.label}
          </button>
        )
      )}
    </motion.div>
  );
};

const SettingsDropdown = ({ x, onClose }: { x: number; onClose: () => void }) => {
  const [status, setStatus] = useState<{ provider: string; model: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => setStatus({ provider: 'unknown', model: 'unknown' }));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
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
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 font-medium">Provider</span>
            <span className="text-[10px] font-bold text-accent-green uppercase tracking-wider">{status.provider}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 font-medium">Model</span>
            <span className="text-[10px] font-bold text-gray-300 font-mono">{status.model}</span>
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-gray-600">Loading…</p>
      )}
      <div className="mt-3 pt-3 border-t border-gray-800">
        <p className="text-[9px] text-gray-700 leading-relaxed">
          Switch providers by editing <span className="text-gray-500 font-mono">.env</span> and restarting.
        </p>
      </div>
    </motion.div>
  );
};

export const TopBar = ({
  onNew, onSave, onPrint, onClearResult, onRefresh, onSettings, onBatch,
  hasResult, studentInfo, onStudentInfoUpdate, history,
  onShowOldSessions, schools, departments, onShowAddSchool, onShowAddDepartment, onSearchTermChange,
  isLoggedIn, onLogin, onLogout, onToggleYaza, isYazaOpen,
  onViewChange, onProfile, onLoadHistoryRecord
}: TopBarProps) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeMenu, setActiveMenu] = useState<{ name: string; x: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Search dropdown state
  const [searchValue, setSearchValue] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const handleMenuClick = (name: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (activeMenu?.name === name) { setActiveMenu(null); return; }
    setShowSettings(false);
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveMenu({ name, x: rect.left });
  };

  const closeMenu = useCallback(() => setActiveMenu(null), []);

  const recentCourses = getRecentCourses(history);

  // ========== Command palette actions ==========
  const searchActions: SearchAction[] = useMemo(() => [
    { id: 'dashboard', label: 'Dashboard', keywords: 'home overview', icon: LayoutGrid, action: () => onViewChange('dashboard') },
    { id: 'grade', label: 'Grade', keywords: 'grading upload paper evaluate', icon: Zap, action: () => onViewChange('grade') },
    { id: 'remark', label: 'Remark', keywords: 'comments notes', icon: PenLine, action: () => onViewChange('remark') },
    { id: 'history', label: 'History', keywords: 'past records saved', icon: Clock, action: () => onViewChange('history') },
    { id: 'new', label: 'New Session', keywords: 'start fresh reset', icon: Layers, action: onNew },
    { id: 'save', label: 'Save Results', keywords: 'store persist', icon: Layers, action: onSave },
    { id: 'print', label: 'Print Report', keywords: 'export pdf', icon: Layers, action: onPrint },
    { id: 'refresh', label: 'Refresh', keywords: 'clear reload', icon: RotateCw, action: onRefresh },
    { id: 'settings', label: 'Settings', keywords: 'api keys provider config', icon: SlidersHorizontal, action: onSettings },
    { id: 'batch', label: 'Batch Grade', keywords: 'multiple papers bulk', icon: Layers, action: onBatch },
    { id: 'yaza', label: 'Yaza AI', keywords: 'assistant chat agent', icon: Bot, action: onToggleYaza },
    { id: 'profile', label: isLoggedIn ? 'Profile' : 'Sign In', keywords: 'account user login', icon: UserIcon, action: isLoggedIn ? onProfile : onLogin },
    { id: 'old-sessions', label: 'Load Session', keywords: 'previous course open', icon: FolderOpen, action: onShowOldSessions },
  ], [onViewChange, onNew, onSave, onPrint, onRefresh, onSettings, onBatch, onToggleYaza, isLoggedIn, onProfile, onLogin, onShowOldSessions]);

  const query = searchValue.trim().toLowerCase();

  const matchedActions = useMemo(() => {
    if (!query) return [];
    return searchActions.filter(a =>
      a.label.toLowerCase().includes(query) || a.keywords.toLowerCase().includes(query)
    ).slice(0, 5);
  }, [query, searchActions]);

  const matchedHistory = useMemo(() => {
    if (!query) return [];
    return history.filter(r =>
      (r.studentInfo?.name || '').toLowerCase().includes(query) ||
      (r.studentInfo?.regNo || '').toLowerCase().includes(query) ||
      (r.studentInfo?.courseCode || '').toLowerCase().includes(query)
    ).slice(0, 5);
  }, [query, history]);

  const hasSearchResults = matchedActions.length > 0 || matchedHistory.length > 0;

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    setShowSearchDropdown(true);
    onSearchTermChange(value);
  };

  const handleActionClick = (action: SearchAction) => {
    action.action();
    setSearchValue('');
    setShowSearchDropdown(false);
    onSearchTermChange('');
  };

  const handleHistoryClick = (record: HistoryRecord) => {
    onLoadHistoryRecord(record);
    setSearchValue('');
    setShowSearchDropdown(false);
    onSearchTermChange('');
  };

  // Close the search dropdown when clicking outside it
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const menus: Record<string, DropdownItem[]> = {
    File: [
      { label: 'New Session', action: () => { onNew(); } },
      { label: 'Load Session', action: onShowOldSessions }, // Updated menu item name
      { divider: true },
      { label: 'Save Results', action: onSave, disabled: !hasResult },
      { label: 'Print Report', action: onPrint, disabled: !hasResult },
    ],
    Edit: [
      { label: 'Clear Student Info', action: () => onStudentInfoUpdate({ name: '', regNo: '', program: '', year: '', courseCode: '', examDate: '' }) },
      { label: 'Clear Results', action: onClearResult, disabled: !hasResult },
      { divider: true },
      { label: 'Reset All', action: onNew },
    ],
    Course: recentCourses.length > 0
      ? [
        ...recentCourses.map(code => ({
          label: code,
          action: () => onStudentInfoUpdate({ courseCode: code }),
          active: studentInfo.courseCode === code
        })),
        { divider: true },
        { label: 'Add New Course...', action: () => { } }
      ]
      : [
        { label: 'No recent courses — fill the form', disabled: true },
        { divider: true },
        { label: 'Add New Course...', action: () => { } }
      ],
    Semester: [
      ...SEMESTERS.map(sem => ({
        label: sem,
        action: () => onStudentInfoUpdate({ year: sem }),
        active: studentInfo.year === sem
      })),
      { divider: true },
      { label: 'Add New Semester...', action: () => { } }
    ],
    Program: [
      ...PROGRAMS.map(prog => ({
        label: prog,
        action: () => onStudentInfoUpdate({ program: prog }),
        active: studentInfo.program === prog
      })),
      { divider: true },
      { label: 'Add New Program...', action: () => { } }
    ],
    Department: [
      ...DEPARTMENTS.map(dept => ({
        label: dept,
        action: () => {
          // Store department details separately from the student form
          localStorage.setItem('lastSelectedDepartment', dept);
        },
        active: localStorage.getItem('lastSelectedDepartment') === dept
      })),
      ...departments.map(dept => ({
        label: dept,
        action: () => {
          // Store department details separately from the student form
          localStorage.setItem('lastSelectedDepartment', dept);
        },
        active: localStorage.getItem('lastSelectedDepartment') === dept
      })),
      { divider: true },
      { label: 'Add New Department...', action: onShowAddDepartment }
    ],
  };

  const menuNames = ['File', 'Edit', 'Course', 'Semester', 'Program', 'Department'];

  return (
    <div
      className="h-10 bg-sidebar border-b border-gray-800 flex items-center px-4 gap-4 select-none"
    >
      <div className="flex items-center gap-1.5 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <img src={logo} alt="Logo" className="w-18 h-8 object-contain" />

        <div className="flex gap-0.5 text-[11px] font-medium text-gray-400 ml-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {menuNames.map(name => (
            <button
              key={name}
              onClick={(e) => handleMenuClick(name, e)}
              className={`px-2 py-1 rounded transition-colors ${activeMenu?.name === name ? 'text-white bg-white/10' : 'hover:text-white hover:bg-white/5'
                }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex justify-center">
        <div ref={searchContainerRef} className="relative w-full max-w-lg" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Search className="absolute left-3 top-1.5 text-gray-500" size={12} />
          <input
            type="text"
            placeholder="Search documents, results, or history"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => searchValue && setShowSearchDropdown(true)}
            className="w-full bg-[#252526] border border-[#3e3e42] rounded-md py-1 pl-9 pr-3 text-[11px] focus:border-accent-blue focus:outline-none transition-all text-ink"
          />

          <AnimatePresence>
            {showSearchDropdown && query && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.12 }}
                className="absolute top-full left-0 right-0 mt-1.5 bg-gray-950 border border-gray-800 rounded-xl shadow-2xl overflow-hidden z-[9999] max-h-80 overflow-y-auto"
              >
                {!hasSearchResults ? (
                  <div className="px-4 py-6 text-center text-[11px] text-gray-600">No matches found</div>
                ) : (
                  <>
                    {matchedActions.length > 0 && (
                      <div className="py-1.5">
                        <p className="px-3 pb-1 text-[9px] font-black uppercase tracking-widest text-gray-600 flex items-center gap-1.5">
                          <Command size={9} /> Actions
                        </p>
                        {matchedActions.map(a => (
                          <button
                            key={a.id}
                            onClick={() => handleActionClick(a)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-gray-300 hover:bg-white/5 hover:text-white transition-colors text-left"
                          >
                            <a.icon size={13} className="text-accent-blue shrink-0" />
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {matchedHistory.length > 0 && (
                      <div className="py-1.5 border-t border-gray-800/70">
                        <p className="px-3 pb-1 text-[9px] font-black uppercase tracking-widest text-gray-600 flex items-center gap-1.5">
                          <Clock size={9} /> History
                        </p>
                        {matchedHistory.map(r => (
                          <button
                            key={r.id}
                            onClick={() => handleHistoryClick(r)}
                            className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-[12px] text-gray-300 hover:bg-white/5 hover:text-white transition-colors text-left"
                          >
                            <span className="truncate">
                              {r.studentInfo?.name || 'Unknown Student'}
                              <span className="text-gray-600"> · {r.studentInfo?.courseCode || '—'}</span>
                            </span>
                            <span className="text-[10px] font-mono text-gray-600 shrink-0">{r.result?.grade}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={isLoggedIn ? onLogout : onLogin}
          className="px-3 py-1 bg-gray-700 text-white text-[11px] font-bold rounded-md hover:bg-gray-600 hover:scale-105 hover:shadow-xl active:scale-95 transition-all duration-150 shadow-lg flex items-center gap-1.5 cursor-pointer"
        >
          {isLoggedIn ? <LogOut size={12} /> : <LogIn size={12} />}
          {isLoggedIn ? 'Logout' : 'Login'}
        </button>
        <button
          onClick={onToggleYaza}
          className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all duration-150 flex items-center gap-1.5 shadow-lg cursor-pointer ${isYazaOpen
            ? 'bg-accent-blue text-white scale-105 shadow-accent-blue/30'
            : 'bg-gray-700 text-white hover:bg-gray-600 hover:scale-105 hover:shadow-xl active:scale-95'
            }`}
        >
          <Bot size={12} />
          Yaza AI
        </button>
        <button
          onClick={onBatch}
          className="px-3 py-1 bg-accent-blue text-white text-[11px] font-bold rounded-md hover:bg-blue-600 hover:scale-105 hover:shadow-xl active:scale-95 transition-all duration-150 shadow-lg flex items-center gap-1.5 cursor-pointer"
        >
          <Layers size={12} />
          Batch
        </button>
        <button
          onClick={onRefresh}
          className="px-3 py-1 bg-yellow-600 text-white text-[11px] font-bold rounded-md hover:bg-yellow-500 hover:scale-105 hover:shadow-xl active:scale-95 transition-all duration-150 shadow-lg flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCw size={10} />
          Refresh
        </button>
        <button
          onClick={onSettings}
          className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all duration-150 flex items-center gap-1 shadow-lg cursor-pointer ${showSettings
            ? 'bg-gray-700 text-white scale-105'
            : 'bg-accent-blue text-white hover:bg-blue-600 hover:scale-105 hover:shadow-xl active:scale-95'
            }`}
        >
          <SlidersHorizontal size={10} />
          Settings
        </button>

      </div>

      <AnimatePresence>
        {activeMenu && (
          <Dropdown key={activeMenu.name} x={activeMenu.x} items={menus[activeMenu.name]} onClose={closeMenu} />
        )}
        {showSettings && (
          <SettingsDropdown key="settings" x={0} onClose={() => setShowSettings(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};
