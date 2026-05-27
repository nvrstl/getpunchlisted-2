import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, FolderOpen, LogOut,
  Clock, CalendarX2, Plus, ChevronRight, Loader2, Star,
  CheckSquare, Flame, CalendarDays, X, Bell,
} from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import FloatingChat from '../components/FloatingChat';

const spring = { type: 'spring', stiffness: 300, damping: 28 };

const STATUS_CONFIG = {
  pre_construction: { label: 'Voorbereiding', color: '#6366F1', bg: '#EEF2FF' },
  active:           { label: 'Actief',         color: '#7669ff', bg: '#F3F0FF' },
  punch_phase:      { label: 'Oplevering',     color: '#F59E0B', bg: '#FFFBEB' },
  completed:        { label: 'Voltooid',       color: '#6B7280', bg: '#F9FAFB' },
};

/* ── Utility helpers ─────────────────────────────────────────────────────── */
function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'Goedemorgen';
  if (h < 18) return 'Goedemiddag';
  return 'Goedenavond';
}
function formatDate() {
  return new Date().toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
}
function formatTime() {
  return new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
}
function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}
function getUserInitials(email) {
  const name = (email ?? '').split('@')[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/* ── Favorites (localStorage, keyed per user) ────────────────────────────── */
function getFavorites(userId) {
  try { return JSON.parse(localStorage.getItem(`punchlister_fav_${userId}`) ?? '[]'); }
  catch { return []; }
}
function toggleFavInStorage(userId, projectId) {
  const favs = getFavorites(userId);
  const idx  = favs.indexOf(projectId);
  if (idx >= 0) favs.splice(idx, 1); else favs.push(projectId);
  localStorage.setItem(`punchlister_fav_${userId}`, JSON.stringify(favs));
  return [...favs];
}

/* ── Risk card ───────────────────────────────────────────────────────────── */
function RiskCard({ variant, eyebrow, icon: Icon, title, count, suffix, items }) {
  const v = {
    red:     { border: '#b91c1c', color: '#b91c1c', bg: '#fff5f5' },
    orange:  { border: '#c2410c', color: '#c2410c', bg: '#fff7ed' },
    darkred: { border: '#7f1d1d', color: '#7f1d1d', bg: '#fef2f2' },
  }[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-5"
      style={{ borderLeft: `3px solid ${v.border}` }}
      whileHover={{ y: -2, boxShadow: '0 8px 32px rgba(0,0,0,0.10)' }}
      transition={spring}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: v.color }}>{eyebrow}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: v.bg }}>
          <Icon className="w-3.5 h-3.5" style={{ color: v.color }} />
        </div>
      </div>
      <div className="text-[14px] font-semibold text-[var(--text-primary)] mb-3 leading-tight">{title}</div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-[38px] font-bold text-[var(--text-primary)] leading-none tracking-tight tabular-nums">{count}</span>
        <span className="text-[13px] text-[var(--text-secondary)]">{suffix}</span>
      </div>
      {items.length > 0 && (
        <div className="pt-3 border-t border-[var(--border-color)]/60 space-y-1.5">
          {items.slice(0, 3).map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1" style={{ background: v.border }} />
              <span className="leading-snug">{item}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── Overview card (overdue / approaching / todos) ───────────────────────── */
function OverviewCard({ accent, tintBg, eyebrow, title, count, suffix, icon: Icon, items = [], onItemClick, emptyText, split }) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 8px 32px rgba(0,0,0,0.10)' }}
      transition={spring}
      className="glass-card rounded-2xl p-5 flex flex-col"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>{eyebrow}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: tintBg }}>
          <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
        </div>
      </div>

      <div className="text-[14px] font-semibold text-[var(--text-primary)] mb-3 leading-tight">{title}</div>

      {split ? (
        <div className="grid grid-cols-2 gap-3 mb-3">
          {split.map((s, i) => (
            <div key={i} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.025)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <s.Icon className="w-3 h-3" style={{ color: s.color }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</span>
              </div>
              <div className="text-[24px] font-bold text-[var(--text-primary)] leading-none tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-[38px] font-bold text-[var(--text-primary)] leading-none tracking-tight tabular-nums">{count}</span>
          {suffix && <span className="text-[13px] text-[var(--text-secondary)]">{suffix}</span>}
        </div>
      )}

      {items.length > 0 ? (
        <div className="pt-3 mt-auto border-t border-[var(--border-color)]/60 space-y-1.5">
          {items.map((item, i) => {
            const clickable = typeof onItemClick === 'function';
            const Tag = clickable ? 'button' : 'div';
            return (
              <Tag
                key={i}
                onClick={clickable ? () => onItemClick(i) : undefined}
                className={cn(
                  'w-full text-left flex items-start gap-2 text-[12px] text-[var(--text-secondary)]',
                  clickable && 'hover:text-[var(--text-primary)] transition-colors cursor-pointer'
                )}
              >
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1" style={{ background: accent }} />
                <span className="leading-snug">{item}</span>
              </Tag>
            );
          })}
        </div>
      ) : emptyText ? (
        <div className="pt-3 mt-auto border-t border-[var(--border-color)]/60 text-[12px] text-[var(--text-tertiary)] italic">
          {emptyText}
        </div>
      ) : null}
    </motion.div>
  );
}

/* ── Sidebar project item ────────────────────────────────────────────────── */
function SidebarProjectItem({ project, actionCount, isFav, onSelect, onToggleFav }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => onSelect(project)}
        className="w-full text-left px-3 py-2 rounded-xl hover:bg-[var(--surface-1)] transition-colors cursor-pointer pr-8"
      >
        <div className="text-[13px] font-medium text-[var(--text-secondary)] truncate group-hover:text-[var(--text-primary)] transition-colors">
          {project.name}
        </div>
        <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
          {actionCount > 0 ? `${actionCount} actie${actionCount !== 1 ? 's' : ''}` : 'Geen acties'}
        </div>
      </button>
      {/* Star toggle — appears on hover or when already fav */}
      <AnimatePresence>
        {(hovered || isFav) && (
          <motion.button
            key="star"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={e => { e.stopPropagation(); onToggleFav(project.id); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            title={isFav ? 'Verwijder favoriet' : 'Voeg toe als favoriet'}
          >
            <Star
              className="w-3.5 h-3.5 transition-colors"
              fill={isFav ? '#f59e0b' : 'none'}
              stroke={isFav ? '#f59e0b' : 'currentColor'}
              style={{ color: isFav ? '#f59e0b' : 'var(--text-tertiary)' }}
            />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Hero project card (used in the grid on the landing) ────────────────── */
function ProjectCard({ project, todoCount = 0, punchCount = 0, disputeCount = 0, isFav, onSelect, onToggleFav }) {
  const status = STATUS_CONFIG[project.status] || STATUS_CONFIG.active;
  const total = todoCount + punchCount + disputeCount;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="paper-card relative cursor-pointer overflow-hidden"
      onClick={() => onSelect(project)}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
            style={{ background: status.bg, color: status.color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.color }} />
            {status.label}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onToggleFav(project.id); }}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-black/[0.04] cursor-pointer"
            title={isFav ? 'Verwijder favoriet' : 'Voeg toe als favoriet'}
          >
            <Star
              className="w-3.5 h-3.5"
              fill={isFav ? '#f59e0b' : 'none'}
              stroke={isFav ? '#f59e0b' : 'currentColor'}
              style={{ color: isFav ? '#f59e0b' : 'var(--text-tertiary)' }}
            />
          </button>
        </div>
        <h3 className="text-[15px] font-semibold text-[#0c0040] leading-tight mb-1 truncate">
          {project.name}
        </h3>
        <div className="text-[11.5px] text-[var(--text-tertiary)] mb-3 truncate">
          {[project.project_number, project.city].filter(Boolean).join(' · ') || 'Geen locatie'}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-black/5 gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {todoCount > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ background: '#280063', color: '#fff' }}>
                {todoCount} mail{todoCount !== 1 ? 's' : ''}
              </span>
            )}
            {punchCount > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: '#ece9ff', color: '#3a31a8' }}>
                {punchCount} taken
              </span>
            )}
            {disputeCount > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: '#ffe1e1', color: '#9b1d1d' }}>
                {disputeCount} betwist.
              </span>
            )}
            {total === 0 && (
              <span className="text-[11px] text-[var(--text-tertiary)]">Geen openstaande acties</span>
            )}
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[var(--text-tertiary)] flex-shrink-0" />
        </div>
      </div>
    </motion.div>
  );
}

