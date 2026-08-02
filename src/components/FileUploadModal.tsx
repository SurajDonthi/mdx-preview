import { useState, useRef } from 'react';
import * as Icons from 'lucide-react';
import { SAMPLE_DOCUMENTS } from '../data/sampleMDX';

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDoc: (content: string, title?: string) => void;
}

export function FileUploadModal({ isOpen, onClose, onSelectDoc }: FileUploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileRead = (file: File) => {
    setErrorMsg(null);
    if (!file.name.match(/\.(md|mdx|txt|json)$/i)) {
      setErrorMsg('Please upload a valid .md, .mdx, .txt, or .json file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        onSelectDoc(text, file.name);
        onClose();
      }
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read file.');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileRead(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Icons.UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-base leading-tight">
                Upload or Load MDX File
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload local .md/.mdx files or pick a starter template
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          {/* File Drag and Drop Zone */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Upload Local File
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                  : 'border-slate-300 dark:border-slate-700 hover:border-indigo-500/60 bg-slate-50/50 dark:bg-slate-950/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.mdx,.txt,.json"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileRead(e.target.files[0]);
                  }
                }}
              />
              <Icons.UploadCloud className="w-10 h-10 text-indigo-500 mx-auto mb-3 animate-bounce" />
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                Click to browse or drop your .md / .mdx file here
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Supports Markdown, MDX, Plain Text, and JSON
              </p>
            </div>

            {errorMsg && (
              <p className="mt-2 text-xs text-rose-500 font-medium flex items-center gap-1">
                <Icons.AlertCircle className="w-3.5 h-3.5" />
                {errorMsg}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
            <span className="text-xs uppercase font-mono text-slate-400">Or Choose a Preset</span>
            <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
          </div>

          {/* Sample Preset Templates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SAMPLE_DOCUMENTS.map((sample) => (
              <button
                key={sample.id}
                onClick={() => {
                  onSelectDoc(sample.content, sample.title);
                  onClose();
                }}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-indigo-500 dark:hover:border-indigo-500/70 hover:shadow-md text-left transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {sample.title}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2">
                    {sample.description}
                  </p>
                </div>
                <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-900 flex items-center justify-between text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                  <span>Load Preset</span>
                  <Icons.ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
