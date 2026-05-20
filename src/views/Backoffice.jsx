import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, FolderOpen, Users, Zap,
  Search, Plus, ChevronLeft, ChevronRight,
  ExternalLink, Loader2, X, AlertCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

const spring = { type: 'spring', stiffness: 320, damping: 28 };

const apiFetch = async (url, opts = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  const r = await fetch(url, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`HTTP ${r.status} – ${text.slice(0, 200)}`); }
};

const VAT_RE = /^BE0\d{3}\.\d{3}\.\d{3}$/;

function StatCard({ icon: Icon, iconBg, label, value, loading }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', iconBg)}>
          <Icon className="w-4 h-4" strokeWidth={2} />
        </div>
      </div>
      <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1">{label}</p>
      {loading ? (
        <div className="h-7 w-16 bg-[var(--surface-2)] rounded-lg animate-pulse" />
      ) : (
        <p className="text-[22px] font-bold text-[var(--text-primary)] leading-none">{value ?? '—'}</p>
      )}
    </motion.div>
  );
}

function CreateModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    name: '', vat_number: '', email: '', phone: '',
    address_street: '', address_zip: '', address_city: '', notes: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validate = () => {
    if (!form.name.trim()) return 'Bedrijfsnaam is verplicht.';
    if (!form.email.trim()) return 'E-mailadres is verplicht.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Ongeldig e-mailadres.';
    if (form.vat_number.trim() && !VAT_RE.test(form.vat_number.trim()))
      return 'BTW-nummer moet het formaat BE0xxx.xxx.xxx hebben.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/backoffice/companies', { method: 'POST', body: form });
      if (!res.success) throw new Error(res.error);
      onCreate(res.data);
      onClose();
    } catch (ex) {
      setError(ex.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
        initial={{ scale: 0.95, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 12 }}
        transition={spring}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)]/60">
          <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Nieuw bedrijf aanmaken</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-[13px]">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">Bedrijfsnaam *</label>
              <input
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                placeholder="Bouwbedrijf De Backer NV"
                value={form.name}
                onChange={e => set('name', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">BTW-nummer</label>
              <input
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                placeholder="BE0123.456.789"
                value={form.vat_number}
                onChange={e => set('vat_number', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">Telefoon</label>
              <input
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                placeholder="+32 ..."
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">E-mail *</label>
              <input
                type="email"
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                placeholder="info@bedrijf.be"
                value={form.email}
                onChange={e => set('email', e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">Straat</label>
              <input
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                placeholder="Kerkstraat 12"
                value={form.address_street}
                onChange={e => set('address_street', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">Postcode</label>
              <input
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                placeholder="2000"
                value={form.address_zip}
                onChange={e => set('address_zip', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">Stad</label>
              <input
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                placeholder="Antwerpen"
                value={form.address_city}
                onChange={e => set('address_city', e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">Notities</label>
              <textarea
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition resize-none"
                placeholder="Interne opmerkingen..."
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[var(--border-color)]/60 bg-[var(--surface-2)]/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          >
            Annuleren
          </button>
          <motion.button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-brand text-white shadow-sm hover:brightness-105 disabled:opacity-60 transition cursor-pointer"
            whileTap={{ scale: 0.97 }}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Aanmaken
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const STATUS_BADGE = {
  active:   'bg-[#d4f7ec] text-[#075e48]',
  inactive: 'bg-gray-100 text-gray-500',
};

export default function Backoffice({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [statsError, setStatsError] = useState('');
  const [fetchError, setFetchError] = useState('');

  const LIMIT = 10;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError('');
    try {
      const res = await apiFetch('/api/backoffice/stats');
      if (res.success) setStats(res.data);
      else setStatsError(res.error || 'Kon statistieken niet laden');
    } catch (ex) {
      setStatsError(ex.message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const params = new URLSearchParams({ search, status: statusFilter, page, limit: LIMIT });
      const res = await apiFetch(`/api/backoffice/companies?${params}`);
      if (res.success) { setCompanies(res.data); setTotal(res.total); }
      else setFetchError(res.error || 'Kon bedrijven niet laden');
    } catch (ex) {
      setFetchError(ex.message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const handleCreate = (newCompany) => {
    setCompanies(prev => [{ ...newCompany, userCount: 0, activeProjects: 0 }, ...prev]);
    setTotal(t => t + 1);
    fetchStats();
  };

  return (
    <div className="p-6 space-y-6 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text-primary)] tracking-tight">Backoffice</h1>
          <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">Platform overzicht en bedrijfsbeheer</p>
        </div>
      </div>

      {/* Stats error */}
      {statsError && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-[13px]">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{statsError}</span>
          <button onClick={() => setStatsError('')} className="cursor-pointer flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2} iconBg="bg-indigo-100 text-indigo-600" label="Actieve bedrijven" value={stats?.activeCompanies} loading={statsLoading} />
        <StatCard icon={FolderOpen} iconBg="bg-[#d4f7ec] text-[#0c7a5e]" label="Totaal projecten" value={stats?.runningProjects} loading={statsLoading} />
        <StatCard icon={Users} iconBg="bg-amber-100 text-amber-600" label="Totaal gebruikers" value={stats?.totalUsers} loading={statsLoading} />
        <StatCard icon={Zap} iconBg="bg-purple-100 text-purple-600" label="AI requests (maand)" value={stats?.aiRequestsThisMonth} loading={statsLoading} />
      </div>

      {/* Companies panel */}
      <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border-color)]/60 flex-wrap gap-y-2">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]" />
            <input
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
              placeholder="Zoek op naam, BTW of e-mail…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-white px-1.5 py-1.5">
            {['all', 'active', 'inactive'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'px-3 py-1 rounded-lg text-[12px] font-medium transition-colors cursor-pointer',
                  statusFilter === s ? 'bg-brand text-white shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                )}
              >
                {s === 'all' ? 'Alle' : s === 'active' ? 'Actief' : 'Inactief'}
              </button>
            ))}
          </div>
          <motion.button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-[13px] font-semibold shadow-sm hover:brightness-105 transition cursor-pointer"
            whileTap={{ scale: 0.97 }}
          >
            <Plus className="w-3.5 h-3.5" />
            Nieuw bedrijf
          </motion.button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-[13px] text-[var(--text-tertiary)] text-center max-w-xs">{fetchError}</p>
            <button onClick={fetchCompanies} className="text-[13px] text-brand underline cursor-pointer">Opnieuw proberen</button>
          </div>
        ) : companies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)]">
            <Building2 className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-[13px]">Geen bedrijven gevonden</p>
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-4 px-5 py-2.5 border-b border-[var(--border-color)]/40">
              {['Bedrijf', 'Contactpersoon', 'Projecten', 'Gebruikers', ''].map((h, i) => (
                <div key={i} className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">{h}</div>
              ))}
            </div>

            <div className="divide-y divide-[var(--border-color)]/40">
              {companies.map(c => (
                <motion.div
                  key={c.id}
                  className={cn(
                    'grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-4 px-5 py-3.5 items-center hover:bg-[var(--surface-2)]/50 transition-colors',
                    c.status === 'inactive' && 'opacity-50'
                  )}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: c.status === 'inactive' ? 0.5 : 1 }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{c.name}</span>
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0', STATUS_BADGE[c.status] || STATUS_BADGE.active)}>
                        {c.status === 'active' ? 'Actief' : 'Inactief'}
                      </span>
                    </div>
                    {c.vat_number && <div className="text-[11px] text-[var(--text-tertiary)] font-mono mt-0.5">{c.vat_number}</div>}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] text-[var(--text-secondary)] truncate">{c.email}</div>
                    {c.phone && <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{c.phone}</div>}
                  </div>
                  <div>
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold',
                      c.activeProjects > 0 ? 'bg-[#d4f7ec] text-[#075e48]' : 'bg-gray-100 text-gray-500'
                    )}>
                      <FolderOpen className="w-3 h-3" />
                      {c.activeProjects}
                    </span>
                  </div>
                  <div className="text-[12px] text-[var(--text-secondary)]">{c.userCount}</div>
                  <motion.button
                    onClick={() => onNavigate('backofficeCompany', { companyId: c.id })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-white text-[12px] font-medium text-[var(--text-secondary)] border border-[var(--border-color)] transition-colors cursor-pointer whitespace-nowrap"
                    whileTap={{ scale: 0.97 }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Bekijk
                  </motion.button>
                </motion.div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border-color)]/40">
            <span className="text-[12px] text-[var(--text-tertiary)]">
              {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} van {total} bedrijven
            </span>
            <div className="flex items-center gap-1.5">
              <motion.button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 rounded-xl flex items-center justify-center border border-[var(--border-color)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-white disabled:opacity-40 transition-colors cursor-pointer"
                whileTap={{ scale: 0.9 }}
              >
                <ChevronLeft className="w-4 h-4" />
              </motion.button>
              <span className="text-[12px] font-medium text-[var(--text-secondary)] px-2">
                {page} / {totalPages}
              </span>
              <motion.button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-8 h-8 rounded-xl flex items-center justify-center border border-[var(--border-color)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-white disabled:opacity-40 transition-colors cursor-pointer"
                whileTap={{ scale: 0.9 }}
              >
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      </AnimatePresence>
    </div>
  );
}
