import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Loader2, Bot, User as UserIcon, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StudentInfo, GradingResult, ActiveView } from '../types';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface YazaAction {
  name: string;
  args: Record<string, any>;
}

interface Props {
  onClose: () => void;
  authHeaders: () => Record<string, string>;
  isLoggedIn: boolean;
  onRequireLogin: () => void;
  sessionKey: string;
  // App state needed for context
  studentInfo: StudentInfo;
  result: GradingResult | null;
  activeView: ActiveView;
  hasStudentPaper: boolean;
  // Action handlers — the panel calls these to actually do things
  onUpdateStudentInfo: (updates: Partial<StudentInfo>) => void;
  onTriggerGrading: (mode: 'ai' | 'manual') => void;
  onNavigateView: (view: ActiveView) => void;
  onEditResultFeedback: (feedback: string) => void;
  onEditQuestionScore: (questionNumber: number, score?: string, feedback?: string) => void;
  onSaveResults: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
}

export const YazaPanel = ({
  onClose,
  authHeaders,
  isLoggedIn,
  onRequireLogin,
  sessionKey,
  studentInfo,
  result,
  activeView,
  hasStudentPaper,
  onUpdateStudentInfo,
  onTriggerGrading,
  onNavigateView,
  onEditResultFeedback,
  onEditQuestionScore,
  onSaveResults,
  onOpenSettings,
  onOpenProfile,
}: Props) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Resizable width via left-edge drag
  const MIN_WIDTH = 390;
  const [panelWidth, setPanelWidth] = useState(MIN_WIDTH);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      // Panel is anchored to the right edge (right-4 = 16px), so width = distance from cursor to that right edge
      const newWidth = window.innerWidth - e.clientX - 16;
      const maxWidth = window.innerWidth - 32; // leave a little margin on the far left
      setPanelWidth(Math.min(Math.max(newWidth, MIN_WIDTH), maxWidth));
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startDragging = () => {
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Auto-growing textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX_TEXTAREA_HEIGHT = 200; // px — matches roughly ~8-9 lines before scrolling kicks in

  const autoResizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto'; // reset first so shrinking works too
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  };

  useEffect(() => {
    autoResizeTextarea();
  }, [input]);

  // Load prior chat history whenever the panel opens or the session changes
  useEffect(() => {
    if (!isLoggedIn) {
      setMessages([]);
      setLoadingHistory(false);
      return;
    }
    setLoadingHistory(true);
    (async () => {
      try {
        const res = await fetch(`/api/yaza/history?sessionKey=${encodeURIComponent(sessionKey)}`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.history)) {
            setMessages(data.history.map((m: any) => ({ role: m.role, text: m.text })));
          } else {
            setMessages([]);
          }
        }
      } catch (err) {
        console.error('Failed to load Yaza history:', err);
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [sessionKey, isLoggedIn]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Execute a tool call returned by Gemini against real app handlers
  const executeAction = (action: YazaAction): string => {
    switch (action.name) {
      case 'update_student_info':
        onUpdateStudentInfo(action.args);
        return `Updated student info.`;
      case 'trigger_grading':
        if (!hasStudentPaper) return `No student paper is uploaded yet, so I can't grade.`;
        onTriggerGrading(action.args.mode === 'manual' ? 'manual' : 'ai');
        return `Triggered ${action.args.mode === 'manual' ? 'manual' : 'AI'} grading.`;
      case 'navigate_view':
        onNavigateView(action.args.view);
        return `Switched to ${action.args.view}.`;
      case 'edit_result_feedback':
        if (!result) return `There's no grading result to edit yet.`;
        onEditResultFeedback(action.args.feedback);
        return `Updated the feedback.`;
      case 'edit_question_score':
        if (!result) return `There's no grading result to edit yet.`;
        onEditQuestionScore(action.args.questionNumber, action.args.score, action.args.feedback);
        return `Updated question ${action.args.questionNumber}.`;
      case 'save_results':
        if (!result) return `There's no grading result to save yet.`;
        onSaveResults();
        return `Saved to history.`;
      case 'open_settings':
        onOpenSettings();
        return `Opened settings.`;
      case 'open_profile':
        onOpenProfile();
        return `Opened your profile.`;
      default:
        return '';
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: 'user', text: trimmed };
    setInput('');

    if (!isLoggedIn) {
      setMessages((prev) => [
        ...prev,
        userMsg,
        { role: 'assistant', text: 'Please log in to use Yaza AI.' },
      ]);
      onRequireLogin();
      return;
    }

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const appContext = {
        activeView,
        studentInfo,
        hasStudentPaper,
        result: result
          ? {
              totalScore: result.totalScore,
              grade: result.grade,
              feedback: result.feedback,
              questions: result.questions,
            }
          : null,
      };

      const res = await fetch('/api/yaza/chat', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          message: trimmed,
          appContext,
          conversationHistory: messages.slice(-10), // last few turns for context
          sessionKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', text: data.message || 'Something went wrong.' }]);
        return;
      }

      // Execute any actions Gemini requested
      let actionSummaries: string[] = [];
      if (Array.isArray(data.actions) && data.actions.length > 0) {
        actionSummaries = data.actions.map((a: YazaAction) => executeAction(a));
      }

      const replyText = data.reply?.trim();
      const combined = [replyText, ...actionSummaries.filter(Boolean)].filter(Boolean).join('\n\n');

      setMessages((prev) => [...prev, { role: 'assistant', text: combined || 'Done.' }]);
    } catch (err) {
      console.error('Yaza chat failed:', err);
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Failed to reach Yaza AI. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!isLoggedIn) return;
    if (!window.confirm('Clear this session\'s Yaza AI conversation? This cannot be undone.')) return;

    try {
      await fetch(`/api/yaza/history?sessionKey=${encodeURIComponent(sessionKey)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setMessages([]);
    } catch (err) {
      console.error('Failed to clear Yaza history:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      initial={{ x: 360, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 360, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      style={{ width: panelWidth }}
      className="fixed top-10 right-4 bottom-4 bg-card rounded-3xl border border-gray-800 shadow-xl z-[9998] flex flex-col overflow-hidden"
    >
      {/* Drag handle — left edge */}
      <div
        onMouseDown={startDragging}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent-blue/30 active:bg-accent-blue/50 transition-colors z-10"
        title="Drag to resize"
      />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-accent-blue/10 rounded-lg flex items-center justify-center">
            <Sparkles size={14} className="text-accent-blue" />
          </div>
          <div>
            <p className="text-[12px] font-black text-white">Yaza AI</p>
            <p className="text-[9px] text-gray-500">Chat &amp; take actions in the app</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClearHistory}
            title="Clear conversation"
            className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-colors">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loadingHistory ? (
          <div className="flex items-center justify-center h-full text-gray-600">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="bg-card h-full rounded-3xl border border-gray-800 shadow-xl flex flex-col items-center justify-center p-8 text-center border-dashed">
            <Sparkles size={48} className="text-gray-800 mb-4" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-600">Start a Conversation</h3>
            <p className="text-[10px] text-gray-700 mt-2 uppercase font-medium">
              Ask me anything, or tell me to do something — like "grade this" or "change the name"
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-gray-800' : 'bg-accent-blue/10'}`}>
                {m.role === 'user' ? <UserIcon size={12} className="text-gray-400" /> : <Bot size={12} className="text-accent-blue" />}
              </div>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-accent-blue text-white' : 'bg-gray-900 text-gray-300 border border-gray-800'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-lg bg-accent-blue/10 flex items-center justify-center shrink-0">
              <Bot size={12} className="text-accent-blue" />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl px-3 py-2">
              <Loader2 size={12} className="animate-spin text-gray-500" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-800 shrink-0">
        <div className="flex items-end gap-2 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 focus-within:border-accent-blue transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Yaza AI..."
            rows={1}
            style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
            className="flex-1 bg-transparent text-[12px] text-white placeholder:text-gray-600 focus:outline-none resize-none overflow-y-auto"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="p-1.5 rounded-lg bg-accent-blue text-white disabled:bg-gray-800 disabled:text-gray-600 transition-colors shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
