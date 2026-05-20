import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, FileText, Loader2, X, Send, CheckCircle,
  Clock, Edit3, Trash2, ChevronRight, Copy, Check, Mail, Calculator,
  Layers, Receipt, BookOpen, Info, Euro, RefreshCw,
} from 'lucide-react';
import { getGmailConnection, sendGmail } from '../lib/gmail';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { ShimmerButton } from '../components/magicui/shimmer';
import { cn } from '../lib/utils';

const spring = { type: 'spring', stiffness: 300, damping: 28 };

async function streamPricing(params, { onDelta, signal } = {}) {
  const res = await fetch('/api/price-rfi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || `HTTP ${res.status}`);
  }

  // Plain JSON fallback (local dev Express server returns { success, proposition })
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream')) {
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Prijsberekening mislukt');
    return json.proposition;
  }

  // SSE streaming path (Vercel serverless)
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        const evt = JSON.parse(raw);
        if (evt.error) throw new Error(evt.error);
        if (evt.delta && onDelta) onDelta(evt.delta);
        if (evt.done) return evt.proposition;
      }
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error('Stream ended without result');
}

const STATUS_LABEL = {
  draft:            'Concept',
  pending_approval: 'Wacht op goedkeuring klant',
  goedgekeurd:      'Goedgekeurd',
  work_executed:    'Werk uitgevoerd',
  gefactureerd:     'Gefactureerd',
  geweigerd:        'Geweigerd',
};

const STATUS_BADGE = {
  draft:            'secondary',
  pending_approval: 'warning',
  goedgekeurd:      'success',
  work_executed:    'info',
  gefactureerd:     'success',
  geweigerd:        'secondary',
};

const STATUS_ICON = {
  draft:            <Edit3 className="w-3 h-3" />,
  pending_approval: <Clock className="w-3 h-3" />,
  goedgekeurd:      <CheckCircle className="w-3 h-3" />,
  work_executed:    <Layers className="w-3 h-3" />,
  gefactureerd:     <Receipt className="w-3 h-3" />,
  geweigerd:        <X className="w-3 h-3" />,
};

