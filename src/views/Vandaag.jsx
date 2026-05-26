import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, Send, Loader2, MessageCircle, Mail, PenLine,
  Check, Trash2, Archive, RotateCcw, RefreshCw, AlertTriangle, Bell, FileSignature, Briefcase,
  Clock, Sparkles, Layers, X, ArrowUpDown,
} from 'lucide-react';
import { cn } from '../lib/utils';

async function mergeIntoFluentEmail({ items, recipient }) {
  const res = await fetch('/api/merge-emails', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      items: items.map(t => ({ output: t.output || t })),
      recipient,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success || !json.body) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json.body;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Constants & helpers                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

const SOURCE_META = {
  whatsapp: { icon: MessageCircle, label: 'WhatsApp', tint: '#25d366' },
  voice:    { icon: Mic,           label: 'Voice',    tint: '#7669ff' },
  email:    { icon: Mail,          label: 'Email',    tint: '#0ea5e9' },
  manual:   { icon: PenLine,       label: 'Manueel',  tint: '#94a3b8' },
};

const TYPE_META = {
  reminder:        { icon: Bell,           label: 'Reminder',          step: '01', verb: 'Versturen' },
  pv_mail:         { icon: FileSignature,  label: 'Paper trail',       step: '02', verb: 'Versturen' },
  werfmail:        { icon: Briefcase,      label: 'Werfmail',          step: '03', verb: 'Versturen' },
  meerwerk_offerte:{ icon: FileSignature,  label: 'Meerwerk-offerte',  step: '02', verb: 'Versturen' },
  briefing:        { icon: Briefcase,      label: 'Werfploeg-briefing',step: '03', verb: 'Versturen' },
  self_reminder:   { icon: Bell,           label: 'Reminder voor jezelf', step: '04', verb: 'Plannen' },
};

const URGENCY_BADGE = {
  urgent: { bg: '#ffe1e1', fg: '#9b1d1d', label: 'URGENT' },
  normal: { bg: '#ece9ff', fg: '#3a31a8', label: 'NORMAAL' },
  low:    { bg: '#eceef3', fg: '#4b5563', label: 'INFO' },
};

const TAG_STYLES = {
  urgent:      { bg: '#ffe1e1', fg: '#9b1d1d' },
  meerwerk:    { bg: '#ece9ff', fg: '#3a31a8' },
  veiligheid:  { bg: '#fff4d6', fg: '#92580c' },
  vertraging:  { bg: '#fff4d6', fg: '#92580c' },
  betwisting:  { bg: '#ffe1e1', fg: '#9b1d1d' },
  materiaal:   { bg: '#dbeafe', fg: '#1e40af' },
  rfi:         { bg: '#ece9ff', fg: '#3a31a8' },
  voortgang:   { bg: '#d4f7ec', fg: '#075e48' },
  'actie-nodig': { bg: '#280063', fg: '#fff'    },
  opvolgen:    { bg: '#ffe4ff', fg: '#8a2c8a' },
  wacht:       { bg: '#fff4d6', fg: '#92580c' },
  verstreken:  { bg: '#ffe1e1', fg: '#9b1d1d' },
  antwoord:    { bg: '#d4f7ec', fg: '#075e48' },
};

const TYPE_TO_TAG = {
  delay:    'vertraging',
  safety:   'veiligheid',
  progress: 'voortgang',
  material: 'materiaal',
  rfi:      'rfi',
  dispute:  'betwisting',
};

// Compute tags for a memo based on derived fields. No AI calls.
function computeTags(memo) {
  const tags = [];
  const outs = memo.recommendedOutputs || [];
  const wps  = memo.workpoints || [];
  const ageHours = (Date.now() - new Date(memo.createdAt).getTime()) / 36e5;
  const unsent = outs.filter(o => !o.sentAt && o.type !== 'self_reminder').length;

  if (memo.parentOutboundEmailId)              tags.push('antwoord');
  if (outs.some(o => o.urgency === 'urgent' && !o.sentAt)) tags.push('urgent');
  // Deadline expired (memo's logDate or any output's dueAt is in the past)
  if (memo.logDate && new Date(memo.logDate) < new Date() && unsent > 0) tags.push('verstreken');
  if (outs.some(o => o.dueAt && new Date(o.dueAt) < new Date() && !o.sentAt)) {
    if (!tags.includes('verstreken')) tags.push('verstreken');
  }
  if (TYPE_TO_TAG[memo.type] && !tags.includes(TYPE_TO_TAG[memo.type])) tags.push(TYPE_TO_TAG[memo.type]);
  if (wps.some(w => w.classification === 'meerwerk') && !tags.includes('meerwerk')) tags.push('meerwerk');
  if (unsent > 0 && !memo.treated && !tags.includes('actie-nodig')) tags.push('actie-nodig');
  // Wacht: unsent for > 72h
  if (unsent > 0 && ageHours > 72 && !memo.treated) tags.push('wacht');
  if (outs.some(o => o.type === 'self_reminder' && !o.sentAt)) tags.push('opvolgen');

  return tags;
}

// Priority score for sorting: lower = higher priority
function memoPriority(memo) {
  const tags = computeTags(memo);
  if (tags.includes('verstreken')) return -1;        // overdue beats everything
  if (tags.includes('urgent') || tags.includes('betwisting')) return 0;
  if (tags.includes('veiligheid')) return 1;
  if (tags.includes('antwoord'))   return 2;          // a reply you haven't dealt with
  if (tags.includes('wacht'))      return 3;          // 3+ days waiting
  if (tags.includes('actie-nodig')) return 4;
  if (tags.includes('vertraging')) return 5;
  if (tags.includes('meerwerk'))   return 6;
  if (tags.includes('opvolgen'))   return 7;
  return 9;
}

const FILTER_PILLS = [
  { id: 'all',         label: 'Alles' },
  { id: 'urgent',      label: 'Urgent',         match: (t) => t.includes('urgent') || t.includes('betwisting') || t.includes('veiligheid') },
  { id: 'actie-nodig', label: 'Actie nodig',    match: (t) => t.includes('actie-nodig') },
  { id: 'meerwerk',    label: 'Meerwerk',       match: (t) => t.includes('meerwerk') },
  { id: 'opvolgen',    label: 'Op te volgen',   match: (t) => t.includes('opvolgen') },
];

const fmtTime = (iso) => iso
  ? new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
  : '';
const fmtDay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return fmtTime(iso);
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (same(d, yest)) return 'Gisteren';
  return d.toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' });
};
const fmtFullDate = () => new Date().toLocaleDateString('nl-BE',
  { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShortDate = (iso) => iso
  ? new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
  : '';

// Render plain text with light formatting preserved: blank lines split
// paragraphs, lines starting with `- ` or `• ` become bullets, and **bold**
// markers render as <strong>. Designed for email/voice transcripts that
// arrive as one wall of text with original whitespace intact.
function renderInlineMarkup(text) {
  // Split on **bold** while keeping the delimiters out of the result
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((chunk, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-semibold not-italic">{chunk}</strong>
      : <React.Fragment key={i}>{chunk}</React.Fragment>
  );
}

function FormattedTranscript({ text }) {
  if (!text) return null;
  // Normalise line endings, then split into paragraphs on blank lines
  const normalised = text.replace(/\r\n/g, '\n').trim();
  const paragraphs = normalised.split(/\n{2,}/);

  return (
    <>
      {paragraphs.map((para, pi) => {
        const lines = para.split('\n');
        const isList = lines.every(l => /^\s*[-•]\s+/.test(l));
        if (isList) {
          return (
            <ul key={pi} className="list-disc pl-5 space-y-1 my-2">
              {lines.map((l, li) => (
                <li key={li}>{renderInlineMarkup(l.replace(/^\s*[-•]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        // Mixed paragraph: preserve single line breaks within it
        return (
          <p key={pi} className={pi === 0 ? '' : 'mt-3'}>
            {lines.map((l, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInlineMarkup(l)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

// Resolve a recommended output's recipient → email by matching against project contacts.
function resolveRecipientEmail(output, contacts = [], members = []) {
  if (!output) return '';
  const byName = output.recipientName
    ? contacts.find(c => c.name?.toLowerCase() === output.recipientName.toLowerCase())
    : null;
  if (byName?.email) return byName.email;
  const byRole = output.recipientRole
    ? contacts.find(c => c.role?.toLowerCase() === output.recipientRole.toLowerCase())
    : null;
  if (byRole?.email) return byRole.email;
  return members.find(m => m.role === 'manager')?.email || members[0]?.email || '';
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Inbox list item                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

// Snooze options used in the row menu and in TodosOverview
const SNOOZE_OPTIONS = [
  { id: 'tonight',  label: 'Vanavond 18:00',     compute: () => { const d = new Date(); d.setHours(18, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d; } },
  { id: 'tomorrow', label: 'Morgenochtend 8:00', compute: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d; } },
  { id: 'friday',   label: 'Vrijdag 8:00',       compute: () => { const d = new Date(); const dow = d.getDay(); const add = ((5 - dow) + 7) % 7 || 7; d.setDate(d.getDate() + add); d.setHours(8, 0, 0, 0); return d; } },
  { id: 'monday',   label: 'Maandag 8:00',       compute: () => { const d = new Date(); const dow = d.getDay(); const add = ((1 - dow) + 7) % 7 || 7; d.setDate(d.getDate() + add); d.setHours(8, 0, 0, 0); return d; } },
  { id: 'week',     label: 'Volgende week',      compute: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(8, 0, 0, 0); return d; } },
];

function SnoozeMenu({ onPick, onClose }) {
  return (
    <div
      className="absolute right-0 top-7 z-20 paper-card overflow-hidden"
      style={{ minWidth: 180 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        Snooze tot…
      </div>
      {SNOOZE_OPTIONS.map(opt => (
        <button key={opt.id}
                onClick={(e) => { e.stopPropagation(); onPick(opt.compute().toISOString()); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-[12.5px] text-[#0c0040] hover:bg-black/[0.04] cursor-pointer">
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function MemoListItem({ item, active, onSelect, onMarkTreated, onDelete, onSnooze }) {
  const src = SOURCE_META[item.source] || SOURCE_META.manual;
  const SrcIcon = src.icon;
  const tags = computeTags(item);
  const isUrgent = tags.includes('urgent') || tags.includes('betwisting') || tags.includes('veiligheid');
  const isSnoozedRow = item.snoozedUntil && new Date(item.snoozedUntil).getTime() > Date.now();
  const snoozeWakeLabel = isSnoozedRow
    ? new Date(item.snoozedUntil).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <div
      className={cn(
        'group w-full transition-colors relative border-l-2',
        active ? 'border-l-[#280063] bg-white' : 'border-l-transparent hover:bg-white/60'
      )}
    >
      <button onClick={() => onSelect(item)} className="w-full text-left px-5 py-3 cursor-pointer">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            {isUrgent && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#9b1d1d' }} />}
            <SrcIcon className="w-3 h-3 flex-shrink-0" style={{ color: src.tint }} strokeWidth={2.2} />
          </div>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{fmtDay(item.createdAt)}</span>
        </div>
        <div className="text-[13px] leading-snug line-clamp-2 text-[#0c0040] pr-14">{item.title}</div>
        {tags.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1 flex-wrap">
            {tags.slice(0, 3).map(t => {
              const s = TAG_STYLES[t] || TAG_STYLES['actie-nodig'];
              return (
                <span key={t}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase"
                      style={{ background: s.bg, color: s.fg }}>
                  {t.replace('-', ' ')}
                </span>
              );
            })}
          </div>
        )}
        {snoozeWakeLabel && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
            <Clock className="w-2.5 h-2.5" />
            <span>Wakker {snoozeWakeLabel}</span>
          </div>
        )}
      </button>
      <div className="absolute right-3 bottom-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isSnoozedRow && onSnooze && (
          <button onClick={(e) => { e.stopPropagation(); onSnooze(item.id, null); }}
                  title="Wakker maken — terug naar inbox"
                  className="w-6 h-6 rounded flex items-center justify-center bg-white border border-black/10 hover:bg-[#d4f7ec] cursor-pointer">
            <RotateCcw className="w-3 h-3 text-[#0c7a5e]" />
          </button>
        )}
        {onSnooze && !item.treated && !isSnoozedRow && (
          <SnoozeButton item={item} onSnooze={onSnooze} />
        )}
        {onMarkTreated && !item.treated && (
          <button onClick={(e) => { e.stopPropagation(); onMarkTreated(item.id, true); }}
                  title="Markeer behandeld"
                  className="w-6 h-6 rounded flex items-center justify-center bg-white border border-black/10 hover:bg-[#d4f7ec] cursor-pointer">
            <Check className="w-3 h-3 text-[#0c7a5e]" />
          </button>
        )}
        {onMarkTreated && item.treated && (
          <button onClick={(e) => { e.stopPropagation(); onMarkTreated(item.id, false); }}
                  title="Terug naar inbox"
                  className="w-6 h-6 rounded flex items-center justify-center bg-white border border-black/10 hover:bg-black/[0.05] cursor-pointer">
            <RotateCcw className="w-3 h-3 text-[var(--text-secondary)]" />
          </button>
        )}
        {onDelete && (
          <button onClick={(e) => { e.stopPropagation(); if (confirm('Memo verwijderen?')) onDelete(item.id); }}
                  title="Verwijderen"
                  className="w-6 h-6 rounded flex items-center justify-center bg-white border border-black/10 hover:bg-[#ffe1e1] cursor-pointer">
            <Trash2 className="w-3 h-3 text-[#9b1d1d]" />
          </button>
        )}
      </div>
    </div>
  );
}

function SnoozeButton({ item, onSnooze }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);
  return (
    <div className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
              title="Snooze"
              className="w-6 h-6 rounded flex items-center justify-center bg-white border border-black/10 hover:bg-[#fff4d6] cursor-pointer">
        <Clock className="w-3 h-3 text-[#92580c]" />
      </button>
      {open && <SnoozeMenu onPick={(iso) => onSnooze(item.id, iso)} onClose={() => setOpen(false)} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Output card — one per recommendedOutputs[i]                                */
/* ─────────────────────────────────────────────────────────────────────────── */

function OutputCard({ memo, output, index, contacts, members, onSend, onMarkSent }) {
  const meta = TYPE_META[output.type] || TYPE_META.pv_mail;
  const isReminderForSelf = output.type === 'self_reminder';
  const initialTo = resolveRecipientEmail(output, contacts, members);
  const matchedContact = output.recipientName || output.recipientRole
    ? contacts.find(c =>
        (output.recipientName && c.name?.toLowerCase() === output.recipientName.toLowerCase())
        || (output.recipientRole && c.role?.toLowerCase() === output.recipientRole.toLowerCase()))
    : null;

  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(output.subject || '');
  const [body, setBody] = useState(output.body || '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(!!output.sentAt);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTo(resolveRecipientEmail(output, contacts, members));
    setSubject(output.subject || '');
    setBody(output.body || '');
    setSent(!!output.sentAt);
    setError('');
  }, [output, contacts, members]);

  const triggerSentAnimation = () => {
    setSent(true);
    setJustSent(true);
    // Fire a global toast for the entire app to see, then drop the inline celebration after ~1.6s
    window.dispatchEvent(new CustomEvent('punchlister:toast', {
      detail: { kind: 'success', text: isReminderForSelf
        ? `Reminder ingepland · ${output.subject || ''}`
        : `Verstuurd naar ${to.split('@')[0]} · ${subject || output.subject || ''}` },
    }));
    setTimeout(() => setJustSent(false), 1600);
  };

  const handleSend = async () => {
    if (isReminderForSelf) {
      onMarkSent?.(index);
      triggerSentAnimation();
      return;
    }
    if (!to.trim()) { setError('Voeg een ontvanger toe.'); return; }
    setSending(true); setError('');
    try {
      await onSend({
        to, subject, body,
        emailType: output.type === 'meerwerk_offerte' ? 'pv_mail' : output.type,
        fieldLogId: memo.id,
        outputIndex: index,
      });
      triggerSentAnimation();
    } catch (err) {
      setError(err.message || 'Versturen mislukt');
    } finally {
      setSending(false);
    }
  };

  const urgencyBadge = URGENCY_BADGE[output.urgency] || URGENCY_BADGE.normal;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <header className="mb-3 flex items-baseline gap-3">
        <span className="inline-flex items-center justify-center w-7 h-5 rounded-md text-[10px] font-mono font-semibold tracking-wider"
              style={{ background: '#ece9ff', color: '#3a31a8' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="title-lg">{meta.label}</h3>
            {output.urgency !== 'normal' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide"
                    style={{ background: urgencyBadge.bg, color: urgencyBadge.fg }}>
                {urgencyBadge.label}
              </span>
            )}
            {sent && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide"
                    style={{ background: '#d4f7ec', color: '#0c7a5e' }}>
                <Check className="w-2.5 h-2.5" /> {isReminderForSelf ? 'GEPLAND' : 'VERZONDEN'}
              </span>
            )}
          </div>
          {output.rationale && (
            <p className="tagline tagline-sm mt-0.5">{output.rationale}</p>
          )}
        </div>
      </header>

      <motion.div
        className={cn('paper-card overflow-hidden relative', sent && !justSent && 'opacity-60')}
        animate={justSent ? { scale: [1, 1.015, 1] } : {}}
        transition={{ duration: 0.45 }}
      >
        {/* Send-success overlay */}
        <AnimatePresence>
          {justSent && (
            <>
              {/* Green sweep that wipes left → right across the card */}
              <motion.div
                key="sweep"
                className="absolute inset-0 pointer-events-none z-10"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(178,249,235,0.55) 45%, rgba(212,247,236,0.85) 55%, transparent 100%)' }}
                initial={{ x: '-100%' }} animate={{ x: '100%' }} exit={{ opacity: 0 }}
                transition={{ duration: 0.85, ease: [0.4, 0, 0.2, 1] }}
              />
              {/* Centered check that springs in */}
              <motion.div
                key="check"
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: [0, 1.18, 1], rotate: [-20, 6, 0] }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.6, times: [0, 0.6, 1], ease: 'backOut' }}
                  className="w-16 h-16 rounded-full flex items-center justify-center shadow-brand"
                  style={{ background: 'linear-gradient(135deg, #0c7a5e 0%, #34d4a8 100%)' }}
                >
                  <Check className="w-8 h-8 text-white" strokeWidth={3} />
                </motion.div>
              </motion.div>
              {/* Subtle confetti dots */}
              {[...Array(6)].map((_, i) => (
                <motion.span
                  key={`dot-${i}`}
                  className="absolute rounded-full pointer-events-none z-20"
                  style={{
                    width: 6, height: 6,
                    left: '50%', top: '50%',
                    background: ['#7669ff', '#ffabff', '#b2f9eb', '#ffd166', '#7669ff', '#ffabff'][i],
                  }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                  animate={{
                    x: Math.cos((i / 6) * Math.PI * 2) * 80,
                    y: Math.sin((i / 6) * Math.PI * 2) * 60,
                    opacity: 0,
                    scale: [0, 1, 0.6],
                  }}
                  transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
                />
              ))}
            </>
          )}
        </AnimatePresence>

        {!isReminderForSelf && (
          <>
            <div className="px-5 py-3 space-y-2 border-b border-black/5">
              <Field label="Aan" value={to} onChange={setTo}
                     placeholder="naam@bedrijf.be"
                     suggestions={[
                       ...contacts.map(c => c.email).filter(Boolean),
                       ...members.map(m => m.email).filter(Boolean),
                     ]}
                     hint={matchedContact && matchedContact.email
                       ? `${matchedContact.name}${matchedContact.role ? ' · ' + matchedContact.role : ''}`
                       : output.recipientRole
                         ? `Geen ${output.recipientRole.toLowerCase()} in contacten — vul handmatig aan.`
                         : null} />
              <Field label="Onderwerp" value={subject} onChange={setSubject} />
            </div>
            <div className="px-5 py-3">
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={Math.min(10, Math.max(4, body.split('\n').length + 1))}
                disabled={sent}
                className="w-full bg-transparent text-[13.5px] leading-relaxed text-[#0c0040] outline-none resize-none disabled:cursor-not-allowed"
              />
            </div>
          </>
        )}

        {isReminderForSelf && (
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)] mb-2">
              <Bell className="w-3.5 h-3.5" />
              <span>Plannen voor <strong className="text-[#0c0040]">{output.dueAt ? fmtShortDate(output.dueAt) : 'later'}</strong></span>
            </div>
            <p className="text-[13.5px] text-[#0c0040] leading-relaxed">{body || subject}</p>
          </div>
        )}

        {error && (
          <div className="px-5 py-2 text-[12px] text-[#9b1d1d] border-t border-black/5"
               style={{ background: '#ffe1e1' }}>
            {error}
          </div>
        )}

        <div className="px-5 py-2.5 border-t border-black/5 flex items-center justify-between gap-2"
             style={{ background: '#faf9f7' }}>
          <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
            {output.dueAt && !isReminderForSelf ? `Voor ${fmtShortDate(output.dueAt)}` : 'Auto-opgesteld'}
          </span>
          {!sent && (
            <motion.button
              onClick={handleSend}
              disabled={sending || (!isReminderForSelf && !to.trim())}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#280063', color: '#fff' }}
              whileTap={{ scale: 0.97 }}
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {sending ? 'Bezig…' : meta.verb}
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.section>
  );
}

function Field({ label, value, onChange, placeholder, suggestions, hint }) {
  const id = `f-${label.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`;
  const list = suggestions?.length ? `${id}-list` : undefined;
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <label htmlFor={id} className="w-20 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </label>
        <input
          id={id} list={list}
          value={value || ''} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-[13.5px] text-[#0c0040] outline-none placeholder:text-[var(--text-tertiary)]"
        />
        {list && <datalist id={list}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>}
      </div>
      {hint && <p className="ml-[5.5rem] text-[10.5px] text-[var(--text-tertiary)] mt-0.5 italic">{hint}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  TodosOverview — high-level "what's on my plate" panel                      */
/* ─────────────────────────────────────────────────────────────────────────── */

function TodosOverview({ todos = [], onJumpTo, onBatchSend, contacts = [], members = [], onTriageWithAI, triageResult, triageLoading }) {
  if (todos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)] text-[13px]">
        Selecteer een memo. Inbox is leeg.
      </div>
    );
  }
  // Group by recipient/role for a tighter overview
  const grouped = todos.reduce((acc, t) => {
    const key = t.output.recipientName || t.output.recipientRole || 'Anders';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});
  const urgentCount = todos.filter(t => t.output.urgency === 'urgent').length;

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <div className="max-w-3xl">
        <header className="mb-6">
          <span className="eyebrow">Vandaag op je bord</span>
          <h2 className="display-hero mt-2">{todos.length} {todos.length === 1 ? 'taak' : 'taken'}</h2>
          <p className="tagline tagline-md mt-2">
            {urgentCount > 0
              ? `${urgentCount} urgent — direct versturen of inplannen.`
              : 'Klik een taak open om te bewerken en versturen.'}
          </p>
        </header>

        {/* AI triage suggestion */}
        {onTriageWithAI && (
          <section className="mb-6 paper-card p-4"
                   style={{ background: 'linear-gradient(135deg, #f5edff 0%, #fdf4ff 100%)' }}>
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                   style={{ background: '#7669ff', color: '#fff' }}>
                <Sparkles className="w-3.5 h-3.5" strokeWidth={2.4} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="eyebrow">AI prioriteit</div>
                <h3 className="title-lg mt-0.5 mb-1">Wat moet ik eerst doen?</h3>
                {triageResult ? (
                  <ol className="text-[13px] text-[#0c0040] leading-relaxed space-y-1 mt-2 list-decimal pl-4">
                    {triageResult.map((r, i) => (
                      <li key={i}>
                        <button onClick={() => r.memoId && onJumpTo(r.memoId)}
                                className="text-left hover:underline cursor-pointer">
                          <strong>{r.title}</strong>
                          {r.reason && <span className="text-[var(--text-tertiary)]"> — {r.reason}</span>}
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <button onClick={onTriageWithAI} disabled={triageLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium cursor-pointer disabled:opacity-50"
                          style={{ background: '#280063', color: '#fff' }}>
                    {triageLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {triageLoading ? 'Analyseren…' : 'Vraag Punchlister'}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {Object.entries(grouped).map(([recipient, items]) => {
          // Resolve recipient email for batching
          const matched = items[0]?.output;
          const groupEmail = matched ? resolveRecipientEmail(matched, contacts, members) : '';
          return (
            <section key={recipient} className="mb-6">
              <div className="flex items-baseline justify-between mb-2">
                <div className="eyebrow">{recipient}</div>
                {items.length >= 2 && onBatchSend && groupEmail && (
                  <button onClick={() => onBatchSend(items, recipient, groupEmail)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#7669ff] hover:text-[#280063] cursor-pointer">
                    <Layers className="w-3 h-3" /> {items.length} samen versturen
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {items.map((t) => {
                  const meta = TYPE_META[t.output.type] || TYPE_META.pv_mail;
                  const isUrgent = t.output.urgency === 'urgent';
                  return (
                    <button
                      key={`${t.memo.id}-${t.outputIndex}`}
                      onClick={() => onJumpTo(t.memo.id)}
                      className="w-full text-left paper-card-tight px-3.5 py-2.5 hover:bg-white cursor-pointer flex items-start gap-3"
                    >
                      <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                           style={{ background: isUrgent ? '#ffe1e1' : '#ece9ff', color: isUrgent ? '#9b1d1d' : '#3a31a8' }}>
                        <meta.icon className="w-3.5 h-3.5" strokeWidth={2.2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wide"
                                style={{ color: isUrgent ? '#9b1d1d' : '#3a31a8' }}>
                            {meta.label}
                          </span>
                          {isUrgent && (
                            <span className="text-[9px] font-bold uppercase tracking-wide"
                                  style={{ color: '#9b1d1d' }}>· URGENT</span>
                          )}
                        </div>
                        <div className="text-[13.5px] font-semibold text-[#0c0040] leading-snug truncate">
                          {t.output.subject || t.memo.title}
                        </div>
                        {t.output.rationale && (
                          <div className="text-[11.5px] text-[var(--text-tertiary)] italic leading-snug truncate">
                            {t.output.rationale}
                          </div>
                        )}
                      </div>
                      <ChevronRightStub />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ComposePreviewModal({ open, draft, items, onClose, onConfirm, contacts = [], members = [] }) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [rewriteOnce, setRewriteOnce] = useState(false);

  const runRewrite = async () => {
    if (!draft || rewriting) return;
    setRewriting(true);
    setError('');
    try {
      const fluent = await mergeIntoFluentEmail({ items, recipient: draft.recipient });
      if (fluent) setBody(fluent);
    } catch (e) {
      console.warn('Fluent merge failed:', e.message);
      setError(`AI-herformulering mislukt: ${e.message}. Je kan de tekst manueel aanpassen of opnieuw proberen.`);
    } finally {
      setRewriting(false);
    }
  };

  useEffect(() => {
    if (!open || !draft) return;
    setTo(draft.recipientEmail || '');
    setSubject(draft.subject || '');
    setBody(draft.body || '');
    setError('');
    setRewriteOnce(false);
  }, [open, draft]);

  // Auto-trigger AI rewrite once when the modal opens (with >=2 items).
  useEffect(() => {
    if (!open || !draft || rewriteOnce || items.length < 2) return;
    setRewriteOnce(true);
    runRewrite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft, rewriteOnce]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !sending) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, sending, onClose]);

  if (!open || !draft) return null;

  const send = async () => {
    if (!to.trim()) { setError('Voeg een ontvanger toe.'); return; }
    setSending(true); setError('');
    try { await onConfirm({ to, subject, body }); }
    catch (e) { setError(e.message || 'Versturen mislukt.'); }
    finally { setSending(false); }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-center justify-center p-6"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ background: 'rgba(40,0,99,0.45)', backdropFilter: 'blur(4px)' }}
        onClick={() => !sending && onClose()}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ y: 20, scale: 0.97, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 12, scale: 0.97, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="paper-card w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
          style={{ background: '#fff' }}
        >
          {/* Header */}
          <header className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
            <div>
              <span className="eyebrow">Preview · {items.length} punten gecombineerd</span>
              <h2 className="title-xl mt-0.5">Bericht aan {draft.recipient}</h2>
            </div>
            <button onClick={onClose} disabled={sending}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/[0.05] cursor-pointer disabled:opacity-50"
                    aria-label="Sluiten">
              <X className="w-4 h-4 text-[#0c0040]" />
            </button>
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <Field label="Aan" value={to} onChange={setTo}
                   placeholder="naam@bedrijf.be"
                   suggestions={[
                     ...contacts.map(c => c.email).filter(Boolean),
                     ...members.map(m => m.email).filter(Boolean),
                   ]} />
            <Field label="Onderwerp" value={subject} onChange={setSubject} />
            <div className="relative">
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={Math.min(18, Math.max(8, body.split('\n').length + 1))}
                disabled={rewriting}
                className="w-full px-3 py-3 rounded-lg bg-white border border-black/10 text-[13.5px] leading-relaxed text-[#0c0040] outline-none resize-y focus:border-[#7669ff]/50 disabled:opacity-60"
              />
              {rewriting && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-lg"
                     style={{ background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(1px)' }}>
                  <div className="inline-flex items-center gap-1.5 text-[12px] text-[#3a31a8] bg-white border border-[#ece9ff] px-3 py-1.5 rounded-full shadow-sm">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI herformuleert tot één vloeiende mail…
                  </div>
                </div>
              )}
              {!rewriting && items.length >= 2 && (
                <button
                  type="button"
                  onClick={runRewrite}
                  className="absolute right-2 bottom-2 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-white/90 hover:bg-white border border-[#ece9ff] text-[#3a31a8] cursor-pointer shadow-sm"
                  title="Herformuleer als vloeiende mail"
                >
                  <Sparkles className="w-3 h-3" /> Herformuleer
                </button>
              )}
            </div>

            {/* Source items reference */}
            <div className="paper-card-tight p-3">
              <div className="eyebrow mb-1.5">Bronpunten</div>
              <ul className="space-y-1">
                {items.map((t, i) => {
                  const meta = TYPE_META[t.output.type] || TYPE_META.pv_mail;
                  return (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                      <meta.icon className="w-3 h-3 mt-0.5 flex-shrink-0 text-[#7669ff]" />
                      <span className="truncate"><strong className="text-[#0c0040]">{i + 1}.</strong> {t.output.subject}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {error && (
            <div className="px-5 py-2 text-[12px] text-[#9b1d1d] border-t border-black/5"
                 style={{ background: '#ffe1e1' }}>
              {error}
            </div>
          )}

          {/* Footer */}
          <footer className="px-5 py-3 border-t border-black/5 flex items-center justify-between gap-2"
                  style={{ background: '#faf9f7' }}>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              Eén mail · {items.length} punten worden allemaal gemarkeerd als verzonden
            </span>
            <div className="flex items-center gap-2">
              <button onClick={onClose} disabled={sending}
                      className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium border border-black/10 hover:bg-black/[0.04] cursor-pointer text-[#0c0040] disabled:opacity-50">
                Annuleer
              </button>
              <motion.button
                onClick={send}
                disabled={sending || !to.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: '#280063', color: '#fff' }}
                whileTap={{ scale: 0.97 }}
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {sending ? 'Versturen…' : 'Verstuur'}
              </motion.button>
            </div>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ChevronRightStub() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[var(--text-tertiary)] flex-shrink-0 mt-2.5"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Main component                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */

export default function Vandaag({
  project,
  fieldLogs = [],
  projectMembers = [],
  projectContacts = [],
  onSendEmail,
  onMarkTreated,
  onSnoozeLog,
  onDeleteLog,
  onReprocessLog,
  onUpdateLog,
}) {
  const decorated = useMemo(() => fieldLogs.map((l) => {
    const text = l.processedSummary || l.rawNote || '';
    return { ...l, title: text.slice(0, 90) || 'Memo' };
  }), [fieldLogs]);

  const [tab, setTab] = useState('inbox');
  const [filter, setFilter] = useState('all');
  // Inbox sort mode. Default 'timestamp' = newest first; 'priority' uses
  // memoPriority() with createdAt as tiebreaker.
  const [sortBy, setSortBy] = useState('timestamp');

  // Snoozed memos = unsent + future snoozedUntil. Inbox excludes them; they get their own tab.
  const now = Date.now();
  const isSnoozed = (l) => l.snoozedUntil && new Date(l.snoozedUntil).getTime() > now;
  const inbox    = useMemo(() => decorated.filter(l => !l.treated && !isSnoozed(l)), [decorated]);
  const snoozed  = useMemo(() => decorated.filter(l => !l.treated &&  isSnoozed(l)).sort((a, b) => new Date(a.snoozedUntil) - new Date(b.snoozedUntil)), [decorated]);
  const done     = useMemo(() => decorated.filter(l =>  l.treated), [decorated]);

  // Sort + apply filter pill on inbox; due-soon for snoozed; chronological for done.
  const visible = useMemo(() => {
    if (tab === 'done')     return done;
    if (tab === 'snoozed')  return snoozed;
    const pill = FILTER_PILLS.find(p => p.id === filter);
    const sorted = [...inbox].sort((a, b) => {
      if (sortBy === 'priority') {
        const pa = memoPriority(a), pb = memoPriority(b);
        if (pa !== pb) return pa - pb;
      }
      // Timestamp tiebreaker (and the default sort): newest first.
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    if (!pill?.match) return sorted;
    return sorted.filter(m => pill.match(computeTags(m)));
  }, [tab, inbox, done, snoozed, filter, sortBy]);

  // Pre-compute counts for filter pills
  const pillCounts = useMemo(() => {
    const out = {};
    for (const p of FILTER_PILLS) {
      if (!p.match) { out[p.id] = inbox.length; continue; }
      out[p.id] = inbox.filter(m => p.match(computeTags(m))).length;
    }
    return out;
  }, [inbox]);

  // Aggregate todos: every unsent recommended output across all inbox memos
  const todos = useMemo(() => {
    const list = [];
    for (const m of inbox) {
      for (let i = 0; i < (m.recommendedOutputs || []).length; i++) {
        const o = m.recommendedOutputs[i];
        if (o.sentAt) continue;
        list.push({ memo: m, output: o, outputIndex: i });
      }
    }
    return list.sort((a, b) => {
      const u = { urgent: 0, normal: 1, low: 2 };
      return (u[a.output.urgency] ?? 1) - (u[b.output.urgency] ?? 1);
    });
  }, [inbox]);

  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(() =>
    visible.find(l => l.id === selectedId) || visible[0] || null,
    [visible, selectedId]
  );

  const [bulkBusy, setBulkBusy] = useState(false);
  const handleBulkTreat = async () => {
    if (!onMarkTreated || inbox.length === 0) return;
    if (!confirm(`Markeer alle ${inbox.length} memo's als behandeld?`)) return;
    setBulkBusy(true);
    try { for (const l of inbox) await onMarkTreated(l.id, true); }
    finally { setBulkBusy(false); }
  };

  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessError, setReprocessError] = useState('');
  const handleReprocess = async () => {
    if (!selected || !onReprocessLog) return;
    setReprocessing(true); setReprocessError('');
    try { await onReprocessLog(selected.id); }
    catch (e) { setReprocessError(e.message || 'Mislukt'); }
    finally { setReprocessing(false); }
  };

  // ── AI triage ────────────────────────────────────────────────────────────
  const [triageResult, setTriageResult] = useState(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const handleTriageWithAI = async () => {
    if (!project?.id) return;
    setTriageLoading(true);
    try {
      const res = await fetch('/api/triage-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          memos: inbox.map(m => ({
            id: m.id,
            createdAt: m.createdAt,
            summary: m.processedSummary || m.rawNote || '',
            location: m.location,
            type: m.type,
            workpoints: m.workpoints || [],
            recommendedOutputs: (m.recommendedOutputs || []).map(o => ({
              type: o.type, recipientName: o.recipientName, recipientRole: o.recipientRole,
              subject: o.subject, urgency: o.urgency, dueAt: o.dueAt, sentAt: o.sentAt,
            })),
          })),
        }),
      });
      const json = await res.json();
      if (json.success) setTriageResult(json.priorities || []);
    } catch (err) {
      console.warn('triage failed', err);
    } finally {
      setTriageLoading(false);
    }
  };
  // Reset triage when inbox changes
  useEffect(() => { setTriageResult(null); }, [inbox.length]);

  // ── Batch send: open a preview modal with the combined draft ─────────────
  const [batchPreview, setBatchPreview] = useState(null); // { items, recipient, recipientEmail, subject, body }

  const handleBatchSend = (items, recipient, recipientEmail) => {
    if (items.length === 0) return;
    const subject = `Update: ${items.length} openstaande punten`;
    const body = [
      `Beste${recipient && recipient !== 'Anders' ? ` ${recipient.split(' ')[0]}` : ''},`,
      '',
      'In één bericht een overzicht van openstaande punten:',
      '',
      ...items.map((t, i) =>
        `${i + 1}. ${t.output.subject}\n   ${(t.output.body || '').split('\n').filter(Boolean).slice(0, 3).join(' ')}`
      ),
      '',
      'Graag jullie reactie per punt.',
      '',
      'Met vriendelijke groet',
    ].join('\n');
    setBatchPreview({ items, recipient, recipientEmail, subject, body });
  };

  const confirmBatchSend = async ({ to, subject, body }) => {
    if (!batchPreview || !onSendEmail) return;
    const { items, recipient } = batchPreview;
    try {
      await onSendEmail({
        to, subject, body,
        emailType: 'pv_mail',
        fieldLogId: items[0].memo.id,
      });
      const stamp = new Date().toISOString();
      const memoIds = [...new Set(items.map(t => t.memo.id))];
      for (const memoId of memoIds) {
        const memo = items.find(t => t.memo.id === memoId).memo;
        const next = (memo.recommendedOutputs || []).map((o, i) => {
          const matched = items.find(t => t.memo.id === memoId && t.outputIndex === i);
          return matched ? { ...o, sentAt: stamp, batchedWith: memoIds.length } : o;
        });
        if (onUpdateLog) await onUpdateLog(memoId, { recommendedOutputs: next, treated: true });
      }
      window.dispatchEvent(new CustomEvent('punchlister:toast', {
        detail: { kind: 'success', text: `${items.length} punten verstuurd naar ${recipient}` },
      }));
      setBatchPreview(null);
    } catch (err) {
      window.dispatchEvent(new CustomEvent('punchlister:toast', {
        detail: { kind: 'error', text: 'Versturen mislukt: ' + err.message },
      }));
      throw err;
    }
  };

  // If every recommended output now has a sentAt, the memo is fully handled — move it to Behandeld.
  const persistOutputs = async (memo, nextOutputs) => {
    if (!onUpdateLog) return;
    const allDone = nextOutputs.length > 0 && nextOutputs.every(o => o.sentAt);
    const updates = { recommendedOutputs: nextOutputs };
    // Only flip `treated` when state actually changes — avoids redundant DB writes.
    if (allDone && !memo.treated) updates.treated = true;
    await onUpdateLog(memo.id, updates);
  };

  // Send through and mark which output was sent (so the card shows VERZONDEN).
  const handleSendOutput = async ({ outputIndex, ...payload }) => {
    if (!selected || !onSendEmail) return;
    await onSendEmail(payload);
    const next = (selected.recommendedOutputs || []).map((o, i) =>
      i === outputIndex ? { ...o, sentAt: new Date().toISOString() } : o
    );
    await persistOutputs(selected, next);
  };

  const handleMarkOutputDone = async (outputIndex) => {
    if (!selected) return;
    const next = (selected.recommendedOutputs || []).map((o, i) =>
      i === outputIndex ? { ...o, sentAt: new Date().toISOString() } : o
    );
    await persistOutputs(selected, next);
  };

  const outputs = selected?.recommendedOutputs || [];
  const allSent = outputs.length > 0 && outputs.every(o => o.sentAt);
  const src = selected ? (SOURCE_META[selected.source] || SOURCE_META.manual) : null;

  return (
    <div className="flex min-h-[calc(100vh-0px)] text-[#0c0040]">
      {/* ── Inbox column ───────────────────────────────────────────────── */}
      <section
        className="w-[340px] flex-shrink-0 flex flex-col border-r border-black/5"
        style={{ background: 'rgba(245,242,232,0.6)', backdropFilter: 'blur(20px)' }}
      >
        <header className="px-6 pt-6 pb-3">
          <span className="eyebrow">{fmtFullDate()}</span>
          <h1 className="display-hero mt-2">Vandaag</h1>
          <p className="tagline tagline-sm mt-1">
            {inbox.length} {inbox.length === 1 ? 'memo' : "memo's"} in te verwerken.
          </p>
        </header>

        <div className="px-6 pb-2 flex items-center justify-between gap-2 min-w-0">
          <div className="inline-flex items-center gap-1 rounded-lg p-0.5 flex-shrink min-w-0"
               style={{ background: 'rgba(40,0,99,0.07)' }}>
            <button onClick={() => { setTab('inbox'); setSelectedId(null); }}
                    className={cn('px-2.5 py-1 rounded text-[11.5px] font-semibold cursor-pointer transition-colors whitespace-nowrap',
                                  tab === 'inbox' ? 'bg-[#280063] text-white' : 'text-[var(--text-secondary)]')}>
              Inbox{inbox.length > 0 && <span className="opacity-80"> {inbox.length}</span>}
            </button>
            <button onClick={() => { setTab('snoozed'); setSelectedId(null); }}
                    className={cn('px-2.5 py-1 rounded text-[11.5px] font-semibold cursor-pointer transition-colors whitespace-nowrap',
                                  tab === 'snoozed' ? 'bg-[#280063] text-white' : 'text-[var(--text-secondary)]')}>
              Snoozed{snoozed.length > 0 && <span className="opacity-80"> {snoozed.length}</span>}
            </button>
            <button onClick={() => { setTab('done'); setSelectedId(null); }}
                    className={cn('px-2.5 py-1 rounded text-[11.5px] font-semibold cursor-pointer transition-colors whitespace-nowrap',
                                  tab === 'done' ? 'bg-[#280063] text-white' : 'text-[var(--text-secondary)]')}>
              Behandeld{done.length > 0 && <span className="opacity-80"> {done.length}</span>}
            </button>
          </div>
          {tab === 'inbox' && inbox.length >= 5 && onMarkTreated && (
            <button onClick={handleBulkTreat} disabled={bulkBusy}
                    title="Markeer alles behandeld"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[#0c0040] hover:bg-black/[0.04] cursor-pointer disabled:opacity-50 whitespace-nowrap flex-shrink-0">
              {bulkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
              Alles
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pb-6">
          {/* Filter pills + cluster chips — only on Inbox; live inside the list so the header stays a stable height across tabs */}
          {tab === 'inbox' && inbox.length > 1 && (
            <div className="px-6 pt-1 pb-2 flex items-center gap-1 flex-wrap border-b border-black/5"
                 style={{ background: 'rgba(245,242,232,0.6)' }}>
              {FILTER_PILLS.map(p => {
                const c = pillCounts[p.id] || 0;
                if (p.id !== 'all' && c === 0) return null;
                return (
                  <button
                    key={p.id} onClick={() => setFilter(p.id)}
                    className={cn('px-2 py-0.5 rounded-md text-[10.5px] font-medium cursor-pointer transition-colors',
                                  filter === p.id
                                    ? 'bg-[#0c0040] text-white'
                                    : 'text-[var(--text-tertiary)] hover:text-[#0c0040] hover:bg-black/[0.04]')}>
                    {p.label}{c > 0 ? ` ${c}` : ''}
                  </button>
                );
              })}

              {/* Sort toggle — pushed to the right */}
              <div className="ml-auto inline-flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3 text-[var(--text-tertiary)]" />
                <button
                  onClick={() => setSortBy('timestamp')}
                  title="Sorteer op tijdstip (nieuwste eerst)"
                  className={cn('px-2 py-0.5 rounded-md text-[10.5px] font-medium cursor-pointer transition-colors',
                                sortBy === 'timestamp'
                                  ? 'bg-[#0c0040] text-white'
                                  : 'text-[var(--text-tertiary)] hover:text-[#0c0040] hover:bg-black/[0.04]')}>
                  Tijd
                </button>
                <button
                  onClick={() => setSortBy('priority')}
                  title="Sorteer op prioriteit"
                  className={cn('px-2 py-0.5 rounded-md text-[10.5px] font-medium cursor-pointer transition-colors',
                                sortBy === 'priority'
                                  ? 'bg-[#0c0040] text-white'
                                  : 'text-[var(--text-tertiary)] hover:text-[#0c0040] hover:bg-black/[0.04]')}>
                  Prioriteit
                </button>
              </div>
            </div>
          )}

          {visible.length === 0 ? (
            <div className="px-6 py-10 text-center text-[12px] text-[var(--text-tertiary)]">
              {tab === 'inbox' ? 'Inbox leeg. Druk op de mic.' : 'Nog niets behandeld.'}
            </div>
          ) : visible.map(item => (
            <MemoListItem
              key={item.id} item={item}
              active={selected?.id === item.id}
              onSelect={() => setSelectedId(item.id)}
              onMarkTreated={onMarkTreated}
              onSnooze={onSnoozeLog}
              onDelete={onDeleteLog}
            />
          ))}
        </div>
      </section>

      {/* ── Detail column ──────────────────────────────────────────────── */}
      <section className="flex-1 min-w-0 flex flex-col">
        {!selected ? (
          <TodosOverview
            todos={todos}
            onJumpTo={(id) => setSelectedId(id)}
            onBatchSend={handleBatchSend}
            contacts={projectContacts}
            members={projectMembers}
            onTriageWithAI={handleTriageWithAI}
            triageResult={triageResult}
            triageLoading={triageLoading}
          />
        ) : (
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-3xl space-y-7">
              {/* Hero */}
              <header>
                <span className="eyebrow">
                  {src.label} · {fmtShortDate(selected.createdAt)}, {fmtTime(selected.createdAt)}
                </span>
                <h2 className="display mt-2 mb-2">{selected.title.split('. ')[0]}</h2>
                <p className="tagline tagline-md">
                  {selected.location ? `${selected.location} · ${project?.name || ''}` : (project?.name || 'Werfverslag')}
                </p>
              </header>

              {/* Transcript */}
              <div className="paper-card p-5">
                <div className="text-[14px] leading-relaxed italic"
                     style={{ fontFamily: 'Source Serif 4, Georgia, serif', color: '#3a345e' }}>
                  <FormattedTranscript
                    text={(selected.rawNote || selected.processedSummary || '').slice(0, 1500)
                      + ((selected.rawNote || '').length > 1500 ? '…' : '')}
                  />
                </div>
              </div>

              {/* Outputs header + reprocess */}
              <header className="flex items-end justify-between gap-3">
                <div>
                  <span className="eyebrow">Aanbevolen acties</span>
                  <h3 className="title-xl mt-1">
                    {outputs.length === 0
                      ? 'Geen acties voorgesteld'
                      : `${outputs.length} ${outputs.length === 1 ? 'actie' : 'acties'}`}
                  </h3>
                  {outputs.length === 0 && (
                    <p className="tagline tagline-sm mt-1">
                      Klik <em>Genereer</em> om Punchlister drafts te laten opstellen.
                    </p>
                  )}
                </div>
                {onReprocessLog && (
                  <button onClick={handleReprocess}
                          disabled={reprocessing || selected.processing}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/10 hover:bg-black/[0.04] cursor-pointer disabled:opacity-50 text-[#3a345e]"
                          title="Genereer drafts opnieuw">
                    {reprocessing || selected.processing
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />}
                    {outputs.length === 0 ? 'Genereer' : 'Opnieuw'}
                  </button>
                )}
              </header>

              {reprocessError && (
                <div className="paper-card-tight px-4 py-2 text-[12px] text-[#9b1d1d]"
                     style={{ background: '#ffe1e1' }}>
                  {reprocessError}
                </div>
              )}

              {/* Output cards */}
              {outputs.map((o, i) => (
                <OutputCard
                  key={i} memo={selected} output={o} index={i}
                  contacts={projectContacts} members={projectMembers}
                  onSend={handleSendOutput}
                  onMarkSent={handleMarkOutputDone}
                />
              ))}

              {outputs.length === 0 && !selected.processing && (
                <div className="paper-card-tight px-5 py-8 text-center">
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Nog geen drafts. Punchlister kan ze nu opstellen op basis van de memo, je contacten en de offerte.
                  </p>
                </div>
              )}

              {/* Footer actions */}
              <footer className="flex items-center justify-between pt-3 border-t border-black/5">
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {allSent
                    ? 'Alle aanbevolen acties zijn verstuurd of gepland.'
                    : 'Versturen markeert deze memo automatisch als behandeld.'}
                </span>
                <div className="flex items-center gap-2">
                  {onMarkTreated && !selected.treated && (
                    <button onClick={() => onMarkTreated(selected.id, true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/10 hover:bg-black/[0.04] cursor-pointer text-[#0c0040]">
                      <Check className="w-3.5 h-3.5" /> Klaar
                    </button>
                  )}
                  {onMarkTreated && selected.treated && (
                    <button onClick={() => onMarkTreated(selected.id, false)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/10 hover:bg-black/[0.04] cursor-pointer text-[var(--text-secondary)]">
                      <RotateCcw className="w-3.5 h-3.5" /> Terug naar inbox
                    </button>
                  )}
                </div>
              </footer>
            </div>
          </div>
        )}
      </section>

      {/* Batch-send preview modal */}
      <ComposePreviewModal
        open={!!batchPreview}
        draft={batchPreview}
        items={batchPreview?.items || []}
        contacts={projectContacts}
        members={projectMembers}
        onClose={() => setBatchPreview(null)}
        onConfirm={confirmBatchSend}
      />
    </div>
  );
}
