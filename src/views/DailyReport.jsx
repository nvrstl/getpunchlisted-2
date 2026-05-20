import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart2, Loader2, RefreshCw, Calendar, FileDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ShimmerButton } from '../components/magicui/shimmer';
import { AnimatedNumber } from '../components/magicui/animated-number';

const spring = { type: 'spring', stiffness: 300, damping: 28 };

export default function DailyReport({ fieldLogs, rfis, punchItems, contextItems = [], project = null }) {
  const todayStr    = new Date().toISOString().split('T')[0];
  const [date, setDate]     = useState(todayStr);
  const [html, setHtml]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const iframeRef           = useRef(null);

  const selectedDate = new Date(date + 'T12:00:00').toDateString();
  const logsForDate  = fieldLogs.filter(l => {
    const logDate = l.logDate
      ? new Date(l.logDate + 'T12:00:00').toDateString()
      : new Date(l.createdAt).toDateString();
    return logDate === selectedDate;
  });
  const openRFIs    = rfis.filter(r => r.status !== 'resolved');
  const pendingTasks = punchItems.filter(p => p.status !== 'completed');

  // Auto-resize iframe once it loads
  const handleIframeLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        iframeRef.current.style.height = doc.documentElement.scrollHeight + 'px';
      }
    } catch {
      // cross-origin guard — shouldn't happen with srcdoc
    }
  };

  // Re-measure when html changes (srcdoc swap)
  useEffect(() => {
    if (!html) return;
    const timer = setTimeout(handleIframeLoad, 120);
    return () => clearTimeout(timer);
  }, [html]);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setHtml('');
    try {
      const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('nl-BE', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:            formattedDate,
          logs:            logsForDate,
          rfis:            openRFIs,
          tasks:           punchItems,
          context:         contextItems,
          projectName:     project?.name     || '',
          projectLocation: project?.city     || '',
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Generatie mislukt');
      if (!json.html) throw new Error('Server stuurde geen HTML terug — herstart de server na de laatste wijzigingen.');
      setHtml(json.html);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleExportPDF = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (win) {
      win.addEventListener('load', () => {
        win.focus();
        win.print();
        // Revoke after a delay to allow print dialog to open
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      });
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <h1 className="title-xl">Dagrapport</h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">
          AI-gegenereerd werfrapport op basis van uw werfnotities en projectdata.
        </p>
      </motion.div>

      {/* Controls card */}
      <motion.div
        className="glass-card rounded-2xl p-5 mb-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.05 }}
      >
        <div className="flex items-end gap-4 flex-wrap">
          {/* Date picker */}
          <div className="flex-1 min-w-[160px]">
            <label htmlFor="report-date" className="label-caps mb-2 block">Rapportdatum</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
              <Input
                id="report-date"
                type="date"
                className="pl-9 cursor-pointer"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Mini stats */}
          <div className="flex gap-2.5 flex-wrap">
            {[
              { value: logsForDate.length,  label: 'Werfnotities' },
              { value: openRFIs.length,     label: 'Open meerwerken' },
              { value: pendingTasks.length, label: 'Openstaand' },
              { value: contextItems.length, label: 'Context' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center px-4 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] min-w-[70px]">
                <div className="text-[17px] font-bold text-[var(--text-primary)] tabular-nums leading-none">
                  <AnimatedNumber value={value} />
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          <ShimmerButton
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="px-5 py-2.5"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Genereren…</>
              : <><BarChart2 className="w-4 h-4" /> Rapport genereren</>
            }
          </ShimmerButton>
        </div>

        <AnimatePresence>
          {logsForDate.length === 0 && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2.5 rounded-xl"
            >
              Geen werfnotities voor deze datum. Het rapport wordt gebaseerd op meerwerken en takenlijstdata.
            </motion.p>
          )}
          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-xl"
            >
              {error} — Controleer of uw API-sleutel is ingesteld in .env.
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* States */}
      <AnimatePresence mode="wait">

        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={spring}
            className="text-center py-20"
          >
            <div className="relative mx-auto mb-5 w-16 h-16">
              <div className="absolute inset-0 bg-brand/15 rounded-2xl blur-xl" />
              <div className="relative w-16 h-16 bg-brand/10 rounded-2xl flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-brand animate-spin" />
              </div>
            </div>
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">Claude stelt uw rapport op…</p>
            <p className="text-[12px] text-[var(--text-tertiary)] mt-1">Dit duurt ongeveer 15–25 seconden</p>
          </motion.div>
        )}

        {!html && !loading && !error && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-20"
          >
            <div className="w-16 h-16 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <BarChart2 className="w-8 h-8 text-[var(--text-tertiary)]" />
            </div>
            <p className="text-[14px] font-medium text-[var(--text-secondary)]">Nog geen rapport gegenereerd</p>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-1">Selecteer een datum en klik op Rapport genereren</p>
          </motion.div>
        )}

        {!html && !loading && error && (
          <motion.div
            key="error-main"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card rounded-2xl p-8 text-center"
          >
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">Rapport genereren mislukt</p>
            <p className="text-[13px] text-red-600 max-w-md mx-auto">{error}</p>
          </motion.div>
        )}

        {html && !loading && (
          <motion.div
            key="report"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring}
          >
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <div className="label-caps mb-0.5">Rapport klaar</div>
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {new Date(date + 'T12:00:00').toLocaleDateString('nl-BE', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={handleGenerate}>
                  <RefreshCw className="w-3.5 h-3.5" /> Opnieuw genereren
                </Button>
                <Button
                  size="sm"
                  onClick={handleExportPDF}
                  className="bg-[var(--text-primary)] hover:bg-[var(--text-secondary)] text-white border-0"
                >
                  <FileDown className="w-3.5 h-3.5" /> PDF exporteren
                </Button>
              </div>
            </div>

            {/* iframe report */}
            <div className="rounded-2xl overflow-hidden border border-[var(--border-color)] shadow-sm">
              <iframe
                ref={iframeRef}
                srcDoc={html}
                title="Dagelijks werfrapport"
                className="w-full block border-0"
                style={{ minHeight: '600px' }}
                onLoad={handleIframeLoad}
                sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
              />
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
