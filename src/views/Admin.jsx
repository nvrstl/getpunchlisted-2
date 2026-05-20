import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, Zap, Activity, Users, Building2,
  ShieldCheck, TrendingUp, Cpu, RefreshCw, Loader2,
  ChevronDown, ChevronUp, Plus, Trash2, ChevronRight,
  UserPlus, FolderOpen, MapPin, Hash, Crown,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

const apiFetch = async (url, opts = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  const r = await fetch(url, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return r.json();
};

const MODEL_LABELS = {
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'claude-opus-4-6':           'Claude Opus 4.6',
};
const ENDPOINT_LABELS = {
  'process-log':          'Werfnotitie verwerken',
  'extract-action-items': 'Acties extraheren',
  'draft-rfi':            'Meerwerk opstellen',
  'generate-report':      'Dagrapport',
  'process-document':     'Document verwerken',
  'analyse-context':      'Context analyseren',
};
const STATUS_COLORS = {
  pre_construction: 'bg-indigo-100 text-indigo-700',
  active:           'bg-[#d4f7ec] text-[#075e48]',
  punch_phase:      'bg-amber-100 text-amber-700',
  completed:        'bg-gray-100 text-gray-600',
};
const STATUS_LABELS = {
  pre_construction: 'Voorbereiding',
  active:           'Actief',
  punch_phase:      'Oplevering',
  completed:        'Voltooid',
};
const RANGE_OPTIONS = [
  { label: '7 days',   value: '7d'  },
  { label: '30 days',  value: '30d' },
  { label: '90 days',  value: '90d' },
  { label: 'All time', value: 'all' },
];

const fmt = {
  usd:  (n) => `$${(n || 0).toFixed(4)}`,
  usd2: (n) => `$${(n || 0).toFixed(2)}`,
  num:  (n) => (n || 0).toLocaleString(),
  date: (s) => s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
  rel:  (s) => {
    if (!s) return '—';
    const diff = Date.now() - new Date(s).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  },
};

const spring = { type: 'spring', stiffness: 320, damping: 28 };

function StatCard({ icon: Icon, iconColor, label, value, sub }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', iconColor || 'bg-[var(--surface-2)]')}>
          <Icon className="w-4 h-4" strokeWidth={2} />
        </div>
      </div>
      <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1">{label}</p>
      <p className="text-[22px] font-bold text-[var(--text-primary)] leading-none">{value}</p>
      {sub && <p className="text-[11px] text-[var(--text-tertiary)] mt-1">{sub}</p>}
    </motion.div>
  );
}

