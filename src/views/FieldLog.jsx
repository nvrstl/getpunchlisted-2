import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, Loader2, MapPin, AlertTriangle, FileText,
  Trash2, ChevronDown, Zap, Camera, X, Image as ImageIcon,
  ListTodo, Check, Upload, FileUp, ClipboardList, Tag,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { ShimmerButton } from '../components/magicui/shimmer';
import { cn } from '../lib/utils';

const spring = { type: 'spring', stiffness: 300, damping: 28 };

const TYPE_BADGE = {
  delay:    'destructive',
  safety:   'warning',
  progress: 'success',
  material: 'info',
  rfi:      'purple',
  general:  'secondary',
};

const MEERWERK_BADGE = {
  in_scope: { label: 'IN SCOPE',  className: 'bg-[#d4f7ec] text-[#075e48] border border-[#88f0d4]' },
  meerwerk: { label: 'MEERWERK',  className: 'bg-orange-100 text-orange-700 border border-orange-200' },
  twijfel:  { label: 'TWIJFEL',   className: 'bg-slate-100 text-slate-500 border border-dashed border-slate-300' },
};

function MeerwerkBadge({ classification }) {
  const cfg = MEERWERK_BADGE[classification];
  if (!cfg) return null;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

const IMPACT_CLASS = {
  none:     'text-[var(--text-tertiary)]',
  schedule: 'text-amber-500',
  cost:     'text-red-500',
  safety:   'text-orange-500',
};

async function compressImage(file, maxWidth = 1200, quality = 0.78) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxWidth / img.width, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Bulk import helpers ───────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}

