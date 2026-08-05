import React, { useState, useRef } from 'react';
import {
  LayoutGrid,
  PenLine,
  Save,
  History,
  HelpCircle,
  User,
  Zap
} from 'lucide-react';
import { motion } from 'motion/react';
import { ActiveView, User as UserType } from '../types';

interface SidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  onSave: () => void;
  onHelp: () => void;
  hasResult: boolean;
  user: UserType | null;
  isAutoMode: boolean;
  onProfile: () => void;
  onAutoModeToggle: () => void;
}

interface TooltipState {
  label: string;
  y: number;
}

interface SidebarItemProps {
  icon: any;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onTooltip: (state: TooltipState | null) => void;
}

const SidebarItem = ({ icon: Icon, label, active = false, disabled = false, onClick, onTooltip }: SidebarItemProps) => {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      onTooltip({ label, y: rect.top + rect.height / 2 });
    }
  };

  return (
    <div
      ref={ref}
      className="flex items-center justify-center py-2 px-3"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => onTooltip(null)}
    >
      <motion.button
        whileHover={disabled ? {} : { scale: 1.1, y: -2 }}
        whileTap={disabled ? {} : { scale: 0.95 }}
        onClick={disabled ? undefined : onClick}
        className={`relative p-3 rounded-2xl transition-all duration-300 ${disabled
          ? 'text-gray-700 cursor-not-allowed'
          : active
            ? 'bg-accent-blue text-white shadow-xl scale-105'
            : 'text-gray-400 hover:bg-white/5 hover:text-white hover:shadow-lg'
          }`}
      >
        <Icon size={22} strokeWidth={active ? 2.5 : 2} />
        {active && (
          <span className="absolute -right-0.5 -top-0.5 w-3 h-3 bg-accent-green rounded-full border-2 border-sidebar animate-pulse" />
        )}
      </motion.button>
    </div>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-2 mt-6 px-4 text-center">
    {children}
  </div>
);

export const Sidebar = ({ activeView, onViewChange, onSave, onHelp, hasResult, user, isAutoMode, onProfile, onAutoModeToggle }: SidebarProps) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  return (
    <aside className="w-[90px] h-full bg-sidebar border-r border-gray-800 flex flex-col relative">
      {tooltip && (
        <div
          className="fixed z-[9999] px-3 py-1.5 bg-gray-950/95 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest rounded-lg border border-white/10 shadow-2xl pointer-events-none"
          style={{ left: 98, top: tooltip.y - 12 }}
        >
          {tooltip.label}
        </div>
      )}

      {/* Auto Button - top section */}
      <div className="pt-3 pb-2 flex flex-col items-center">
        <SectionLabel>Auto</SectionLabel>
        <div className="px-4 mt-1">
          <button
            onClick={onAutoModeToggle}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all border ${isAutoMode
              ? 'bg-accent-blue border-accent-blue text-white shadow-lg animate-pulse'
              : 'bg-gray-800 border-accent-blue text-white hover:bg-gray-700'
              }`}
          >
            <span className="text-xl font-bold">A</span>
          </button>
        </div>
      </div>

      {/* General + Tools - centered */}
      <div className="flex-1 flex flex-col items-center justify-center gap-0">
        <SidebarItem
          icon={LayoutGrid}
          label="Dashboard"
          active={activeView === 'dashboard'}
          onClick={() => onViewChange('dashboard')}
          onTooltip={setTooltip}
        />
        <SidebarItem
          icon={Zap}
          label="Grade"
          active={activeView === 'grade'}
          onClick={() => onViewChange('grade')}
          onTooltip={setTooltip}
        />
        <SidebarItem
          icon={PenLine}
          label="Remark"
          active={activeView === 'remark'}
          onClick={() => onViewChange('remark')}
          onTooltip={setTooltip}
        />
        <div className="w-8 h-px bg-gray-800/50 my-1.5" />
        <SidebarItem
          icon={Save}
          label="Save Results"
          disabled={!hasResult}
          onClick={onSave}
          onTooltip={setTooltip}
        />
        <SidebarItem
          icon={History}
          label="History"
          active={activeView === 'history'}
          onClick={() => onViewChange('history')}
          onTooltip={setTooltip}
        />
        <SidebarItem
          icon={HelpCircle}
          label="Help"
          onClick={onHelp}
          onTooltip={setTooltip}
        />
      </div>

      {/* Profile - bottom section */}
      <div className="pb-3 pt-2 flex flex-col items-center">
        <div className="px-4">
          <button
            onClick={onProfile}
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all border overflow-hidden ${user
              ? 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20'
              : 'bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700 hover:text-white'
              }`}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltip({ label: user ? user.name : 'Sign In', y: rect.top + rect.height / 2 });
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                <User size={18} className="transition-colors" />
                <span className="text-[8px] mt-0.5 uppercase font-bold tracking-tighter transition-colors">
                  {user ? user.name.split(' ')[0] : 'Login'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
};
