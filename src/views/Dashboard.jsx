import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUp, Loader2, Search, Mic, FileText, Bell,
  CheckCircle2, Clock, CalendarClock, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

async function callChat({ system, messages, max_tokens = 900 }) {
  const res = await fetch('/api/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ system, messages, max_tokens }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
  return json.text;
}

const spring = { type: 'spring', stiffness: 300, damping: 28 };

/* ── helpers ─────────────────────────────────────────────────────────────── */
function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 86_400_000);
}
function daysFromNow(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso) - new Date()) / 86_400_000);
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}
function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) {
    return `Vandaag · ${d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return `${d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`;
}

const STATUS_LABEL = {
  pre_construction: 'Voorbereiding',
  active:           'Werken in uitvoering',
  punch_phase:      'Opleveringsfase',
  completed:        'Voltooid',
};

/* ── Fact row ─────────────────────────────────────────────────────────────── */
function FactRow({ label, value, muted }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)] mb-0.5">{label}</div>
      <div className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">
        {value}
        {muted && <span className="text-[var(--text-tertiary)] font-normal"> · {muted}</span>}
      </div>
    </div>
  );
}

/* ── Ops item ─────────────────────────────────────────────────────────────── */
function OpsItem({ title, meta, primaryLabel, secondaryLabel, warningLabel, onPrimary, onSecondary, onWarning }) {
  return (
    <div className="p-3 bg-[var(--surface-3)] border border-[var(--border-color)] rounded-lg text-[13px] cursor-default hover:border-[var(--border-color)] transition-colors">
      <div className="font-medium text-[var(--text-primary)] mb-1 leading-snug">{title}</div>
      {meta && <div className="text-[11px] text-[var(--text-tertiary)] mb-2.5" dangerouslySetInnerHTML={{ __html: meta }} />}
      {(primaryLabel || secondaryLabel || warningLabel) && (
        <div className="flex gap-1.5 pt-2 border-t border-[var(--border-color)]">
          {primaryLabel && (
            <button
              onClick={onPrimary}
              className="flex-1 py-1.5 px-2 rounded-md text-[11px] font-semibold bg-brand text-white hover:opacity-90 transition-opacity cursor-pointer"
            >
              {primaryLabel}
            </button>
          )}
          {warningLabel && (
            <button
              onClick={onWarning}
              className="flex-1 py-1.5 px-2 rounded-md text-[11px] font-semibold border border-amber-500 text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
            >
              {warningLabel}
            </button>
          )}
          {secondaryLabel && (
            <button
              onClick={onSecondary}
              className="flex-1 py-1.5 px-2 rounded-md text-[11px] font-semibold bg-white border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-brand/50 hover:text-brand transition-colors cursor-pointer"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Ops column ───────────────────────────────────────────────────────────── */
function OpsColumn({ accentColor, eyebrow, title, children, isEmpty }) {
  return (
    <div
      className="bg-white border border-[var(--border-color)] rounded-xl p-4 flex flex-col gap-3"
      style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] mb-0.5" style={{ color: accentColor }}>{eyebrow}</div>
        <div className="text-[15px] font-semibold text-[var(--text-primary)] tracking-tight">{title}</div>
      </div>
      {isEmpty
        ? <div className="py-4 text-center text-[12px] text-[var(--text-tertiary)] italic">Geen items</div>
        : <div className="flex flex-col gap-2">{children}</div>
      }
    </div>
  );
}

/* ── Timeline item ────────────────────────────────────────────────────────── */
function TimelineItem({ type, date, title, snippet, last }) {
  const tagConfig = {
    voice:   { label: 'Spraakmemo', bg: 'bg-[#eef2ff]', color: 'text-brand', dot: 'bg-brand' },
    draft:   { label: 'Draft',      bg: 'bg-[var(--surface-2)]', color: 'text-[var(--text-tertiary)]', dot: 'bg-white border border-brand' },
    sent:    { label: 'Verzonden',  bg: 'bg-[#e8fbf5]', color: 'text-[#075e48]', dot: 'bg-[#0c7a5e]' },
    dispute: { label: 'Betwisting', bg: 'bg-red-50', color: 'text-red-700', dot: 'bg-red-500' },
  };
  const cfg = tagConfig[type] || tagConfig.voice;
  return (
    <div className="relative pl-6">
      {/* dot */}
      <div className={cn('absolute left-0 top-4 w-2.5 h-2.5 rounded-full border-2 border-white z-10', cfg.dot)} style={{ transform: 'translateX(-4px)' }} />
      <div className={cn('glass-card rounded-lg px-4 py-3 cursor-default hover:shadow-md transition-shadow', !last && 'mb-3')}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] text-[var(--text-tertiary)]">{date}</span>
          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-[0.06em]', cfg.bg, cfg.color)}>{cfg.label}</span>
        </div>
        <div className="text-[13.5px] font-medium text-[var(--text-primary)] mb-1">{title}</div>
        {snippet && <div className="text-[12px] text-[var(--text-secondary)] leading-snug" dangerouslySetInnerHTML={{ __html: snippet }} />}
      </div>
    </div>
  );
}

/* ── Chat interface ───────────────────────────────────────────────────────── */
const PROJECT_SUGGESTIONS_VRAAG = [
  'Wat is de huidige status van het project?',
  'Welke beslissingen zijn nog openstaand?',
  'Vat de laatste werfverslagen samen',
];
const PROJECT_SUGGESTIONS_INSTRUCTIE = [
  'Stuur een herinnering aan de bouwheer',
  'Stel een voortgangsmail op voor de architect',
  'Maak een samenvatting voor het volgende overleg',
];

function ProjectChat({ project, fieldLogs, rfis, punchItems, disputes }) {
  const [mode, setMode] = useState('vraag'); // 'vraag' | 'instructie'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const buildContext = () => {
    const lines = [];
    lines.push(`## Project: ${project.name}`);
    if (project.city) lines.push(`Stad: ${project.city}`);
    if (project.status) lines.push(`Status: ${STATUS_LABEL[project.status] || project.status}`);
    if (project.client_name) lines.push(`Bouwheer: ${project.client_name}`);
    if (project.bouwheer_name) lines.push(`Bouwheer contactpersoon: ${project.bouwheer_name}${project.bouwheer_email ? ` <${project.bouwheer_email}>` : ''}`);
    if (project.architect_name) lines.push(`Architect: ${project.architect_name}${project.architect_email ? ` <${project.architect_email}>` : ''}`);
    if (project.project_manager) lines.push(`Projectleider: ${project.project_manager}`);
    if (project.start_date) lines.push(`Startdatum: ${project.start_date}`);
    if (project.planned_completion) lines.push(`Geplande oplevering: ${project.planned_completion}`);

    if (fieldLogs.length) {
      lines.push('\n## Recente werfverslagen');
      fieldLogs.slice(0, 10).forEach(l => {
        lines.push(`- ${(l.logDate || l.createdAt || '').split('T')[0]}: ${(l.processedSummary || l.rawNote || '').slice(0, 150)}`);
      });
    }
    if (rfis.length) {
      lines.push('\n## Meerwerken / Mails');
      rfis.slice(0, 8).forEach(r => {
        lines.push(`- [${r.status}] ${r.title || r.number}`);
      });
    }
    if (punchItems.filter(p => p.status !== 'completed').length) {
      lines.push('\n## Openstaande taken');
      punchItems.filter(p => p.status !== 'completed').slice(0, 10).forEach(p => {
        lines.push(`- ${p.task}${p.assignee ? ` → ${p.assignee}` : ''}${p.dueDate ? ` (deadline: ${p.dueDate})` : ''}`);
      });
    }
    if (disputes.filter(d => d.status === 'open').length) {
      lines.push('\n## Openstaande betwistingen');
      disputes.filter(d => d.status === 'open').forEach(d => {
        lines.push(`- ${d.subject || d.number}`);
      });
    }
    return lines.join('\n');
  };

  const send = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setLoading(true);
    try {
      const context = buildContext();
      const isInstructie = mode === 'instructie';
      const system = isInstructie
        ? `Je bent Punchlister AI, assistent voor bouwprojectbeheer. Stel professionele communicatie op (mails, brieven) op basis van de instructie en projectdata hieronder. Schrijf in het Nederlands. Formeel, bondig, bouwprofessioneel.\n\n${context}`
        : `Je bent Punchlister AI, assistent voor bouwprojectbeheer. Beantwoord vragen over onderstaand project beknopt en concreet in het Nederlands.\n\n${context}`;

      const text = await callChat({
        system,
        max_tokens: 900,
        messages: [
          ...messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: trimmed },
        ],
      });
      setMessages(prev => [...prev, { role: 'assistant', content: text.trim() }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Fout: ${err.message}` }]);
    }
    setLoading(false);
  };

  const suggestions = mode === 'vraag' ? PROJECT_SUGGESTIONS_VRAAG : PROJECT_SUGGESTIONS_INSTRUCTIE;
  const empty = messages.length === 0;

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: 400 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-color)]/60 bg-[var(--surface-3)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--text-primary)] rounded-full flex items-center justify-center text-[13px] font-bold text-[#b3aaf5]">P</div>
          <div>
            <div className="text-[14px] font-semibold text-[var(--text-primary)] leading-none">Werk met dit project</div>
            <div className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
              {mode === 'vraag' ? 'Stel vragen over dit project' : 'Geef een instructie om een draft op te stellen'}
            </div>
          </div>
        </div>
        {/* Mode toggle */}
        <div className="flex bg-[var(--surface-2)] rounded-lg p-0.5 gap-0.5">
          {['vraag', 'instructie'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer capitalize',
                mode === m
                  ? 'bg-white text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              )}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ minHeight: 220 }}>
        <AnimatePresence initial={false}>
          {empty ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="h-full flex flex-col items-center justify-center py-8 text-center"
            >
              <div className="w-10 h-10 bg-[var(--text-primary)] rounded-xl flex items-center justify-center mb-2.5 text-[#b3aaf5] text-[16px] font-bold">P</div>
              <div className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">
                {mode === 'vraag' ? 'Stel een vraag over dit project' : 'Geef een instructie'}
              </div>
            </motion.div>
          ) : (
            messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={spring}
                className={cn('flex gap-2.5', msg.role === 'user' ? 'ml-auto flex-row-reverse max-w-[80%]' : 'max-w-[88%]')}
              >
                <div className={cn(
                  'w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold',
                  msg.role === 'user' ? 'bg-[#eef2ff] text-brand border border-[#c7d2fe]' : 'bg-[var(--text-primary)] text-[#b3aaf5]'
                )}>
                  {msg.role === 'user' ? 'J' : 'P'}
                </div>
                <div className={cn(
                  'px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-brand text-white rounded-tr-sm'
                    : 'bg-[var(--surface-3)] border border-[var(--border-color)]/60 text-[var(--text-secondary)] rounded-tl-sm'
                )}>
                  {msg.content}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[var(--text-primary)] flex items-center justify-center text-[10px] font-bold text-[#b3aaf5]">P</div>
            <div className="px-3.5 py-2.5 bg-[var(--surface-3)] border border-[var(--border-color)]/60 rounded-xl rounded-tl-sm">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                  <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]"
                    animate={{ y: [0, -4, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      <AnimatePresence>
        {empty && (
          <motion.div
            key="suggestions"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="px-5 py-3 border-t border-[var(--border-color)]/60 bg-[var(--surface-3)]"
          >
            <div className="label-caps mb-2">Voorbeelden</div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className={cn(
                    'text-[11.5px] px-2.5 py-1.5 rounded-full border transition-colors cursor-pointer font-medium',
                    mode === 'instructie'
                      ? 'bg-[#eef2ff] border-brand/30 text-brand hover:bg-brand/10'
                      : 'bg-white border-[var(--border-color)] text-[var(--text-secondary)] hover:border-brand/40 hover:text-brand'
                  )}
                >
                  {mode === 'instructie' && <span className="mr-1 opacity-70">↗</span>}
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[var(--border-color)]/60 flex items-center gap-2.5 bg-white/50">
        <div className="flex-1 flex items-center gap-2 bg-[var(--surface-3)] border border-[var(--border-color)] rounded-xl px-3 py-2 focus-within:border-brand/50 transition-colors">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand flex-shrink-0">
            {mode === 'vraag' ? 'Vraag' : 'Instructie'}
          </span>
          <input
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            placeholder={mode === 'vraag' ? 'Stel een vraag over dit project...' : 'Geef een instructie voor een draft...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            disabled={loading}
          />
        </div>
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="w-9 h-9 rounded-full bg-brand flex items-center justify-center text-white flex-shrink-0 disabled:opacity-35 hover:bg-brand/90 transition-colors cursor-pointer"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function Dashboard({ project, fieldLogs, rfis, punchItems, subs = [], disputes = [], onNavigate }) {
  const [timelineSearch, setTimelineSearch] = useState('');

  /* ── derived data ──────────────────────────────────────────────────────── */
  const today      = new Date(); today.setHours(0, 0, 0, 0);
  const startDate  = project?.start_date ? new Date(project.start_date) : null;
  const endDate    = project?.planned_completion ? new Date(project.planned_completion) : null;
  const totalDays  = daysBetween(startDate, endDate);
  const daysIn     = startDate ? Math.max(0, Math.round((today - startDate) / 86_400_000)) : null;
  const daysLeft   = endDate ? Math.round((endDate - today) / 86_400_000) : null;

  const draftRFIs   = rfis.filter(r => r.status === 'draft').slice(0, 4);
  const openDisputes = disputes.filter(d => d.status === 'open').slice(0, 3);
  const pendingHigh  = punchItems.filter(p => p.status !== 'completed' && p.priority === 'high').slice(0, 2);
  const decisionsItems = [...openDisputes, ...pendingHigh].slice(0, 4);

  const upcomingDeadlines = punchItems
    .filter(p => p.status !== 'completed' && p.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 3);

  const deadlineItems = [
    ...upcomingDeadlines,
    ...(endDate ? [{ _isEnd: true, dueDate: project.planned_completion }] : []),
  ].slice(0, 4);

  // Timeline: merge field logs + draft/sent RFIs
  const timelineEntries = [
    ...fieldLogs.map(l => ({
      id: l.id,
      type: 'voice',
      date: fmtDateTime(l.logDate || l.createdAt),
      sortKey: new Date(l.logDate || l.createdAt).getTime(),
      title: l.processedSummary ? l.processedSummary.split('.')[0] : (l.rawNote || '').slice(0, 80),
      snippet: l.processedSummary || l.rawNote || '',
    })),
    ...rfis.filter(r => r.status === 'sent').map(r => ({
      id: `rfi-${r.id}`,
      type: 'sent',
      date: fmtDateTime(r.updatedAt || r.createdAt),
      sortKey: new Date(r.updatedAt || r.createdAt).getTime(),
      title: r.title || r.number,
      snippet: r.emailDraft ? r.emailDraft.slice(0, 120) + '…' : '',
    })),
    ...rfis.filter(r => r.status === 'draft').map(r => ({
      id: `rfi-draft-${r.id}`,
      type: 'draft',
      date: fmtDateTime(r.createdAt),
      sortKey: new Date(r.createdAt).getTime(),
      title: `${r.title || r.number} · klaar voor review`,
      snippet: '',
    })),
    ...disputes.map(d => ({
      id: `dis-${d.id}`,
      type: 'dispute',
      date: fmtDateTime(d.createdAt),
      sortKey: new Date(d.createdAt).getTime(),
      title: d.subject || d.number,
      snippet: '',
    })),
  ]
    .sort((a, b) => b.sortKey - a.sortKey)
    .filter(e =>
      !timelineSearch ||
      e.title.toLowerCase().includes(timelineSearch.toLowerCase()) ||
      e.snippet.toLowerCase().includes(timelineSearch.toLowerCase())
    )
    .slice(0, 20);

  const sentCount   = rfis.filter(r => r.status === 'sent').length;
  const pendingCount = punchItems.filter(p => p.status !== 'completed').length + disputes.filter(d => d.status === 'open').length;
  const meetingCount = fieldLogs.length;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto pb-24 md:pb-8">

      {/* ── Breadcrumb ── */}
      <motion.div
        className="text-[12px] text-[var(--text-tertiary)] mb-1.5"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
      >
        <button onClick={() => onNavigate('dashboard')} className="text-brand font-medium hover:underline cursor-pointer">Projecten</button>
        <span className="mx-1.5">·</span>
        <span>{project?.name}</span>
      </motion.div>

      {/* ── Top row: project header + status card ── */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 mb-6"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      >
        {/* Project header */}
        <div>
          <h1 className="text-[26px] font-bold text-[var(--text-primary)] tracking-tight leading-none mb-1">
            {project?.name}
          </h1>
          <div className="text-[14px] text-[var(--text-secondary)] mb-4">
            {[project?.description, project?.city].filter(Boolean).join(' · ')}
          </div>

          <div className="bg-[var(--surface-3)] border border-[var(--border-color)] rounded-xl p-4 grid grid-cols-2 gap-x-6 gap-y-3">
            <FactRow
              label="Bouwheer"
              value={project?.bouwheer_name || project?.client_name}
              muted={project?.bouwheer_email}
            />
            <FactRow
              label="Architect"
              value={project?.architect_name}
              muted={project?.architect_email}
            />
            <FactRow
              label="Projectleider"
              value={project?.project_manager}
            />
            <FactRow
              label="Calculator"
              value={project?.calculator_name}
              muted={project?.calculator_email}
            />
            <FactRow
              label="Type werk"
              value={project?.description}
            />
            <FactRow
              label="Status"
              value={STATUS_LABEL[project?.status] || project?.status}
            />
          </div>
        </div>

        {/* Status card */}
        <div
          className="rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[200px]"
          style={{ background: 'var(--text-primary)' }}
        >
          <div
            className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(124,109,240,0.35), transparent 60%)' }}
          />
          <div className="relative">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b3aaf5] mb-1">Project status</div>
            <div className="text-[15px] font-semibold text-white mb-4">
              {daysIn !== null && totalDays !== null
                ? `Dag ${daysIn} van ${totalDays}`
                : project?.start_date ? `Gestart op ${fmtDate(project.start_date)}` : 'In uitvoering'
              }
            </div>
          </div>
          <div className="relative grid grid-cols-2 gap-3">
            {[
              { num: daysLeft !== null ? Math.max(0, daysLeft) : '—', label: 'Dagen tot oplevering' },
              { num: meetingCount, label: 'Werfverslagen' },
              { num: sentCount, label: 'Mails verzonden' },
              { num: pendingCount, label: 'Openstaande items' },
            ].map(({ num, label }) => (
              <div key={label}>
                <div className="text-[22px] font-bold text-white leading-none tracking-tight mb-1">{num}</div>
                <div className="text-[11px] text-[#b3aaf5] leading-snug">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Three operational columns ── */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.08 }}
      >
        {/* Drafts */}
        <OpsColumn accentColor="var(--brand)" eyebrow="Drafts" title="Klaar voor review" isEmpty={draftRFIs.length === 0}>
          {draftRFIs.map(r => (
            <OpsItem
              key={r.id}
              title={r.title || r.number}
              meta={`Opgesteld ${fmtDate(r.createdAt)}`}
              primaryLabel="Review &amp; verzenden"
              secondaryLabel="Verwerpen"
              onPrimary={() => onNavigate('rfis')}
              onSecondary={() => onNavigate('rfis')}
            />
          ))}
        </OpsColumn>

        {/* Beslissingen */}
        <OpsColumn accentColor="#c2410c" eyebrow="Beslissingen" title="Openstaand" isEmpty={decisionsItems.length === 0}>
          {openDisputes.map(d => (
            <OpsItem
              key={d.id}
              title={d.subject || d.number}
              meta={`Openstaande betwisting · <strong>${fmtDate(d.createdAt)}</strong>`}
              primaryLabel="Behandelen"
              onPrimary={() => onNavigate('disputes')}
            />
          ))}
          {pendingHigh.map(p => (
            <OpsItem
              key={p.id}
              title={p.task}
              meta={`Hoge prioriteit${p.assignee ? ` · <strong>${p.assignee}</strong>` : ''}`}
              warningLabel="Beslissen"
              secondaryLabel="Details"
              onWarning={() => onNavigate('punchList')}
              onSecondary={() => onNavigate('punchList')}
            />
          ))}
        </OpsColumn>

        {/* Deadlines */}
        <OpsColumn accentColor="var(--text-primary)" eyebrow="Deadlines" title="Eerstvolgende" isEmpty={deadlineItems.length === 0}>
          {upcomingDeadlines.map(p => {
            const d = daysFromNow(p.dueDate);
            return (
              <OpsItem
                key={p.id}
                title={p.task}
                meta={`Deadline <strong>${fmtDate(p.dueDate)}</strong> · ${d !== null ? (d >= 0 ? `over ${d} dagen` : `${Math.abs(d)} dagen geleden`) : ''}`}
                primaryLabel="Bekijken"
                onPrimary={() => onNavigate('punchList')}
              />
            );
          })}
          {endDate && (
            <OpsItem
              title="Voorziene oplevering"
              meta={`Op <strong>${fmtDate(project.planned_completion)}</strong>${daysLeft !== null ? ` · over ${Math.max(0, daysLeft)} dagen` : ''}`}
            />
          )}
        </OpsColumn>
      </motion.div>

      {/* ── Project chat ── */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.14 }}
      >
        <ProjectChat
          project={project}
          fieldLogs={fieldLogs}
          rfis={rfis}
          punchItems={punchItems}
          disputes={disputes}
        />
      </motion.div>

      {/* ── Project memory / timeline ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[18px] font-bold text-[var(--text-primary)] tracking-tight">Projectgeheugen</h2>
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-3)] border border-[var(--border-color)] rounded-lg text-[12px] text-[var(--text-tertiary)] w-64">
            <Search className="w-3.5 h-3.5 flex-shrink-0" />
            <input
              className="flex-1 bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              placeholder="Zoek in dit project..."
              value={timelineSearch}
              onChange={e => setTimelineSearch(e.target.value)}
            />
          </div>
        </div>

        {timelineEntries.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center text-[13px] text-[var(--text-tertiary)] italic">
            Nog geen activiteiten — voeg een werfverslag toe om te starten.
          </div>
        ) : (
          <div className="relative ml-2 border-l-2 border-[var(--border-color)] pl-4">
            {timelineEntries.map((entry, i) => (
              <TimelineItem
                key={entry.id}
                type={entry.type}
                date={entry.date}
                title={entry.title}
                snippet={entry.snippet}
                last={i === timelineEntries.length - 1}
              />
            ))}
          </div>
        )}
      </motion.div>

    </div>
  );
}
