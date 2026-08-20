import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, CheckCircle, XCircle, Loader2, ChevronRight, Download, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GradingResult } from '../types';

interface BatchFile {
    id: string;
    name: string;
    size: number;
    base64: string;
    status: 'queued' | 'processing' | 'done' | 'error';
    result?: GradingResult;
    error?: string;
}

interface Props {
    onClose: () => void;
    markingScheme: { base64: string; name: string } | null;
    onGradeSingle: (paperBase64: string) => Promise<GradingResult>;
    onSaveAll: (results: { file: BatchFile; result: GradingResult }[]) => void;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const BatchModal = ({ onClose, markingScheme, onGradeSingle, onSaveAll }: Props) => {
    const [files, setFiles] = useState<BatchFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isGrading, setIsGrading] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [completedCount, setCompletedCount] = useState(0);
    const [showResults, setShowResults] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addFiles = useCallback(async (fileList: FileList) => {
        const newFiles: BatchFile[] = [];
        for (const file of Array.from(fileList)) {
            if (!file.type.startsWith('image/') && file.type !== 'application/pdf') continue;

            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(file);
            });

            newFiles.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: file.name,
                size: file.size,
                base64,
                status: 'queued',
            });
        }
        setFiles(prev => [...prev, ...newFiles]);
        setShowResults(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    }, [addFiles]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) addFiles(e.target.files);
        e.target.value = '';
    }, [addFiles]);

    const removeFile = useCallback((id: string) => {
        setFiles(prev => prev.filter(f => f.id !== id));
    }, []);

    const handleGradeAll = async () => {
        if (files.length === 0) return;
        setIsGrading(true);
        setCurrentIndex(0);
        setCompletedCount(0);
        setShowResults(false);

        const updated = [...files];
        for (let i = 0; i < updated.length; i++) {
            setCurrentIndex(i);
            updated[i] = { ...updated[i], status: 'processing' };
            setFiles([...updated]);

            try {
                const result = await onGradeSingle(updated[i].base64);
                updated[i] = { ...updated[i], status: 'done', result };
            } catch (err: any) {
                updated[i] = { ...updated[i], status: 'error', error: err.message || 'Grading failed' };
            }

            setCompletedCount(i + 1);
            setFiles([...updated]);
        }

        setIsGrading(false);
        setShowResults(true);
    };

    const handleSaveAll = () => {
        const successful = files.filter(f => f.status === 'done' && f.result);
        onSaveAll(successful.map(f => ({ file: f, result: f.result! })));
    };

    const progress = files.length ? Math.round((completedCount / files.length) * 100) : 0;

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
                className="bg-card border border-gray-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-4 bg-accent-blue rounded-full" />
                        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-300">Batch Grading</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    {/* Drop Zone */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${isDragging
                            ? 'border-accent-blue bg-accent-blue/5 scale-[1.02]'
                            : 'border-gray-700 hover:border-gray-600 bg-gray-900/20'
                            }`}
                    >
                        <Upload size={28} className={`mx-auto mb-2 ${isDragging ? 'text-accent-blue' : 'text-gray-600'}`} />
                        <p className="text-[12px] font-bold text-gray-400">
                            {isDragging ? 'Drop files here' : 'Upload student papers'}
                        </p>
                        <p className="text-[10px] text-gray-600 mt-1">Supports images & PDFs (multiple files)</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/*,.pdf"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                    </div>

                    {/* File List */}
                    {files.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                    {files.length} file{files.length > 1 ? 's' : ''}
                                </span>
                                {showResults && (
                                    <span className="text-[10px] text-accent-green font-bold">
                                        {files.filter(f => f.status === 'done').length} completed
                                    </span>
                                )}
                            </div>

                            <AnimatePresence>
                                {files.map(file => (
                                    <motion.div
                                        key={file.id}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 8 }}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${file.status === 'done'
                                            ? 'border-accent-green/20 bg-accent-green/5'
                                            : file.status === 'error'
                                                ? 'border-red-500/20 bg-red-500/5'
                                                : file.status === 'processing'
                                                    ? 'border-accent-blue/20 bg-accent-blue/5'
                                                    : 'border-gray-800 bg-gray-900/30'
                                            }`}
                                    >
                                        <FileText size={16} className="text-gray-500 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-medium text-gray-300 truncate">{file.name}</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] text-gray-600">{formatSize(file.size)}</span>
                                                {file.result && (
                                                    <>
                                                        <span className="text-[9px] text-gray-700">·</span>
                                                        <span className="text-[9px] font-bold" style={{ color: file.result.grade?.startsWith('A') ? '#34d399' : file.result.grade?.startsWith('B') ? '#60a5fa' : file.result.grade?.startsWith('C') ? '#fbbf24' : '#f87171' }}>
                                                            {file.result.grade}
                                                        </span>
                                                        <span className="text-[9px] text-gray-600">{file.result.total_score}</span>
                                                    </>
                                                )}
                                                {file.error && (
                                                    <span className="text-[9px] text-red-400">{file.error}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {file.status === 'queued' && !isGrading && (
                                                <button
                                                    onClick={() => removeFile(file.id)}
                                                    className="p-1 text-gray-600 hover:text-red-400 rounded transition-colors"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                            {file.status === 'processing' && (
                                                <Loader2 size={14} className="text-accent-blue animate-spin" />
                                            )}
                                            {file.status === 'done' && (
                                                <CheckCircle size={14} className="text-accent-green" />
                                            )}
                                            {file.status === 'error' && (
                                                <XCircle size={14} className="text-red-400" />
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* Progress Bar */}
                    {isGrading && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-500 font-medium">
                                    Grading {currentIndex + 1} of {files.length}...
                                </span>
                                <span className="text-[10px] font-bold text-accent-blue">{progress}%</span>
                            </div>
                            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className="h-full bg-accent-blue rounded-full"
                                />
                            </div>
                        </div>
                    )}

                    {/* Results Summary */}
                    {showResults && (
                        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Results Summary</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[10px]">
                                    <thead>
                                        <tr className="text-gray-600 border-b border-gray-800">
                                            <th className="text-left py-2 pr-2 font-medium">File</th>
                                            <th className="text-left py-2 px-2 font-medium">Student</th>
                                            <th className="text-center py-2 px-2 font-medium">Score</th>
                                            <th className="text-center py-2 px-2 font-medium">Grade</th>
                                            <th className="text-center py-2 pl-2 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {files.map((file) => (
                                            <tr key={file.id} className="border-b border-gray-800/50">
                                                <td className="py-2 pr-2 text-gray-400 truncate max-w-[120px]">{file.name}</td>
                                                <td className="py-2 px-2 text-gray-300">
                                                    {file.result?.extracted_info?.name || '—'}
                                                </td>
                                                <td className="py-2 px-2 text-center text-gray-300">{file.result?.total_score || '—'}</td>
                                                <td className="py-2 px-2 text-center font-bold"
                                                    style={{ color: file.result?.grade?.startsWith('A') ? '#34d399' : file.result?.grade?.startsWith('B') ? '#60a5fa' : file.result?.grade?.startsWith('C') ? '#fbbf24' : '#f87171' }}
                                                >
                                                    {file.result?.grade || '—'}
                                                </td>
                                                <td className="py-2 pl-2 text-center">
                                                    {file.status === 'done' ? (
                                                        <CheckCircle size={10} className="text-accent-green inline" />
                                                    ) : (
                                                        <XCircle size={10} className="text-red-400 inline" />
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between p-6 border-t border-gray-800 bg-sidebar/50">
                    <span className="text-[10px] text-gray-600">
                        {markingScheme ? '✓ Scheme loaded' : 'No marking scheme (AI uses general criteria)'}
                    </span>
                    <div className="flex gap-2.5">
                        {showResults && files.some(f => f.status === 'done') && (
                            <button
                                onClick={handleSaveAll}
                                className="px-4 py-2 bg-accent-green text-white text-[11px] font-bold rounded-xl hover:bg-emerald-600 transition-all flex items-center gap-1.5 shadow-lg shadow-accent-green/20"
                            >
                                <Download size={12} />
                                Save All
                            </button>
                        )}
                        {!isGrading && files.some(f => f.status === 'queued') && (
                            <button
                                onClick={handleGradeAll}
                                className="px-4 py-2 bg-accent-blue text-white text-[11px] font-bold rounded-xl hover:bg-blue-600 transition-all flex items-center gap-1.5 shadow-lg shadow-accent-blue/20"
                            >
                                <ChevronRight size={12} />
                                Grade All ({files.filter(f => f.status === 'queued').length})
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};