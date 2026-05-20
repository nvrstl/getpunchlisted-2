import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Mic, Mail, MailCheck, FileQuestion, ClipboardCheck, ClipboardList,
  FileSignature, AlertOctagon, Bell, History, Filter, Search, X,
} from 'lucide-react';
import { cn } from '../lib/utils';

const spring = { type: 'spring', stiffness: 300, damping: 28 };

const EVENT_TYPES = {
  memo:        { label: "Werfnotitie",      color: '#280063', bg: '#ece9ff', icon: Mic },
  email_sent:  { label: "Mail verzonden",   color: '#1d4ed8', bg: '#dbeafe', icon: Mail },
  email_reply: { label: "Reactie ontvangen",color: '#075e48', bg: '#d1fae5', icon: MailCheck },
  rfi:         { label: "Meerwerk",         color: '#4338ca', bg: '#e0e7ff', icon: FileQuestion },
  punch_new:   { label: "Taak toegevoegd",  color: '#92580c', bg: '#fef3c7', icon: ClipboardList },
  punch_done:  { label: "Taak afgerond",    color: '#075e48', bg: '#d1fae5', icon: ClipboardCheck },
  variation:   { label: "Meerwerk",         color: '#c2410c', bg: '#ffedd5', icon: FileSignature },
  dispute:     { label: "Betwisting",       color: '#b91c1c', bg: '#fee2e2', icon: AlertOctagon },
  reminder:    { label: "Reminder",         color: '#6b7280', bg: '#f3f4f6', icon: Bell },
};

function formatDayHeader(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest  = new Date(today); yest.setDate(today.getDate() - 1);
  const d     = new Date(date); d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return 'Vandaag';
  if (d.getTime() === yest.getTime())  return 'Gisteren';
  return d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
}

