import { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeToast, ToastMessage } from '../utils/toast';

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToast((newToast) => {
      setToasts((prev) => [...prev, newToast]);

      if (newToast.duration !== 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
        }, newToast.duration || 4000);
      }
    });

    return () => unsubscribe();
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="pointer-events-auto flex items-start gap-3 p-4 rounded-2xl bg-slate-900/95 dark:bg-slate-900/95 border border-slate-700/80 shadow-2xl text-white backdrop-blur-md"
          >
            <div className="mt-0.5 shrink-0">
              {toast.type === 'success' && (
                <div className="p-1.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  <Icons.CheckCircle2 className="w-5 h-5" />
                </div>
              )}
              {toast.type === 'info' && (
                <div className="p-1.5 rounded-full bg-indigo-500/20 text-indigo-400">
                  <Icons.Download className="w-5 h-5" />
                </div>
              )}
              {toast.type === 'error' && (
                <div className="p-1.5 rounded-full bg-rose-500/20 text-rose-400">
                  <Icons.AlertCircle className="w-5 h-5" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pr-2">
              <h4 className="font-semibold text-sm text-slate-100 leading-snug">
                {toast.title}
              </h4>
              {toast.message && (
                <p className="text-xs text-slate-300 mt-0.5 leading-relaxed break-words">
                  {toast.message}
                </p>
              )}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Icons.X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