function parseEntries(text, filename = '') {
  const ext = filename.split('.').pop().toLowerCase();

  if (ext === 'json') {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : [data];
    return arr.map(item => {
      const rawDate = (item.date || item.log_date || item.logDate || item.day || '').toString().trim();
      let logDate = null;
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (!isNaN(parsed)) logDate = parsed.toISOString().slice(0, 10);
      }
      return {
        rawNote: (item.raw_note || item.rawNote || item.note || item.observation || item.text || '').trim(),
        location: (item.location || item.loc || item.area || '').trim(),
        logDate,
      };
    }).filter(e => e.rawNote);
  }

  if (ext === 'csv') {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, ''));
    const noteIdx     = headers.findIndex(h => ['raw_note','note','rawnote','observation','description','text','notes'].includes(h));
    const locationIdx = headers.findIndex(h => ['location','loc','area','zone','place'].includes(h));
    const dateIdx     = headers.findIndex(h => ['date','log_date','logdate','day','when'].includes(h));
    return lines.slice(1).map(line => {
      const cols = parseCSVLine(line);
      const rawDate = (dateIdx >= 0 ? cols[dateIdx] : '').replace(/^["']|["']$/g, '').trim();
      // Normalise date to YYYY-MM-DD if possible
      let logDate = null;
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (!isNaN(parsed)) logDate = parsed.toISOString().slice(0, 10);
      }
      return {
        rawNote:  (noteIdx >= 0 ? cols[noteIdx] : cols[0] || '').replace(/^["']|["']$/g, '').trim(),
        location: (locationIdx >= 0 ? cols[locationIdx] : '').replace(/^["']|["']$/g, '').trim(),
        logDate,
      };
    }).filter(e => e.rawNote);
  }

  // .txt or paste: paragraphs (double newline) first, then single lines
  const paragraphs = text.split(/\n{2,}/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs.map(p => ({ rawNote: p, location: '' }));
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => ({ rawNote: l, location: '' }));
}

// ── Bulk Import Modal ─────────────────────────────────────────────────────────

function BulkImportModal({ onClose, onSubmit }) {
  const [step, setStep]         = useState('upload'); // upload | preview | importing
  const [entries, setEntries]   = useState([]);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [error, setError]       = useState('');
  const fileRef = useRef(null);

  const ACCEPTED = '.txt,.csv,.json';

  const loadFile = async (file) => {
    setError('');
    try {
      const text = await file.text();
      const parsed = parseEntries(text, file.name);
      if (!parsed.length) { setError('Geen vermeldingen gevonden in dit bestand. Controleer het formaat.'); return; }
      setEntries(parsed.map((e, i) => ({ ...e, _id: i })));
      setStep('preview');
    } catch (err) {
      setError(`Bestand kon niet worden gelezen: ${err.message}`);
    }
  };

  const loadPaste = () => {
    setError('');
    const parsed = parseEntries(pasteText, 'paste.txt');
    if (!parsed.length) { setError('Geen vermeldingen gevonden. Zorg dat elke notitie op een eigen regel staat of gescheiden is door een lege regel.'); return; }
    setEntries(parsed.map((e, i) => ({ ...e, _id: i })));
    setStep('preview');
  };

  const updateEntry = (id, field, value) =>
    setEntries(prev => prev.map(e => e._id === id ? { ...e, [field]: value } : e));
  const removeEntry = (id) =>
    setEntries(prev => prev.filter(e => e._id !== id));

  const handleImport = async () => {
    setStep('importing');
    setProgress(0);
    for (let i = 0; i < entries.length; i++) {
      const { rawNote, location, logDate } = entries[i];
      try { await onSubmit({ rawNote, location, logDate }); } catch {}
      setProgress(i + 1);
      // small pause to avoid hammering the API
      if (i < entries.length - 1) await new Promise(r => setTimeout(r, 300));
    }
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => step !== 'importing' && onClose()}
    >
      <motion.div
        className="w-full md:max-w-2xl bg-white rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={spring}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-[var(--border-color)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-brand" />
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
              {step === 'upload' && 'Werfnotities importeren'}
              {step === 'preview' && `Voorbeeld — ${entries.length} vermelding${entries.length === 1 ? '' : 'en'}`}
              {step === 'importing' && 'Importeren…'}
            </h3>
          </div>
          {step !== 'importing' && (
            <motion.button onClick={onClose} className="p-1.5 rounded-xl hover:bg-[var(--surface-2)] cursor-pointer" whileTap={{ scale: 0.9 }}>
              <X className="w-4 h-4 text-[var(--text-tertiary)]" />
            </motion.button>
          )}
        </div>

        {/* Upload step */}
        {step === 'upload' && (
          <div className="px-5 py-5 space-y-4">
            {!pasteMode ? (
              <>
                {/* Drop zone */}
                <motion.div
                  className={cn(
                    'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors',
                    dragOver ? 'border-brand bg-brand/5' : 'border-[var(--border-color)] hover:border-brand/50 hover:bg-[var(--surface-2)]'
                  )}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
                  onClick={() => fileRef.current?.click()}
                  whileTap={{ scale: 0.99 }}
                >
                  <FileUp className="w-8 h-8 text-[var(--text-tertiary)] mx-auto mb-3" />
                  <p className="text-[13px] font-medium text-[var(--text-secondary)]">Sleep een bestand of klik om te bladeren</p>
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-1">.txt · .csv · .json</p>
                  <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
                </motion.div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[var(--border-color)]" />
                  <span className="text-[11px] text-[var(--text-tertiary)]">of</span>
                  <div className="flex-1 h-px bg-[var(--border-color)]" />
                </div>

                <Button variant="secondary" size="sm" className="w-full gap-2" onClick={() => setPasteMode(true)}>
                  <ClipboardList className="w-3.5 h-3.5" /> Notities rechtstreeks plakken
                </Button>

                {/* Formaatgids */}
                <div className="bg-[var(--surface-2)] rounded-2xl p-4 space-y-2">
                  <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest">Ondersteunde formaten</p>
                  <div className="space-y-1.5 text-[11px] text-[var(--text-secondary)]">
                    <p><span className="font-mono bg-white px-1.5 py-0.5 rounded border border-[var(--border-color)] mr-2">.txt</span>Één notitie per regel, of notities gescheiden door een lege regel</p>
                    <p><span className="font-mono bg-white px-1.5 py-0.5 rounded border border-[var(--border-color)] mr-2">.csv</span>Kolommen: <span className="font-mono">notes</span>, <span className="font-mono">location</span>, <span className="font-mono">date</span> (allemaal optioneel behalve notes)</p>
                    <p><span className="font-mono bg-white px-1.5 py-0.5 rounded border border-[var(--border-color)] mr-2">.json</span>Array van <span className="font-mono">{"{ note, location, date }"}</span> objecten</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="label-caps mb-2 block">Plak uw notities</label>
                  <Textarea
                    className="h-48 font-mono text-[12px]"
                    placeholder={"Betonvloer verdieping 2 gestort.\n\nOnderaannemer vertraagd — wapening niet geleverd.\n\nVeiligheidsinspectie geslaagd, geen problemen."}
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    autoFocus
                  />
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">Scheid notities met een lege regel, of zet één notitie per regel.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPasteMode(false)}>Terug</Button>
                  <Button size="sm" className="flex-1" onClick={loadPaste} disabled={!pasteText.trim()}>Notities verwerken</Button>
                </div>
              </>
            )}

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-xl">
                {error}
              </motion.p>
            )}
          </div>
        )}

        {/* Preview step */}
        {step === 'preview' && (
          <>
            <div className="max-h-[55vh] overflow-y-auto px-5 py-4 space-y-2">
              {entries.map((entry, idx) => (
                <div key={entry._id} className="flex gap-3 items-start group">
                  <span className="text-[10px] text-[var(--text-tertiary)] font-mono mt-2.5 w-5 flex-shrink-0 text-right">{idx + 1}</span>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <textarea
                      className="w-full text-[12px] text-[var(--text-primary)] bg-[var(--surface-2)] border border-[var(--border-color)] rounded-xl px-3 py-2 outline-none resize-none focus:border-brand/50 transition-colors leading-snug"
                      rows={2}
                      value={entry.rawNote}
                      onChange={e => updateEntry(entry._id, 'rawNote', e.target.value)}
                    />
                    <div className="flex gap-2">
                      <input
                        className="flex-1 text-[11px] text-[var(--text-secondary)] bg-transparent border-0 outline-none placeholder:text-[var(--text-tertiary)]"
                        placeholder="Locatie (optioneel)"
                        value={entry.location}
                        onChange={e => updateEntry(entry._id, 'location', e.target.value)}
                      />
                      <input
                        className="w-28 text-[11px] text-[var(--text-secondary)] bg-transparent border-0 outline-none placeholder:text-[var(--text-tertiary)] text-right"
                        placeholder="Datum (optioneel)"
                        value={entry.logDate || ''}
                        onChange={e => updateEntry(entry._id, 'logDate', e.target.value || null)}
                      />
                    </div>
                  </div>
                  <motion.button
                    onClick={() => removeEntry(entry._id)}
                    className="mt-2 p-1 rounded-lg text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer flex-shrink-0"
                    whileTap={{ scale: 0.85 }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </motion.button>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-[var(--border-color)] flex justify-between items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => { setStep('upload'); setEntries([]); }}>Terug</Button>
              <Button size="sm" onClick={handleImport} disabled={entries.length === 0} className="gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                {entries.length} notitie{entries.length !== 1 ? 's' : ''} importeren + Analyseren
              </Button>
            </div>
          </>
        )}

        {/* Importing step */}
        {step === 'importing' && (
          <div className="px-5 py-10 text-center space-y-5">
            <div className="w-12 h-12 bg-brand/10 rounded-2xl flex items-center justify-center mx-auto">
              <Loader2 className="w-6 h-6 text-brand animate-spin" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[var(--text-primary)]">Importeren en analyseren…</p>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1">{progress} van {entries.length} vermeldingen verwerkt</p>
            </div>
            <div className="w-full bg-[var(--surface-2)] rounded-full h-2 overflow-hidden">
              <motion.div
                className="h-full bg-brand rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(progress / entries.length) * 100}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 30 }}
              />
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Bulk Extract Modal ────────────────────────────────────────────────────────

function BulkExtractModal({ logs, subs, onExtractActions, onSaveActions, onUpdate, onClose }) {
  const [step, setStep]         = useState('confirm'); // confirm | running | review | saving
  const [progress, setProgress] = useState(0);
  const [saveProgress, setSaveProgress] = useState(0);
  const [allItems, setAllItems] = useState([]);
  const [currentLog, setCurrentLog] = useState('');
  const [saveError, setSaveError]   = useState('');

  const eligibleLogs = logs; // pre-filtered to !processing && !treated by caller
  const assigneeOptions = ['Back Office', ...(subs || []).map(s => s.company)];

  const runExtraction = async () => {
    setStep('running');
    const collected = [];
    for (let i = 0; i < eligibleLogs.length; i++) {
      const log = eligibleLogs[i];
      setCurrentLog((log.processedSummary || log.rawNote).slice(0, 70));
      setProgress(i + 1);
      try {
        const items = await onExtractActions(log);
        items.forEach((item, j) => collected.push({
          ...item,
          // Use log type as category fallback
          category: item.category || log.type || null,
          _id: `${i}-${j}`,
          _checked: true,
          _logSummary: (log.processedSummary || log.rawNote).slice(0, 80),
        }));
      } catch (err) {
        console.warn(`Failed to extract from log ${i}:`, err.message);
      }
      if (i < eligibleLogs.length - 1) await new Promise(r => setTimeout(r, 200));
    }
    setAllItems(collected);
    setStep('review');
  };

  const toggleChecked = (id) =>
    setAllItems(prev => prev.map(i => i._id === id ? { ...i, _checked: !i._checked } : i));
  const updateItem = (id, field, value) =>
    setAllItems(prev => prev.map(i => i._id === id ? { ...i, [field]: value } : i));

  const handleConfirm = async () => {
    const toSave = allItems
      .filter(i => i._checked)
      .map(({ _id, _checked, _logSummary, ...rest }) => rest);
    if (!toSave.length) return;

    setStep('saving');
    setSaveProgress(0);
    setSaveError('');
    try {
      await onSaveActions(toSave, null, (n) => setSaveProgress(n));
      if (onUpdate) {
        await Promise.all(eligibleLogs.map(l => onUpdate(l.id, { treated: true })));
      }
      onClose();
    } catch (err) {
      setSaveError(err.message || 'Taken konden niet worden opgeslagen');
      setStep('review');
    }
  };

  const checkedCount = allItems.filter(i => i._checked).length;

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => step !== 'running' && step !== 'saving' && onClose()}
    >
      <motion.div
        className="w-full md:max-w-2xl bg-white rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={spring}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-[var(--border-color)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-brand" />
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
              {step === 'confirm' && 'Analyseren & taken aanmaken'}
              {step === 'running' && 'Werfnotities analyseren…'}
              {step === 'review'  && `${checkedCount} taak${checkedCount !== 1 ? 'en' : ''} klaar om toe te voegen`}
              {step === 'saving'  && 'Taken opslaan…'}
            </h3>
          </div>
          {step !== 'running' && step !== 'saving' && (
            <motion.button onClick={onClose} className="p-1.5 rounded-xl hover:bg-[var(--surface-2)] cursor-pointer" whileTap={{ scale: 0.9 }}>
              <X className="w-4 h-4 text-[var(--text-tertiary)]" />
            </motion.button>
          )}
        </div>

        {/* Confirm */}
        {step === 'confirm' && (
          <div className="px-5 py-6 space-y-4">
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              AI leest alle <strong>{eligibleLogs.length}</strong> werfnotities en extraheert concrete actiepunten — met voorgestelde verantwoordelijken (Back Office of onderaannemers). Controleer en bewerk vóór het toevoegen aan de takenlijst.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={onClose}>Annuleren</Button>
              <Button size="sm" className="flex-1 gap-1.5" onClick={runExtraction}>
                <ListTodo className="w-3.5 h-3.5" /> {eligibleLogs.length} notities analyseren
              </Button>
            </div>
          </div>
        )}

        {/* Running */}
        {(step === 'running' || step === 'saving') && (
          <div className="px-5 py-10 text-center space-y-5">
            <div className="w-12 h-12 bg-brand/10 rounded-2xl flex items-center justify-center mx-auto">
              <Loader2 className="w-6 h-6 text-brand animate-spin" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[var(--text-primary)]">
                {step === 'running' ? 'Analyseren…' : 'Taken opslaan…'}
              </p>
              {step === 'running' && (
                <>
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-1 line-clamp-1 px-4">{currentLog}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{progress} / {eligibleLogs.length} notities</p>
                </>
              )}
              {step === 'saving' && (
                <p className="text-[11px] text-[var(--text-tertiary)] mt-1">{saveProgress} / {checkedCount} taken opgeslagen</p>
              )}
            </div>
            <div className="w-full bg-[var(--surface-2)] rounded-full h-2 overflow-hidden">
              <motion.div
                className="h-full bg-brand rounded-full"
                animate={{ width: step === 'running' ? `${(progress / eligibleLogs.length) * 100}%` : `${(saveProgress / checkedCount) * 100}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 30 }}
              />
            </div>
          </div>
        )}

        {/* Review */}
        {step === 'review' && (
          <>
            {allItems.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center mx-auto mb-3">
                  <ListTodo className="w-6 h-6 text-[var(--text-tertiary)]" />
                </div>
                <p className="text-[13px] font-medium text-[var(--text-secondary)]">Geen actiepunten gevonden</p>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-1">De werfnotities bevatten geen concrete opvolgacties.</p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-2">
                {allItems.map(item => (
                  <div key={item._id} className={cn('rounded-2xl border p-3.5 transition-colors', item._checked ? 'border-brand/30 bg-brand/5' : 'border-[var(--border-color)] bg-[var(--surface-2)] opacity-50')}>
                    <p className="text-[10px] text-[var(--text-tertiary)] font-mono mb-2 line-clamp-1 italic">↳ {item._logSummary}</p>
                    <div className="flex items-start gap-3">
                      <motion.button onClick={() => toggleChecked(item._id)} className="mt-0.5 flex-shrink-0 cursor-pointer" whileTap={{ scale: 0.85 }}>
                        {item._checked
                          ? <div className="w-5 h-5 rounded-md bg-brand flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>
                          : <div className="w-5 h-5 rounded-md border-2 border-[var(--border-color)]" />}
                      </motion.button>
                      <div className="flex-1 min-w-0 space-y-2">
                        <textarea
                          className="w-full text-[12px] font-medium text-[var(--text-primary)] bg-transparent border-0 outline-none resize-none leading-snug"
                          rows={2} value={item.task}
                          onChange={e => updateItem(item._id, 'task', e.target.value)}
                          disabled={!item._checked}
                        />
                        <div className="flex gap-2 flex-wrap">
                          <select
                            className="text-[11px] bg-white border border-[var(--border-color)] rounded-lg px-2 py-1 text-[var(--text-secondary)] cursor-pointer outline-none"
                            value={item.assignee || 'Back Office'}
                            onChange={e => updateItem(item._id, 'assignee', e.target.value)}
                            disabled={!item._checked}
                          >
                            {assigneeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                          <select
                            className="text-[11px] bg-white border border-[var(--border-color)] rounded-lg px-2 py-1 text-[var(--text-secondary)] cursor-pointer outline-none"
                            value={item.priority || 'medium'}
                            onChange={e => updateItem(item._id, 'priority', e.target.value)}
                            disabled={!item._checked}
                          >
                            <option value="high">Hoog</option>
                            <option value="medium">Gemiddeld</option>
                            <option value="low">Laag</option>
                          </select>
                        </div>
                        {item.notes && <p className="text-[10px] text-[var(--text-tertiary)] italic leading-relaxed">{item.notes}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {saveError && (
              <p className="mx-5 text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{saveError}</p>
            )}
            <div className="px-5 py-4 border-t border-[var(--border-color)] flex justify-between items-center gap-3">
              <Button variant="ghost" size="sm" onClick={onClose}>Annuleren</Button>
              {allItems.length > 0 && (
                <Button size="sm" onClick={handleConfirm} disabled={!checkedCount} className="gap-1.5">
                  <ListTodo className="w-3.5 h-3.5" />
                  {checkedCount} taak{checkedCount !== 1 ? 'en' : ''} toevoegen aan takenlijst
                </Button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const LOG_TYPES = ['delay', 'safety', 'progress', 'material', 'rfi', 'general'];

function LogTypeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const handler = e => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        listRef.current && !listRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
    setOpen(v => !v);
  };

  return (
    <div ref={triggerRef}>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-white border border-[var(--border-color)] hover:bg-slate-50 hover:border-slate-300 shadow-sm text-xs font-semibold text-slate-700 cursor-pointer transition-colors capitalize"
      >
        {value || 'general'}
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && ReactDOM.createPortal(
        <ul
          ref={listRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: 130, zIndex: 9999 }}
          className="bg-white border border-[var(--border-color)] rounded-xl shadow-lg overflow-hidden py-1"
        >
          {LOG_TYPES.map(t => (
            <li key={t}>
              <button
                type="button"
                onClick={() => { onChange(t); setOpen(false); }}
                className={cn(
                  'w-full text-left px-4 py-1.5 text-xs font-semibold capitalize transition-colors',
                  t === value ? 'bg-slate-50 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                {t}
              </button>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}

const LABEL_PALETTE = ['#6366F1', '#7669ff', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#0EA5E9'];
function colorForLabel(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return LABEL_PALETTE[h % LABEL_PALETTE.length];
}

function LogCard({ log, onDelete, onUpdate, onCreateRFI, subs }) {
  const [expanded, setExpanded] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={spring}
      style={{ borderRadius: 16 }}
      className="glass-card overflow-hidden"
      whileHover={{ y: -1, borderRadius: 22, boxShadow: '0 0 0 1px rgba(255,255,255,0.90), 0 8px 32px rgba(0,0,0,0.09), inset 0 1px 0 rgba(255,255,255,0.90)' }}
    >
      <div className="px-4 md:px-5 py-4">
        <div className="flex items-start gap-3">
          <Badge variant={TYPE_BADGE[log.type] || 'secondary'} className="mt-0.5 flex-shrink-0">
            {log.type || 'general'}
          </Badge>
          <div className="flex-1 min-w-0">
            {log.processing ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-brand animate-spin flex-shrink-0" />
                <span className="text-[13px] text-[var(--text-tertiary)] italic">Analyseren met AI…</span>
              </div>
            ) : (
              <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">
                {log.processedSummary || log.rawNote}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {log.location && (
                <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                  <MapPin className="w-3 h-3" />{log.location}
                </span>
              )}
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {log.logDate
                  ? new Date(log.logDate + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                  : new Date(log.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                }
              </span>
              {log.impact && log.impact !== 'none' && (
                <span className={cn('text-[11px] font-medium', IMPACT_CLASS[log.impact])}>
                  {log.impact} impact
                </span>
              )}
              {log.photo && (
                <motion.button
                  onClick={() => setPhotoOpen(true)}
                  className="flex items-center gap-1 text-[11px] text-brand hover:underline cursor-pointer"
                  whileTap={{ scale: 0.95 }}
                >
                  <ImageIcon className="w-3 h-3" /> Foto
                </motion.button>
              )}
            </div>
          </div>
          <motion.button
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Inklappen' : 'Uitklappen'}
            className="p-1.5 rounded-xl hover:bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer flex-shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center"
            whileTap={{ scale: 0.9 }}
            transition={spring}
          >
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={spring}>
              <ChevronDown className="w-4 h-4" />
            </motion.div>
          </motion.button>
        </div>

        {(log.label || (log.flags && log.flags.length > 0) || log.meerwerkClassification) && (
          <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
            {log.meerwerkClassification && (
              <MeerwerkBadge classification={log.meerwerkClassification} />
            )}
            {log.label && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: colorForLabel(log.label) }}
              >
                {log.label}
              </span>
            )}
            {log.flags && log.flags.map((f, i) => (
              <span key={i} className="text-[10px] font-mono bg-[var(--surface-2)] text-[var(--text-tertiary)] px-2 py-0.5 rounded-md">
                {f}
              </span>
            ))}
          </div>
        )}

        {log.photo && !expanded && (
          <motion.button
            onClick={() => setPhotoOpen(true)}
            className="mt-3 block cursor-pointer"
            whileTap={{ scale: 0.97 }}
          >
            <img
              src={log.photo}
              alt="Site observation photo"
              className="w-24 h-16 object-cover rounded-xl border border-[var(--border-color)] hover:opacity-80 transition-opacity"
            />
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="px-4 md:px-5 py-4 border-t border-[var(--border-color)] bg-[var(--surface-2)]">
              {log.photo && (
                <motion.button
                  onClick={() => setPhotoOpen(true)}
                  className="block mb-4 w-full cursor-pointer"
                  whileTap={{ scale: 0.99 }}
                >
                  <img
                    src={log.photo}
                    alt="Werf observatie foto"
                    className="w-full max-h-52 object-cover rounded-2xl border border-[var(--border-color)] hover:opacity-90 transition-opacity"
                  />
                </motion.button>
              )}
              {log.meerwerkClassification && (
                <div className="mb-4 flex items-start gap-2">
                  <MeerwerkBadge classification={log.meerwerkClassification} />
                  {log.meerwerkReasoning && (
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      {log.meerwerkReasoning}
                    </p>
                  )}
                </div>
              )}
              <p className="text-[11px] text-[var(--text-secondary)] font-mono leading-relaxed mb-4">
                <span className="text-[var(--text-tertiary)] uppercase tracking-widest text-[9px] block mb-1">Originele notitie</span>
                "{log.rawNote}"
              </p>
              <div className="flex gap-2 flex-wrap items-center">
                {log.suggestRFI && (
                  <Button size="sm" variant="secondary" onClick={() => onCreateRFI(log)} className="gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Meerwerk aanmaken
                  </Button>
                )}
                {log.treated && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-[#0c7a5e] bg-[#e8fbf5] border border-[#88f0d4] px-3 py-1.5 rounded-full">
                    <Check className="w-3 h-3" /> Behandeld
                  </span>
                )}
                {!log.processing && (
                  <LogTypeSelect
                    value={log.type || 'general'}
                    onChange={type => onUpdate(log.id, { type })}
                  />
                )}
                {log.actionRequired && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-orange-600 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-full">
                    <AlertTriangle className="w-3.5 h-3.5" /> Actie vereist
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(log.id)}
                  className="ml-auto text-red-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Verwijderen
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Photo lightbox */}
      <AnimatePresence>
        {photoOpen && log.photo && (
          <motion.div
            className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPhotoOpen(false)}
          >
            <motion.button
              aria-label="Foto sluiten"
              className="absolute top-4 right-4 text-white/60 hover:text-white cursor-pointer p-2 rounded-xl hover:bg-white/10"
              whileTap={{ scale: 0.9 }}
            >
              <X className="w-6 h-6" />
            </motion.button>
            <motion.img
              src={log.photo}
              alt="Werf observatie foto volledig formaat"
              className="max-w-full max-h-full rounded-2xl object-contain"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={spring}
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FieldLog({ logs, onSubmit, onUpdate, onDelete, onCreateRFI, subs, onExtractActions, onSaveActions }) {
  const [note, setNote]         = useState('');
  const [location, setLocation] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const locationUserEdited = useRef(false);

  useEffect(() => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          if (!locationUserEdited.current) {
            const addr = data.address || {};
            const parts = [
              addr.road || addr.pedestrian || addr.footway,
              addr.house_number,
              addr.suburb || addr.neighbourhood || addr.city_district,
              addr.city || addr.town || addr.village,
            ].filter(Boolean);
            setLocation(parts.join(', '));
          }
        } catch {
          // silently ignore reverse geocoding failures
        }
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
      { timeout: 8000 }
    );
  }, []);

  const [photo, setPhoto]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [filter, setFilter]     = useState('all');
  const [showImport, setShowImport]           = useState(false);
  const [showBulkExtract, setShowBulkExtract] = useState(false);
  const cameraRef = useRef(null);

  const filterTypes = ['all', 'delay', 'safety', 'progress', 'material', 'rfi', 'general'];
  const filtered = filter === 'all' ? logs : logs.filter(l => l.type === filter);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(await compressImage(file));
    e.target.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onSubmit({ rawNote: note.trim(), location: location.trim(), photo });
    } catch (err) {
      setError(err.message);
    }
    setNote('');
    setLocation('');
    setPhoto(null);
    setLoading(false);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="title-xl">Werfnotities</h1>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1">
              Registreer werfobservaties. AI extraheert gestructureerde data onmiddellijk.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {onExtractActions && logs.filter(l => !l.processing && !l.treated).length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setShowBulkExtract(true)} className="gap-1.5">
                <ListTodo className="w-3.5 h-3.5" /> Analyseren & taken aanmaken
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowImport(true)} className="gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Importeren
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Input form */}
      <motion.div
        className="glass-card rounded-2xl mb-6 overflow-hidden"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.05 }}
      >
        <div className="p-5">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="site-obs" className="label-caps mb-2 block">
                Werfobservatie *
              </label>
              <Textarea
                id="site-obs"
                className="h-28"
                placeholder="Beschrijf wat u op de werf observeerde. bijv. 'Onderaannemer vertraagd door ontbrekende ankers.'"
                value={note}
                onChange={e => setNote(e.target.value)}
                required
              />
            </div>

            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <label htmlFor="log-location" className="label-caps mb-2 block">
                  Locatie <span className="font-normal normal-case text-[var(--text-tertiary)]">(optioneel)</span>
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
                  <Input
                    id="log-location"
                    className="pl-9 pr-8"
                    placeholder={geoLoading ? 'Locatie detecteren…' : 'bijv. Verdieping 3, Grid B-4'}
                    value={location}
                    onChange={e => { locationUserEdited.current = true; setLocation(e.target.value); }}
                  />
                  {geoLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)] animate-spin pointer-events-none" />
                  )}
                </div>
              </div>
              <div className="flex items-end gap-2">
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhoto}
                />
                <motion.button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  aria-label="Foto toevoegen"
                  className={cn(
                    'h-10 w-10 rounded-xl border-2 flex items-center justify-center transition-colors duration-150 flex-shrink-0 cursor-pointer',
                    photo
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-[var(--border-color)] bg-white text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-slate-300'
                  )}
                  whileTap={{ scale: 0.9 }}
                  transition={spring}
                >
                  <Camera className="w-4 h-4" />
                </motion.button>
                <ShimmerButton
                  type="submit"
                  disabled={loading || !note.trim()}
                  className="h-10 px-5 flex-shrink-0"
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Verwerken…</>
                    : <><Zap className="w-4 h-4" /> Opslaan + Analyseren</>}
                </ShimmerButton>
              </div>
            </div>

            <AnimatePresence>
              {photo && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={spring}
                  className="relative w-fit"
                >
                  <img src={photo} alt="Preview" className="w-24 h-16 object-cover rounded-xl border border-[var(--border-color)]" />
                  <motion.button
                    type="button"
                    onClick={() => setPhoto(null)}
                    aria-label="Foto verwijderen"
                    className="absolute -top-1.5 -right-1.5 bg-white text-[var(--text-secondary)] rounded-full p-0.5 hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer border border-[var(--border-color)] shadow-card"
                    whileTap={{ scale: 0.85 }}
                  >
                    <X className="w-3 h-3" />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {error && (
                <motion.p
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-xl"
                >
                  {error} — Controleer uw API-sleutel in .env.
                </motion.p>
              )}
            </AnimatePresence>
          </form>
        </div>
      </motion.div>

      {/* Filter tabs */}
      <motion.div
        className="flex gap-1 p-1 rounded-full bg-[var(--surface-2)] mb-4 flex-wrap w-fit"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {filterTypes.map(t => (
          <motion.button
            key={t}
            onClick={() => setFilter(t)}
            className={cn('filter-pill', filter === t ? 'filter-pill-active' : 'filter-pill-inactive')}
            whileTap={{ scale: 0.95 }}
            transition={spring}
          >
            {t === 'all' ? `Alle (${logs.length})` : t}
          </motion.button>
        ))}
      </motion.div>

      {/* Bulk import modal */}
      <AnimatePresence>
        {showImport && (
          <BulkImportModal onClose={() => setShowImport(false)} onSubmit={onSubmit} />
        )}
      </AnimatePresence>

      {/* Bulk extract modal */}
      <AnimatePresence>
        {showBulkExtract && (
          <BulkExtractModal
            logs={logs.filter(l => !l.processing && !l.treated)}
            subs={subs}
            onExtractActions={onExtractActions}
            onSaveActions={onSaveActions}
            onUpdate={onUpdate}
            onClose={() => setShowBulkExtract(false)}
          />
        )}
      </AnimatePresence>

      {/* Log entries */}
      <motion.div className="space-y-3" layout>
        <AnimatePresence>
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-16"
            >
              <div className="w-14 h-14 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Mic className="w-6 h-6 text-[var(--text-tertiary)]" />
              </div>
              <p className="text-[13px] font-medium text-[var(--text-secondary)]">
                {filter === 'all' ? 'Nog geen werfnotities.' : `Geen ${filter} vermeldingen.`}
              </p>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
                {filter === 'all' ? 'Voeg hierboven uw eerste observatie toe.' : 'Probeer een ander filter.'}
              </p>
            </motion.div>
          ) : (
            filtered.map(log => (
              <LogCard key={log.id} log={log} onDelete={onDelete} onUpdate={onUpdate} onCreateRFI={onCreateRFI}
                subs={subs} />
            ))
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
