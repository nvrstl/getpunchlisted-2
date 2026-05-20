import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, ChevronRight, Loader2, FolderOpen, LogOut,
  Building2, MapPin, User, Calendar, Hash, DollarSign, Briefcase,
} from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const spring  = { type: 'spring', stiffness: 300, damping: 28 };
const fadeUp  = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
};

const STATUSES = [
  { value: 'pre_construction', label: 'Voorbereiding',    color: '#6366F1', bg: '#EEF2FF' },
  { value: 'active',           label: 'Actief',           color: '#7669ff', bg: '#F3F0FF' },
  { value: 'punch_phase',      label: 'Opleveringsfase',  color: '#F59E0B', bg: '#FFFBEB' },
  { value: 'completed',        label: 'Voltooid',         color: '#6B7280', bg: '#F9FAFB' },
];

function StatusBadge({ value }) {
  const s = STATUSES.find(x => x.value === value) || STATUSES[1];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}

function FieldRow({ children }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}

function Label({ children }) {
  return <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">{children}</p>;
}

export default function ProjectSelect({ onSelect }) {
  const { user, signOut }       = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const blank = {
    name: '', projectNumber: '', status: 'active',
    clientName: '', projectManager: '', city: '',
    startDate: '', plannedCompletion: '', actualCompletion: '',
    contractValue: '', description: '',
  };
  const [form, setForm] = useState(blank);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setStatus = (v) => setForm(f => ({ ...f, status: v }));

  useEffect(() => {
    supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (!err) setProjects(data || []);
        setLoading(false);
      });
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    const { data, error: err } = await supabase
      .from('projects')
      .insert({
        name:               form.name.trim(),
        description:        form.description.trim() || null,
        owner_id:           user.id,
        project_number:     form.projectNumber.trim() || null,
        status:             form.status,
        client_name:        form.clientName.trim() || null,
        project_manager:    form.projectManager.trim() || null,
        city:               form.city.trim() || null,
        start_date:         form.startDate || null,
        planned_completion: form.plannedCompletion || null,
        actual_completion:  form.actualCompletion || null,
        contract_value:     form.contractValue ? parseFloat(form.contractValue) : null,
      })
      .select()
      .single();
    if (err) {
      setError(err.message);
    } else {
      onSelect(data);
    }
    setSaving(false);
  };

  const cancelCreate = () => { setCreating(false); setForm(blank); setError(''); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F2E8] via-[#F8F5EB] to-[#F2EEE0] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 right-10 w-96 h-96 bg-brand/[0.06] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 left-10 w-80 h-80 bg-[#ffabff]/15 rounded-full blur-3xl pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #c8d5e0 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          opacity: 0.25,
        }}
      />

      <div className="w-full max-w-md relative z-10">
        {/* Logo row */}
        <motion.div
          className="flex items-center gap-3.5 mb-8 justify-center"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.05 }}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-[#280063]/25 rounded-xl blur-lg" />
            <LogoMark size={44} radius={14} className="relative rounded-[14px] shadow-brand-sm" />
          </div>
          <div>
            <div className="font-bold text-[var(--text-primary)] text-base tracking-tight">Punchlister</div>
            <div className="text-[var(--text-tertiary)] text-[10px] font-mono truncate max-w-[200px]">{user?.email}</div>
          </div>
        </motion.div>

        {/* Card */}
        <motion.div
          className="bg-white rounded-3xl shadow-float overflow-hidden"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring, delay: 0.12 }}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-5 border-b border-[var(--border-color)]">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="title-lg">Uw projecten</h1>
                <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">Selecteer of maak een project aan.</p>
              </div>
              <motion.div whileTap={{ scale: 0.94 }} transition={spring}>
                <Button size="sm" onClick={() => { setCreating(c => !c); setError(''); }}>
                  <Plus className="w-3.5 h-3.5" /> Nieuw
                </Button>
              </motion.div>
            </div>
          </div>

          <div className="p-6">
            {/* Create form */}
            <AnimatePresence>
              {creating && (
                <motion.form
                  onSubmit={handleCreate}
                  variants={fadeUp}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={spring}
                  className="mb-5 p-4 bg-[var(--surface-2)] rounded-2xl border border-[var(--border-color)] space-y-4"
                >
                  {/* Name + Number */}
                  <FieldRow>
                    <div>
                      <Label>Projectnaam *</Label>
                      <Input placeholder="Nieuwbouw Schoolgebouw" value={form.name} onChange={set('name')} required autoFocus />
                    </div>
                    <div>
                      <Label>Projectnummer</Label>
                      <Input placeholder="PRJ-2024-001" value={form.projectNumber} onChange={set('projectNumber')} />
                    </div>
                  </FieldRow>

                  {/* Status picker */}
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
                      <Input placeholder="Gemeente Gent" value={form.clientName} onChange={set('clientName')} />
                    </div>
                    <div>
                      <Label>Projectleider</Label>
                      <Input placeholder="Jan Janssen" value={form.projectManager} onChange={set('projectManager')} />
                    </div>
                  </FieldRow>

                  {/* City */}
                  <div>
                    <Label>Stad / werf</Label>
                    <Input placeholder="Brussel" value={form.city} onChange={set('city')} />
                  </div>

                  {/* Dates */}
                  <FieldRow>
                    <div>
                      <Label>Startdatum</Label>
                      <Input type="date" value={form.startDate} onChange={set('startDate')} />
                    </div>
                    <div>
                      <Label>Geplande oplevering</Label>
                      <Input type="date" value={form.plannedCompletion} onChange={set('plannedCompletion')} />
                    </div>
                  </FieldRow>

                  {/* Contract value */}
                  <div>
                    <Label>Contractwaarde (€)</Label>
                    <Input type="number" placeholder="250000" value={form.contractValue} onChange={set('contractValue')} min="0" step="1000" />
                  </div>

                  {/* Omschrijving */}
                  <div>
                    <Label>Omschrijving (optioneel)</Label>
                    <Input placeholder="Korte projectomschrijving…" value={form.description} onChange={set('description')} />
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

                  <div className="flex gap-2 pt-1">
                    <Button type="button" variant="secondary" className="flex-1" onClick={cancelCreate}>
                      Annuleren
                    </Button>
                    <Button type="submit" disabled={saving || !form.name.trim()} className="flex-1">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aanmaken'}
                    </Button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Project list */}
            {loading ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 className="w-6 h-6 text-[var(--text-tertiary)] animate-spin" />
              </div>
            ) : projects.length === 0 ? (
              <motion.div
                className="text-center py-14"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <div className="w-14 h-14 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <FolderOpen className="w-6 h-6 text-[var(--text-tertiary)]" />
                </div>
                <p className="text-[13px] font-medium text-[var(--text-secondary)]">Nog geen projecten.</p>
                <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">Maak hierboven uw eerste project aan.</p>
              </motion.div>
            ) : (
              <motion.div
                className="space-y-2"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
              >
                {projects.map(p => (
                  <motion.button
                    key={p.id}
                    onClick={() => onSelect(p)}
                    variants={fadeUp}
                    transition={spring}
                    className="w-full flex items-start gap-3 p-4 rounded-2xl border border-[var(--border-color)]
                               hover:border-brand/30 hover:bg-[#e8fbf5]/40 text-left
                               transition-colors duration-150 cursor-pointer group"
                    whileHover={{ y: -1, boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="w-10 h-10 bg-[var(--surface-2)] rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-brand/10 transition-colors duration-150 mt-0.5">
                      <Building2 className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-brand transition-colors duration-150" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-[var(--text-primary)] text-[13px] truncate">{p.name}</p>
                        {p.status && <StatusBadge value={p.status} />}
                      </div>

                      {/* Number + city */}
                      {(p.project_number || p.city) && (
                        <div className="flex items-center gap-3 mt-1">
                          {p.project_number && (
                            <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] font-mono">
                              <Hash className="w-3 h-3" />{p.project_number}
                            </span>
                          )}
                          {p.city && (
                            <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                              <MapPin className="w-3 h-3" />{p.city}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Client + PM */}
                      {(p.client_name || p.project_manager) && (
                        <div className="flex items-center gap-3 mt-1">
                          {p.client_name && (
                            <span className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                              <Briefcase className="w-3 h-3" />{p.client_name}
                            </span>
                          )}
                          {p.project_manager && (
                            <span className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                              <User className="w-3 h-3" />{p.project_manager}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Deadline + value */}
                      {(p.planned_completion || p.contract_value) && (
                        <div className="flex items-center gap-3 mt-1">
                          {p.planned_completion && (
                            <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                              <Calendar className="w-3 h-3" />
                              Deadline {new Date(p.planned_completion).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                          {p.contract_value && (
                            <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                              <DollarSign className="w-3 h-3" />
                              €{Number(p.contract_value).toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-brand transition-colors duration-150 flex-shrink-0 mt-3" />
                  </motion.button>
                ))}
              </motion.div>
            )}

            <motion.button
              onClick={signOut}
              className="mt-6 w-full flex items-center justify-center gap-1.5 text-[12px] text-[var(--text-tertiary)]
                         hover:text-[var(--text-secondary)] transition-colors cursor-pointer py-1"
              whileTap={{ scale: 0.96 }}
              transition={spring}
            >
              <LogOut className="w-3.5 h-3.5" /> Afmelden
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
