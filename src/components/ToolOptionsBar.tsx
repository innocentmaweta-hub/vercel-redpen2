import React from 'react';

interface ToolOptionsBarProps {
  activeTool: string | null;
  penColor: string;
  penSize: number;
  shapeColor: string;  // Add shape color prop
  shapeSize: number;   // Add shape size prop
  shapeType: 'rectangle' | 'ellipse' | 'line' | 'triangle';
  textColor: string;
  textSize: number;
  textFont: string;
  markingMode: 'none' | 'right' | 'wrong';
  markSize: number;
  markThickness: number; // New prop for mark thickness
  onPenColorChange: (color: string) => void;
  onPenSizeChange: (size: number) => void;
  onShapeColorChange: (color: string) => void;  // Add shape color change handler
  onShapeSizeChange: (size: number) => void;    // Add shape size change handler
  onShapeTypeChange: (type: 'rectangle' | 'ellipse' | 'line' | 'triangle') => void;
  onTextColorChange: (color: string) => void;
  onTextSizeChange: (size: number) => void;
  onTextFontChange: (font: string) => void;
  onMarkingModeChange: (mode: 'none' | 'right' | 'wrong') => void;
  onMarkSizeChange: (size: number) => void;
  onMarkThicknessChange: (thickness: number) => void; // New prop for mark thickness
  onInteraction?: () => void; // Callback when user interacts with options
}

export const ToolOptionsBar: React.FC<ToolOptionsBarProps> = ({
  activeTool,
  penColor,
  penSize,
  shapeColor,
  shapeSize,
  shapeType,
  textColor,
  textSize,
  textFont,
  markingMode: _markingMode,
  markSize,
  markThickness, // New prop for mark thickness
  onPenColorChange,
  onPenSizeChange,
  onShapeColorChange,
  onShapeSizeChange,
  onShapeTypeChange,
  onTextColorChange,
  onTextSizeChange,
  onTextFontChange,
  onMarkingModeChange: _onMarkingModeChange,
  onMarkSizeChange,
  onMarkThicknessChange, // New prop for mark thickness
  onInteraction,
}) => {
  // Handle interaction to reset auto-hide timer
  const handleInteraction = () => {
    onInteraction?.();
  };

  return (
    <div className="bg-card p-4 rounded-xl border border-gray-800 shadow-lg space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Pen Options */}
        {activeTool === 'pen' && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-gray-500">Pen Color</label>
              <input
                type="color"
                value={penColor}
                onChange={(e) => {
                  onPenColorChange(e.target.value);
                  handleInteraction();
                }}
                className="w-8 h-8 rounded cursor-pointer border border-gray-700"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-gray-500">Size</label>
              <input
                type="range"
                min="1"
                max="10"
                value={penSize}
                onChange={(e) => {
                  onPenSizeChange(parseInt(e.target.value));
                  handleInteraction();
                }}
                className="w-24"
              />
              <span className="text-[10px] text-gray-400 w-6">{penSize}px</span>
            </div>
          </>
        )}

        {/* Shape Options */}
        {activeTool === 'shape' && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-gray-500">Shape</label>
              <select
                value={shapeType}
                onChange={(e) => {
                  onShapeTypeChange(e.target.value as any);
                  handleInteraction();
                }}
                className="bg-sidebar border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 focus:border-accent-blue focus:outline-none"
              >
                <option value="rectangle">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="line">Line</option>
                <option value="triangle">Triangle</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-gray-500">Color</label>
              <input
                type="color"
                value={shapeColor}
                onChange={(e) => {
                  onShapeColorChange(e.target.value);
                  handleInteraction();
                }}
                className="w-8 h-8 rounded cursor-pointer border border-gray-700"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-gray-500">Size</label>
              <input
                type="range"
                min="1"
                max="10"
                value={shapeSize}
                onChange={(e) => {
                  onShapeSizeChange(parseInt(e.target.value));
                  handleInteraction();
                }}
                className="w-24"
              />
              <span className="text-[10px] text-gray-400 w-6">{shapeSize}px</span>
            </div>
          </>
        )}

        {/* Text Options */}
        {activeTool === 'text' && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-gray-500">Font</label>
              <select
                value={textFont}
                onChange={(e) => {
                  onTextFontChange(e.target.value);
                  handleInteraction();
                }}
                className="bg-sidebar border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 focus:border-accent-blue focus:outline-none"
              >
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Georgia">Georgia</option>
                <option value="Verdana">Verdana</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-gray-500">Size</label>
              <input
                type="range"
                min="10"
                max="50"
                value={textSize}
                onChange={(e) => {
                  onTextSizeChange(parseInt(e.target.value));
                  handleInteraction();
                }}
                className="w-24"
              />
              <span className="text-[10px] text-gray-400 w-8">{textSize}px</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-gray-500">Color</label>
              <input
                type="color"
                value={textColor}
                onChange={(e) => {
                  onTextColorChange(e.target.value);
                  handleInteraction();
                }}
                className="w-8 h-8 rounded cursor-pointer border border-gray-700"
              />
            </div>
          </>
        )}

        {/* Marking Options - for both old mark tool and new mark-right/mark-wrong tools */}
        {(activeTool === 'mark' || activeTool === 'mark-right' || activeTool === 'mark-wrong') && (
          <div className="border-l border-gray-700 pl-4 flex gap-2">
            {/* Size control for marks */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-gray-500">Mark Size</label>
              <input
                type="range"
                min="10"
                max="200"
                value={markSize}
                onChange={(e) => {
                  onMarkSizeChange(parseInt(e.target.value));
                  handleInteraction();
                }}
                className="w-24"
              />
              <span className="text-[10px] text-gray-400 w-8">{markSize}px</span>
            </div>

            {/* Thickness control for marks */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase text-gray-500">Mark Thickness</label>
              <input
                type="range"
                min="1"
                max="5"
                value={markThickness}
                onChange={(e) => {
                  onMarkThicknessChange(parseInt(e.target.value));
                  handleInteraction();
                }}
                className="w-24"
              />
              <span className="text-[10px] text-gray-400 w-8">{markThickness}px</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};