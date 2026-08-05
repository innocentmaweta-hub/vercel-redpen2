import React from 'react';
import { RotateCcw, AlertTriangle, X } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
    onConfirm: () => void;
    onCancel: () => void;
}

export const RefreshModal = ({ onConfirm, onCancel }: Props) => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={onCancel}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-card border border-gray-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-4 bg-yellow-500 rounded-full" />
                        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-300">Refresh App</h2>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="w-14 h-14 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-center">
                            <RotateCcw size={28} className="text-yellow-500" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-200">Refresh Application?</p>
                            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                                This will clear all current work, reset all inputs, and reload the app to its initial state.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-2.5 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                        <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                        <p className="text-[10px] font-medium text-red-400 leading-relaxed">
                            Any unsaved grading results, uploaded files, and student information will be permanently lost.
                        </p>
                    </div>

                    <div className="flex gap-2.5">
                        <button
                            onClick={onCancel}
                            className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className="flex-1 py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white text-[11px] font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg"
                        >
                            <RotateCcw size={12} />
                            Refresh
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};
