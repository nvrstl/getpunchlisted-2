import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Building2, Mail, Phone, MapPin, Hash,
  Users, FolderOpen, Plus, Trash2, Loader2,
  ExternalLink, AlertCircle, X, CheckCircle,
  Edit3, Save, ChevronDown,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

const spring = { type: 'spring', stiffness: 320, damping: 28 };

const apiFetch = async (url, opts = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return fetch(url, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
  }).then(r => r.json());
};

const STATUS_COLORS = {
  pre_construction: 'bg-indigo-100 text-indigo-700',
  active:           'bg-[#d4f7ec] text-[#075e48]',
  punch_phase:      'bg-amber-100 text-amber-700',
  completed:        'bg-gray-100 text-gray-600',
};
const STATUS_LABELS = {
  pre_construction: 'Pre-construction',
  active:           'Actief',
  punch_phase:      'Punch Phase',
  completed:        'Voltooid',
};
const COMPANY_STATUS_BADGE = {
  active:   'bg-[#d4f7ec] text-[#075e48]',
  inactive: 'bg-gray-100 text-gray-500',
};

const fmt = {
  date: (s) => s ? new Date(s).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
};

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-[var(--surface-2)] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
      </div>
      <div>
        <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">{label}</div>
        <div className="text-[13px] text-[var(--text-primary)] mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel, errorMsg }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6"
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        transition={spring}
      >
        <AlertCircle className="w-8 h-8 text-red-500 mb-3" />
        <p className="text-[14px] font-medium text-[var(--text-primary)] mb-5">{message}</p>
        {errorMsg && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-3 py-2.5 text-[12px]">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{errorMsg}
          </div>
        )}
        <div className="flex gap-2.5">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border-color)] text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition cursor-pointer">
            Annuleren
          </button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-semibold hover:brightness-105 transition cursor-pointer">
            Verwijderen
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AddUserModal({ companyId, users, onClose, onAdd }) {
  const hasAdmin = (users || []).some(u => u.role === 'admin');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError('E-mail is verplicht.'); return; }
    setSaving(true);
    setError('');
    setWarning('');
    try {
      const res = await apiFetch(`/api/backoffice/companies/${companyId}/users`, {
        method: 'POST', body: { email, role },
      });
      if (!res.success) throw new Error(res.error);
      onAdd(res.data);
      if (res.inviteError) {
        setWarning('Gebruiker toegevoegd, maar uitnodigingsmail kon niet worden verzonden. Controleer de e-mailinstellingen in Supabase.');
        setSaving(false);
        return;
      }
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
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        transition={spring}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)]/60">
          <h3 className="text-[15px] font-bold text-[var(--text-primary)]">Gebruiker toevoegen</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-3 py-2.5 text-[12px]">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{error}
            </div>
          )}
          {warning && (
            <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-xl px-3 py-2.5 text-[12px]">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{warning}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">E-mailadres *</label>
            <input
              type="email" autoFocus
              className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
              placeholder="gebruiker@bedrijf.be"
              value={email} onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">Rol</label>
            <div className="relative">
              <select
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition appearance-none cursor-pointer"
                value={role} onChange={e => setRole(e.target.value)}
              >
                <option value="owner">Eigenaar</option>
                <option value="admin" disabled={hasAdmin}>{hasAdmin ? 'Beheerder (al ingenomen)' : 'Beheerder'}</option>
                <option value="member">Lid</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)] pointer-events-none" />
            </div>
          </div>
        </form>
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[var(--border-color)]/60 bg-[var(--surface-2)]/50">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition cursor-pointer">
            Annuleren
          </button>
          <motion.button
            onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-[13px] font-semibold shadow-sm hover:brightness-105 disabled:opacity-60 transition cursor-pointer"
            whileTap={{ scale: 0.97 }}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Toevoegen
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function LinkProjectModal({ companyId, onClose, onLink }) {
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/backoffice/unlinked-projects').then(res => {
      if (res.success) setProjects(res.data);
      setLoading(false);
    });
  }, []);

  const handleLink = async () => {
    if (!selected) { setError('Selecteer een project.'); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/backoffice/companies/${companyId}/projects`, {
        method: 'POST', body: { projectId: selected },
      });
      if (!res.success) throw new Error(res.error);
      onLink(res.data);
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
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        transition={spring}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)]/60">
          <h3 className="text-[15px] font-bold text-[var(--text-primary)]">Project koppelen</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-3 py-2.5 text-[12px]">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{error}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">Selecteer project</label>
            {loading ? (
              <div className="flex items-center gap-2 text-[12px] text-[var(--text-tertiary)] py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Laden…
              </div>
            ) : projects.length === 0 ? (
              <p className="text-[12px] text-[var(--text-tertiary)] py-2">Geen ontkoppelde projecten beschikbaar.</p>
            ) : (
              <div className="relative">
                <select
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition appearance-none cursor-pointer"
                  value={selected} onChange={e => setSelected(e.target.value)}
                >
                  <option value="">— Kies een project —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.city ? ` (${p.city})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)] pointer-events-none" />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[var(--border-color)]/60 bg-[var(--surface-2)]/50">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition cursor-pointer">
            Annuleren
          </button>
          <motion.button
            onClick={handleLink} disabled={saving || !selected}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-[13px] font-semibold shadow-sm hover:brightness-105 disabled:opacity-60 transition cursor-pointer"
            whileTap={{ scale: 0.97 }}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Koppelen
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function BackofficeCompany({ companyId, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [roleError, setRoleError] = useState('');
  const [pendingRoleEmail, setPendingRoleEmail] = useState(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showLinkProject, setShowLinkProject] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // { type: 'user'|'project', id, label }
  const [showDeleteCompany, setShowDeleteCompany] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/backoffice/companies/${companyId}`);
      if (!res.success) throw new Error(res.error);
      setData(res.data);
      setEditForm(res.data.company);
    } catch (ex) {
      setError(ex.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveEdit = async () => {
    setSaving(true);
    setEditError('');
    try {
      const res = await apiFetch(`/api/backoffice/companies/${companyId}`, { method: 'PATCH', body: editForm });
      if (!res.success) throw new Error(res.error);
      setData(d => ({ ...d, company: res.data }));
      setEditing(false);
    } catch (ex) {
      setEditError(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = data.company.status === 'active' ? 'inactive' : 'active';
    const res = await apiFetch(`/api/backoffice/companies/${companyId}`, { method: 'PATCH', body: { status: newStatus } });
    if (res.success) setData(d => ({ ...d, company: { ...d.company, status: newStatus } }));
  };

  const handleRemoveUser = async (email) => {
    const res = await apiFetch(`/api/backoffice/companies/${companyId}/users/${encodeURIComponent(email)}`, { method: 'DELETE' });
    if (res.success) setData(d => ({ ...d, users: d.users.filter(u => u.email !== email) }));
    setConfirmRemove(null);
  };

  const handleRoleChange = async (email, newRole) => {
    setPendingRoleEmail(email);
    setRoleError('');
    try {
      const res = await apiFetch(`/api/backoffice/companies/${companyId}/users/${encodeURIComponent(email)}`, { method: 'PATCH', body: { role: newRole } });
      if (res.success) setData(d => ({ ...d, users: d.users.map(u => u.email === email ? { ...u, role: newRole } : u) }));
      else setRoleError(res.error);
    } catch (ex) {
      setRoleError(ex.message);
    } finally {
      setPendingRoleEmail(null);
    }
  };

  const handleUnlinkProject = async (projectId) => {
    try {
      const res = await apiFetch(`/api/backoffice/companies/${companyId}/projects/${projectId}`, { method: 'DELETE' });
      if (res.success) setData(d => ({ ...d, projects: d.projects.filter(p => p.id !== projectId) }));
    } catch (ex) {
      console.error('Unlink project failed:', ex.message);
    } finally {
      setConfirmRemove(null);
    }
  };

  const handleDeleteCompany = async () => {
    try {
      const res = await apiFetch(`/api/backoffice/companies/${companyId}`, { method: 'DELETE' });
      if (res.success) { onNavigate('backoffice'); return; }
      setDeleteError(res.error);
    } catch (ex) {
      setDeleteError(ex.message);
    }
  };

  const setEdit = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-[13px] text-[var(--text-tertiary)]">{error || 'Bedrijf niet gevonden'}</p>
        <button onClick={() => onNavigate('backoffice')} className="text-[13px] text-brand underline cursor-pointer">
          Terug naar overzicht
        </button>
      </div>
    );
  }

  const { company, users, projects } = data;

  return (
    <div className="p-6 space-y-6 min-h-full max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate('backoffice')}
          className="flex items-center gap-1.5 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Overzicht
        </button>
        <span className="text-[var(--text-tertiary)] text-[12px]">/</span>
        <span className="text-[12px] text-[var(--text-secondary)] font-medium">{company.name}</span>
      </div>

      {/* Company header */}
      <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              {editing ? (
                <input
                  className="text-[18px] font-bold bg-white border border-[var(--border-color)] rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  value={editForm.name || ''}
                  onChange={e => setEdit('name', e.target.value)}
                />
              ) : (
                <h1 className="text-[18px] font-bold text-[var(--text-primary)] tracking-tight">{company.name}</h1>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold', COMPANY_STATUS_BADGE[company.status] || COMPANY_STATUS_BADGE.active)}>
                  {company.status === 'active' ? 'Actief' : 'Inactief'}
                </span>
                {company.vat_number && (
                  <span className="text-[11px] font-mono text-[var(--text-tertiary)]">{company.vat_number}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <motion.button
              onClick={handleToggleStatus}
              className={cn(
                'px-3 py-1.5 rounded-xl text-[12px] font-medium border transition cursor-pointer',
                company.status === 'active'
                  ? 'border-red-200 text-red-600 hover:bg-red-50'
                  : 'border-[#88f0d4] text-[#0c7a5e] hover:bg-[#e8fbf5]'
              )}
              whileTap={{ scale: 0.97 }}
            >
              {company.status === 'active' ? 'Deactiveren' : 'Activeren'}
            </motion.button>
            {!editing && (
              <motion.button
                onClick={() => setShowDeleteCompany(true)}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 border border-[var(--border-color)] transition cursor-pointer"
                whileTap={{ scale: 0.97 }}
                title="Bedrijf verwijderen"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </motion.button>
            )}
            {editing ? (
              <>
                <motion.button
                  onClick={() => { setEditing(false); setEditForm(company); setEditError(''); }}
                  className="px-3 py-1.5 rounded-xl text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] border border-[var(--border-color)] transition cursor-pointer"
                  whileTap={{ scale: 0.97 }}
                >
                  Annuleren
                </motion.button>
                <motion.button
                  onClick={handleSaveEdit} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-brand text-white hover:brightness-105 disabled:opacity-60 transition cursor-pointer"
                  whileTap={{ scale: 0.97 }}
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Opslaan
                </motion.button>
              </>
            ) : (
              <motion.button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] border border-[var(--border-color)] transition cursor-pointer"
                whileTap={{ scale: 0.97 }}
              >
                <Edit3 className="w-3 h-3" />
                Bewerken
              </motion.button>
            )}
          </div>
        </div>

        {/* Contact info */}
        <div className="mt-5 pt-4 border-t border-[var(--border-color)]/60">
          {editing ? (
            <div className="grid grid-cols-2 gap-3">
              {[
                { k: 'email', label: 'E-mail', placeholder: 'info@bedrijf.be', type: 'email' },
                { k: 'phone', label: 'Telefoon', placeholder: '+32 ...' },
                { k: 'vat_number', label: 'BTW-nummer', placeholder: 'BE0123.456.789' },
                { k: 'address_street', label: 'Straat', placeholder: 'Kerkstraat 12' },
                { k: 'address_zip', label: 'Postcode', placeholder: '2000' },
                { k: 'address_city', label: 'Stad', placeholder: 'Antwerpen' },
              ].map(({ k, label, placeholder, type = 'text' }) => (
                <div key={k} className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">{label}</label>
                  <input
                    type={type}
                    className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                    placeholder={placeholder}
                    value={editForm[k] || ''}
                    onChange={e => setEdit(k, e.target.value)}
                  />
                </div>
              ))}
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide">Notities</label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition resize-none"
                  value={editForm.notes || ''}
                  onChange={e => setEdit('notes', e.target.value)}
                />
              </div>
              {editError && (
                <div className="col-span-2 flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-3 py-2.5 text-[12px]">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{editError}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <InfoRow icon={Mail} label="E-mail" value={company.email} />
              <InfoRow icon={Phone} label="Telefoon" value={company.phone} />
              <InfoRow icon={Hash} label="BTW-nummer" value={company.vat_number} />
              <InfoRow
                icon={MapPin}
                label="Adres"
                value={[company.address_street, company.address_zip && company.address_city && `${company.address_zip} ${company.address_city}`].filter(Boolean).join(', ') || null}
              />
              {company.notes && (
                <div className="col-span-2">
                  <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Notities</div>
                  <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">{company.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Users section */}
      <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]/60">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--text-tertiary)]" />
            <span className="text-[13px] font-bold text-[var(--text-primary)]">Gebruikers</span>
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--surface-2)] text-[10px] font-bold text-[var(--text-tertiary)]">{users.length}</span>
          </div>
          <motion.button
            onClick={() => setShowAddUser(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand text-white text-[12px] font-semibold hover:brightness-105 transition cursor-pointer"
            whileTap={{ scale: 0.97 }}
          >
            <Plus className="w-3 h-3" />
            Gebruiker toevoegen
          </motion.button>
        </div>

        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--text-tertiary)]">
            <Users className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-[12px]">Nog geen gebruikers</p>
          </div>
        ) : (
          <>
            {roleError && (
              <div className="mx-5 mt-3 flex items-center gap-2 bg-red-50 text-red-700 rounded-xl px-3 py-2.5 text-[12px]">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1">{roleError}</span>
                <button onClick={() => setRoleError('')} className="cursor-pointer"><X className="w-3 h-3" /></button>
              </div>
            )}
          <div className="divide-y divide-[var(--border-color)]/40">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-[var(--surface-2)]/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[12px] font-bold text-indigo-600">{(u.email?.[0] || '?').toUpperCase()}</span>
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-[var(--text-primary)]">{u.email}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <select
                        value={u.role}
                        onChange={e => handleRoleChange(u.email, e.target.value)}
                        disabled={pendingRoleEmail === u.email}
                        className="text-[11px] font-medium rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] px-2 py-0.5 cursor-pointer text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50 disabled:cursor-wait"
                      >
                        <option value="owner">Eigenaar</option>
                        <option value="admin">Beheerder</option>
                        <option value="member">Lid</option>
                      </select>
                      {u.accepted_at ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-[#0c7a5e]">
                          <CheckCircle className="w-2.5 h-2.5" /> Actief
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-amber-600">Uitnodiging verstuurd</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-[var(--text-tertiary)]">{fmt.date(u.invited_at)}</span>
                  <motion.button
                    onClick={() => setConfirmRemove({ type: 'user', id: u.email, label: u.email })}
                    className="w-7 h-7 rounded-xl flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                    whileTap={{ scale: 0.9 }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </motion.button>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {/* Projects section */}
      <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]/60">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[var(--text-tertiary)]" />
            <span className="text-[13px] font-bold text-[var(--text-primary)]">Projecten</span>
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--surface-2)] text-[10px] font-bold text-[var(--text-tertiary)]">{projects.length}</span>
          </div>
          <motion.button
            onClick={() => setShowLinkProject(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand text-white text-[12px] font-semibold hover:brightness-105 transition cursor-pointer"
            whileTap={{ scale: 0.97 }}
          >
            <Plus className="w-3 h-3" />
            Project koppelen
          </motion.button>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--text-tertiary)]">
            <FolderOpen className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-[12px]">Nog geen gekoppelde projecten</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-color)]/40">
            {projects.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-[var(--surface-2)]/50 transition-colors group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#d4f7ec] flex items-center justify-center flex-shrink-0">
                    <FolderOpen className="w-3.5 h-3.5 text-[#0c7a5e]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">{p.name}</span>
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0', STATUS_COLORS[p.status] || STATUS_COLORS.active)}>
                        {STATUS_LABELS[p.status] || p.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--text-tertiary)]">
                      {p.city && <span>{p.city}</span>}
                      {p.city && <span>·</span>}
                      <span>{p.logCount} logs</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={() => setConfirmRemove({ type: 'project', id: p.id, label: p.name })}
                    className="w-7 h-7 rounded-xl flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                    whileTap={{ scale: 0.9 }}
                    title="Ontkoppelen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </motion.button>
                  <motion.button
                    onClick={() => {}}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-white text-[12px] font-medium text-[var(--text-secondary)] border border-[var(--border-color)] transition-colors cursor-pointer"
                    whileTap={{ scale: 0.97 }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Bekijk
                  </motion.button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddUser && (
          <AddUserModal
            companyId={companyId}
            users={users}
            onClose={() => setShowAddUser(false)}
            onAdd={u => setData(d => ({ ...d, users: [u, ...d.users] }))}
          />
        )}
        {showLinkProject && (
          <LinkProjectModal
            companyId={companyId}
            onClose={() => setShowLinkProject(false)}
            onLink={p => setData(d => ({ ...d, projects: [{ ...p, logCount: 0 }, ...d.projects] }))}
          />
        )}
        {confirmRemove && (
          <ConfirmDialog
            message={
              confirmRemove.type === 'user'
                ? `Gebruiker "${confirmRemove.label}" verwijderen uit dit bedrijf?`
                : `Project "${confirmRemove.label}" ontkoppelen van dit bedrijf?`
            }
            onConfirm={() =>
              confirmRemove.type === 'user'
                ? handleRemoveUser(confirmRemove.id)
                : handleUnlinkProject(confirmRemove.id)
            }
            onCancel={() => setConfirmRemove(null)}
          />
        )}
        {showDeleteCompany && (
          <ConfirmDialog
            message={`Bedrijf "${data.company.name}" definitief verwijderen? Gekoppelde projecten worden ontkoppeld maar niet verwijderd.`}
            onConfirm={handleDeleteCompany}
            onCancel={() => { setShowDeleteCompany(false); setDeleteError(''); }}
            errorMsg={deleteError}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