function RFIDraft({ text }) {
  if (!text) return null;
  return (
    <div className="space-y-1">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('**') && line.endsWith('**'))
          return <p key={i} className="font-semibold text-[var(--text-primary)] text-[13px] mt-3 first:mt-0">{line.replace(/\*\*/g, '')}</p>;
        if (line.startsWith('- ') || line.startsWith('• '))
          return <p key={i} className="text-[13px] text-[var(--text-secondary)] pl-4">• {line.slice(2)}</p>;
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return <p key={i} className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

// ── Pricing proposition parser & renderer ─────────────────────────────────────

const VAT_RATE = 0.21;

const STATIC_ASSUMPTIONS = [
  'Prijzen gebaseerd op standaard werkuren (ma–vr, 07:00–17:00)',
  'Eenheidsprijzen exclusief reiskosten en werfspecifieke toegangsbeperkingen',
  'BTW 21% — renovatietarief 6% kan van toepassing zijn, controleer met klant',
  'Hoeveelheden zijn ramingen op basis van werfobservaties — definitieve meting op werf',
  'Geldig gedurende 30 dagen na uitgifte',
];

// Rows to skip: separator lines, echo of header text, empty descriptions
function isGarbageRow(desc) {
  if (!desc || !desc.trim()) return true;
  if (/^[-=|#\s]+$/.test(desc.trim())) return true;           // dashes, pipes, etc.
  if (/^(description|item|omschrijving)$/i.test(desc.trim())) return true; // header echo
  return false;
}

function fmtEur(n) {
  return '€\u00A0' + Number(n).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parsePricingProposition(text) {
  // ── Path 1: new JSON format ───────────────────────────────────────────────
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      if (Array.isArray(data.items)) {
        const items = data.items
          .map(it => {
            const description = String(it.description || '').trim();
            const qty         = Number(it.qty)        || 1;
            const unit        = String(it.unit        || 'ls').trim();
            const unitRate    = Number(it.unit_rate)  || 0;
            const subtotal    = qty * unitRate;
            const isCredit    = subtotal < 0 || /credit|deduct|reduction/i.test(description);
            return { description, qty, unit, unitRate, subtotal, isCredit };
          })
          .filter(r => !isGarbageRow(r.description));

        const subtotalExclVat = items.reduce((s, r) => s + r.subtotal, 0);
        const vat             = subtotalExclVat * VAT_RATE;
        const totalInclVat    = subtotalExclVat + vat;
        return { items, subtotalExclVat, vat, totalInclVat };
      }
    }
  } catch (e) {
    console.warn('[price-rfi] JSON parse failed, falling back to text parser', e.message);
  }

  // ── Path 2: legacy plain-text format (old saved propositions) ────────────
  const items = [];
  let inBreakdown = false;

  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    if (/^\*\*COST\s+BREAKDOWN/i.test(t)) { inBreakdown = true;  continue; }
    if (/^\*\*/.test(t))                  { inBreakdown = false; continue; }
    if (!inBreakdown) continue;

    // Strip bullet / leading number
    const stripped = t.replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '');

    // Try "Description: €1,200" or "Description: 1200.00"
    const m = stripped.match(/^(.+?):\s*(-?[$€£]?[\d\s,.']+(?:\s*excl\.?\s*VAT)?)\s*$/i);
    if (m) {
      const description = m[1].trim();
      if (isGarbageRow(description)) continue;
      const unitRate = parseFloat(m[2].replace(/[^0-9.\-]/g, '')) || 0;
      const isCredit = unitRate < 0 || /credit|deduct|reduction/i.test(description);
      items.push({ description, qty: 1, unit: 'ls', unitRate, subtotal: unitRate, isCredit });
    }
  }

  const subtotalExclVat = items.reduce((s, r) => s + r.subtotal, 0);
  const vat             = subtotalExclVat * VAT_RATE;
  const totalInclVat    = subtotalExclVat + vat;
  return { items, subtotalExclVat, vat, totalInclVat };
}

function PricingTab({ proposition, loadingPrice, streamingText, priceError, onRegenerate, contextItems }) {
  if (loadingPrice) {
    if (streamingText) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-tertiary)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-brand flex-shrink-0" />
            <span>
              {contextItems.length > 0
                ? `${contextItems.length} contextitem${contextItems.length !== 1 ? 's' : ''} analyseren…`
                : 'Schatting op basis van meerwerk details…'}
            </span>
          </div>
          <pre className="rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] p-4 font-mono text-[10px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed max-h-52 overflow-y-auto">
            {streamingText}<span className="animate-pulse text-brand">▌</span>
          </pre>
        </div>
      );
    }
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-10 rounded-xl bg-[var(--surface-2)]" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 rounded-lg bg-[var(--surface-2)]" style={{ opacity: 1 - i * 0.15 }} />
        ))}
        <p className="text-center text-[11px] text-[var(--text-tertiary)] pt-1">
          {contextItems.length > 0
            ? `${contextItems.length} contextitem${contextItems.length !== 1 ? 's' : ''} analyseren…`
            : 'Schatten op basis van meerwerk-details…'}
        </p>
      </div>
    );
  }

  if (priceError) {
    return (
      <div className="text-center py-10 space-y-3">
        <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl max-w-xs mx-auto">{priceError}</p>
        <motion.button
          onClick={onRegenerate}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-white text-[13px] font-semibold cursor-pointer"
          whileTap={{ scale: 0.97 }} transition={spring}
        >
          <Calculator className="w-4 h-4" /> Opnieuw proberen
        </motion.button>
      </div>
    );
  }

  const parsed = proposition ? parsePricingProposition(proposition) : null;
  const items  = parsed?.items ?? [];
  const { subtotalExclVat = 0, vat = 0, totalInclVat = 0 } = parsed ?? {};

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center">
          <Calculator className="w-6 h-6 text-[var(--text-tertiary)]" />
        </div>
        <p className="text-[13px] text-[var(--text-secondary)] max-w-xs leading-relaxed">
          Nog geen prijsopgave — klik om een kostenraming te genereren.
        </p>
        <motion.button
          onClick={onRegenerate}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-white text-[13px] font-semibold cursor-pointer mt-1"
          whileTap={{ scale: 0.97 }} transition={spring}
        >
          <Calculator className="w-4 h-4" /> Prijsopgave genereren
        </motion.button>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Cost breakdown table ── */}
      <div className="rounded-xl shadow-sm border border-[var(--border-color)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-[var(--surface-2)] border-b border-[var(--border-color)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--text-tertiary)] text-[11px] uppercase tracking-wider w-8">#</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-tertiary)] text-[11px] uppercase tracking-wider">Omschrijving</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--text-tertiary)] text-[11px] uppercase tracking-wider w-20">Aantal</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--text-tertiary)] text-[11px] uppercase tracking-wider w-36">Eenheidsprijs (excl. BTW)</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--text-tertiary)] text-[11px] uppercase tracking-wider w-32">Subtotaal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={i} className={cn(
                  'border-b border-[var(--border-color)] transition-colors',
                  i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
                )}>
                  <td className="px-4 py-3 text-center text-[11px] font-semibold text-[var(--text-tertiary)]">{i + 1}</td>
                  <td className={cn('px-4 py-3 text-left leading-snug', row.isCredit ? 'text-red-600' : 'text-[var(--text-secondary)]')}>
                    {row.description}
                  </td>
                  <td className={cn('px-4 py-3 text-right tabular-nums', row.isCredit ? 'text-red-600' : 'text-[var(--text-secondary)]')}>
                    {row.qty} <span className="text-[11px] text-[var(--text-tertiary)]">{row.unit}</span>
                  </td>
                  <td className={cn('px-4 py-3 text-right tabular-nums', row.isCredit ? 'text-red-600' : 'text-[var(--text-secondary)]')}>
                    {fmtEur(row.unitRate)}
                  </td>
                  <td className={cn('px-4 py-3 text-right tabular-nums font-semibold', row.isCredit ? 'text-red-600' : 'text-[var(--text-primary)]')}>
                    {fmtEur(row.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--border-color)] bg-[var(--surface-2)]">
                <td colSpan={4} className="px-4 py-3 text-right text-[12px] font-semibold text-[var(--text-secondary)]">Subtotaal excl. BTW</td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-[var(--text-primary)]">{fmtEur(subtotalExclVat)}</td>
              </tr>
              <tr className="bg-[var(--surface-2)]">
                <td colSpan={4} className="px-4 py-3 text-right text-[12px] text-[var(--text-tertiary)]">BTW 21%</td>
                <td className="px-4 py-3 text-right tabular-nums text-[var(--text-tertiary)]">{fmtEur(vat)}</td>
              </tr>
              <tr className="bg-brand/5 border-t border-brand/20">
                <td colSpan={4} className="px-4 py-3 text-right text-[13px] font-bold text-[var(--text-primary)]">Totaal incl. BTW</td>
                <td className="px-4 py-3 text-right tabular-nums text-[15px] font-extrabold" style={{ color: '#7669ff' }}>{fmtEur(totalInclVat)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Assumptions ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="font-medium text-amber-900 mb-2 flex items-center gap-1.5">
          ⚠️ Veronderstellingen
        </p>
        <ul className="space-y-1.5">
          {STATIC_ASSUMPTIONS.map((a, i) => (
            <li key={i} className="flex gap-2 text-sm text-amber-800 leading-snug">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
              {a}
            </li>
          ))}
        </ul>
      </div>

    </div>
  );
}

