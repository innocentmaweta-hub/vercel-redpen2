import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  label: string;
  hasFile: boolean;
  fileName?: string;
  onUpload: (base64: string, name: string) => void;
  description?: string;
  variant?: 'compact' | 'large';
  onZoneClick?: () => void;
  optional?: boolean;
}

export interface UploadZoneHandle {
  triggerInput: () => void;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export const UploadZone = forwardRef<UploadZoneHandle, Props>(
  ({ label, hasFile, fileName, onUpload, description, variant = 'compact', onZoneClick, optional }, ref) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadError, setUploadError] = useState('');

    useImperativeHandle(ref, () => ({
      triggerInput: () => fileInputRef.current?.click(),
    }), []);

    const processFile = (file: File) => {
      setUploadError('');

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setUploadError(`File is too large (max ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB).`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => onUpload(reader.result as string, file.name);
      reader.onerror = () => setUploadError('Failed to read the file. Please try again.');
      reader.readAsDataURL(file);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = '';
    };

    const handleZoneClick = () => {
      if (onZoneClick) {
        onZoneClick();
      } else {
        fileInputRef.current?.click();
      }
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
    };

    const isLarge = variant === 'large';

    return (
      <div className="bg-card p-6 rounded-3xl border border-gray-800 shadow-xl overflow-hidden relative group h-full flex flex-col transition-all duration-500 hover:border-gray-700 hover:shadow-2xl hover:shadow-accent-blue/5">
        <div className="flex items-center gap-2 mb-4 shrink-0 px-1">
          <motion.div
            animate={{ scale: hasFile ? [1, 1.2, 1] : 1 }}
            className={`w-2.5 h-5 rounded-full transition-all duration-300 ${hasFile
                ? 'bg-accent-green shadow-[0_0_10px_rgba(0,255,0,0.5)]'
                : optional
                  ? 'bg-yellow-500/60 shadow-[0_0_8px_rgba(234,179,8,0.3)]'
                  : 'bg-accent-blue shadow-[0_0_10px_rgba(37,99,235,0.5)]'
              }`}
          />
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 group-hover:text-gray-200 transition-colors flex-1">
            {label}
          </h2>
          {optional && !hasFile && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-yellow-500/70 border border-yellow-500/20 rounded px-1.5 py-0.5">
              Optional
            </span>
          )}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,application/pdf,text/plain"
        />

        <motion.div
          whileHover={{ scale: 1.01, borderColor: hasFile ? '#22c55e' : '#2563eb' }}
          whileTap={{ scale: 0.99 }}
          onClick={handleZoneClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`relative flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${hasFile
              ? 'border-accent-green/50 bg-accent-green/5 group-hover:bg-accent-green/10'
              : optional
                ? 'border-yellow-500/20 hover:bg-yellow-500/5 group-hover:border-yellow-500/30'
                : 'border-gray-800 hover:bg-accent-blue/5 group-hover:border-accent-blue/40'
            } ${isLarge ? 'min-h-[220px]' : 'min-h-[140px]'}`}
        >
          <AnimatePresence mode="wait">
            {hasFile ? (
              <motion.div
                key="success"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.1, opacity: 0 }}
                className="flex flex-col items-center"
              >
                <CheckCircle2 size={isLarge ? 48 : 32} className="text-accent-green mb-3" />
                <span className="text-[11px] font-mono font-bold text-accent-green uppercase max-w-[200px] truncate text-center">{fileName}</span>
                <span className="text-[9px] text-gray-500 mt-2 uppercase font-bold tracking-tighter">Click to replace</span>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center text-center p-4"
              >
                <Upload
                  size={isLarge ? 48 : 32}
                  className={`mb-3 transition-colors ${optional ? 'text-yellow-500/40 group-hover:text-yellow-500/70' : 'text-gray-600 group-hover:text-accent-blue'}`}
                />
                <span className="font-bold text-xs text-gray-400 group-hover:text-gray-300 transition-colors">
                  {description || 'Click or drop file to upload'}
                </span>
                <span className="text-[10px] text-gray-600 mt-2 uppercase font-medium">Images, PDF, or Text</span>
                {optional && !uploadError && (
                  <span className="text-[9px] text-yellow-500/50 mt-1">Can grade without this</span>
                )}
                {uploadError && (
                  <span className="text-[9px] text-red-400 mt-2 font-bold max-w-[220px]">{uploadError}</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }
);

UploadZone.displayName = 'UploadZone';