/* ── Agenda modal: chronological view of all pending reminders ───────────── */
function AgendaModal({ open, onClose, reminders, onSelectProject, projects }) {
  if (!open) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const groups = [];
  let curKey = null;
  const sorted = [...reminders].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  for (const r of sorted) {
    if (!r.dueAt) continue;
    const d = new Date(r.dueAt); d.setHours(0, 0, 0, 0);
    const overdue = d < today;
    const k = overdue ? 'overdue' : d.toDateString();
    if (k !== curKey) {
      let label;
      if (k === 'overdue') label = 'Verstreken';
      else if (d.getTime() === today.getTime()) label = 'Vandaag';
      else {
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        if (d.getTime() === tomorrow.getTime()) label = 'Morgen';
        else label = d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
      }
      groups.push({ key: k, label, overdue, items: [] });
      curKey = k;
    }
    groups[groups.length - 1].items.push(r);
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-center justify-center p-6"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ background: 'rgba(40,0,99,0.45)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ y: 20, scale: 0.97, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 12, scale: 0.97, opacity: 0 }}
          transition={spring}
          className="paper-card w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden"
          style={{ background: '#fff' }}
        >
          <header className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#ece9ff] flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-[#3a31a8]" />
              </div>
              <div>
                <span className="eyebrow">Agenda</span>
                <h2 className="title-xl mt-0.5">Reminders</h2>
              </div>
            </div>
            <button onClick={onClose}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/[0.05] cursor-pointer"
                    aria-label="Sluiten">
              <X className="w-4 h-4 text-[#0c0040]" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {groups.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="w-8 h-8 text-[var(--text-tertiary)] mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-[13px] text-[var(--text-secondary)]">Geen openstaande reminders.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {groups.map(g => (
                  <div key={g.key}>
                    <div className={cn(
                      'text-[10px] font-bold uppercase tracking-widest mb-2',
                      g.overdue ? 'text-[#9b1d1d]' : 'text-[var(--text-tertiary)]'
                    )}>
                      {g.label} <span className="opacity-70">· {g.items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {g.items.map(r => {
                        const proj = projects.find(p => p.id === r.projectId);
                        return (
                          <button
                            key={r.id}
                            onClick={() => { if (proj) { onSelectProject(proj); onClose(); } }}
                            className="w-full text-left paper-card-tight px-3.5 py-3 hover:border-brand/40 transition-colors cursor-pointer"
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                                style={{ background: g.overdue ? '#fee2e2' : '#ece9ff', color: g.overdue ? '#9b1d1d' : '#3a31a8' }}
                              >
                                <Bell className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                                    {new Date(r.dueAt).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <span className="text-[11px] text-[var(--text-tertiary)] truncate">· {r.projectName}</span>
                                </div>
                                <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">
                                  {r.subject}
                                </p>
                                {r.recipient && (
                                  <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 truncate">
                                    naar {r.recipient}
                                  </p>
                                )}
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-tertiary)] flex-shrink-0 mt-2.5" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function LandingDashboard({ onSelect, onCreateProject }) {
  const { user, signOut } = useAuth();
  const [projects, setProjects]           = useState([]);
  const [punchCounts, setPunchCounts]     = useState({});
  const [punchItems, setPunchItems]       = useState([]); // full rows for urgency split
  const [disputeCounts, setDisputeCounts] = useState({});
  const [todoCounts, setTodoCounts]       = useState({}); // unsent recommended outputs per project
  const [reminders, setReminders]         = useState([]);  // all pending reminders across projects
  const [agendaOpen, setAgendaOpen]       = useState(false);
  const [loading, setLoading]             = useState(true);
  const [time, setTime]                   = useState(formatTime());
  const [favorites, setFavorites]         = useState(() => getFavorites(user?.id ?? ''));

  const userInitials = getUserInitials(user?.email);
  const fullName     = (user?.user_metadata?.full_name ?? '').trim();
  const userName     = fullName ? fullName.split(/\s+/)[0] : '';

  /* Live clock */
  useEffect(() => {
    const t = setInterval(() => setTime(formatTime()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* Fetch projects + aggregate open counts */
  useEffect(() => {
    if (!user) return;
    supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
      .then(async ({ data: projs }) => {
        if (!projs?.length) { setLoading(false); return; }
        setProjects(projs);
        const ids = projs.map(p => p.id);

        const [punchRes, dispRes, logsRes, remRes] = await Promise.all([
          supabase.from('punch_items').select('project_id, task, priority, due_date').eq('status', 'pending').in('project_id', ids),
          supabase.from('disputes').select('project_id').eq('status', 'open').in('project_id', ids),
          supabase.from('field_logs').select('project_id, recommended_outputs, treated').eq('treated', false).in('project_id', ids),
          supabase.from('reminders').select('id, project_id, subject, body, recipient, recipient_kind, due_at, status').eq('status', 'pending').in('project_id', ids).order('due_at', { ascending: true }),
        ]);

        const pc = {};
        (punchRes.data ?? []).forEach(r => { pc[r.project_id] = (pc[r.project_id] ?? 0) + 1; });
        setPunchCounts(pc);
        setPunchItems(punchRes.data ?? []);

        const dc = {};
        (dispRes.data ?? []).forEach(r => { dc[r.project_id] = (dc[r.project_id] ?? 0) + 1; });
        setDisputeCounts(dc);

        // Count unsent recommended outputs (excluding self_reminders) per project
        const tc = {};
        (logsRes.data ?? []).forEach(r => {
          const outs = Array.isArray(r.recommended_outputs) ? r.recommended_outputs : [];
          const unsent = outs.filter(o => !o.sentAt && o.type !== 'self_reminder').length;
          if (unsent > 0) tc[r.project_id] = (tc[r.project_id] ?? 0) + unsent;
        });
        setTodoCounts(tc);

        const projectName = Object.fromEntries(projs.map(p => [p.id, p.name]));
        setReminders((remRes.data ?? []).map(r => ({
          id:        r.id,
          projectId: r.project_id,
          projectName: projectName[r.project_id] ?? '—',
          subject:   r.subject,
          body:      r.body,
          recipient: r.recipient,
          recipientKind: r.recipient_kind,
          dueAt:     r.due_at,
        })));

        setLoading(false);
      });
  }, [user?.id]);

  /* Favorites toggle */
  const toggleFavorite = (projectId) => {
    if (!user) return;
    setFavorites(toggleFavInStorage(user.id, projectId));
  };

  /* Risk summaries */
  const risks = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in7   = new Date(today); in7.setDate(today.getDate() + 7);
    let totalDisputes = 0;
    const disputeItems = [], approachingItems = [], overdueItems = [];
    const projectName = Object.fromEntries(projects.map(p => [p.id, p.name]));

    projects.forEach(p => {
      const d = disputeCounts[p.id] ?? 0;
      totalDisputes += d;
      if (d > 0) disputeItems.push(`${p.name} — ${d} betwisting${d !== 1 ? 'en' : ''}`);

      if (p.planned_completion && p.status !== 'completed') {
        const due = new Date(p.planned_completion);
        if (due < today)      overdueItems.push({ project: p, label: `${p.name} — termijn verstreken op ${formatShortDate(p.planned_completion)}` });
        else if (due <= in7)  approachingItems.push({ project: p, label: `${p.name} — gepland op ${formatShortDate(p.planned_completion)}` });
      }
    });

    // Reminders: overdue → "Verstreken deadlines" card, near-term → "Naderende deadlines".
    reminders.forEach(r => {
      if (!r.dueAt) return;
      const due = new Date(r.dueAt);
      const project = projects.find(p => p.id === r.projectId);
      if (!project) return;
      if (due < today) {
        overdueItems.push({ project, label: `Reminder: ${r.subject} — ${r.projectName} (verstreken op ${formatShortDate(r.dueAt)})` });
      } else if (due <= in7) {
        approachingItems.push({ project, label: `Reminder: ${r.subject} — ${r.projectName} (${formatShortDate(r.dueAt)})` });
      }
    });

    const urgentTodos = [], nonUrgentTodos = [];
    punchItems.forEach(it => {
      const overdue = it.due_date && new Date(it.due_date) < today;
      const isUrgent = it.priority === 'high' || it.priority === 'urgent' || overdue;
      const entry = { ...it, projectName: projectName[it.project_id] ?? '—', overdue };
      if (isUrgent) urgentTodos.push(entry); else nonUrgentTodos.push(entry);
    });

    return { totalDisputes, disputeItems, approachingItems, overdueItems, urgentTodos, nonUrgentTodos };
  }, [projects, disputeCounts, punchItems, reminders]);

  const activeProjects  = projects.filter(p => p.status !== 'completed');
  const favProjects     = activeProjects.filter(p => favorites.includes(p.id));
  const nonFavProjects  = activeProjects.filter(p => !favorites.includes(p.id));
  const actionCount     = (p) => (punchCounts[p.id] ?? 0) + (disputeCounts[p.id] ?? 0) + (todoCounts[p.id] ?? 0);
  const totalTodos      = Object.values(todoCounts).reduce((s, n) => s + n, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 bg-[#280063]/25 rounded-2xl blur-xl" />
          <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center shadow-brand" style={{ background: '#280063' }}>
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vestigial sidebar removed — App.jsx provides the unified rail */}
      {false && (
      <aside className="w-[220px] hidden md:flex flex-col flex-shrink-0 select-none glass border-r border-[rgba(255,255,255,0.70)] relative z-10">
        <div className="absolute inset-0 bg-noise opacity-30 pointer-events-none" aria-hidden />

        {/* Logo */}
        <div className="relative px-5 py-5 border-b border-[var(--border-color)]/60">
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-[#280063]/25 rounded-[11px] blur-md" />
              <LogoMark size={32} className="relative rounded-[11px] shadow-brand-sm" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-[var(--text-primary)] tracking-tight leading-none">Punchlister</div>
              <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-0.5 tracking-wide">AI · v1.0</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="relative flex-1 p-2.5 overflow-y-auto space-y-0.5">
          <div className="label-caps px-3 pt-3 pb-2.5">Menu</div>

          <div className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl">
            <div className="absolute inset-0 bg-[var(--surface-1)] rounded-xl" />
            <LayoutGrid className="relative w-[15px] h-[15px] flex-shrink-0 text-[var(--text-primary)]" />
            <span className="relative text-[13px] font-semibold text-[var(--text-primary)]">Dashboard</span>
          </div>

          {onCreateProject && (
            <button
              onClick={onCreateProject}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-1)] transition-colors cursor-pointer"
            >
              <FolderOpen className="w-[15px] h-[15px] flex-shrink-0" />
              <span className="text-[13px] font-medium">Projecten</span>
            </button>
          )}

          <div className="h-px bg-[var(--border-color)]/60 mx-2 my-3" />

          {/* Favorites section */}
          {favProjects.length > 0 ? (
            <>
              <div className="label-caps px-3 pb-2 flex items-center gap-1.5">
                <Star className="w-2.5 h-2.5" fill="currentColor" />
                Favorieten
              </div>
              {favProjects.map(p => (
                <SidebarProjectItem
                  key={p.id}
                  project={p}
                  actionCount={actionCount(p)}
                  isFav={true}
                  onSelect={onSelect}
                  onToggleFav={toggleFavorite}
                />
              ))}
              {nonFavProjects.length > 0 && (
                <>
                  <div className="h-px bg-[var(--border-color)]/40 mx-2 my-2" />
                  <div className="label-caps px-3 pb-2">Andere projecten</div>
                  {nonFavProjects.slice(0, 4).map(p => (
                    <SidebarProjectItem
                      key={p.id}
                      project={p}
                      actionCount={actionCount(p)}
                      isFav={false}
                      onSelect={onSelect}
                      onToggleFav={toggleFavorite}
                    />
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <div className="label-caps px-3 pb-2">Actieve projecten</div>
              {activeProjects.slice(0, 6).map(p => (
                <SidebarProjectItem
                  key={p.id}
                  project={p}
                  actionCount={actionCount(p)}
                  isFav={false}
                  onSelect={onSelect}
                  onToggleFav={toggleFavorite}
                />
              ))}
              {activeProjects.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-[var(--text-tertiary)] italic">Geen actieve projecten</div>
              )}
              {activeProjects.length > 0 && (
                <div className="px-3 pt-1">
                  <div className="text-[10px] text-[var(--text-tertiary)] italic">Hover een project om het te bewaren ★</div>
                </div>
              )}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="relative p-3 border-t border-[var(--border-color)]/60">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-1)] transition-colors text-[13px] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{user?.email}</span>
          </button>
        </div>
      </aside>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="relative z-10">
        <div className="p-8 max-w-5xl mx-auto pb-24 md:pb-8">

          {/* Greeting + small new-project link */}
          <motion.div
            className="flex items-end justify-between mb-7 gap-4"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={spring}
          >
            <div>
              <span className="eyebrow">{formatDate()} · {time}</span>
              <h1 className="display-hero mt-2">
                {greetingWord()}{userName ? `, ${userName}` : ''}.
              </h1>
              <p className="tagline tagline-md mt-2">
                {totalTodos > 0
                  ? `${totalTodos} ${totalTodos === 1 ? 'mail' : 'mails'} klaar om te versturen — verspreid over je projecten.`
                  : 'Kies een project om verder te werken.'}
              </p>
            </div>
            <button
              onClick={() => setAgendaOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-medium border border-[var(--border-color)] bg-white/70 hover:bg-white text-[var(--text-secondary)] hover:text-[#0c0040] cursor-pointer transition-colors flex-shrink-0"
              title="Agenda: alle reminders chronologisch"
            >
              <CalendarDays className="w-4 h-4" />
              Agenda
              {reminders.length > 0 && (
                <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-[#ece9ff] text-[#3a31a8]">{reminders.length}</span>
              )}
            </button>
          </motion.div>

          {/* Overview cards — overdue / approaching / todos */}
          <motion.div
            className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={spring}
          >
            <OverviewCard
              accent="#c0392b"
              tintBg="#fdecea"
              eyebrow="Verstreken deadlines"
              title="Termijn verstreken"
              count={risks.overdueItems.length}
              suffix="vereist actie"
              icon={CalendarX2}
              items={risks.overdueItems.slice(0, 3).map(o => o.label)}
              onItemClick={(i) => onSelect(risks.overdueItems[i].project)}
              emptyText="Alles binnen termijn"
            />
            <OverviewCard
              accent="#b8821c"
              tintBg="#fff4d6"
              eyebrow="Naderende deadlines"
              title="Binnen 7 dagen"
              count={risks.approachingItems.length}
              suffix={risks.approachingItems.length === 1 ? 'project' : 'projecten'}
              icon={Clock}
              items={risks.approachingItems.slice(0, 3).map(o => o.label)}
              onItemClick={(i) => onSelect(risks.approachingItems[i].project)}
              emptyText="Geen deadlines deze week"
            />
            <OverviewCard
              accent="#3a31a8"
              tintBg="#ece9ff"
              eyebrow="Openstaande taken"
              title="Te doen"
              icon={CheckSquare}
              split={[
                { label: 'Urgent',     value: risks.urgentTodos.length,    color: '#c0392b', Icon: Flame },
                { label: 'Niet urgent', value: risks.nonUrgentTodos.length, color: '#3a31a8', Icon: CheckSquare },
              ]}
              items={risks.urgentTodos.slice(0, 3).map(t => `${t.projectName} — ${t.task}${t.overdue ? ' (over termijn)' : ''}`)}
              emptyText="Geen openstaande taken"
            />
          </motion.div>

          {/* Project grid — the hero of this page */}
          <section className="mb-12">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <span className="eyebrow">Projecten</span>
                <h2 className="title-xl mt-1">
                  {activeProjects.length} {activeProjects.length === 1 ? 'actief project' : 'actieve projecten'}
                </h2>
              </div>
              {onCreateProject && (
                <button
                  onClick={onCreateProject}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-[var(--text-secondary)] hover:text-[#0c0040] hover:bg-black/[0.04] cursor-pointer"
                  title="Nieuw project"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nieuw
                </button>
              )}
            </div>

            {activeProjects.length === 0 ? (
              <div className="paper-card-tight px-5 py-8 text-center">
                <p className="text-[13px] text-[var(--text-secondary)] mb-3">
                  {onCreateProject
                    ? 'Nog geen projecten. Maak er een aan om te starten.'
                    : 'Nog geen projecten toegewezen. Vraag een beheerder om je aan een project te koppelen.'}
                </p>
                {onCreateProject && (
                  <button onClick={onCreateProject}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer"
                          style={{ background: '#280063', color: '#fff' }}>
                    <Plus className="w-4 h-4" /> Nieuw project
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...favProjects, ...nonFavProjects].map(p => (
                  <ProjectCard
                    key={p.id} project={p}
                    todoCount={todoCounts[p.id] ?? 0}
                    punchCount={punchCounts[p.id] ?? 0}
                    disputeCount={disputeCounts[p.id] ?? 0}
                    isFav={favorites.includes(p.id)}
                    onSelect={onSelect}
                    onToggleFav={toggleFavorite}
                  />
                ))}
              </div>
            )}
          </section>

        </div>
      </main>

      {/* Floating chat bubble */}
      <FloatingChat
        projects={projects}
        userInitials={userInitials}
        onSelectProject={onSelect}
      />

      {/* Agenda (reminders) modal */}
      <AgendaModal
        open={agendaOpen}
        onClose={() => setAgendaOpen(false)}
        reminders={reminders}
        projects={projects}
        onSelectProject={onSelect}
      />
    </div>
  );
}
