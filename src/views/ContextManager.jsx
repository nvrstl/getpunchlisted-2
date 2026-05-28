import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, AlertTriangle, FileText, MessageSquareQuote,
  Plus, Trash2, Pencil, Check, X, ChevronDown,
  Upload, Loader2, FileUp, ShieldAlert, ClipboardCheck,
  Eye, DollarSign, RefreshCw, LayoutDashboard, List,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../lib/utils';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// Extractors now also return progress metadata so the upload UI can show
// concrete numbers (page count, character count). Each takes an optional
// onProgress callback fired after each page/sheet for live feedback on
// large files.
async function extractPdfText(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
    onProgress?.({ done: i, total: pdf.numPages });
  }
  const text = pages.join('\n');
  return { text, pages: pdf.numPages, chars: text.length };
}

async function extractXlsxText(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const parts = [];
  let i = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) parts.push(`[Sheet: ${sheetName}]\n${csv}`);
    onProgress?.({ done: ++i, total: workbook.SheetNames.length });
  }
  const text = parts.join('\n\n');
  return { text, pages: workbook.SheetNames.length, chars: text.length };
}

const ACCEPTED_TYPES = {
  'application/pdf': extractPdfText,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': extractXlsxText,
  'application/vnd.ms-excel': extractXlsxText,
};
const ACCEPT_ATTR = '.pdf,.xlsx,.xls';

const spring = { type: 'spring', stiffness: 300, damping: 28 };

const CATEGORIES = [
  {
    id: 'danger',
    label: 'Danger / Risk',
    icon: AlertTriangle,
    color: 'text-red-500',
    bg: 'bg-red-50 border-red-200',
    pill: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
    description: 'Site hazards, safety alerts, critical risks',
  },
  {
    id: 'quote',
    label: 'Quotes',
    icon: MessageSquareQuote,
    color: 'text-violet-500',
    bg: 'bg-violet-50 border-violet-200',
    pill: 'bg-violet-100 text-violet-700',
    dot: 'bg-violet-500',
    description: 'Statements from client, architect, or trade',
  },
  {
    id: 'contract',
    label: 'Contract Notes',
    icon: FileText,
    color: 'text-brand',
    bg: 'bg-[#e8fbf5] border-[#88f0d4]',
    pill: 'bg-[#d4f7ec] text-[#075e48]',
    dot: 'bg-[#0c7a5e]',
    description: 'Key clauses, obligations, or constraints',
  },
  {
    id: 'note',
    label: 'General Notes',
    icon: BookOpen,
    color: 'text-amber-500',
    bg: 'bg-amber-50 border-amber-200',
    pill: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
    description: 'Background context for AI reports',
  },
  {
    id: 'document',
    label: 'Document (PDF)',
    icon: FileUp,
    color: 'text-sky-500',
    bg: 'bg-sky-50 border-sky-200',
    pill: 'bg-sky-100 text-sky-700',
    dot: 'bg-sky-500',
    description: 'Lastenboek, quote PDF, specs — AI-summarised',
  },
];

const getCat = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[3];

