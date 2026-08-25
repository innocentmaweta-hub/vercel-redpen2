import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Check,
    FileText,
    FolderOpen,
    Loader2,
    Printer,
    RefreshCw,
    X,
    ZoomIn,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
    getSavedFolder,
    isFileSystemAccessSupported,
    listSavedPdfFiles,
    pickSaveFolder,
    type SavedPdfFile,
} from '../lib/fileStorage';

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Unknown date';
    return new Date(timestamp).toLocaleString();
};

export const ResultsFilesPage = () => {
    const [files, setFiles] = useState<SavedPdfFile[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [folderName, setFolderName] = useState<string | null>(null);
    const [preview, setPreview] = useState<SavedPdfFile | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [printing, setPrinting] = useState(false);

    const loadFiles = useCallback(async () => {
        setLoading(true);
        try {
            const folder = await getSavedFolder();
            setFolderName(folder ? ((folder as any).name || 'Selected folder') : null);
            const nextFiles = await listSavedPdfFiles();
            setFiles(nextFiles);
            setSelected(current => current.filter(name => nextFiles.some(file => file.name === name)));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadFiles();
        const interval = window.setInterval(() => void loadFiles(), 3000);
        return () => window.clearInterval(interval);
    }, [loadFiles]);

    useEffect(() => {
        if (!preview) {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const file = await preview.handle.getFile();
                const url = URL.createObjectURL(file);
                if (cancelled) {
                    URL.revokeObjectURL(url);
                    return;
                }
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(url);
            } catch (error) {
                console.error('Failed to preview PDF:', error);
                setPreviewUrl(null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [preview]);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const selectedFiles = useMemo(
        () => files.filter(file => selected.includes(file.name)),
        [files, selected]
    );

    const toggleSelected = (name: string) => {
        setSelected(current =>
            current.includes(name)
                ? current.filter(item => item !== name)
                : [...current, name]
        );
    };

    const selectAll = () => {
        setSelected(selected.length === files.length ? [] : files.map(file => file.name));
    };

    const openPreview = (file: SavedPdfFile) => {
        setPreview(file);
    };

    const printSingle = async (file: SavedPdfFile) => {
        try {
            const blob = await (await file.handle.getFile()).arrayBuffer();
            const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const popup = window.open('', '_blank', 'width=1100,height=800');
            if (!popup) {
                URL.revokeObjectURL(url);
                alert('Please allow pop-ups for RedPen to print PDF results.');
                return;
            }

            popup.document.write(`<!doctype html><html><head><title>${file.name}</title><style>html,body{margin:0;height:100%;background:#111}embed{width:100%;height:100%;border:0}</style></head><body><embed src="${url}" type="application/pdf"></body></html>`);
            popup.document.close();
            window.setTimeout(() => {
                popup.focus();
                popup.print();
                window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            }, 1200);
        } catch (error) {
            console.error('Failed to print PDF:', error);
            alert('Could not open this PDF for printing.');
        }
    };

    const printSelected = async () => {
        if (!selectedFiles.length || printing) return;
        setPrinting(true);

        const urls: string[] = [];
        try {
            const items = await Promise.all(
                selectedFiles.map(async file => {
                    const blob = await file.handle.getFile();
                    const url = URL.createObjectURL(blob);
                    urls.push(url);
                    return { name: file.name, url };
                })
            );

            const popup = window.open('', '_blank', 'width=1200,height=900');
            if (!popup) {
                alert('Please allow pop-ups for RedPen to batch print PDF results.');
                urls.forEach(url => URL.revokeObjectURL(url));
                return;
            }

            popup.document.write(`<!doctype html><html><head><title>RedPen Batch Print</title><style>@page{margin:0}html,body{margin:0;padding:0;background:#fff}section{width:100%;height:100vh;page-break-after:always;break-after:page}embed{width:100%;height:100%;border:0}h1{font:700 16px Arial;padding:20px;margin:0}</style></head><body>${items.map(item => `<section><embed src="${item.url}" type="application/pdf"></section>`).join('')}</body></html>`);
            popup.document.close();

            window.setTimeout(() => {
                popup.focus();
                popup.print();
                window.setTimeout(() => urls.forEach(url => URL.revokeObjectURL(url)), 60000);
                setPrinting(false);
            }, Math.max(1800, selectedFiles.length * 700));
        } catch (error) {
            console.error('Batch PDF print failed:', error);
            urls.forEach(url => URL.revokeObjectURL(url));
            setPrinting(false);
            alert('Could not prepare the selected PDFs for printing.');
        }
    };

    const chooseFolder = async () => {
        const folder = await pickSaveFolder();
        if (folder) {
            setFolderName((folder as any).name || 'Selected folder');
            await loadFiles();
        }
    };

    if (!isFileSystemAccessSupported()) {
        return (
            <div className="flex-1 p-6 overflow-auto">
                <div className="max-w-4xl mx-auto mt-10 bg-card border border-gray-800 rounded-3xl p-8 text-center">
                    <FolderOpen size={34} className="mx-auto mb-4 text-gray-500" />
                    <h2 className="text-lg font-black text-white">Saved Results</h2>
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                        Your browser does not support direct folder syncing. PDFs can still be downloaded normally, but RedPen cannot browse the browser's download folder.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 min-w-0 flex flex-col p-5 overflow-hidden">
            <div className="flex items-center justify-between gap-4 mb-5 shrink-0">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-5 bg-accent-blue rounded-full" />
                        <h1 className="text-lg font-black text-white">Saved Results</h1>
                    </div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
                        PDFs saved to {folderName || 'no folder selected'}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={chooseFolder} className="px-3 py-2 rounded-xl border border-gray-700 text-gray-300 hover:bg-gray-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                        <FolderOpen size={13} />
                        {folderName ? 'Change Folder' : 'Select Folder'}
                    </button>
                    <button onClick={() => void loadFiles()} className="w-9 h-9 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 flex items-center justify-center" title="Refresh">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {!folderName ? (
                <div className="flex-1 flex items-center justify-center bg-card border border-gray-800 rounded-3xl">
                    <div className="text-center max-w-md px-6">
                        <FolderOpen size={42} className="mx-auto mb-4 text-accent-blue" />
                        <h2 className="text-sm font-black text-white uppercase tracking-widest">Select your results folder</h2>
                        <p className="text-xs text-gray-500 mt-2 leading-relaxed">Choose the same folder used by Settings → Save To. Every PDF saved by RedPen will automatically appear here.</p>
                        <button onClick={chooseFolder} className="mt-5 px-5 py-3 bg-accent-blue text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600">
                            Select Folder
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between bg-card border border-gray-800 rounded-2xl px-4 py-3 mb-3 shrink-0">
                        <div className="flex items-center gap-3">
                            <button onClick={selectAll} className={`w-6 h-6 rounded-md border flex items-center justify-center ${selected.length === files.length && files.length ? 'bg-accent-blue border-accent-blue text-white' : 'border-gray-700 text-transparent'}`}>
                                <Check size={13} />
                            </button>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                {selected.length ? `${selected.length} selected` : `${files.length} PDF${files.length === 1 ? '' : 's'}`}
                            </span>
                        </div>

                        <button
                            onClick={() => void printSelected()}
                            disabled={!selectedFiles.length || printing}
                            className="px-4 py-2 bg-accent-blue text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                            {printing ? 'Preparing...' : 'Batch Print'}
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto bg-card border border-gray-800 rounded-3xl p-3">
                        {loading && !files.length ? (
                            <div className="h-full flex items-center justify-center text-gray-500"><Loader2 size={22} className="animate-spin" /></div>
                        ) : !files.length ? (
                            <div className="h-full flex flex-col items-center justify-center text-center">
                                <FileText size={40} className="text-gray-700 mb-3" />
                                <p className="text-sm font-bold text-gray-400">No saved PDF results yet</p>
                                <p className="text-[10px] text-gray-600 mt-1">Save a graded result and it will appear here automatically.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                                {files.map(file => {
                                    const checked = selected.includes(file.name);
                                    return (
                                        <motion.div key={file.name} layout className={`group border rounded-2xl p-3 flex items-center gap-3 transition-all ${checked ? 'border-accent-blue/50 bg-accent-blue/5' : 'border-gray-800 hover:border-gray-700 bg-sidebar/20'}`}>
                                            <button onClick={() => toggleSelected(file.name)} className={`w-6 h-6 shrink-0 rounded-md border flex items-center justify-center ${checked ? 'bg-accent-blue border-accent-blue text-white' : 'border-gray-700 text-transparent'}`}>
                                                <Check size={13} />
                                            </button>
                                            <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center shrink-0"><FileText size={18} /></div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[11px] font-bold text-gray-200 truncate" title={file.name}>{file.name}</p>
                                                <p className="text-[9px] text-gray-600 mt-1">{formatSize(file.size)} • {formatDate(file.modified)}</p>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                                                <button onClick={() => openPreview(file)} className="w-8 h-8 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 flex items-center justify-center" title="Preview"><ZoomIn size={14} /></button>
                                                <button onClick={() => void printSingle(file)} className="w-8 h-8 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 flex items-center justify-center" title="Print"><Printer size={14} /></button>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}

            {preview && previewUrl && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => setPreview(null)}>
                    <div className="w-full h-full max-w-6xl bg-card border border-gray-800 rounded-3xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="h-12 px-4 border-b border-gray-800 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2 min-w-0"><FileText size={15} className="text-red-400" /><span className="text-[11px] font-bold text-gray-300 truncate">{preview.name}</span></div>
                            <button onClick={() => setPreview(null)} className="w-8 h-8 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 flex items-center justify-center"><X size={16} /></button>
                        </div>
                        <iframe title={preview.name} src={previewUrl} className="flex-1 w-full bg-white" />
                    </div>
                </div>
            )}
        </div>
    );
};