function trunc(s, n = 110) {
  if (!s) return '';
  const t = String(s).trim().replace(/\s+/g, ' ');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function firstSentence(s, max = 140) {
  if (!s) return '';
  const t = String(s).trim().replace(/\s+/g, ' ');
  // Cut at first sentence terminator if reasonably early, otherwise hard-truncate.
  const m = t.match(/^(.{20,160}?[.!?])(\s|$)/);
  return trunc(m ? m[1] : t, max);
}

export default function ProjectTimeline({
  project,
  fieldLogs = [],
  outboundEmails = [],
  rfis = [],
  punchItems = [],
  variations = [],
  disputes = [],
  reminders = [],
}) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery]   = useState('');

  const events = useMemo(() => {
    const list = [];

    for (const l of fieldLogs) {
      const at = l.logDate || l.createdAt;
      if (!at) continue;
      const title = l.label || (l.type ? l.type[0].toUpperCase() + l.type.slice(1) : 'Werfnotitie');
      const summary = firstSentence(l.processedSummary || l.rawNote, 140);
      list.push({
        id: `memo-${l.id}`,
        type: 'memo',
        at,
        title,
        summary,
        meta: l.location || null,
        searchText: `${title} ${summary} ${l.location || ''} ${l.rawNote || ''}`,
      });
    }

    for (const e of outboundEmails) {
      const to = Array.isArray(e.to) && e.to.length ? e.to[0] : '—';
      const subject = e.subject || '(geen onderwerp)';
      const bodyPeek = firstSentence(e.bodyText, 120);
      if (e.sentAt) {
        list.push({
          id: `mail-${e.id}`,
          type: 'email_sent',
          at: e.sentAt,
          title: trunc(subject, 90),
          summary: bodyPeek,
          meta: `aan ${to}`,
          searchText: `${subject} ${to} ${bodyPeek}`,
        });
      }
      if (e.repliedAt) {
        list.push({
          id: `reply-${e.id}`,
          type: 'email_reply',
          at: e.repliedAt,
          title: trunc(subject, 90),
          summary: '',
          meta: `van ${to}`,
          searchText: `${subject} ${to}`,
        });
      }
    }

    for (const r of rfis) {
      if (!r.createdAt) continue;
      const title = r.title || `Meerwerk ${r.number || ''}`;
      const summary = firstSentence(r.context || r.draft, 140);
      list.push({
        id: `rfi-${r.id}`,
        type: 'rfi',
        at: r.createdAt,
        title: trunc(title, 100),
        summary,
        meta: r.status ? `status: ${r.status}` : null,
        searchText: `${title} ${summary} ${r.status || ''}`,
      });
    }

    for (const p of punchItems) {
      if (p.createdAt) list.push({
        id: `punch-new-${p.id}`,
        type: 'punch_new',
        at: p.createdAt,
        title: trunc(p.task, 100),
        summary: firstSentence(p.notes, 120),
        meta: [p.assignee, p.dueDate ? `deadline ${new Date(p.dueDate).toLocaleDateString('nl-BE')}` : null].filter(Boolean).join(' · ') || null,
        searchText: `${p.task} ${p.assignee || ''} ${p.notes || ''}`,
      });
      if (p.completedAt) list.push({
        id: `punch-done-${p.id}`,
        type: 'punch_done',
        at: p.completedAt,
        title: trunc(p.task, 100),
        summary: '',
        meta: p.assignee ? `door ${p.assignee}` : 'afgerond',
        searchText: `${p.task} ${p.assignee || ''}`,
      });
    }

    for (const v of variations) {
      if (!v.createdAt) continue;
      const title = v.description ? `Meerwerk: ${v.description.split('.')[0]}` : `Meerwerk ${v.number || ''}`;
      const cost  = v.estimatedCost != null ? `€ ${Number(v.estimatedCost).toLocaleString('nl-BE')}` : null;
      list.push({
        id: `var-${v.id}`,
        type: 'variation',
        at: v.createdAt,
        title: trunc(title, 110),
        summary: firstSentence(v.notes || v.description, 140),
        meta: [cost, v.requestedBy && `aangevraagd door ${v.requestedBy}`, v.status && `status: ${v.status}`].filter(Boolean).join(' · ') || null,
        searchText: `${v.description || ''} ${v.notes || ''} ${v.requestedBy || ''} ${v.status || ''}`,
      });
    }

    for (const d of disputes) {
      if (!d.createdAt) continue;
      list.push({
        id: `disp-${d.id}`,
        type: 'dispute',
        at: d.createdAt,
        title: trunc(d.subject || 'Betwisting', 110),
        summary: d.senderEmail ? `Ingediend door ${d.senderEmail}.` : '',
        meta: d.status ? `status: ${d.status}` : null,
        searchText: `${d.subject || ''} ${d.senderEmail || ''} ${d.status || ''}`,
      });
    }

    for (const r of reminders) {
      const at = r.sentAt || r.dueAt;
      if (!at) continue;
      const title = r.subject || '(reminder)';
      list.push({
        id: `rem-${r.id}`,
        type: 'reminder',
        at,
        title: trunc(title, 100),
        summary: firstSentence(r.body, 120),
        meta: r.status === 'pending'
          ? `gepland: ${new Date(r.dueAt).toLocaleDateString('nl-BE')}`
          : (r.recipient ? `verstuurd naar ${r.recipient}` : 'verstuurd'),
        searchText: `${title} ${r.body || ''} ${r.recipient || ''}`,
      });
    }

    return list.sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [fieldLogs, outboundEmails, rfis, punchItems, variations, disputes, reminders]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    let out = events;
    if (filter !== 'all') out = out.filter(e => e.type === filter);
    if (normalizedQuery) {
      out = out.filter(e => (e.searchText || '').toLowerCase().includes(normalizedQuery));
    }
    return out;
  }, [events, filter, normalizedQuery]);

  const counts = useMemo(() => {
    const c = {};
    for (const e of events) c[e.type] = (c[e.type] || 0) + 1;
    return c;
  }, [events]);

  const grouped = useMemo(() => {
    const out = [];
    let curKey = null;
    for (const e of filtered) {
      const k = new Date(e.at).toDateString();
      if (k !== curKey) {
        out.push({ dayKey: k, dayLabel: formatDayHeader(e.at), items: [] });
        curKey = k;
      }
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [filtered]);

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto pb-28 md:pb-10">
      {/* Header */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] flex items-center justify-center">
            <History className="w-4 h-4 text-[var(--text-secondary)]" />
          </div>
          <div>
            <span className="eyebrow">Geschiedenis</span>
            <h1 className="title-xl">Project-tijdlijn</h1>
          </div>
        </div>
        <p className="text-[13px] text-[var(--text-secondary)] ml-12">
          Alles wat gebeurd is op {project?.name || 'dit project'} — memos, mails, taken, meerwerken, betwistingen.
        </p>
      </motion.div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek in werfnotities, mails, taken, meerwerken…"
          className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white border border-[var(--border-color)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-brand/50 transition-colors"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-tertiary)] hover:text-[#0c0040] hover:bg-black/[0.05] cursor-pointer"
            title="Wis"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="mb-6 flex flex-wrap gap-1.5 items-center">
        <Filter className="w-3.5 h-3.5 text-[var(--text-tertiary)] mr-1" />
        <button
          onClick={() => setFilter('all')}
          className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-colors',
            filter === 'all' ? 'bg-[#280063] text-white' : 'bg-black/[0.04] text-[var(--text-secondary)] hover:bg-black/[0.08]')}
        >
          Alles {events.length > 0 && <span className="opacity-70">· {events.length}</span>}
        </button>
        {Object.entries(EVENT_TYPES).map(([id, meta]) => {
          const c = counts[id] || 0;
          if (c === 0) return null;
          const isActive = filter === id;
          return (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-colors flex items-center gap-1.5',
                isActive ? 'text-white' : 'hover:bg-black/[0.04]')}
              style={isActive
                ? { background: meta.color }
                : { background: meta.bg, color: meta.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: isActive ? '#fff' : meta.color }} />
              {meta.label} <span className="opacity-70">· {c}</span>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {grouped.length === 0 ? (
        <div className="paper-card-tight px-5 py-10 text-center">
          <p className="text-[13px] text-[var(--text-secondary)]">
            {normalizedQuery
              ? `Geen resultaten voor "${query}".`
              : `Nog geen activiteit voor ${filter === 'all' ? 'dit project' : EVENT_TYPES[filter]?.label?.toLowerCase()}.`}
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical guide rail */}
          <div className="absolute left-[15px] top-0 bottom-0 w-px bg-[var(--border-color)]" aria-hidden />

          {grouped.map((g, gi) => (
            <div key={g.dayKey} className={cn('mb-7', gi === 0 && 'pt-1')}>
              {/* Day header */}
              <div className="flex items-center gap-2 mb-3 pl-9">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                  {g.dayLabel}
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)]">· {g.items.length}</span>
              </div>

              {/* Events */}
              <div className="space-y-2.5">
                {g.items.map(e => {
                  const meta = EVENT_TYPES[e.type] || EVENT_TYPES.memo;
                  const Icon = meta.icon;
                  return (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={spring}
                      className="relative flex items-start gap-3 pl-0"
                    >
                      {/* Icon node on the rail */}
                      <div
                        className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-[var(--surface-2)]"
                        style={{ background: meta.bg, color: meta.color }}
                        title={meta.label}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>

                      {/* Body */}
                      <div className="flex-1 min-w-0 paper-card-tight px-3.5 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span
                                className="text-[10px] font-bold uppercase tracking-wider"
                                style={{ color: meta.color }}
                              >
                                {meta.label}
                              </span>
                              {e.meta && (
                                <span className="text-[11px] text-[var(--text-tertiary)]">· {e.meta}</span>
                              )}
                            </div>
                            <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">
                              {e.title}
                            </p>
                            {e.summary && (
                              <p className="text-[12px] text-[var(--text-secondary)] leading-snug mt-0.5">
                                {e.summary}
                              </p>
                            )}
                          </div>
                          <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums flex-shrink-0 mt-0.5">
                            {formatTime(e.at)}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
