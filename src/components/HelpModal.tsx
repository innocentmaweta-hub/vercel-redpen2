import React from 'react';
import { X, LayoutGrid, PenLine, Save, History } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  onClose: () => void;
}

const Step = ({ num, title, desc }: { num: string; title: string; desc: string }) => (
  <div className="flex gap-3 items-start">
    <span className="w-6 h-6 bg-accent-blue/20 border border-accent-blue/30 rounded-full flex items-center justify-center text-[10px] font-black text-accent-blue shrink-0 mt-0.5">{num}</span>
    <div>
      <p className="text-xs font-bold text-gray-300">{title}</p>
      <p className="text-[10px] text-gray-600 mt-0.5 leading-relaxed">{desc}</p>
    </div>
  </div>
);

const IconRow = ({ icon: Icon, label, desc }: { icon: any; label: string; desc: string }) => (
  <div className="flex items-center gap-3">
    <div className="w-8 h-8 bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-center shrink-0">
      <Icon size={14} className="text-gray-400" />
    </div>
    <div>
      <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{label}</p>
      <p className="text-[10px] text-gray-600">{desc}</p>
    </div>
  </div>
);

export const HelpModal = ({ onClose }: Props) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-2 h-4 bg-accent-blue rounded-full" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-300">How to Use</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          <p className="text-[10px] uppercase font-bold text-gray-600 tracking-widest mb-3">Grading Steps</p>
          <Step num="1" title="Upload Marking Scheme" desc="Click the Marking Scheme zone and upload your answer key or rubric image." />
          <Step num="2" title="Fill Student Details" desc="Enter the student's name, registration number, program, course code, and exam date." />
          <Step num="3" title="Upload Student Paper" desc="Click the Student Answer Paper zone and upload the student's exam paper image." />
          <Step num="4" title="Run AI Grading" desc="Click the blue play button. The AI will analyse the paper against the scheme and return a grade breakdown." />
          <Step num="5" title="Review & Export" desc="Review the results panel on the right. Use Export to print or download the report." />

          <div className="border-t border-gray-800 pt-4 mt-4 space-y-3">
            <p className="text-[10px] uppercase font-bold text-gray-600 tracking-widest mb-3">Sidebar Buttons</p>
            <IconRow icon={LayoutGrid} label="Dashboard" desc="Return to the main grading interface." />
            <IconRow icon={PenLine} label="Remark" desc="Write additional examiner remarks for the current student." />
            <IconRow icon={Save} label="Save Results" desc="Download the current grading result as a JSON file and save it to history." />
            <IconRow icon={History} label="History" desc="Browse previously graded and saved papers. Click any record to reload it." />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
