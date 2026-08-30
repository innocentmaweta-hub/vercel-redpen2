import { AlertTriangle } from 'lucide-react';

interface UpgradePromptModalProps {
    message: string;
    onUpgrade: () => void;
    onAddApiKey: () => void;
    onCancel: () => void;
}

export function UpgradePromptModal({ message, onUpgrade, onAddApiKey, onCancel }: UpgradePromptModalProps) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-3xl border border-gray-800 shadow-xl w-full max-w-sm">
                <div className="p-6 border-b border-gray-800 bg-sidebar/50 flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-500/10 rounded-xl flex items-center justify-center shrink-0">
                        <AlertTriangle size={18} className="text-yellow-500" />
                    </div>

                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-300">
                            Grading Limit Reached
                        </h2>
                    </div>
                </div>

                <div className="p-6">
                    <p className="text-[13px] text-gray-400 leading-relaxed">
                        {message}
                    </p>
                </div>

                <div className="p-4 border-t border-gray-800 bg-sidebar/50 flex flex-col gap-2">
                    <button
                        onClick={onUpgrade}
                        className="w-full bg-yellow-600 hover:bg-yellow-500 text-white py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-all"
                    >
                        Upgrade Plan
                    </button>

                    <button
                        onClick={onAddApiKey}
                        className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-all"
                    >
                        Add My Own API Key
                    </button>

                    <button
                        onClick={onCancel}
                        className="w-full text-gray-500 hover:text-gray-300 py-2 text-xs font-bold uppercase tracking-widest transition-all"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
