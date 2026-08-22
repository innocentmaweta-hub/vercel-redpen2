import React from 'react';
import { Check, CloudOff, Loader2, RotateCcw } from 'lucide-react';

export type CloudSaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  state: CloudSaveState;
  onRetry?: () => void;
  label?: string;
}

export const CloudSaveStatus = ({ state, onRetry, label = 'Session' }: Props) => {
  if (state === 'idle') return null;

  if (state === 'saving') {
    return <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent-blue/10 border border-accent-blue/20 text-[9px] font-bold text-accent-blue"><Loader2 size={11} className="animate-spin" /> Saving…</div>;
  }

  if (state === 'saved') {
    return <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent-green/10 border border-accent-green/20 text-[9px] font-bold text-accent-green"><Check size={11} /> Saved</div>;
  }

  return <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-[9px] font-bold text-red-400"><CloudOff size={11} /> {label} failed <button type="button" onClick={onRetry} className="ml-0.5 inline-flex items-center gap-1 hover:text-white underline"><RotateCcw size={9} /> Retry</button></div>;
};