function BreakdownTable({ title, rows, keyLabel, keyFn, maxCost }) {
  return (
    <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border-color)]/60">
        <p className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">{title}</p>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-6 text-center text-[12px] text-[var(--text-tertiary)]">Nog geen data</div>
      ) : (
        <div className="divide-y divide-[var(--border-color)]/40">
          {rows.map((row, i) => {
            const pct = maxCost > 0 ? (row.cost / maxCost) * 100 : 0;
            return (
              <div key={i} className="px-5 py-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-semibold text-[var(--text-primary)] truncate max-w-[60%]">
                    {keyFn ? keyFn(row[keyLabel]) : row[keyLabel]}
                  </span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[11px] text-[var(--text-tertiary)]">{fmt.num(row.calls)} calls</span>
                    <span className="text-[12px] font-bold text-[var(--text-primary)]">{fmt.usd(row.cost)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-brand rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DailyChart({ daily }) {
  if (!daily || daily.length === 0) return null;
  const maxCost = Math.max(...daily.map(d => d.cost), 0.000001);
  const hasData = daily.some(d => d.cost > 0);

  return (
    <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border-color)]/60 flex items-center justify-between">
        <p className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">Daily Spend</p>
        {hasData && (
          <p className="text-[11px] text-[var(--text-tertiary)]">
            Peak: {fmt.usd(maxCost)} / day
          </p>
        )}
      </div>
      <div className="px-5 py-4">
        {!hasData ? (
          <div className="text-center py-4 text-[12px] text-[var(--text-tertiary)]">Nog geen kosten geregistreerd</div>
        ) : (
          <div className="flex items-end gap-[3px] h-20">
            {daily.map((d, i) => {
              const pct = (d.cost / maxCost) * 100;
              const isToday = d.date === new Date().toISOString().slice(0, 10);
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div
                    className={cn(
                      'w-full rounded-t-sm transition-colors',
                      d.cost > 0
                        ? isToday ? 'bg-brand' : 'bg-brand/40 group-hover:bg-brand/70'
                        : 'bg-[var(--surface-2)]'
                    )}
                    style={{ height: `${Math.max(pct, d.cost > 0 ? 4 : 2)}%` }}
                  />
                  {/* Tooltip */}
                  {d.cost > 0 && (
                    <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[9px] font-mono px-1.5 py-0.5 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {d.date.slice(5)} · {fmt.usd(d.cost)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* X-axis labels: first, mid, last */}
        {daily.length > 0 && (
          <div className="flex justify-between mt-2">
            <span className="text-[9px] text-[var(--text-tertiary)] font-mono">{daily[0]?.date.slice(5)}</span>
            <span className="text-[9px] text-[var(--text-tertiary)] font-mono">{daily[Math.floor(daily.length / 2)]?.date.slice(5)}</span>
            <span className="text-[9px] text-[var(--text-tertiary)] font-mono">{daily[daily.length - 1]?.date.slice(5)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function UsersTable({ users }) {
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

  const toggle = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  const SortIcon = ({ k }) => sortKey === k
    ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
    : null;

  const sorted = [...users].sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va;
    return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });

  return (
    <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border-color)]/60 flex items-center justify-between">
        <p className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">Users</p>
        <span className="text-[11px] font-semibold text-[var(--text-tertiary)] bg-[var(--surface-2)] px-2 py-0.5 rounded-full">
          {users.length} total
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border-color)]/40">
              {[
                { k: 'email', label: 'Email' },
                { k: 'createdAt', label: 'Joined' },
                { k: 'lastSignIn', label: 'Last seen' },
                { k: 'projectCount', label: 'Projects' },
              ].map(({ k, label }) => (
                <th
                  key={k}
                  onClick={() => toggle(k)}
                  className="px-5 py-2.5 text-left text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest cursor-pointer hover:text-[var(--text-secondary)] select-none"
                >
                  <span className="flex items-center gap-1">{label} <SortIcon k={k} /></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]/30">
            {sorted.map(u => (
              <tr key={u.id} className="hover:bg-white/50 transition-colors">
                <td className="px-5 py-3 text-[12px] font-medium text-[var(--text-primary)]">{u.email}</td>
                <td className="px-5 py-3 text-[12px] text-[var(--text-secondary)]">{fmt.date(u.createdAt)}</td>
                <td className="px-5 py-3 text-[12px] text-[var(--text-secondary)]">{fmt.rel(u.lastSignIn)}</td>
                <td className="px-5 py-3">
                  <span className="text-[12px] font-semibold text-[var(--text-primary)]">{u.projectCount}</span>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-6 text-center text-[12px] text-[var(--text-tertiary)]">Geen gebruikers</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectsTable({ projects }) {
  return (
    <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border-color)]/60 flex items-center justify-between">
        <p className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">Projects</p>
        <span className="text-[11px] font-semibold text-[var(--text-tertiary)] bg-[var(--surface-2)] px-2 py-0.5 rounded-full">
          {projects.length} total
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border-color)]/40">
              {['Project', 'Status', 'Owner', 'Field Logs', 'Created'].map(label => (
                <th key={label} className="px-5 py-2.5 text-left text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]/30">
            {projects.map(p => (
              <tr key={p.id} className="hover:bg-white/50 transition-colors">
                <td className="px-5 py-3 text-[12px] font-semibold text-[var(--text-primary)]">{p.name}</td>
                <td className="px-5 py-3">
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600')}>
                    {STATUS_LABELS[p.status] || p.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-[12px] text-[var(--text-secondary)] max-w-[160px] truncate">{p.ownerEmail}</td>
                <td className="px-5 py-3 text-[12px] font-semibold text-[var(--text-primary)]">{p.logCount}</td>
                <td className="px-5 py-3 text-[12px] text-[var(--text-secondary)]">{fmt.date(p.createdAt)}</td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-[12px] text-[var(--text-tertiary)]">Geen projecten</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ROLES = [
  { value: 'owner',  label: 'Owner',  color: 'text-violet-700 bg-violet-50' },
  { value: 'lead',   label: 'Lead',   color: 'text-blue-700 bg-blue-50' },
  { value: 'member', label: 'Member', color: 'text-[#075e48] bg-[#e8fbf5]' },
  { value: 'viewer', label: 'Viewer', color: 'text-gray-600 bg-gray-100' },
];

function RoleBadge({ role }) {
  const r = ROLES.find(x => x.value === role) || ROLES[2];
  return (
    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', r.color)}>{r.label}</span>
  );
}

function ProjectCard({ project }) {
  const [expanded, setExpanded]   = useState(false);
  const [members, setMembers]     = useState(project.members || []);
  const [addEmail, setAddEmail]   = useState('');
  const [addRole, setAddRole]     = useState('member');
  const [adding, setAdding]       = useState(false);
  const [addError, setAddError]   = useState('');

  const handleAddMember = async () => {
    const email = addEmail.trim();
    if (!email) return;
    setAdding(true); setAddError('');
    try {
      const json = await apiFetch(`/api/admin-project-members?projectId=${project.id}`, {
        method: 'POST', body: { email, role: addRole },
      });
      if (!json.success) throw new Error(json.error);
      setMembers(prev => [...prev, json.data]);
      setAddEmail('');
    } catch (err) { setAddError(err.message); }
    setAdding(false);
  };

  const handleRoleChange = async (memberId, newRole) => {
    const json = await apiFetch(`/api/admin-project-members?projectId=${project.id}&memberId=${memberId}`, {
      method: 'PATCH', body: { role: newRole },
    });
    if (json.success) setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
  };

  const handleRemoveMember = async (memberId) => {
    const json = await apiFetch(`/api/admin-project-members?projectId=${project.id}&memberId=${memberId}`, {
      method: 'DELETE',
    });
    if (json.success) setMembers(prev => prev.filter(m => m.id !== memberId));
  };

  return (
    <motion.div
      layout
      className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      {/* Project header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/50 transition-colors cursor-pointer"
      >
        <div className="w-8 h-8 rounded-xl bg-[var(--surface-2)] flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-[var(--text-tertiary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{project.name}</span>
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-600')}>
              {STATUS_LABELS[project.status] || project.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {project.projectNumber && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] font-mono">
                <Hash className="w-3 h-3" />{project.projectNumber}
              </span>
            )}
            {project.city && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                <MapPin className="w-3 h-3" />{project.city}
              </span>
            )}
            {project.ownerEmail && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                <Crown className="w-3 h-3" />{project.ownerEmail}
              </span>
            )}
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <ChevronRight
          className={cn('w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0 transition-transform duration-200', expanded && 'rotate-90')}
        />
      </button>

      {/* Expanded members section */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border-color)]/50 px-5 py-4 space-y-3">
              <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">Team Members</p>

              {/* Member rows */}
              {members.length === 0 ? (
                <p className="text-[12px] text-[var(--text-tertiary)] py-2">Nog geen leden.</p>
              ) : (
                <div className="space-y-2">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-3 bg-[var(--surface-2)] rounded-xl px-3 py-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white border border-[var(--border-color)] flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-[var(--text-secondary)]">
                        {m.email[0].toUpperCase()}
                      </div>
                      <span className="flex-1 text-[12px] font-medium text-[var(--text-primary)] truncate">{m.email}</span>
                      {/* Role selector */}
                      <select
                        value={m.role}
                        onChange={e => handleRoleChange(m.id, e.target.value)}
                        className="text-[11px] font-semibold rounded-lg border border-[var(--border-color)] bg-white px-2 py-1 cursor-pointer text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-brand"
                      >
                        {ROLES.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 hover:text-red-500 text-[var(--text-tertiary)] transition-colors cursor-pointer"
                        title="Lid verwijderen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add member row */}
              <div className="pt-1 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="E-mailadres"
                    value={addEmail}
                    onChange={e => setAddEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddMember()}
                    className="flex-1 text-[12px] px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-2)] focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-[var(--text-tertiary)]"
                  />
                  <select
                    value={addRole}
                    onChange={e => setAddRole(e.target.value)}
                    className="text-[11px] font-semibold rounded-xl border border-[var(--border-color)] bg-[var(--surface-2)] px-2.5 py-2 cursor-pointer text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <motion.button
                    onClick={handleAddMember}
                    disabled={adding || !addEmail.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 bg-brand text-white text-[12px] font-semibold rounded-xl disabled:opacity-50 cursor-pointer"
                    whileTap={{ scale: 0.96 }}
                    transition={spring}
                  >
                    {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                    Add
                  </motion.button>
                </div>
                {addError && (
                  <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">{addError}</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const STATUSES_LIST = [
  { value: 'pre_construction', label: 'Pre-construction' },
  { value: 'active',           label: 'Active' },
  { value: 'punch_phase',      label: 'Punch Phase' },
  { value: 'completed',        label: 'Completed' },
];

function ProjectsTab() {
  const [projects, setProjects]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [creating, setCreating]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [createError, setCreateError] = useState('');

  const blank = { name: '', ownerEmail: '', status: 'active', projectNumber: '', city: '', clientName: '', projectManager: '' };
  const [form, setForm] = useState(blank);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const json = await apiFetch('/api/admin-projects');
      if (!json.success) throw new Error(json.error);
      setProjects(json.data);
    } catch (err) { setError(err.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.ownerEmail.trim()) return;
    setSaving(true); setCreateError('');
    try {
      const json = await apiFetch('/api/admin-projects', {
        method: 'POST',
        body: {
          name: form.name, ownerEmail: form.ownerEmail, status: form.status,
          projectNumber: form.projectNumber, city: form.city,
          clientName: form.clientName, projectManager: form.projectManager,
        },
      });
      if (!json.success) throw new Error(json.error);
      setProjects(prev => [json.data, ...(prev || [])]);
      setForm(blank);
      setCreating(false);
    } catch (err) { setCreateError(err.message); }
    setSaving(false);
  };

  const inputCls = 'text-[12px] px-3 py-2 rounded-xl border border-[var(--border-color)] bg-white focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-[var(--text-tertiary)] w-full';

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {projects !== null && (
            <span className="text-[11px] font-semibold text-[var(--text-tertiary)] bg-[var(--surface-2)] border border-[var(--border-color)] px-2 py-0.5 rounded-full">
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
            whileTap={{ scale: 0.92 }}
            transition={spring}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </motion.button>
          <motion.button
            onClick={() => { setCreating(c => !c); setCreateError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white text-[12px] font-semibold rounded-xl cursor-pointer"
            whileTap={{ scale: 0.96 }}
            transition={spring}
          >
            <Plus className="w-3.5 h-3.5" />
            New Project
          </motion.button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[12px] text-red-700">{error}</div>
      )}

      {/* Create form */}
      <AnimatePresence>
        {creating && (
          <motion.form
            onSubmit={handleCreate}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring}
            className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm p-5 space-y-3"
          >
            <p className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1">Nieuw project</p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Projectnaam *</p>
                <input className={inputCls} placeholder="Nieuwbouw kantoor" value={form.name} onChange={set('name')} required autoFocus />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Projectnummer</p>
                <input className={inputCls} placeholder="PRJ-2024-001" value={form.projectNumber} onChange={set('projectNumber')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">E-mail eigenaar *</p>
                <input className={inputCls} type="email" placeholder="eigenaar@bedrijf.be" value={form.ownerEmail} onChange={set('ownerEmail')} required />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Status</p>
                <select value={form.status} onChange={set('status')} className={inputCls + ' cursor-pointer'}>
                  {STATUSES_LIST.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Klantnaam</p>
                <input className={inputCls} placeholder="Bedrijf NV" value={form.clientName} onChange={set('clientName')} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Projectleider</p>
                <input className={inputCls} placeholder="Jan Janssen" value={form.projectManager} onChange={set('projectManager')} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Stad / werf</p>
              <input className={inputCls} placeholder="Brussel" value={form.city} onChange={set('city')} />
            </div>
            {createError && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{createError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setCreating(false); setForm(blank); setCreateError(''); }}
                className="flex-1 px-4 py-2 text-[12px] font-semibold rounded-xl border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <motion.button
                type="submit"
                disabled={saving || !form.name.trim() || !form.ownerEmail.trim()}
                className="flex-1 px-4 py-2 bg-brand text-white text-[12px] font-semibold rounded-xl disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                whileTap={{ scale: 0.97 }}
                transition={spring}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Project'}
              </motion.button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Projects list */}
      {loading && projects === null ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
        </div>
      ) : projects?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center mb-3">
            <FolderOpen className="w-5 h-5 text-[var(--text-tertiary)]" />
          </div>
          <p className="text-[13px] font-medium text-[var(--text-secondary)]">Nog geen projecten.</p>
          <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">Maak het eerste hierboven aan.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(projects || []).map(p => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab]           = useState('spend');
  const [range, setRange]       = useState('30d');
  const [usageData, setUsageData]   = useState(null);
  const [accountData, setAccountData] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const fetchUsage = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const json = await apiFetch(`/api/admin-usage?range=${range}`);
      if (!json.success) throw new Error(json.error);
      setUsageData(json.data);
    } catch (err) { setError(err.message); }
    setLoading(false);
  }, [range]);

  const fetchAccounts = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const json = await apiFetch('/api/admin-accounts');
      if (!json.success) throw new Error(json.error);
      setAccountData(json.data);
    } catch (err) { setError(err.message); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'spend') fetchUsage();
    else if (tab === 'accounts') fetchAccounts();
  }, [tab, fetchUsage, fetchAccounts]);

  const maxModelCost = usageData?.byModel?.[0]?.cost || 1;
  const maxEndpointCost = usageData?.byEndpoint?.[0]?.cost || 1;

  return (
    <div className="p-6 md:p-8 pb-28 md:pb-10 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        className="mb-7"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-[var(--text-secondary)]" />
          </div>
          <h1 className="title-xl">Admin Dashboard</h1>
          <span className="text-[10px] font-bold text-[var(--text-tertiary)] bg-[var(--surface-2)] border border-[var(--border-color)] px-2 py-0.5 rounded-full uppercase tracking-widest">
            Internal
          </span>
        </div>
        <p className="text-[13px] text-[var(--text-secondary)] ml-12">AI spend tracking and account management.</p>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[var(--surface-2)] border border-[var(--border-color)] p-1 rounded-xl w-fit">
        {[
          { id: 'spend',    label: 'AI Spend',  icon: DollarSign },
          { id: 'accounts', label: 'Accounts',  icon: Users },
          { id: 'projects', label: 'Projects',  icon: Building2 },
        ].map(({ id, label, icon: Icon }) => (
          <motion.button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer',
              tab === id ? 'bg-white shadow-sm text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            )}
            whileTap={{ scale: 0.97 }}
            transition={spring}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </motion.button>
        ))}
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[12px] text-red-700"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── AI Spend tab ────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {tab === 'spend' && (
          <motion.div
            key="spend"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={spring}
            className="space-y-5"
          >
            {/* Range selector + refresh */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1 bg-[var(--surface-2)] border border-[var(--border-color)] p-1 rounded-xl">
                {RANGE_OPTIONS.map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => setRange(value)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer',
                      range === value ? 'bg-white shadow-sm text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <motion.button
                onClick={fetchUsage}
                disabled={loading}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                whileTap={{ scale: 0.92 }}
                transition={spring}
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </motion.button>
            </div>

            {loading && !usageData ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
              </div>
            ) : (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard
                    icon={DollarSign}
                    iconColor="bg-[#e8fbf5]"
                    label="Totale kosten"
                    value={fmt.usd2(usageData?.totalCost)}
                    sub={`${RANGE_OPTIONS.find(r => r.value === range)?.label || ''}`}
                  />
                  <StatCard
                    icon={Zap}
                    iconColor="bg-blue-50"
                    label="AI-oproepen"
                    value={fmt.num(usageData?.totalCalls)}
                    sub="totaal verzoeken"
                  />
                  <StatCard
                    icon={Activity}
                    iconColor="bg-violet-50"
                    label="Gem. kosten / oproep"
                    value={usageData?.totalCalls ? fmt.usd(usageData.totalCost / usageData.totalCalls) : '$0'}
                    sub="per verzoek"
                  />
                  <StatCard
                    icon={Cpu}
                    iconColor="bg-amber-50"
                    label="Totaal tokens"
                    value={fmt.num((usageData?.totalInputTokens || 0) + (usageData?.totalOutputTokens || 0))}
                    sub={`↑${fmt.num(usageData?.totalInputTokens)} ↓${fmt.num(usageData?.totalOutputTokens)}`}
                  />
                </div>

                {/* Breakdown tables */}
                <div className="grid md:grid-cols-2 gap-4">
                  <BreakdownTable
                    title="Kosten per model"
                    rows={usageData?.byModel || []}
                    keyLabel="model"
                    keyFn={(m) => MODEL_LABELS[m] || m}
                    maxCost={maxModelCost}
                  />
                  <BreakdownTable
                    title="Kosten per functie"
                    rows={usageData?.byEndpoint || []}
                    keyLabel="endpoint"
                    keyFn={(e) => ENDPOINT_LABELS[e] || e}
                    maxCost={maxEndpointCost}
                  />
                </div>

                {/* Daily chart */}
                <DailyChart daily={usageData?.daily} />

                {/* Pricing footnote */}
                <p className="text-[10px] text-[var(--text-tertiary)] text-center">
                  Pricing: Haiku 4.5 — $0.80/M input · $4.00/M output &nbsp;|&nbsp; Opus 4.6 — $15.00/M input · $75.00/M output
                </p>
              </>
            )}
          </motion.div>
        )}

        {/* ── Accounts tab ──────────────────────────────────────────────────── */}
        {tab === 'accounts' && (
          <motion.div
            key="accounts"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={spring}
            className="space-y-5"
          >
            <div className="flex justify-end">
              <motion.button
                onClick={fetchAccounts}
                disabled={loading}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                whileTap={{ scale: 0.92 }}
                transition={spring}
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </motion.button>
            </div>

            {loading && !accountData ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <StatCard
                    icon={Users}
                    iconColor="bg-blue-50"
                    label="Totaal gebruikers"
                    value={accountData?.users?.length || 0}
                    sub="geregistreerde accounts"
                  />
                  <StatCard
                    icon={Building2}
                    iconColor="bg-[#e8fbf5]"
                    label="Totaal projecten"
                    value={accountData?.projects?.length || 0}
                    sub="over alle gebruikers"
                  />
                  <StatCard
                    icon={TrendingUp}
                    iconColor="bg-violet-50"
                    label="Gem. projecten / gebruiker"
                    value={accountData?.users?.length
                      ? (accountData.projects.length / accountData.users.length).toFixed(1)
                      : '0'}
                    sub="per account"
                  />
                </div>

                <UsersTable users={accountData?.users || []} />
                <ProjectsTable projects={accountData?.projects || []} />
              </>
            )}
          </motion.div>
        )}

        {/* ── Projects tab ──────────────────────────────────────────────────── */}
        {tab === 'projects' && (
          <motion.div
            key="projects"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={spring}
          >
            <ProjectsTab />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
