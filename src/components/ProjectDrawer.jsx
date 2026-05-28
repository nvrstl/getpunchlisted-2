import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Trash2, Mail, Phone, Copy, Check, Send, Loader2,
  Paperclip, FileText, Users, MessageSquare, Upload,
} from 'lucide-react';
import { cn } from '../lib/utils';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// Mirror the pdf.js worker setup used in ContextManager so PDF extraction
// works the same way regardless of which upload UI the user clicks.
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

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

const EXTRACTORS = {
  'application/pdf': extractPdfText,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': extractXlsxText,
  'application/vnd.ms-excel': extractXlsxText,
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Generic right-side drawer                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

export function Drawer({ open, onClose, title, eyebrow, children, width = 480 }) {
  // Lock body scroll while open + close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 z-40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
            style={{ width, background: '#F5F2E8', boxShadow: '-12px 0 40px rgba(40,0,99,0.18)' }}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <header className="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <div>
                {eyebrow && <span className="eyebrow">{eyebrow}</span>}
                <h2 className="title-xl mt-0.5">{title}</h2>
              </div>
              <button onClick={onClose}
                      className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/[0.05] cursor-pointer"
                      aria-label="Sluiten">
                <X className="w-4 h-4 text-[#0c0040]" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CONTEXT panel — upload offerte / lastenboek / contract                     */
/* ─────────────────────────────────────────────────────────────────────────── */

const CTX_CATEGORIES = [
  { id: 'quote',                  label: 'Offerte' },
  { id: 'contract_client',        label: 'Contract opdrachtgever',  hint: 'Contract met de bouwheer / eindklant' },
  { id: 'contract_subcontractor', label: 'Contract onderaannemer',  hint: 'Contract met een onderaannemer of leverancier' },
  { id: 'lastenboek',             label: 'Lastenboek' },
  { id: 'email',                  label: 'E-mail' },
  { id: 'note',                   label: 'Notitie' },
];

// Map legacy 'contract' entries (pre-split) into the client bucket for display.
const CTX_CATEGORY_FALLBACK = { contract: 'contract_client' };

export function ContextPanel({ project, contextItems = [], onAdd, onDelete, forwardingEmail }) {
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState('quote');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [source, setSource] = useState('');
  const [rawText, setRawText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const [copied, setCopied] = useState(false);
  // Multi-step progress for PDF/Excel upload (mirrors ContextManager's panel).
  const [uploadPhase, setUploadPhase] = useState(null); // null | 'extracting' | 'processing' | 'done' | 'error'
  const [uploadStats, setUploadStats] = useState({ fileName: null, pagesDone: 0, pagesTotal: 0, chars: 0, summaryLen: 0 });

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setSource(file.name);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    setError('');

    // Plain-text files: just inline the contents, no AI processing needed.
    if (file.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(file.name)) {
      const text = await file.text();
      const capped = text.slice(0, 50000);
      setContent(capped);
      setRawText(capped);
      return;
    }

    // PDF / Excel: extract text → AI summary → auto-fill the form fields,
    // store the raw text so the chat can quote verbatim.
    const extractor = EXTRACTORS[file.type];
    if (!extractor) {
      setError('Alleen PDF, Excel (.xlsx) en tekstbestanden worden ondersteund.');
      return;
    }

    setUploadPhase('extracting');
    setUploadStats({ fileName: file.name, pagesDone: 0, pagesTotal: 0, chars: 0, summaryLen: 0 });
    try {
      const { text, pages, chars } = await extractor(file, ({ done, total }) =>
        setUploadStats(s => ({ ...s, pagesDone: done, pagesTotal: total }))
      );
      if (!text.trim()) throw new Error('Geen tekst gevonden in dit bestand (mogelijk een gescande PDF zonder OCR).');
      setUploadStats(s => ({ ...s, pages, chars }));

      setUploadPhase('processing');
      const excerpt = text.length > 40000 ? text.slice(0, 40000) : text;
      const res = await fetch('/api/process-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: excerpt, filename: file.name }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'AI-verwerking mislukt');
      const { title: aiTitle, summary, keyPoints, category: aiCategory } = json.data;
      const composed = [summary, '', ...(keyPoints || []).map(k => `• ${k}`)].join('\n');

      setTitle(aiTitle || file.name.replace(/\.[^.]+$/, ''));
      setContent(composed);
      setCategory(aiCategory || 'quote');
      setRawText(excerpt.length > 80000 ? excerpt.slice(0, 80000) : excerpt);
      setUploadStats(s => ({ ...s, summaryLen: composed.length }));
      setUploadPhase('done');
      setTimeout(() => setUploadPhase(null), 2000);
    } catch (err) {
      setError(err.message);
      setUploadPhase('error');
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('Titel en inhoud zijn verplicht.');
      return;
    }
    setSubmitting(true); setError('');
    try {
      await onAdd({
        category,
        title: title.trim(),
        content: content.trim(),
        source: source.trim() || null,
        raw_text: rawText || null,
      });
      setTitle(''); setContent(''); setSource(''); setRawText(''); setAdding(false);
      setUploadPhase(null);
    } catch (err) {
      setError(err.message || 'Kon niet toevoegen.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (text) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const normalizedCategory = (raw) => CTX_CATEGORY_FALLBACK[raw] ?? raw;
  const grouped = CTX_CATEGORIES.map(c => ({
    ...c,
    items: contextItems.filter(i => normalizedCategory(i.category) === c.id),
  }));
  const activeCat = CTX_CATEGORIES.find(c => c.id === category);

  return (
    <div className="p-5 space-y-5">
      {/* Forwarding email */}
      {forwardingEmail && (
        <div className="paper-card-tight px-4 py-3">
          <div className="eyebrow mb-1.5">Stuur mails door</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[12px] font-mono text-[#0c0040] truncate">{forwardingEmail}</code>
            <button onClick={() => handleCopy(forwardingEmail)}
                    className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-black/[0.05] cursor-pointer"
                    title="Kopieer">
              {copied ? <Check className="w-3.5 h-3.5 text-[#0c7a5e]" /> : <Copy className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />}
            </button>
          </div>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5 leading-snug">
            Forward klanten- of leveranciersmails naar dit adres — Punchlister voegt ze toe als context.
          </p>
        </div>
      )}

      {/* Add button / form */}
      {!adding ? (
        <button onClick={() => setAdding(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer"
                style={{ background: '#280063', color: '#fff' }}>
          <Plus className="w-4 h-4" /> Document toevoegen
        </button>
      ) : (
        <form onSubmit={handleAdd} className="paper-card p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {CTX_CATEGORIES.map(c => (
              <button type="button" key={c.id}
                      onClick={() => setCategory(c.id)}
                      className={cn('px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer',
                                    category === c.id ? 'bg-[#280063] text-white' : 'bg-black/[0.04] text-[var(--text-secondary)]')}>
                {c.label}
              </button>
            ))}
          </div>
          {activeCat?.hint && (
            <p className="text-[11px] text-[var(--text-tertiary)] -mt-1.5 leading-snug">{activeCat.hint}</p>
          )}
          <input type="text" placeholder="Titel"
                 value={title} onChange={e => setTitle(e.target.value)}
                 className="w-full px-3 py-2 rounded-md bg-white border border-black/10 text-[13px] outline-none focus:border-[#7669ff]/50" />
          <input type="text" placeholder="Bron (optioneel)"
                 value={source} onChange={e => setSource(e.target.value)}
                 className="w-full px-3 py-2 rounded-md bg-white border border-black/10 text-[13px] outline-none focus:border-[#7669ff]/50" />
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.txt,.md,.csv" onChange={handleFile} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()}
                    disabled={uploadPhase === 'extracting' || uploadPhase === 'processing'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-black/10 hover:bg-black/[0.04] cursor-pointer text-[#0c0040] disabled:opacity-50">
              <Upload className="w-3.5 h-3.5" /> Upload bestand
            </button>
            <span className="text-[11px] text-[var(--text-tertiary)]">of plak hieronder</span>
          </div>

          {/* PDF/Excel processing progress */}
          {uploadPhase && uploadPhase !== 'error' && (
            <div className="paper-card-tight px-3 py-2.5 space-y-1.5">
              {uploadStats.fileName && (
                <p className="text-[11px] font-mono text-[var(--text-tertiary)] truncate">{uploadStats.fileName}</p>
              )}
              {[
                {
                  key: 'extracting',
                  label: uploadStats.pagesTotal > 0 && uploadPhase === 'extracting'
                    ? `Tekst uit document lezen (${uploadStats.pagesDone}/${uploadStats.pagesTotal})`
                    : 'Tekst uit document lezen',
                  hint: uploadStats.chars > 0
                    ? `${uploadStats.pages} pagina${uploadStats.pages === 1 ? '' : '\'s'} · ${uploadStats.chars.toLocaleString('nl-BE')} karakters`
                    : null,
                },
                {
                  key: 'processing',
                  label: 'AI samenvatting genereren',
                  hint: uploadStats.summaryLen > 0
                    ? `${uploadStats.summaryLen} karakters samenvatting`
                    : null,
                },
              ].map(step => {
                const order = ['extracting', 'processing', 'done'];
                const idx = order.indexOf(uploadPhase);
                const stepIdx = order.indexOf(step.key);
                const st = idx > stepIdx ? 'done' : idx === stepIdx ? 'active' : 'pending';
                return (
                  <div key={step.key} className="flex items-start gap-2">
                    <div className={cn(
                      'w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                      st === 'done'    && 'bg-[#d4f7ec]',
                      st === 'active'  && 'bg-brand/15',
                      st === 'pending' && 'bg-black/[0.06]',
                    )}>
                      {st === 'done'   && <Check className="w-2.5 h-2.5 text-[#0c7a5e]" />}
                      {st === 'active' && <Loader2 className="w-2.5 h-2.5 text-brand animate-spin" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-[12px]',
                        st === 'pending' ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]',
                      )}>{step.label}</p>
                      {step.hint && st !== 'pending' && (
                        <p className="text-[10.5px] text-[var(--text-tertiary)]">{step.hint}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {uploadPhase === 'done' && (
                <p className="text-[11px] text-[#075e48] font-medium pt-1">Klaar — controleer de velden en klik Toevoegen.</p>
              )}
            </div>
          )}
          <textarea placeholder="Inhoud (plak offerte-tekst, lastenboek, of mail body)"
                    value={content} onChange={e => setContent(e.target.value)} rows={8}
                    className="w-full px-3 py-2 rounded-md bg-white border border-black/10 text-[12.5px] outline-none focus:border-[#7669ff]/50 resize-y" />
          {error && <p className="text-[12px] text-[#9b1d1d]">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer disabled:opacity-50"
                    style={{ background: '#280063', color: '#fff' }}>
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Toevoegen
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(''); }}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium border border-black/10 hover:bg-black/[0.04] cursor-pointer text-[#0c0040]">
              Annuleer
            </button>
          </div>
        </form>
      )}

      {/* List grouped by category */}
      <div className="space-y-4">
        {grouped.filter(g => g.items.length > 0).map(g => (
          <div key={g.id}>
            <div className="eyebrow mb-2">{g.label} ({g.items.length})</div>
            <div className="space-y-1.5">
              {g.items.map(item => (
                <div key={item.id} className="paper-card-tight px-3.5 py-2.5 flex items-start gap-2.5">
                  <FileText className="w-3.5 h-3.5 text-[#7669ff] mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[#0c0040] truncate">{item.title}</div>
                    {item.source && <div className="text-[11px] text-[var(--text-tertiary)] truncate">{item.source}</div>}
                  </div>
                  <button onClick={() => onDelete(item.id)}
                          className="text-[var(--text-tertiary)] hover:text-[#9b1d1d] cursor-pointer flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {contextItems.length === 0 && !adding && (
          <p className="text-[12.5px] text-[var(--text-tertiary)] text-center py-6">
            Nog geen documenten geüpload.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CONTACTEN panel                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

const CONTACT_ROLES = ['Klant', 'Architect', 'Schilder', 'Loodgieter', 'Elektricien', 'Bouwheer', 'Onderaannemer', 'Leverancier', 'Andere'];

export function ContactsPanel({ contacts = [], onAdd, onUpdate, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const blank = { name: '', role: 'Klant', email: '', phone: '', notes: '' };
  const [form, setForm] = useState(blank);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const startEdit = (c) => {
    setForm({ name: c.name || '', role: c.role || 'Andere', email: c.email || '', phone: c.phone || '', notes: c.notes || '' });
    setEditId(c.id); setAdding(false);
  };
  const startAdd = () => {
    setForm(blank); setEditId(null); setAdding(true);
  };
  const cancel = () => {
    setAdding(false); setEditId(null); setForm(blank); setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Naam verplicht.'); return; }
    setSubmitting(true); setError('');
    try {
      if (editId) await onUpdate(editId, form);
      else        await onAdd(form);
      cancel();
    } catch (err) {
      setError(err.message || 'Kon niet opslaan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-5 space-y-4">
      {!adding && !editId && (
        <button onClick={startAdd}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer"
                style={{ background: '#280063', color: '#fff' }}>
          <Plus className="w-4 h-4" /> Contact toevoegen
        </button>
      )}

      {(adding || editId) && (
        <form onSubmit={submit} className="paper-card p-4 space-y-2.5">
          <input type="text" placeholder="Naam *" autoFocus
                 value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                 className="w-full px-3 py-2 rounded-md bg-white border border-black/10 text-[13px] outline-none focus:border-[#7669ff]/50" />
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md bg-white border border-black/10 text-[13px] outline-none focus:border-[#7669ff]/50">
            {CONTACT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="email" placeholder="E-mail"
                 value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                 className="w-full px-3 py-2 rounded-md bg-white border border-black/10 text-[13px] outline-none focus:border-[#7669ff]/50" />
          <input type="tel" placeholder="Telefoon"
                 value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                 className="w-full px-3 py-2 rounded-md bg-white border border-black/10 text-[13px] outline-none focus:border-[#7669ff]/50" />
          <textarea placeholder="Notities (optioneel)" rows={2}
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2 rounded-md bg-white border border-black/10 text-[12.5px] outline-none focus:border-[#7669ff]/50 resize-y" />
          {error && <p className="text-[12px] text-[#9b1d1d]">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer disabled:opacity-50"
                    style={{ background: '#280063', color: '#fff' }}>
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {editId ? 'Opslaan' : 'Toevoegen'}
            </button>
            <button type="button" onClick={cancel}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium border border-black/10 hover:bg-black/[0.04] cursor-pointer text-[#0c0040]">
              Annuleer
            </button>
          </div>
        </form>
      )}

      <div className="space-y-1.5">
        {contacts.length === 0 && !adding ? (
          <p className="text-[12.5px] text-[var(--text-tertiary)] text-center py-6">
            Nog geen contacten.
          </p>
        ) : contacts.map(c => (
          <div key={c.id} className="paper-card-tight px-3.5 py-3 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                 style={{ background: 'linear-gradient(135deg, #7669ff 0%, #ffabff 100%)' }}>
              {c.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <button onClick={() => startEdit(c)}
                        className="text-[13.5px] font-semibold text-[#0c0040] cursor-pointer hover:underline truncate text-left">
                  {c.name}
                </button>
                {c.role && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0"
                        style={{ background: '#ece9ff', color: '#3a31a8' }}>
                    {c.role}
                  </span>
                )}
              </div>
              {c.email && (
                <a href={`mailto:${c.email}`} className="text-[11.5px] text-[var(--text-secondary)] flex items-center gap-1 mt-0.5 hover:text-[#280063]">
                  <Mail className="w-3 h-3" /> {c.email}
                </a>
              )}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="text-[11.5px] text-[var(--text-secondary)] flex items-center gap-1 mt-0.5 hover:text-[#280063]">
                  <Phone className="w-3 h-3" /> {c.phone}
                </a>
              )}
              {c.notes && <p className="text-[11.5px] text-[var(--text-tertiary)] mt-1 leading-snug">{c.notes}</p>}
            </div>
            <button onClick={() => onDelete(c.id)}
                    className="text-[var(--text-tertiary)] hover:text-[#9b1d1d] cursor-pointer flex-shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CHAT panel                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

// Render assistant text with [memo:<uuid>] markers turned into clickable
// chips that fire a global event for App to handle (jump to inbox + open).
function renderAssistantContent(text) {
  if (!text) return null;
  const re = /\[memo:([0-9a-f-]{36})\]/g;
  const out = [];
  let last = 0;
  let m;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const id = m[1];
    out.push(
      <button
        key={`memo-${idx++}-${id}`}
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('punchlister:open-memo', { detail: { id } }))}
        className="inline-flex items-center align-baseline ml-0.5 px-1.5 py-0 rounded-md bg-[#ece9ff] text-[#3a31a8] text-[11px] font-semibold hover:bg-[#d8d2ff] cursor-pointer transition-colors"
        title="Open dit inbox-item"
      >
        ↗ memo
      </button>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Phased status — the chat endpoint does context-gathering + LLM call in
// one HTTP request, so we can't actually observe phase transitions. We
// approximate with a timer: show "context" for the first 1.2s, then switch
// to "thinking". Good enough to convey "still working, not stuck."
function PhasedChatIndicator({ phase }) {
  const meta = {
    context:  { label: 'Context verzamelen…',   width: '35%', hint: 'Memo\'s en documenten ophalen' },
    thinking: { label: 'Antwoord genereren…',   width: '75%', hint: 'Punchlister verwerkt je vraag' },
  }[phase] || { label: 'Bezig…', width: '50%', hint: '' };
  return (
    <div className="px-3.5 py-2.5 rounded-2xl bg-white border border-black/5 rounded-tl-sm min-w-[200px]">
      <div className="flex items-center gap-2 mb-1.5">
        <Loader2 className="w-3 h-3 animate-spin text-[#7669ff]" />
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">{meta.label}</span>
      </div>
      {meta.hint && (
        <div className="text-[10px] text-[var(--text-tertiary)] mb-2">{meta.hint}</div>
      )}
      <div className="h-1 w-full bg-black/[0.06] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#7669ff] to-[#ffabff]"
          initial={{ width: '5%' }}
          animate={{ width: meta.width }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export function ChatPanel({ projectId, projectName }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState(null);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (e) => {
    e?.preventDefault?.();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setError('');
    setDraft('');
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setPhase('context');
    // After ~1.2s we're almost certainly past the SQL phase — promote to thinking.
    const tid = setTimeout(() => setPhase('thinking'), 1200);
    try {
      const res = await fetch('/api/project-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, message: text, history: messages }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Chat failed');
      setMessages(prev => [...prev, { role: 'assistant', content: json.reply }]);
    } catch (err) {
      setError(err.message);
      setMessages(prev => [...prev, { role: 'assistant', content: `Fout: ${err.message}` }]);
    } finally {
      clearTimeout(tid);
      setSending(false);
      setPhase(null);
    }
  };

  const suggestions = [
    'Wat is de status van de meerwerken?',
    'Wat zijn de openstaande punten?',
    'Welke afspraken hebben we met de klant gemaakt?',
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 && (
          <>
            <p className="text-[13px] text-[var(--text-secondary)] mb-3">
              Stel een vraag over <strong>{projectName}</strong>. Punchlister antwoordt op basis van memo's, contacten en geüploade documenten.
            </p>
            <div className="space-y-1.5">
              {suggestions.map(s => (
                <button key={s} onClick={() => setDraft(s)}
                        className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] cursor-pointer paper-card-tight hover:bg-white">
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed',
                               m.role === 'user'
                                 ? 'bg-[#280063] text-white rounded-tr-sm'
                                 : 'bg-white border border-black/5 text-[#0c0040] rounded-tl-sm')}>
              <p style={{ whiteSpace: 'pre-wrap' }}>
                {m.role === 'assistant' ? renderAssistantContent(m.content) : m.content}
              </p>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <PhasedChatIndicator phase={phase} />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="border-t border-black/5 p-4 flex items-end gap-2"
            style={{ background: 'rgba(255,255,255,0.6)' }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }}
          placeholder="Stel een vraag…"
          rows={1}
          className="flex-1 px-3 py-2 rounded-lg bg-white border border-black/10 text-[13px] outline-none focus:border-[#7669ff]/50 resize-none"
          style={{ minHeight: 38, maxHeight: 120 }}
        />
        <button type="submit" disabled={!draft.trim() || sending}
                className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                style={{ background: '#280063', color: '#fff' }}>
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Top-bar buttons                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

export function ProjectTopActions({ onOpenContext, onOpenContacts, onOpenChat, contextCount = 0, contactsCount = 0 }) {
  const Btn = ({ icon: Icon, label, count, onClick }) => (
    <button onClick={onClick}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium hover:bg-black/[0.04] cursor-pointer text-[#0c0040]"
            title={label}>
      <Icon className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
      <span className="hidden md:inline">{label}</span>
      {count > 0 && (
        <span className="inline-flex items-center px-1 rounded text-[10px] font-semibold"
              style={{ background: '#ece9ff', color: '#3a31a8' }}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex items-center gap-1">
      <Btn icon={Paperclip}     label="Context"   count={contextCount}  onClick={onOpenContext} />
      <Btn icon={Users}         label="Contacten" count={contactsCount} onClick={onOpenContacts} />
      <Btn icon={MessageSquare} label="Chat"                            onClick={onOpenChat} />
    </div>
  );
}
