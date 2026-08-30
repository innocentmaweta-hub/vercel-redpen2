import {
    Hand, Pen as PenIcon, Type, Square, Eraser, Check, X,
    Undo2, Redo2, RotateCcw, ZoomIn, ZoomOut, Maximize2, Minimize2,
    ChevronLeft, ChevronRight, Trash2, FileCheck, AlertTriangle,
} from 'lucide-react';

interface ToolButtonProps {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    activeClass?: string;
}

function ToolButton({ active, onClick, icon, label, activeClass = 'bg-accent-blue/20 text-accent-blue' }: ToolButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                active ? activeClass : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
            }`}
        >
            {icon}
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                {label}
            </span>
        </button>
    );
}

interface CanvasToolbarProps {
    activeTool: string | null;
    setActiveTool: (tool: string | null) => void;
    zoom: number;
    setZoom: (fn: (z: number) => number) => void;
    studentPaper: { base64: string; name: string } | null;
    markingScheme: { base64: string; name: string } | null;
    markingMode: 'self' | 'ai';
    isAutoMode: boolean;
    isMaximized: boolean;
    setIsMaximized: (v: boolean) => void;
    showToolOptions: boolean;
    setShowToolOptions: (v: boolean) => void;
    onUndo: () => void;
    onRedo: () => void;
    onRestart: () => void;
    onClearStudentPaper: () => void;
    onToggleMarkingMode: () => void;
}

export function CanvasToolbar({
    activeTool, setActiveTool, zoom, setZoom, studentPaper, markingScheme,
    markingMode, isAutoMode, isMaximized, setIsMaximized,
    showToolOptions, setShowToolOptions,
    onUndo, onRedo, onRestart, onClearStudentPaper, onToggleMarkingMode,
}: CanvasToolbarProps) {
    const toggle = (tool: string) => setActiveTool(activeTool === tool ? null : tool);

    return (
        <div className="h-10 border-b border-gray-800/50 flex items-center justify-between px-4 bg-sidebar/20">
            <div className="flex gap-0.5">
                <ToolButton active={activeTool === 'pan'} onClick={() => toggle('pan')} icon={<Hand size={14} />} label="Pan" />
                <ToolButton active={activeTool === 'pen'} onClick={() => toggle('pen')} icon={<PenIcon size={14} />} label="Pen" />
                <ToolButton active={activeTool === 'text'} onClick={() => toggle('text')} icon={<Type size={14} />} label="Text" />
                <ToolButton active={activeTool === 'shape'} onClick={() => toggle('shape')} icon={<Square size={14} />} label="Shape" />
                <ToolButton
                    active={activeTool === 'clear'}
                    onClick={() => toggle('clear')}
                    icon={<Eraser size={14} />}
                    label="Clear (click to erase)"
                    activeClass="bg-red-500/20 text-red-400"
                />

                <div className="w-px h-5 bg-gray-800/50 mx-1 self-center" />

                <ToolButton
                    active={activeTool === 'mark-right'}
                    onClick={() => toggle('mark-right')}
                    icon={<Check size={14} />}
                    label="Right Mark"
                    activeClass="bg-accent-green/20 text-accent-green"
                />
                <ToolButton
                    active={activeTool === 'mark-wrong'}
                    onClick={() => toggle('mark-wrong')}
                    icon={<X size={14} />}
                    label="Wrong Mark"
                    activeClass="bg-red-500/20 text-red-400"
                />

                <div className="w-px h-5 bg-gray-800/50 mx-1 self-center" />

                <ToolButton active={false} onClick={onUndo} icon={<Undo2 size={13} />} label="Undo" />
                <ToolButton active={false} onClick={onRedo} icon={<Redo2 size={13} />} label="Redo" />
                <ToolButton active={false} onClick={onRestart} icon={<RotateCcw size={13} />} label="Restart" />
            </div>

            {studentPaper && (
                <div className="flex items-center gap-1 border-x border-gray-800/50 px-2 mx-1">
                    <span className="text-[9px] text-gray-500 font-mono mr-1 w-10 text-center">
                        {Math.round(zoom * 100)}%
                    </span>

                    <ToolButton
                        active={false}
                        onClick={() => setZoom(z => Math.max(0.1, +(z - 0.1).toFixed(2)))}
                        icon={<ZoomOut size={13} />}
                        label="Zoom Out"
                    />
                    <ToolButton
                        active={false}
                        onClick={() => setZoom(z => Math.min(5, +(z + 0.1).toFixed(2)))}
                        icon={<ZoomIn size={13} />}
                        label="Zoom In"
                    />
                    <ToolButton
                        active={false}
                        onClick={() => setZoom(() => 1)}
                        icon={<span className="text-[10px] font-bold">1:1</span>}
                        label="Fit to width"
                    />
                </div>
            )}

            {!markingScheme && studentPaper && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <AlertTriangle size={10} className="text-yellow-500" />
                    <span className="text-[9px] font-bold text-yellow-500/80">
                        No scheme — AI uses general criteria
                    </span>
                </div>
            )}

            <div className="flex gap-0.5">
                {studentPaper && (
                    <ToolButton
                        active={false}
                        onClick={onClearStudentPaper}
                        icon={<Trash2 size={14} />}
                        label="Clear"
                        activeClass="hover:bg-accent-blue/20 hover:text-accent-blue"
                    />
                )}

                <button
                    onClick={() => {
                        if (!studentPaper || isAutoMode) return;
                        onToggleMarkingMode();
                    }}
                    className={`relative w-8 h-7 flex items-center justify-center rounded transition-all group ${
                        markingMode === 'self'
                            ? 'bg-accent-green/20 text-accent-green'
                            : markingMode === 'ai'
                            ? 'bg-accent-blue/20 text-accent-blue'
                            : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                    }`}
                >
                    <FileCheck size={14} />
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] bg-gray-900 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-20">
                        {markingMode === 'self' ? 'Manual Grading' : 'AI Grading'}
                    </span>
                </button>

                <ToolButton
                    active={isMaximized}
                    onClick={() => setIsMaximized(!isMaximized)}
                    icon={isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    label={isMaximized ? 'Minimize' : 'Maximize'}
                />

                <ToolButton
                    active={showToolOptions}
                    onClick={() => setShowToolOptions(!showToolOptions)}
                    icon={showToolOptions ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                    label={showToolOptions ? 'Hide Options' : 'Show Options'}
                />
            </div>
        </div>
    );
}
