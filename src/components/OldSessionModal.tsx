import { Search, Upload, Plus } from 'lucide-react';
import type { RedPenWorkbook } from '../types/workbook';

interface OldSessionModalProps {
    searchTerm: string;
    onSearchTermChange: (term: string) => void;
    workbooks: RedPenWorkbook[];
    activeWorkbookId: string | null;
    onSelectWorkbook: (workbook: RedPenWorkbook) => void;
    onLoadFromFile: () => void;
    onNewWorkbook: () => void;
    onClose: () => void;
}

export function OldSessionModal({
    searchTerm,
    onSearchTermChange,
    workbooks,
    activeWorkbookId,
    onSelectWorkbook,
    onLoadFromFile,
    onNewWorkbook,
    onClose,
}: OldSessionModalProps) {
    const query = searchTerm.trim().toLowerCase();
    const filteredWorkbooks = workbooks.filter((workbook) => {
        if (!query) return true;
        return `${workbook.name} ${workbook.fileName ?? ''}`.toLowerCase().includes(query);
    });

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-3xl border border-gray-800 shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
                <div className="p-6 border-b border-gray-800 bg-sidebar/50 flex items-center justify-between">
                    <h2 className="text-lg font-bold uppercase tracking-widest text-gray-400">
                        Load Workbook
                    </h2>

                    <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
                        Close
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />

                        <input
                            type="text"
                            placeholder="Search workbooks..."
                            value={searchTerm}
                            onChange={(e) => onSearchTermChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-sidebar border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-accent-blue"
                        />
                    </div>

                    {filteredWorkbooks.length > 0 ? (
                        filteredWorkbooks.map((workbook) => {
                            const isActive = workbook.id === activeWorkbookId;
                            const sheetCount = workbook.sheets?.length ?? 0;

                            return (
                                <div
                                    key={workbook.id}
                                    className={`p-4 rounded-xl border transition-colors cursor-pointer ${isActive
                                        ? 'border-accent-blue bg-accent-blue/10'
                                        : 'border-gray-800 bg-gray-900/30 hover:bg-gray-800/50'
                                    }`}
                                    onClick={() => onSelectWorkbook(workbook)}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="font-bold text-ink truncate">
                                            {workbook.name || 'Unnamed Workbook'}
                                        </div>
                                        {isActive && (
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-accent-blue shrink-0">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {sheetCount} {sheetCount === 1 ? 'course' : 'courses'}
                                        {workbook.fileName ? ` · ${workbook.fileName}` : ''}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            {workbooks.length === 0 ? 'No workbooks yet' : 'No workbooks found'}
                        </div>
                    )}

                    <div className="border-t border-gray-800 pt-4 mt-4">
                        <button
                            onClick={onLoadFromFile}
                            className="w-full bg-accent-green/20 text-accent-green py-3 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-accent-green/30 transition-all flex items-center justify-center gap-2"
                        >
                            <Upload size={16} />
                            Load from Excel File
                        </button>

                        <p className="text-xs text-gray-500 mt-2 text-center">
                            Select a saved workbook file (.xlsx)
                        </p>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-800 bg-sidebar/50">
                    <button
                        onClick={onNewWorkbook}
                        className="w-full bg-accent-blue text-white py-2 rounded-lg font-bold text-sm uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus size={16} />
                        New Workbook
                    </button>
                </div>
            </div>
        </div>
    );
}
