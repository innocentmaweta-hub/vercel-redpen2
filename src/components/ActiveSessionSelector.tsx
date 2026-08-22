import React from 'react';
import { BookOpen, ChevronDown, Check, Plus } from 'lucide-react';
import { SemesterCourse } from './CourseSessionModal';
import { sessionIdentityKey } from '../lib/sessionStore';

interface Props {
  sessions: SemesterCourse[];
  activeSession: SemesterCourse | null;
  onSelect: (session: SemesterCourse) => void;
  onNewSession: () => void;
  disabled?: boolean;
}

function sessionTitle(session: SemesterCourse): string {
  return session.courseCode || session.customName || 'Unnamed session';
}

function sessionMeta(session: SemesterCourse): string {
  return [
    session.year,
    session.semester,
    session.academicYear,
  ].filter(Boolean).join(' · ');
}

export const ActiveSessionSelector = ({
  sessions,
  activeSession,
  onSelect,
  onNewSession,
  disabled = false,
}: Props) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const activeKey = activeSession
    ? sessionIdentityKey(activeSession)
    : '';

  return (
    <div ref={ref} className="relative min-w-[220px] max-w-[320px]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-950/80 border border-gray-800 hover:border-accent-blue/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <BookOpen size={14} className="text-accent-blue shrink-0" />
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[9px] uppercase tracking-widest font-black text-gray-600">
            Active Session
          </div>
          <div className="text-[11px] font-bold text-white truncate">
            {activeSession ? sessionTitle(activeSession) : 'No session selected'}
          </div>
          {activeSession && sessionMeta(activeSession) && (
            <div className="text-[9px] text-gray-600 truncate">
              {sessionMeta(activeSession)}
            </div>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-[10000] bg-gray-950 border border-gray-800 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800">
            <p className="text-[9px] uppercase tracking-widest font-black text-gray-600">
              Sessions
            </p>
          </div>

          <div className="max-h-[280px] overflow-y-auto p-1">
            {sessions.length === 0 ? (
              <div className="px-3 py-4 text-center text-[10px] text-gray-600">
                No saved sessions yet.
              </div>
            ) : (
              sessions.map(session => {
                const key = sessionIdentityKey(session);
                const selected = key === activeKey;

                return (
                  <button
                    key={session.id || key}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setOpen(false);
                      onSelect(session);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${selected ? 'bg-accent-blue/10' : 'hover:bg-white/5'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`text-[11px] font-bold truncate ${selected ? 'text-accent-blue' : 'text-gray-300'}`}>
                        {sessionTitle(session)}
                      </div>
                      {sessionMeta(session) && (
                        <div className="text-[9px] text-gray-600 truncate">
                          {sessionMeta(session)}
                        </div>
                      )}
                    </div>
                    {selected && <Check size={13} className="text-accent-blue shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-gray-800 p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onNewSession();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Plus size={13} />
              New Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