function PDFUploadPanel({ onSuccess }) {
  const inputRef  = useRef(null);
  const [status, setStatus]     = useState('idle'); // idle | extracting | processing | saving | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  // Progress data shown alongside each step's checkmark.
  const [stats, setStats] = useState({
    fileName: null, pagesDone: 0, pagesTotal: 0, chars: 0, summaryLen: 0, category: null,
  });

  const resetAfterDelay = () => setTimeout(() => {
    setStatus('idle');
    setStats({ fileName: null, pagesDone: 0, pagesTotal: 0, chars: 0, summaryLen: 0, category: null });
  }, 2500);

  const process = async (file) => {
    if (!file || !ACCEPTED_TYPES[file.type]) {
      setErrorMsg('Please upload a PDF or Excel (.xlsx) file.');
      setStatus('error');
      return;
    }
    setErrorMsg('');
    setStatus('extracting');
    setStats(s => ({ ...s, fileName: file.name, pagesDone: 0, pagesTotal: 0, chars: 0, summaryLen: 0, category: null }));
    try {
      const extract = ACCEPTED_TYPES[file.type];
      const { text, pages, chars } = await extract(file, ({ done, total }) =>
        setStats(s => ({ ...s, pagesDone: done, pagesTotal: total }))
      );
      if (!text.trim()) throw new Error('Could not extract text from this PDF (may be scanned/image-only).');
      setStats(s => ({ ...s, pages, chars }));
      setStatus('processing');
      // Only the first 30k chars go to the AI for summarising — that's enough
      // for Haiku to classify + summarise without burning tokens. The chat
      // uses raw_text directly for clause-level questions, so we store the
      // full extracted text (up to 1 MB) rather than the AI excerpt.
      const summaryInput = text.length > 30000 ? text.slice(0, 30000) : text;
      const res = await fetch('/api/process-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: summaryInput, filename: file.name }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Server error ${res.status}: ${msg.slice(0, 120)}`);
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Processing failed');
      const { title, summary, keyPoints, category } = json.data;
      const content = [summary, '', ...keyPoints.map(k => `• ${k}`)].join('\n');
      setStats(s => ({ ...s, summaryLen: content.length, category }));
      setStatus('saving');
      // Postgres TEXT has no hard limit; we cap at 1 MB to keep row size
      // manageable and avoid pathological 1000-page PDFs blowing things up.
      const raw_text = text.length > 1_000_000 ? text.slice(0, 1_000_000) : text;
      await onSuccess({ category, title, content, raw_text, source: file.name });
      setStatus('done');
      resetAfterDelay();
    } catch (err) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  };

  const onFileChange = (e) => { if (e.target.files[0]) process(e.target.files[0]); };
  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files[0]) process(e.dataTransfer.files[0]);
  };

  const busy = status === 'extracting' || status === 'processing' || status === 'saving';

  // Multi-step indicator config. Each step is either pending (○), active
  // (spinner), or completed (✓), with a stat line when relevant data is in.
  const stepOrder = ['extracting', 'processing', 'saving', 'done'];
  const currentStepIdx = stepOrder.indexOf(status);
  const stepStatus = (key) => {
    const idx = stepOrder.indexOf(key);
    if (currentStepIdx > idx) return 'done';
    if (currentStepIdx === idx) return 'active';
    return 'pending';
  };
  const steps = [
    {
      key: 'extracting',
      label: stats.pagesTotal > 0 && status === 'extracting'
        ? `Tekst uit document lezen (${stats.pagesDone}/${stats.pagesTotal})`
        : 'Tekst uit document lezen',
      hint: stats.chars > 0 ? `${stats.pages} pagina${stats.pages === 1 ? '' : '\'s'} · ${stats.chars.toLocaleString('nl-BE')} karakters` : null,
    },
    {
      key: 'processing',
      label: 'AI samenvatting genereren',
      hint: stats.summaryLen > 0 ? `${stats.summaryLen} karakters samenvatting · categorie: ${stats.category}` : null,
    },
    {
      key: 'saving',
      label: 'Opslaan in projectgeheugen',
      hint: status === 'done' ? 'Beschikbaar in chat' : null,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className={cn(
        'rounded-2xl border-2 border-dashed p-6 text-center transition-colors',
        dragOver ? 'border-brand bg-brand/5' : 'border-[var(--border-color)] bg-white/40',
        busy && 'pointer-events-none opacity-70'
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input ref={inputRef} type="file" accept={ACCEPT_ATTR} className="hidden" onChange={onFileChange} />

      {(busy || status === 'done') ? (
        <div className="flex flex-col gap-3 text-left">
          {stats.fileName && (
            <p className="text-[11px] font-mono text-[var(--text-tertiary)] truncate">{stats.fileName}</p>
          )}
          <div className="space-y-2.5">
            {steps.map(step => {
              const st = stepStatus(step.key);
              return (
                <div key={step.key} className="flex items-start gap-2.5">
                  <div className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                    st === 'done'    && 'bg-[#d4f7ec]',
                    st === 'active'  && 'bg-brand/15',
                    st === 'pending' && 'bg-black/[0.06]',
                  )}>
                    {st === 'done'   && <Check className="w-3 h-3 text-[#0c7a5e]" />}
                    {st === 'active' && <Loader2 className="w-3 h-3 text-brand animate-spin" />}
                    {st === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]/40" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-[12.5px] font-medium',
                      st === 'pending' ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]',
                    )}>{step.label}</p>
                    {step.hint && st !== 'pending' && (
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{step.hint}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {status === 'done' && (
            <p className="text-[12px] text-[#075e48] font-semibold text-center mt-1">Document toegevoegd!</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center">
            <Upload className="w-5 h-5 text-sky-500" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Document uploaden</p>
            <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
              Lastenboek, meetstaat, offerte — PDF or Excel (.xlsx)
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white text-[12px] font-semibold cursor-pointer hover:bg-sky-600 transition-colors"
          >
            <FileUp className="w-3.5 h-3.5" /> Choose file
          </button>
          <p className="text-[11px] text-[var(--text-tertiary)]">PDF or .xlsx · drag & drop here</p>
        </div>
      )}

      <AnimatePresence>
        {status === 'error' && (
          <motion.p
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-3 text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl"
          >
            {errorMsg}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ContextCard({ item, onEdit, onDelete }) {
  const cat = getCat(item.category);
  const Icon = cat.icon;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={spring}
      className={cn('rounded-2xl border p-4 relative group', cat.bg)}
    >
      <div className="flex items-start gap-3">
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/70', cat.color)}>
          <Icon className="w-4 h-4" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', cat.pill)}>
              {cat.label}
            </span>
            {item.source && (
              <span className="text-[10px] text-[var(--text-tertiary)] font-mono truncate max-w-[180px]">
                {item.source}
              </span>
            )}
          </div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug mt-1">
            {item.title}
          </div>
          <div className="text-[12px] text-[var(--text-secondary)] mt-1 leading-relaxed whitespace-pre-wrap">
            {item.content}
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => onEdit(item)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/70 transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </motion.button>
          {confirmDelete ? (
            <>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => onDelete(item.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => setConfirmDelete(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-white/70 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </motion.button>
            </>
          ) : (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => setConfirmDelete(true)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ContextForm({ initial, onSave, onCancel }) {
  const [category, setCategory] = useState(initial?.category || 'quote');
  const [title, setTitle]       = useState(initial?.title   || '');
  const [content, setContent]   = useState(initial?.content || '');
  const [source, setSource]     = useState(initial?.source  || '');
  const [catOpen, setCatOpen]   = useState(false);

  const selectedCat = getCat(category);
  const CatIcon = selectedCat.icon;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    onSave({ category, title: title.trim(), content: content.trim(), source: source.trim() || null });
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={spring}
      className="glass-card rounded-2xl p-5 border border-[var(--border-color)] mb-6"
    >
      <div className="text-[13px] font-semibold text-[var(--text-primary)] mb-4">
        {initial ? 'Edit context entry' : 'Add context entry'}
      </div>

      {/* Category picker */}
      <div className="mb-3 relative">
        <label className="label-caps mb-2 block">Category</label>
        <button
          type="button"
          onClick={() => setCatOpen(v => !v)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] bg-white/70 text-left cursor-pointer hover:border-brand/40 transition-colors"
        >
          <CatIcon className={cn('w-4 h-4', selectedCat.color)} />
          <span className="flex-1 text-[13px] text-[var(--text-primary)] font-medium">{selectedCat.label}</span>
          <ChevronDown className={cn('w-4 h-4 text-[var(--text-tertiary)] transition-transform', catOpen && 'rotate-180')} />
        </button>
        <AnimatePresence>
          {catOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 right-0 mt-1 glass-card rounded-xl border border-[var(--border-color)] overflow-hidden z-20 shadow-lg"
            >
              {CATEGORIES.map(cat => {
                const CI = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => { setCategory(cat.id); setCatOpen(false); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/60 transition-colors cursor-pointer',
                      category === cat.id && 'bg-white/80'
                    )}
                  >
                    <CI className={cn('w-4 h-4', cat.color)} />
                    <div>
                      <div className="text-[12px] font-semibold text-[var(--text-primary)]">{cat.label}</div>
                      <div className="text-[11px] text-[var(--text-tertiary)]">{cat.description}</div>
                    </div>
                    {category === cat.id && <Check className="w-3.5 h-3.5 text-brand ml-auto" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mb-3">
        <label className="label-caps mb-2 block">Title</label>
        <Input
          placeholder="e.g. Asbestos in level 2 ceiling void"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="mb-3">
        <label className="label-caps mb-2 block">Content</label>
        <Textarea
          placeholder="Full details, exact quote, or clause text…"
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={3}
          required
        />
      </div>

      <div className="mb-4">
        <label className="label-caps mb-2 block">Source <span className="normal-case font-normal text-[var(--text-tertiary)]">(optional)</span></label>
        <Input
          placeholder="e.g. Client email 2025-01-15 · Contract clause 8.4"
          value={source}
          onChange={e => setSource(e.target.value)}
        />
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>Annuleren</Button>
        <Button type="submit" size="sm">
          {initial ? 'Wijzigingen opslaan' : 'Toevoegen'}
        </Button>
      </div>
    </motion.form>
  );
}

// ── Severity helpers ──────────────────────────────────────────────────────────
const SEVERITY = {
  critical: { label: 'Critical', bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500'    },
  high:     { label: 'High',     bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  medium:   { label: 'Medium',   bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500'  },
  low:      { label: 'Low',      bg: 'bg-[#d4f7ec]',text: 'text-[#075e48]',border: 'border-[#88f0d4]',dot: 'bg-[#0c7a5e]'},
};
const OVERALL_RISK = {
  critical: { label: 'Critical Risk', bg: 'bg-red-500',    icon: '🔴' },
  high:     { label: 'High Risk',     bg: 'bg-orange-500', icon: '🟠' },
  medium:   { label: 'Medium Risk',   bg: 'bg-amber-500',  icon: '🟡' },
  low:      { label: 'Low Risk',      bg: 'bg-[#0c7a5e]',icon: '🟢' },
};

function SummarySection({ icon: Icon, title, color, items, renderItem }) {
  if (!items?.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="glass-card rounded-2xl overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-5 py-3.5 bg-[var(--surface-2)] border-b border-[var(--border-color)]">
        <Icon className={cn('w-4 h-4', color)} />
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="ml-auto text-[11px] font-mono text-[var(--text-tertiary)]">{items.length}</span>
      </div>
      <div className="divide-y divide-[var(--border-color)]">
        {items.map((item, i) => renderItem(item, i))}
      </div>
    </motion.div>
  );
}

function ContextSummary({ contextItems, projectId }) {
  const cacheKey = `risk-analysis-${projectId}`;
  const [analysis, setAnalysis] = useState(() => {
    try { return JSON.parse(localStorage.getItem(cacheKey)) || null; } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/analyse-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: contextItems }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Analysis failed');
      setAnalysis(json.data);
      try { localStorage.setItem(cacheKey, JSON.stringify(json.data)); } catch { /* storage full */ }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const overall = analysis ? (OVERALL_RISK[analysis.overallRisk] || OVERALL_RISK.low) : null;

  // Static counts — always visible
  const dangerCount   = contextItems.filter(i => i.category === 'danger').length;
  const docCount      = contextItems.filter(i => i.category === 'document').length;
  const contractCount = contextItems.filter(i => i.category === 'contract').length;
  const quoteCount    = contextItems.filter(i => i.category === 'quote').length;

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Danger Flags', value: dangerCount, color: 'text-red-500',    bg: 'bg-red-50 border-red-200'    },
          { label: 'Documents',    value: docCount,    color: 'text-sky-500',    bg: 'bg-sky-50 border-sky-200'    },
          { label: 'Contract',     value: contractCount,color:'text-brand',      bg: 'bg-[#e8fbf5] border-[#88f0d4]'},
          { label: 'Quotes',       value: quoteCount,  color: 'text-violet-500', bg: 'bg-violet-50 border-violet-200'},
        ].map(({ label, value, color, bg }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
            className={cn('rounded-2xl border px-4 py-3.5', bg)}
          >
            <div className={cn('text-[22px] font-bold tabular-nums leading-none', color)}>{value}</div>
            <div className="text-[11px] font-mono uppercase tracking-wide text-[var(--text-tertiary)] mt-1">{label}</div>
          </motion.div>
        ))}
      </div>

      {/* Generate / Overall risk */}
      {!analysis && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-6 text-center"
        >
          <div className="w-14 h-14 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-[var(--text-tertiary)]" />
          </div>
          <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">AI Risk Analysis</p>
          <p className="text-[12px] text-[var(--text-tertiary)] mb-4">
            Claude will cross-reference all your context items and surface risks, obligations, and watch points.
          </p>
          {contextItems.length === 0 ? (
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl inline-block">
              Add some context entries first.
            </p>
          ) : (
            <button
              onClick={generate}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-[13px] font-semibold shadow-brand-sm cursor-pointer hover:bg-brand/90 transition-colors"
            >
              <ShieldAlert className="w-4 h-4" /> Generate Risk Analysis
            </button>
          )}
        </motion.div>
      )}

      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card rounded-2xl p-10 text-center"
        >
          <div className="relative mx-auto mb-4 w-14 h-14">
            <div className="absolute inset-0 bg-brand/15 rounded-2xl blur-xl" />
            <div className="relative w-14 h-14 bg-brand/10 rounded-2xl flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-brand animate-spin" />
            </div>
          </div>
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">Claude is analysing your project…</p>
          <p className="text-[12px] text-[var(--text-tertiary)] mt-1">Cross-referencing all context items</p>
        </motion.div>
      )}

      {error && (
        <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {analysis && !loading && (
        <>
          {/* Overall risk banner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring}
            className={cn('rounded-2xl px-5 py-4 text-white flex items-start gap-4', overall.bg)}
          >
            <div className="text-3xl leading-none mt-0.5">{overall.icon}</div>
            <div className="flex-1">
              <div className="text-[11px] font-mono uppercase tracking-widest opacity-80 mb-0.5">Overall Assessment</div>
              <div className="text-[15px] font-bold leading-tight">{overall.label}</div>
              <p className="text-[12px] opacity-90 mt-1.5 leading-relaxed">{analysis.summary}</p>
            </div>
            <button
              onClick={generate}
              className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors"
              title="Heranalyseren"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </motion.div>

          {/* Risks */}
          <SummarySection
            icon={ShieldAlert}
            title="Risico's"
            color="text-red-500"
            items={analysis.risks}
            renderItem={(item, i) => {
              const s = SEVERITY[item.severity] || SEVERITY.medium;
              return (
                <div key={i} className="px-5 py-3.5 flex items-start gap-3">
                  <span className={cn('mt-1.5 w-2 h-2 rounded-full flex-shrink-0', s.dot)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">{item.title}</span>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', s.bg, s.text)}>{s.label}</span>
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{item.detail}</p>
                    {item.source && <p className="text-[10px] text-[var(--text-tertiary)] font-mono mt-1">{item.source}</p>}
                  </div>
                </div>
              );
            }}
          />

          {/* Obligations */}
          <SummarySection
            icon={ClipboardCheck}
            title="Verplichtingen"
            color="text-brand"
            items={analysis.obligations}
            renderItem={(item, i) => (
              <div key={i} className="px-5 py-3.5 flex items-start gap-3">
                <Check className="w-3.5 h-3.5 text-brand flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--text-primary)]">{item.title}</div>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{item.detail}</p>
                  {item.source && <p className="text-[10px] text-[var(--text-tertiary)] font-mono mt-1">{item.source}</p>}
                </div>
              </div>
            )}
          />

          {/* Watch points */}
          <SummarySection
            icon={Eye}
            title="Aandachtspunten"
            color="text-amber-500"
            items={analysis.watchPoints}
            renderItem={(item, i) => (
              <div key={i} className="px-5 py-3.5 flex items-start gap-3">
                <Eye className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--text-primary)]">{item.title}</div>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{item.detail}</p>
                </div>
              </div>
            )}
          />

          {/* Budget notes */}
          <SummarySection
            icon={DollarSign}
            title="Budget & Quantities"
            color="text-violet-500"
            items={analysis.budgetNotes}
            renderItem={(item, i) => (
              <div key={i} className="px-5 py-3.5 flex items-start gap-3">
                <DollarSign className="w-3.5 h-3.5 text-violet-500 flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--text-primary)]">{item.title}</div>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{item.detail}</p>
                  {item.source && <p className="text-[10px] text-[var(--text-tertiary)] font-mono mt-1">{item.source}</p>}
                </div>
              </div>
            )}
          />
        </>
      )}
    </div>
  );
}

export default function ContextManager({ contextItems, onAdd, onUpdate, onDelete, projectId }) {
  const [activeTab, setActiveTab]   = useState('entries'); // 'entries' | 'summary'
  const [showForm, setShowForm]     = useState(false);
  const [showPdfUpload, setPdfUpload] = useState(false);
  const [editing, setEditing]       = useState(null);
  const [activeFilter, setFilter]   = useState('all');

  const handleSave = async (data) => {
    if (editing) {
      await onUpdate(editing.id, data);
      setEditing(null);
    } else {
      await onAdd(data);
      setShowForm(false);
    }
  };

  const handleEdit = (item) => {
    setShowForm(false);
    setPdfUpload(false);
    setEditing(item);
  };

  const filtered = activeFilter === 'all'
    ? contextItems
    : contextItems.filter(i => i.category === activeFilter);

  const countFor = (id) => contextItems.filter(i => i.category === id).length;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="title-xl">Context Manager</h1>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1">
              Quotes, danger flags, and documents that feed into AI reports.
            </p>
          </div>
          {activeTab === 'entries' && !showForm && !editing && !showPdfUpload && (
            <div className="flex gap-2">
              <motion.button
                whileTap={{ scale: 0.94 }}
                whileHover={{ scale: 1.03 }}
                transition={spring}
                onClick={() => setPdfUpload(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 text-white text-[13px] font-semibold cursor-pointer hover:bg-sky-600 transition-colors"
              >
                <FileUp className="w-4 h-4" />
                Upload Document
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.94 }}
                whileHover={{ scale: 1.03 }}
                transition={spring}
                onClick={() => { setPdfUpload(false); setShowForm(true); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-white text-[13px] font-semibold shadow-brand-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Entry
              </motion.button>
            </div>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mt-4 p-1 bg-[var(--surface-2)] rounded-xl w-fit border border-[var(--border-color)]">
          {[
            { id: 'entries', label: 'Entries', icon: List },
            { id: 'summary', label: 'Summary', icon: LayoutDashboard },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer',
                activeTab === id
                  ? 'bg-white shadow-sm text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Summary tab */}
      <AnimatePresence mode="wait">
        {activeTab === 'summary' && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring}
          >
            <ContextSummary contextItems={contextItems} projectId={projectId} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entries tab */}
      {activeTab === 'entries' && <>

      {/* PDF Upload panel */}
      <AnimatePresence>
        {showPdfUpload && (
          <motion.div
            key="pdf-panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={spring}
            className="mb-6"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">Document uploaden</span>
              <button
                onClick={() => setPdfUpload(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-white/70 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <PDFUploadPanel onSuccess={async (data) => { await onAdd(data); setPdfUpload(false); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add / Edit form */}
      <AnimatePresence>
        {(showForm || editing) && (
          <ContextForm
            key={editing?.id || 'new'}
            initial={editing}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        )}
      </AnimatePresence>

      {/* Category filter pills */}
      <motion.div
        className="flex gap-2 flex-wrap mb-5"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.06 }}
      >
        <button
          onClick={() => setFilter('all')}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-[12px] font-semibold border transition-colors cursor-pointer',
            activeFilter === 'all'
              ? 'bg-brand text-white border-brand'
              : 'bg-white/70 text-[var(--text-secondary)] border-[var(--border-color)] hover:border-brand/40'
          )}
        >
          All ({contextItems.length})
        </button>
        {CATEGORIES.map(cat => {
          const CI = cat.icon;
          const count = countFor(cat.id);
          return (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold border transition-colors cursor-pointer',
                activeFilter === cat.id
                  ? cn(cat.pill, 'border-transparent')
                  : 'bg-white/70 text-[var(--text-secondary)] border-[var(--border-color)] hover:border-brand/40'
              )}
            >
              <CI className={cn('w-3 h-3', activeFilter === cat.id ? '' : cat.color)} />
              {cat.label} {count > 0 && `(${count})`}
            </button>
          );
        })}
      </motion.div>

      {/* Danger warning banner */}
      <AnimatePresence>
        {contextItems.filter(i => i.category === 'danger').length > 0 && (activeFilter === 'all' || activeFilter === 'danger') && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 mb-5"
          >
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-[12px] text-red-700 font-medium">
              {contextItems.filter(i => i.category === 'danger').length} danger flag{contextItems.filter(i => i.category === 'danger').length > 1 ? 's' : ''} active — these will be highlighted in daily reports.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Items */}
      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20"
        >
          <div className="w-16 h-16 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-[var(--text-tertiary)]" />
          </div>
          <p className="text-[14px] font-medium text-[var(--text-secondary)]">Nog geen contextitems</p>
          <p className="text-[13px] text-[var(--text-tertiary)] mt-1">
            Voeg offertes, risicovlaggen of contractnotities toe om uw dagrapporten te verrijken.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map(item => (
              <ContextCard
                key={item.id}
                item={item}
                onEdit={handleEdit}
                onDelete={onDelete}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      </>}
    </div>
  );
}
