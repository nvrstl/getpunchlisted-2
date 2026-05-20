import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertTriangle, Info, X } from 'lucide-react';

/**
 * Global toast layer. Listens for `punchlister:toast` CustomEvents.
 * Dispatch with: window.dispatchEvent(new CustomEvent('punchlister:toast',
 *   { detail: { kind: 'success' | 'error' | 'info', text: '...' } }))
 */
export default function Toast() {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const onToast = (e) => {
      const id = Math.random().toString(36).slice(2, 9);
      const toast = {
        id,
        kind: e.detail?.kind || 'info',
        text: e.detail?.text || '',
      };
      setToasts(prev => [...prev, toast]);
      setTimeout(() => dismiss(id), 4200);
    };
    window.addEventListener('punchlister:toast', onToast);
    return () => window.removeEventListener('punchlister:toast', onToast);
  }, [dismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => {
          const tone = t.kind === 'success'
            ? { bg: '#0c7a5e', fg: '#fff', icon: Check }
            : t.kind === 'error'
              ? { bg: '#9b1d1d', fg: '#fff', icon: AlertTriangle }
              : { bg: '#280063', fg: '#fff', icon: Info };
          const Icon = tone.icon;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl shadow-brand"
              style={{ background: tone.bg, color: tone.fg, maxWidth: 360 }}
            >
              <motion.span
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.16)' }}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: [0, 1.2, 1], rotate: [-20, 6, 0] }}
                transition={{ duration: 0.45, ease: 'backOut' }}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={2.6} />
              </motion.span>
              <span className="text-[13px] font-medium leading-snug truncate">{t.text}</span>
              <button onClick={() => dismiss(t.id)}
                      className="ml-1 opacity-60 hover:opacity-100 cursor-pointer flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
