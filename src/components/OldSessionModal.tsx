import { Search, Upload, Plus } from 'lucide-react';
import { SemesterCourse } from './CourseSessionModal';

interface OldSessionModalProps {
    searchTerm: string;
    onSearchTermChange: (term: string) => void;
    filteredSessions: SemesterCourse[];
    onSelectSession: (session: SemesterCourse) => void;
    onLoadFromFile: () => void;
    onNewSession: () => void;
    onClose: () => void;
}

export function OldSessionModal({
    searchTerm, onSearchTermChange, filteredSessions,
    onSelectSession, onLoadFromFile, onNewSession, onClose,
}: OldSessionModalProps) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-3xl border border-gray-800 shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
                <div className="p-6 border-b border-gray-800 bg-sidebar/50 flex items-center justify-between">
                    <h2 className="text-lg font-bold uppercase tracking-widest text-gray-400">
                        Load Session
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
                            placeholder="Search sessions..."
                            value={searchTerm}
                            onChange={(e) => onSearchTermChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-sidebar border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-accent-blue"
                        />
                    </div>

                    {filteredSessions.length > 0 ? (
                        filteredSessions.map((session, index) => (
                            <div
                                key={index}
                                className="p-4 bg-gray-900/30 rounded-xl border border-gray-800 hover:bg-gray-800/50 transition-colors cursor-pointer"
                                onClick={() => onSelectSession(session)}
                            >
                                <div className="font-bold text-ink">{session.courseCode}</div>
                                <div className="text-sm text-gray-400">{session.courseName || 'No course name'}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                    Program: {session.program || 'N/A'} | Year: {session.year || 'N/A'}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            No sessions found
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
                            Select a saved grading session file (.xlsx)
                        </p>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-800 bg-sidebar/50">
                    <button
                        onClick={onNewSession}
                        className="w-full bg-accent-blue text-white py-2 rounded-lg font-bold text-sm uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus size={16} />
                        New Session
                    </button>
                </div>
            </div>
        </div>
    );
}