function CreateRFIModal({ onClose, onSave, fieldLogs }) {
  const [title, setTitle]             = useState('');
  const [context, setContext]         = useState('');
  const [selectedLog, setSelectedLog] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const handleLogSelect = (e) => {
    const id = e.target.value;
    setSelectedLog(id);
    if (id) {
      const log = fieldLogs.find(l => l.id === id);
      if (log) {
        if (!title) setTitle(log.processedSummary || log.rawNote.slice(0, 80));
        setContext(log.rawNote);
      }
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError('');
    const rfiNumber = `RFI-${String(Date.now()).slice(-3)}`;
    try {
      const res  = await fetch('/api/draft-rfi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: rfiNumber, title: title.trim(), context: context.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      onSave({ title: title.trim(), context: context.trim(), draft: json.draft, fieldLogId: selectedLog });
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-lg max-h-[90vh] flex flex-col md:rounded-2xl rounded-t-3xl glass-modal"
        initial={{ y: 60, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.97 }}
        transition={spring}
      >
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
        </div>
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0 border-b border-[var(--border-color)]">
          <div>
            <h2 className="font-bold text-[var(--text-primary)] text-[15px]">Nieuw meerwerk</h2>
            <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">AI stelt het document voor u op</p>
          </div>
          <motion.button
            onClick={onClose}
            aria-label="Sluiten"
            className="p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
            whileTap={{ scale: 0.9 }}
            transition={spring}
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {fieldLogs.length > 0 && (
            <div>
              <label className="label-caps mb-2 block">
                Vanuit werfnotitie <span className="font-normal normal-case text-[var(--text-tertiary)]">(optioneel)</span>
              </label>
              <select
                value={selectedLog}
                onChange={handleLogSelect}
                className="w-full h-10 border border-[var(--border-color)] bg-[var(--surface-2)] rounded-xl px-4 text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/50 cursor-pointer"
              >
                <option value="">— Selecteer een werfnotitie —</option>
                {fieldLogs.slice(0, 20).map(l => (
                  <option key={l.id} value={l.id}>
                    [{l.type || 'general'}] {(l.processedSummary || l.rawNote).slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label-caps mb-2 block">Onderwerp / Titel *</label>
            <Input
              placeholder="bijv. HVAC leidingconflict op verdieping 3"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label-caps mb-2 block">Achtergrond / Context</label>
            <Textarea
              className="h-24"
              placeholder="Beschrijf het probleem, wat u observeerde en wat u wenst te verduidelijken…"
              value={context}
              onChange={e => setContext(e.target.value)}
            />
          </div>
          <AnimatePresence>
            {error && (
              <motion.p
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-xl"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </form>

        <div className="px-6 py-4 flex gap-3 flex-shrink-0 border-t border-[var(--border-color)]">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuleren</Button>
          <ShimmerButton
            type="button"
            onClick={handleSubmit}
            disabled={loading || !title.trim()}
            className="flex-1 justify-center"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Opstellen…</>
              : <><FileText className="w-4 h-4" /> Meerwerk aanmaken</>
            }
          </ShimmerButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

function RFIDetail({ rfi, onClose, onUpdate, onDelete, contextItems = [], project = {} }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(rfi.draft || '');
  const [copied, setCopied]   = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState('rfi');

  // Client email draft — seed from DB, generate only if missing
  const [emailDraft, setEmailDraft]     = useState(rfi.emailDraft || '');
  const [loadingEmail, setLoadingEmail] = useState(!rfi.emailDraft);
  const [emailError, setEmailError]     = useState('');
  const [copiedEmail, setCopiedEmail]   = useState(false);

  // Pricing proposition — seed from DB if it parses to real items (JSON or legacy text)
  const [proposition, setProposition]   = useState(() => {
    const saved = rfi.pricingProposition || '';
    if (!saved) return '';
    return parsePricingProposition(saved).items.length > 0 ? saved : '';
  });
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [priceError, setPriceError]     = useState('');
  const [copiedPrice, setCopiedPrice]   = useState(false);
  const priceGenerated = useRef(!!proposition);

  // Auto-generate client email on mount if not already saved
  useEffect(() => {
    if (rfi.emailDraft) return; // already persisted — nothing to do
    const controller = new AbortController();
    setLoadingEmail(true);
    setEmailError('');
    fetch('/api/draft-rfi-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rfiNumber:  rfi.number,
        rfiTitle:   rfi.title,
        rfiContext: rfi.context,
        rfiDraft:   rfi.draft,
      }),
      signal: controller.signal,
    })
      .then(r => r.json())
      .then(json => {
        if (!json.success) throw new Error(json.error || 'Failed');
        setEmailDraft(json.email);
        onUpdate(rfi.id, { emailDraft: json.email });
      })
      .catch(err => { if (err.name !== 'AbortError') setEmailError(err.message); })
      .finally(() => setLoadingEmail(false));
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate pricing when pricing tab is first opened, if not already saved
  useEffect(() => {
    if (activeTab !== 'pricing' || priceGenerated.current) return;
    priceGenerated.current = true;
    const controller = new AbortController();
    setLoadingPrice(true);
    setStreamingText('');
    setPriceError('');
    streamPricing(
      { rfiTitle: rfi.title, rfiContext: rfi.context, rfiDraft: rfi.draft, contextItems },
      { onDelta: (d) => setStreamingText(t => t + d), signal: controller.signal }
    )
      .then(proposition => {
        setProposition(proposition);
        setStreamingText('');
        onUpdate(rfi.id, { pricingProposition: proposition });
      })
      .catch(err => { if (err.name !== 'AbortError') setPriceError(err.message); })
      .finally(() => setLoadingPrice(false));
    return () => controller.abort();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGeneratePricing = async () => {
    priceGenerated.current = true;
    setLoadingPrice(true);
    setStreamingText('');
    setPriceError('');
    try {
      const proposition = await streamPricing(
        { rfiTitle: rfi.title, rfiContext: rfi.context, rfiDraft: rfi.draft, contextItems },
        { onDelta: (d) => setStreamingText(t => t + d) }
      );
      setProposition(proposition);
      setStreamingText('');
      onUpdate(rfi.id, { pricingProposition: proposition });
    } catch (err) {
      setPriceError(err.message);
    }
    setLoadingPrice(false);
  };

  const handleCopyPrice = () => {
    navigator.clipboard.writeText(proposition);
    setCopiedPrice(true);
    setTimeout(() => setCopiedPrice(false), 2000);
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(emailDraft);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleRefreshEmail = () => {
    setLoadingEmail(true);
    setEmailError('');
    fetch('/api/draft-rfi-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rfiNumber:  rfi.number,
        rfiTitle:   rfi.title,
        rfiContext: rfi.context,
        rfiDraft:   rfi.draft,
      }),
    })
      .then(r => r.json())
      .then(json => {
        if (!json.success) throw new Error(json.error || 'Failed');
        setEmailDraft(json.email);
        onUpdate(rfi.id, { emailDraft: json.email });
      })
      .catch(err => setEmailError(err.message))
      .finally(() => setLoadingEmail(false));
  };

  // Gmail send
  const [gmailConn]       = useState(() => getGmailConnection());
  const [showSend, setShowSend]   = useState(false);
  const [sendTo, setSendTo]       = useState('');
  const [sending, setSending]     = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);

  const handleStatusChange = (status) => onUpdate(rfi.id, { status });
  const handleSaveDraft = () => { onUpdate(rfi.id, { draft }); setEditing(false); };
  const handleCopy = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendGmail = async () => {
    if (!gmailConn || !sendTo.trim() || !draft) return;
    setSending(true);
    setSendError('');
    try {
      await sendGmail({
        token: gmailConn.token,
        to: sendTo.trim(),
        subject: `${rfi.number}: ${rfi.title}`,
        body: draft.replace(/\*\*/g, ''),
      });
      setShowSend(false);
      setSendTo('');
      setSendSuccess(true);
      handleStatusChange('sent');
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (err) {
      setSendError(err.message);
    }
    setSending(false);
  };

  const statusFlow = ['draft', 'pending_approval', 'goedgekeurd', 'work_executed', 'gefactureerd', 'geweigerd'];
  const currentIdx = statusFlow.indexOf(rfi.status);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col md:rounded-2xl rounded-t-3xl glass-modal"
        initial={{ y: 60, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.97 }}
        transition={spring}
      >
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
        </div>
        {/* Header */}
        <div className="px-6 py-5 flex-shrink-0 border-b border-[var(--border-color)]">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-mono text-[var(--text-tertiary)]">{rfi.number}</span>
                <Badge variant={STATUS_BADGE[rfi.status]} className="inline-flex items-center gap-1">
                  {STATUS_ICON[rfi.status]} {STATUS_LABEL[rfi.status] ?? rfi.status}
                </Badge>
              </div>
              <h2 className="font-bold text-[var(--text-primary)] text-[15px] leading-tight">{rfi.title}</h2>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1">Aangemaakt {new Date(rfi.createdAt).toLocaleDateString('nl-BE')}</p>
            </div>
            <motion.button
              onClick={onClose}
              aria-label="Sluiten"
              className="p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer ml-4 flex-shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
              whileTap={{ scale: 0.9 }}
              transition={spring}
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Status stepper */}
        <div className="px-6 py-3 flex-shrink-0 flex items-center gap-0.5 flex-wrap border-b border-[var(--border-color)] bg-[var(--surface-2)]">
          {statusFlow.map((s, i) => (
            <React.Fragment key={s}>
              <motion.button
                onClick={() => handleStatusChange(s)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors duration-150 cursor-pointer',
                  rfi.status === s
                    ? 'bg-brand text-white font-semibold'
                    : i < currentIdx
                    ? 'text-brand bg-brand/10'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-white'
                )}
                whileTap={{ scale: 0.95 }}
                transition={spring}
              >
                {STATUS_ICON[s]}
                <span>{STATUS_LABEL[s] ?? s}</span>
              </motion.button>
              {i < statusFlow.length - 1 && (
                <ChevronRight className="w-3 h-3 text-[var(--text-tertiary)] mx-0.5 flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Tab switcher */}
        <div className="px-6 pt-4 pb-0 flex-shrink-0 flex gap-1">
          {[
            { id: 'rfi',     label: 'Meerwerk concept', icon: <FileText className="w-3.5 h-3.5" /> },
            { id: 'pricing', label: 'Prijsopgave',      icon: <Calculator className="w-3.5 h-3.5" /> },
          ].map(tab => (
            <motion.button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-t-xl text-[12px] font-medium transition-colors duration-150 cursor-pointer border border-b-0',
                activeTab === tab.id
                  ? 'bg-[var(--surface-1)] border-[var(--border-color)] text-[var(--text-primary)]'
                  : 'bg-transparent border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              )}
              whileTap={{ scale: 0.97 }}
              transition={spring}
            >
              {tab.icon}
              {tab.label}
            </motion.button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 border-t border-[var(--border-color)]">
          {activeTab === 'rfi' ? (
            <div className="space-y-5">
              {/* Formal RFI document */}
              {draft ? (
                editing ? (
                  <Textarea
                    className="w-full h-72 font-mono text-[12px]"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                  />
                ) : (
                  <div className="rounded-2xl p-5 bg-[var(--surface-2)] border border-[var(--border-color)]">
                    <RFIDraft text={draft} />
                  </div>
                )
              ) : !emailDraft && !loadingEmail ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center mx-auto mb-2">
                    <FileText className="w-6 h-6 text-[var(--text-tertiary)]" />
                  </div>
                  <p className="text-[13px] text-[var(--text-secondary)]">Nog geen concept opgesteld.</p>
                </div>
              ) : null}

              {/* Client email draft (auto-generated) */}
              <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                      <span className="label-caps">E-mail concept klant</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {emailDraft && (
                        <button
                          onClick={handleCopyEmail}
                          className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] hover:text-brand transition-colors cursor-pointer"
                        >
                          {copiedEmail ? <Check className="w-3 h-3 text-brand" /> : <Copy className="w-3 h-3" />}
                          {copiedEmail ? 'Gekopieerd!' : 'Kopiëren'}
                        </button>
                      )}
                      <button
                        onClick={handleRefreshEmail}
                        disabled={loadingEmail}
                        className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] hover:text-brand transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {loadingEmail
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <RefreshCw className="w-3 h-3" />}
                        {loadingEmail ? 'Opstellen…' : 'Opnieuw'}
                      </button>
                    </div>
                  </div>
                  {loadingEmail ? (
                    <div className="rounded-2xl p-5 bg-[var(--surface-2)] border border-[var(--border-color)] flex items-center gap-3">
                      <Loader2 className="w-4 h-4 animate-spin text-brand flex-shrink-0" />
                      <span className="text-[12px] text-[var(--text-tertiary)]">E-mail concept opstellen…</span>
                    </div>
                  ) : emailError ? (
                    <p className="text-[12px] text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{emailError}</p>
                  ) : emailDraft ? (
                    <div className="rounded-2xl p-5 bg-blue-50/60 border border-blue-100">
                      <pre className="text-[12px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed font-sans">{emailDraft}</pre>
                    </div>
                  ) : null}
                </div>
            </div>
          ) : (
            /* Pricing proposition tab */
            <PricingTab
              proposition={proposition}
              loadingPrice={loadingPrice}
              streamingText={streamingText}
              priceError={priceError}
              onRegenerate={handleGeneratePricing}
              contextItems={contextItems}
            />
          )}
        </div>

        {/* Actions footer */}
        <div className="px-6 py-4 flex gap-2 flex-wrap items-center flex-shrink-0 border-t border-[var(--border-color)] relative">
          {activeTab === 'pricing' ? (
            <>
              {proposition && (
                <>
                  <Button variant="secondary" onClick={handleCopyPrice}>
                    {copiedPrice ? <Check className="w-3.5 h-3.5 text-brand" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedPrice ? 'Gekopieerd!' : 'Kopiëren'}
                  </Button>
                  <Button variant="secondary" onClick={handleGeneratePricing} disabled={loadingPrice}>
                    {loadingPrice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
                    {loadingPrice ? 'Herberekenen…' : 'Herberekenen'}
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { onDelete(rfi.id); onClose(); }}
                className="ml-auto text-red-400 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Verwijderen
              </Button>
            </>
          ) : editing ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(false)}>Annuleren</Button>
              <Button onClick={handleSaveDraft}>Opslaan</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Edit3 className="w-3.5 h-3.5" /> Bewerken
              </Button>
              {draft && (
                <Button variant="secondary" onClick={handleCopy}>
                  {copied ? <Check className="w-3.5 h-3.5 text-brand" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Gekopieerd!' : 'Kopiëren'}
                </Button>
              )}
              {draft && (
                <div className="relative">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!gmailConn) {
                        setSendError('Verbind Gmail eerst via Projectinstellingen.');
                        return;
                      }
                      setSendError('');
                      if (!showSend) {
                        setSendTo(t => t || project.architect_email || project.bouwheer_email || '');
                      }
                      setShowSend(v => !v);
                    }}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {sendSuccess ? 'Verzonden!' : 'Versturen via Gmail'}
                  </Button>

                  {/* Compose popover */}
                  <AnimatePresence>
                    {showSend && gmailConn && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={spring}
                        className="absolute bottom-12 left-0 bg-white border border-[var(--border-color)] rounded-2xl shadow-xl p-4 w-72 z-20"
                      >
                        <p className="text-[12px] font-semibold text-[var(--text-primary)] mb-0.5">Versturen via Gmail</p>
                        <p className="text-[11px] text-[var(--text-tertiary)] mb-3">Van: {gmailConn.email}</p>
                        {/* Contact quick-fill chips */}
                        {[
                          { label: project.architect_name  || 'Architect',  email: project.architect_email  },
                          { label: project.bouwheer_name   || 'Bouwheer',   email: project.bouwheer_email   },
                          { label: project.calculator_name || 'Calculator', email: project.calculator_email },
                        ].filter(c => c.email).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {[
                              { label: project.architect_name  || 'Architect',  email: project.architect_email  },
                              { label: project.bouwheer_name   || 'Bouwheer',   email: project.bouwheer_email   },
                              { label: project.calculator_name || 'Calculator', email: project.calculator_email },
                            ].filter(c => c.email).map(c => (
                              <button
                                key={c.email}
                                type="button"
                                onClick={() => setSendTo(c.email)}
                                className="px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all cursor-pointer"
                                style={sendTo === c.email
                                  ? { color: '#6366F1', backgroundColor: '#EEF2FF', borderColor: '#6366F155' }
                                  : { color: 'var(--text-secondary)', backgroundColor: 'var(--surface-2)', borderColor: 'var(--border-color)' }
                                }
                              >
                                {c.label}
                              </button>
                            ))}
                          </div>
                        )}
                        <Input
                          placeholder="To: architect@firm.com"
                          value={sendTo}
                          onChange={e => setSendTo(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSendGmail()}
                          type="email"
                          className="mb-2"
                          autoFocus
                        />
                        {sendError && (
                          <p className="text-[11px] text-red-600 mb-2">{sendError}</p>
                        )}
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" className="flex-1" onClick={() => { setShowSend(false); setSendError(''); }}>
                            Annuleren
                          </Button>
                          <Button size="sm" className="flex-1" onClick={handleSendGmail} disabled={sending || !sendTo.trim()}>
                            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            {sending ? 'Verzenden…' : 'Versturen'}
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {sendError && !showSend && (
                <p className="text-[11px] text-red-600">{sendError}</p>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { onDelete(rfi.id); onClose(); }}
                className="ml-auto text-red-400 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Verwijderen
              </Button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function FinancialOverview({ rfis, onClose }) {
  const rows = rfis.map(rfi => {
    const parsed = rfi.pricingProposition ? parsePricingProposition(rfi.pricingProposition) : null;
    return {
      rfi,
      subtotal:  parsed?.subtotalExclVat ?? null,
      total:     parsed?.totalInclVat    ?? null,
    };
  });

  const handleExport = async () => {
    const { default: jsPDF }    = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const totalSubtotal = rows.reduce((s, r) => s + (r.subtotal ?? 0), 0);
    const totalInclVat  = rows.reduce((s, r) => s + (r.total    ?? 0), 0);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Financieel overzicht — Meerwerken', 40, 48);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(`Geëxporteerd ${new Date().toLocaleDateString('nl-BE', { day: '2-digit', month: 'long', year: 'numeric' })}`, 40, 64);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 80,
      head: [['#', 'Titel', 'Status', 'Excl. BTW', 'Incl. BTW']],
      body: [
        ...rows.map(({ rfi, subtotal, total }) => [
          rfi.number,
          rfi.title,
          STATUS_LABEL[rfi.status] ?? rfi.status,
          subtotal !== null ? `€ ${subtotal.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
          total    !== null ? `€ ${total.toLocaleString('en-IE',    { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
        ]),
        [
          { content: 'TOTAAL', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `€ ${totalSubtotal.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { fontStyle: 'bold' } },
          { content: `€ ${totalInclVat.toLocaleString('en-IE',  { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { fontStyle: 'bold', textColor: [61, 197, 134] } },
        ],
      ],
      columnStyles: {
        0: { cellWidth: 70,  halign: 'left'  },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 130, halign: 'left'  },
        3: { cellWidth: 110, halign: 'right' },
        4: { cellWidth: 110, halign: 'right' },
      },
      headStyles:  { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles:  { fontSize: 9, textColor: 40 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      styles: { cellPadding: 8 },
    });

    doc.save(`financial-overview-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const totalSubtotal = rows.reduce((s, r) => s + (r.subtotal ?? 0), 0);
  const totalInclVat  = rows.reduce((s, r) => s + (r.total    ?? 0), 0);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col md:rounded-2xl rounded-t-3xl glass-modal"
        initial={{ y: 60, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.97 }}
        transition={spring}
      >
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
        </div>

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0 border-b border-[var(--border-color)]">
          <div>
            <h2 className="font-bold text-[var(--text-primary)] text-[15px]">Financieel overzicht</h2>
            <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">{rfis.length} meerwerk{rfis.length !== 1 ? 'en' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleExport}>
              <Receipt className="w-3.5 h-3.5" /> PDF exporteren
            </Button>
            <motion.button
              onClick={onClose}
            aria-label="Sluiten"
            className="p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
            whileTap={{ scale: 0.9 }}
            transition={spring}
          >
            <X className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="rounded-xl border border-[var(--border-color)] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-[var(--surface-2)] border-b border-[var(--border-color)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-tertiary)] text-[11px] uppercase tracking-wider w-24">#</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-tertiary)] text-[11px] uppercase tracking-wider">Titel</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-tertiary)] text-[11px] uppercase tracking-wider w-44">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-tertiary)] text-[11px] uppercase tracking-wider w-36">Excl. BTW</th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-tertiary)] text-[11px] uppercase tracking-wider w-36">Incl. BTW</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ rfi, subtotal, total }, i) => (
                    <tr key={rfi.id} className={cn('border-b border-[var(--border-color)]', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60')}>
                      <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-tertiary)]">{rfi.number}</td>
                      <td className="px-4 py-3 text-[var(--text-primary)] font-medium leading-snug">{rfi.title}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[rfi.status]} className="inline-flex items-center gap-1">
                          {STATUS_ICON[rfi.status]} {STATUS_LABEL[rfi.status] ?? rfi.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                        {subtotal !== null ? fmtEur(subtotal) : <span className="text-[var(--text-tertiary)] italic text-[11px]">Geen prijsopgave</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                        {total !== null ? fmtEur(total) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border-color)] bg-[var(--surface-2)]">
                    <td colSpan={3} className="px-4 py-3 text-right text-[12px] font-semibold text-[var(--text-secondary)]">Totaal excl. BTW</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-[var(--text-primary)]">{fmtEur(totalSubtotal)}</td>
                    <td />
                  </tr>
                  <tr className="bg-brand/5 border-t border-brand/20">
                    <td colSpan={3} className="px-4 py-3 text-right text-[13px] font-bold text-[var(--text-primary)]">Totaal incl. BTW</td>
                    <td />
                    <td className="px-4 py-3 text-right tabular-nums text-[15px] font-extrabold" style={{ color: '#7669ff' }}>{fmtEur(totalInclVat)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function RFIManager({ rfis, fieldLogs, contextItems = [], project = {}, onAdd, onUpdate, onDelete }) {
  const [showCreate, setShowCreate]   = useState(false);
  const [showFinancial, setShowFinancial] = useState(false);
  const [selected, setSelected]       = useState(null);
  const [filter, setFilter]           = useState('all');

  const filters  = ['all', 'draft', 'pending_approval', 'goedgekeurd', 'work_executed', 'gefactureerd', 'geweigerd'];
  const filtered = filter === 'all' ? rfis : rfis.filter(r => r.status === filter);

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <motion.div
        className="flex items-start justify-between mb-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div>
          <h1 className="title-xl">Wijzigingsbeheer</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">Beheer meerwerken en prijsopgaven.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowFinancial(true)}>
            <Euro className="w-4 h-4" /> Financieel overzicht
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> Nieuw meerwerk
          </Button>
        </div>
      </motion.div>

      <motion.div
        className="flex gap-1 p-1 rounded-full bg-[var(--surface-2)] mb-5 flex-wrap w-fit"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.08 }}
      >
        {filters.map(f => (
          <motion.button
            key={f}
            onClick={() => setFilter(f)}
            className={cn('filter-pill', filter === f ? 'filter-pill-active' : 'filter-pill-inactive')}
            whileTap={{ scale: 0.95 }}
            transition={spring}
          >
            {f === 'all' ? `Alle (${rfis.length})` : `${STATUS_LABEL[f] ?? f} (${rfis.filter(r => r.status === f).length})`}
          </motion.button>
        ))}
      </motion.div>

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
                <FileText className="w-6 h-6 text-[var(--text-tertiary)]" />
              </div>
              <p className="text-[13px] font-medium text-[var(--text-secondary)]">
                {filter === 'all' ? 'Nog geen meerwerken. Maak er hierboven een aan.' : `Geen ${STATUS_LABEL[filter] ?? filter} vermeldingen.`}
              </p>
            </motion.div>
          ) : (
            filtered.map(rfi => (
              <motion.button
                key={rfi.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={spring}
                onClick={() => setSelected(rfi)}
                style={{ borderRadius: 16 }}
                className="glass-card w-full text-left px-5 py-4 cursor-pointer group"
                whileHover={{ y: -1, borderRadius: 22, boxShadow: '0 0 0 1px rgba(255,255,255,0.9), 0 8px 32px rgba(0,0,0,0.09), inset 0 1px 0 rgba(255,255,255,0.9)' }}
                whileTap={{ scale: 0.99 }}
              >
                <div className="flex items-center gap-4">
                  <span className="text-[11px] font-mono text-[var(--text-tertiary)] flex-shrink-0 w-16 truncate">{rfi.number}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--text-primary)] text-[13px] truncate group-hover:text-brand transition-colors duration-150">
                      {rfi.title}
                    </p>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                      {new Date(rfi.createdAt).toLocaleDateString()}
                      {rfi.context && ` · ${rfi.context.slice(0, 50)}…`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={STATUS_BADGE[rfi.status]} className="inline-flex items-center gap-1">
                      {STATUS_ICON[rfi.status]} {STATUS_LABEL[rfi.status] ?? rfi.status}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-brand transition-colors duration-150" />
                  </div>
                </div>
              </motion.button>
            ))
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {showFinancial && (
          <FinancialOverview rfis={rfis} onClose={() => setShowFinancial(false)} />
        )}
        {showCreate && (
          <CreateRFIModal fieldLogs={fieldLogs} onClose={() => setShowCreate(false)} onSave={onAdd} />
        )}
        {selected && (
          <RFIDetail
            rfi={rfis.find(r => r.id === selected.id) || selected}
            onClose={() => setSelected(null)}
            onUpdate={onUpdate}
            onDelete={onDelete}
            contextItems={contextItems}
            project={project}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
