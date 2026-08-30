import { motion } from 'motion/react';
import { Play } from 'lucide-react';

interface GradeFabProps {
    onClick: () => void;
    loading: boolean;
    disabled: boolean;
    showWarning: boolean; // !markingScheme && studentPaper && markingMode === 'ai'
}

export function GradeFab({ onClick, loading, disabled, showWarning }: GradeFabProps) {
    return (
        <div className="absolute bottom-6 right-6 flex flex-col gap-2 items-end">
            <motion.button
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClick}
                disabled={disabled}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl text-white disabled:grayscale disabled:opacity-50 transition-colors ${
                    showWarning
                        ? 'bg-yellow-600 hover:bg-yellow-500 shadow-yellow-600/40'
                        : 'bg-accent-blue hover:bg-blue-600 shadow-accent-blue/40'
                }`}
            >
                {loading ? (
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                    <Play size={24} fill="currentColor" />
                )}
            </motion.button>
        </div>
    );
}
