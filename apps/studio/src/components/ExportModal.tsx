import { useState, type RefObject } from 'react';
import * as Icons from 'lucide-react';
import { exportToPdf, downloadMdxFile } from '@mdxkit/pdf';
import { showToast } from '../utils/toast';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  mdxContent: string;
  documentTitle?: string;
  exportRootRef: RefObject<HTMLElement | null>;
}

export function ExportModal({
  isOpen,
  onClose,
  mdxContent,
  documentTitle = 'document',
  exportRootRef,
}: ExportModalProps) {
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isMdxDownloaded, setIsMdxDownloaded] = useState(false);
  const [isPdfSuccess, setIsPdfSuccess] = useState(false);

  if (!isOpen) return null;

  const sanitizedTitle = (documentTitle || 'document')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'document';

  const handleDownloadMdx = () => {
    try {
      downloadMdxFile(mdxContent, documentTitle);
      setIsMdxDownloaded(true);
      showToast(
        'MDX File Saved',
        `File "${sanitizedTitle}.mdx" has been downloaded`,
        'success'
      );
      setTimeout(() => setIsMdxDownloaded(false), 3000);
    } catch (err) {
      console.error('Download MDX error:', err);
      showToast('Download Failed', 'Could not save MDX file', 'error');
    }
  };

  const handleCopyRaw = () => {
    navigator.clipboard.writeText(mdxContent);
    setCopied(true);
    showToast('Source Code Copied', 'MDX content copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      setIsPdfSuccess(false);

      showToast(
        'Generating A4 PDF',
        'Capturing the document as a clean white A4 PDF...',
        'info',
        3000
      );

      const exportRoot = exportRootRef.current;
      if (!exportRoot) throw new Error('PDF export preview is not available');
      await exportToPdf(exportRoot, documentTitle);

      setIsPdfSuccess(true);
      showToast(
        'PDF Export Complete!',
        `Saved "${sanitizedTitle}.pdf" to your downloads folder`,
        'success',
        5000
      );

      setTimeout(() => {
        setIsGeneratingPdf(false);
        setIsPdfSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast('PDF Generation Failed', 'Could not generate PDF document. Please try again.', 'error');
      setIsGeneratingPdf(false);
    }
  };

  const handleBrowserPrint = () => {
    onClose();
    showToast('Print Dialog', 'Opened native print window', 'info');
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Icons.Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-base leading-tight">
                Export Document
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Canvas-based A4 PDF and system printing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGeneratingPdf}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-950/30 border-b border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Icons.Sliders className="w-3.5 h-3.5 text-indigo-500" />
              Canvas-based A4 export
            </span>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              A4 White Paper Preset Active
            </span>
          </div>

        </div>

        {/* Export Options */}
        <div className="p-6 space-y-3">
          <button
            onClick={handleExportPdf}
            disabled={isGeneratingPdf}
            className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left group cursor-pointer ${
              isPdfSuccess
                ? 'border-emerald-500/80 bg-emerald-50/80 dark:bg-emerald-950/50'
                : 'border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 bg-white dark:bg-slate-950 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  isPdfSuccess
                    ? 'bg-emerald-100 dark:bg-emerald-900/80 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400'
                }`}
              >
                {isGeneratingPdf && !isPdfSuccess ? (
                  <Icons.Loader2 className="w-5 h-5 animate-spin text-rose-500" />
                ) : isPdfSuccess ? (
                  <Icons.CheckCircle2 className="w-5 h-5 text-emerald-500 animate-bounce" />
                ) : (
                  <Icons.FileText className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <span>
                    {isPdfSuccess
                      ? '✓ PDF Generated & Saved!'
                      : isGeneratingPdf
                      ? 'Converting to A4 PDF...'
                      : 'Export to PDF Document'}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold">
                    A4 PDF
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {isPdfSuccess
                    ? `Saved as ${sanitizedTitle}.pdf`
                    : 'Captures MDX as a clean white, canvas-based A4 PDF'}
                </div>
              </div>
            </div>
            {isPdfSuccess ? (
              <Icons.Check className="w-5 h-5 text-emerald-500" />
            ) : (
              <Icons.Download className="w-4 h-4 text-slate-400 group-hover:text-rose-500" />
            )}
          </button>

          <button
            onClick={handleDownloadMdx}
            disabled={isGeneratingPdf}
            className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left group cursor-pointer ${
              isMdxDownloaded
                ? 'border-emerald-500/80 bg-emerald-50/80 dark:bg-emerald-950/50'
                : 'border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 bg-white dark:bg-slate-950 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  isMdxDownloaded
                    ? 'bg-emerald-100 dark:bg-emerald-900/80 text-emerald-600 dark:text-emerald-400'
                    : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400'
                }`}
              >
                {isMdxDownloaded ? (
                  <Icons.CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Icons.FileCode className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                  {isMdxDownloaded ? '✓ MDX File Downloaded!' : 'Download as .mdx File'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {isMdxDownloaded
                    ? `Saved as ${sanitizedTitle}.mdx`
                    : 'Save raw MDX source file to your device'}
                </div>
              </div>
            </div>
            {isMdxDownloaded ? (
              <Icons.Check className="w-5 h-5 text-emerald-500" />
            ) : (
              <Icons.Download className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
            )}
          </button>

          <button
            onClick={handleCopyRaw}
            disabled={isGeneratingPdf}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 bg-white dark:bg-slate-950 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-all text-left group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                <Icons.Copy className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                  {copied ? 'Copied to Clipboard!' : 'Copy Raw Source Code'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Copy complete source text with frontmatter
                </div>
              </div>
            </div>
            {copied ? (
              <Icons.Check className="w-4 h-4 text-emerald-500" />
            ) : (
              <Icons.Copy className="w-4 h-4 text-slate-400 group-hover:text-emerald-500" />
            )}
          </button>

          <button
            onClick={handleBrowserPrint}
            disabled={isGeneratingPdf}
            className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 bg-white dark:bg-slate-950 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-all text-left group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
                <Icons.Printer className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                  System Print Dialog
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Open native browser print window
                </div>
              </div>
            </div>
            <Icons.Printer className="w-4 h-4 text-slate-400 group-hover:text-amber-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

