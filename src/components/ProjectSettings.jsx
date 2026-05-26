import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Settings, RefreshCw, UserPlus, Trash2, Users, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';

const spring = { type: 'spring', stiffness: 320, damping: 30 };

const STATUSES = [
  { value: 'pre_construction', label: 'Pre-construction', color: '#6366F1', bg: '#EEF2FF' },
  { value: 'active',           label: 'Active',           color: '#7669ff', bg: '#F3F0FF' },
  { value: 'punch_phase',      label: 'Punch Phase',      color: '#F59E0B', bg: '#FFFBEB' },
  { value: 'completed',        label: 'Completed',        color: '#6B7280', bg: '#F9FAFB' },
];

function Label({ children }) {
  return <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">{children}</p>;
}

function FieldRow({ children }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}

export default function ProjectSettings({ open, onClose, project, onSave, onChangeProject }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Team members state
  const [members, setMembers] = useState([]);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState('');

  useEffect(() => {
    if (project && open) {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) return;
        const res = await fetch(`/api/projects/${project.id}/members`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (json.success) setMembers(json.data);
      });
    }
  }, [project, open]);

  const handleUpdatePhone = async (id, phone) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`/api/projects/${project.id}/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ whatsapp_phone: phone }),
    });
    setMembers(m => m.map(x => x.id === id ? { ...x, whatsapp_phone: phone.trim() || null } : x));
  };

  const handleAddMember = async () => {
    const email = memberEmail.trim().toLowerCase();
    if (!email) return;
    setMemberLoading(true);
    setMemberError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setMemberError('Not authenticated'); setMemberLoading(false); return; }
    const res = await fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();
    if (!json.success) {
      setMemberError(json.error);
    } else {
      setMembers(m => [...m, json.data]);
      setMemberEmail('');
    }
    setMemberLoading(false);
  };

  const handleRemoveMember = async (id) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`/api/projects/${project.id}/members/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setMembers(m => m.filter(x => x.id !== id));
  };

  useEffect(() => {
    if (project) {
      setForm({
        name:               project.name               || '',
        project_number:     project.project_number     || '',
        status:             project.status             || 'active',
        client_name:        project.client_name        || '',
        project_manager:    project.project_manager    || '',
        city:               project.city               || '',
        start_date:         project.start_date         || '',
        planned_completion: project.planned_completion || '',
        actual_completion:  project.actual_completion  || '',
        contract_value:     project.contract_value     != null ? String(project.contract_value) : '',
        description:        project.description        || '',
        bouwheer_name:      project.bouwheer_name      || '',
        bouwheer_email:     project.bouwheer_email     || '',
        architect_name:     project.architect_name     || '',
        architect_email:    project.architect_email    || '',
        calculator_name:    project.calculator_name    || '',
        calculator_email:   project.calculator_email   || '',
      });
    }
  }, [project, open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setStatus = (v) => setForm(f => ({ ...f, status: v }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');

    const updates = {
      name:               form.name.trim(),
      description:        form.description.trim() || null,
      project_number:     form.project_number.trim() || null,
      status:             form.status,
      client_name:        form.client_name.trim() || null,
      project_manager:    form.project_manager.trim() || null,
      city:               form.city.trim() || null,
      start_date:         form.start_date || null,
      planned_completion: form.planned_completion || null,
      actual_completion:  form.actual_completion || null,
      contract_value:     form.contract_value ? parseFloat(form.contract_value) : null,
      bouwheer_name:      form.bouwheer_name.trim()    || null,
      bouwheer_email:     form.bouwheer_email.trim()   || null,
      architect_name:     form.architect_name.trim()   || null,
      architect_email:    form.architect_email.trim()  || null,
      calculator_name:    form.calculator_name.trim()  || null,
      calculator_email:   form.calculator_email.trim() || null,
    };

    const { data, error: err } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', project.id)
      .select()
      .single();

    if (err) {
      setError(err.message);
    } else {
      onSave(data);
      onClose();
    }
    setSaving(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[420px] bg-white shadow-2xl flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={spring}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)] flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--surface-2)] flex items-center justify-center">
                  <Settings className="w-4 h-4 text-[var(--text-secondary)]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-bold text-[var(--text-primary)] leading-none">Projectinstellingen</h2>
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Projectgegevens bewerken</p>
                </div>
              </div>
              <motion.button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
                whileTap={{ scale: 0.92 }}
                transition={spring}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-5">

                {/* Name + Number */}
                <FieldRow>
                  <div>
                    <Label>Projectnaam *</Label>
                    <Input value={form.name} onChange={set('name')} placeholder="Nieuwbouw schoolgebouw" required />
                  </div>
                  <div>
                    <Label>Projectnummer</Label>
                    <Input value={form.project_number} onChange={set('project_number')} placeholder="PRJ-2024-001" />
                  </div>
                </FieldRow>

                {/* Status */}
                <div>
                  <Label>Status</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {STATUSES.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setStatus(s.value)}
                        className="px-3 py-2 rounded-xl text-[11px] font-semibold border transition-all duration-150 cursor-pointer"
                        style={form.status === s.value
                          ? { color: s.color, backgroundColor: s.bg, borderColor: s.color + '55' }
                          : { color: 'var(--text-tertiary)', backgroundColor: 'white', borderColor: 'var(--border-color)' }
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Client + PM */}
                <FieldRow>
                  <div>
                    <Label>Klantnaam</Label>
                    <Input value={form.client_name} onChange={set('client_name')} placeholder="Gemeente Gent" />
                  </div>
                  <div>
                    <Label>Projectleider</Label>
                    <Input value={form.project_manager} onChange={set('project_manager')} placeholder="Jan Janssen" />
                  </div>
                </FieldRow>

                {/* City */}
                <div>
                  <Label>Stad / werf</Label>
                  <Input value={form.city} onChange={set('city')} placeholder="Brussel" />
                </div>

                {/* Dates */}
                <FieldRow>
                  <div>
                    <Label>Startdatum</Label>
                    <Input type="date" value={form.start_date} onChange={set('start_date')} />
                  </div>
                  <div>
                    <Label>Geplande oplevering</Label>
                    <Input type="date" value={form.planned_completion} onChange={set('planned_completion')} />
                  </div>
                </FieldRow>

                {form.status === 'completed' && (
                  <div>
                    <Label>Werkelijke oplevering</Label>
                    <Input type="date" value={form.actual_completion} onChange={set('actual_completion')} />
                  </div>
                )}

                {/* Contract value */}
                <div>
                  <Label>Contractwaarde (€)</Label>
                  <Input
                    type="number"
                    value={form.contract_value}
                    onChange={set('contract_value')}
                    placeholder="250000"
                    min="0"
                    step="1000"
                  />
                </div>

                {/* Description */}
                <div>
                  <Label>Omschrijving</Label>
                  <Input value={form.description} onChange={set('description')} placeholder="Korte projectomschrijving…" />
                </div>

                {/* Team */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Users className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                    <Label>Teamleden</Label>
                  </div>

                  {/* Existing members */}
                  {members.length > 0 && (
                    <div className="mb-2 space-y-1.5">
                      {members.map(m => (
                        <div key={m.id} className="px-3 py-2 bg-[var(--surface-2)] rounded-xl border border-[var(--border-color)]">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] text-[var(--text-secondary)] truncate">{m.email}</span>
                            <motion.button
                              type="button"
                              onClick={() => handleRemoveMember(m.id)}
                              className="ml-2 text-[var(--text-tertiary)] hover:text-red-500 transition-colors cursor-pointer flex-shrink-0"
                              whileTap={{ scale: 0.85 }}
                              transition={spring}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </motion.button>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <MessageCircle className="w-3 h-3 text-[var(--text-tertiary)] flex-shrink-0" />
                            <input
                              type="tel"
                              placeholder="WhatsApp-nummer (bijv. 32495123456)"
                              defaultValue={m.whatsapp_phone ?? ''}
                              onBlur={e => handleUpdatePhone(m.id, e.target.value)}
                              className="flex-1 text-[11px] text-[var(--text-secondary)] bg-transparent border-none outline-none placeholder:text-[var(--text-tertiary)]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add member */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="collega@bedrijf.be"
                      value={memberEmail}
                      onChange={e => setMemberEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddMember())}
                      type="email"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddMember}
                      disabled={memberLoading || !memberEmail.trim()}
                    >
                      {memberLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  {memberError && (
                    <p className="text-[11px] text-red-600 mt-1">{memberError}</p>
                  )}
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
              </div>
            </form>

            {/* Footer */}
            <div className="flex flex-col gap-2 px-6 py-4 border-t border-[var(--border-color)] flex-shrink-0">
              <div className="flex gap-2.5">
                <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
                  Annuleren
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={saving || !form.name?.trim()}
                  onClick={handleSave}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Wijzigingen opslaan'}
                </Button>
              </div>
              <motion.button
                type="button"
                onClick={() => { onClose(); onChangeProject(); }}
                className="w-full flex items-center justify-center gap-1.5 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer py-1"
                whileTap={{ scale: 0.96 }}
                transition={spring}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Project wisselen
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
