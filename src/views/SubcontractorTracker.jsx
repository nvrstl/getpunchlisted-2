import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HardHat, Phone, MapPin, Users, Plus, Trash2,
  ChevronDown, Edit2, Check, X,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { AnimatedNumber } from '../components/magicui/animated-number';
import { cn } from '../lib/utils';

const spring = { type: 'spring', stiffness: 300, damping: 28 };

const TRADES = [
  { value: 'electrical',       label: 'Elektriciteit' },
  { value: 'plumbing',         label: 'Sanitair' },
  { value: 'hvac',             label: 'HVAC / Mechanica' },
  { value: 'structural_steel', label: 'Staalconstructie' },
  { value: 'concrete',         label: 'Beton' },
  { value: 'masonry',          label: 'Metselwerk' },
  { value: 'framing',          label: 'Ruwbouw / Schrijnwerk' },
  { value: 'drywall',          label: 'Droge wand' },
  { value: 'roofing',          label: 'Dakwerken' },
  { value: 'glazing',          label: 'Beglazing / Curtain Wall' },
  { value: 'flooring',         label: 'Vloerwerken' },
  { value: 'painting',         label: 'Schilderwerken' },
  { value: 'general',          label: 'Algemeen' },
];

const TRADE_BADGE_CLASS = {
  electrical:       'bg-yellow-50 text-yellow-700 border-yellow-200',
  plumbing:         'bg-blue-50 text-blue-600 border-blue-200',
  hvac:             'bg-cyan-50 text-cyan-700 border-cyan-200',
  structural_steel: 'bg-slate-100 text-slate-600 border-slate-200',
  concrete:         'bg-stone-50 text-stone-600 border-stone-200',
  masonry:          'bg-orange-50 text-orange-600 border-orange-200',
  framing:          'bg-amber-50 text-amber-700 border-amber-200',
  drywall:          'bg-purple-50 text-purple-600 border-purple-200',
  roofing:          'bg-red-50 text-red-600 border-red-200',
  glazing:          'bg-sky-50 text-sky-600 border-sky-200',
  flooring:         'bg-lime-50 text-lime-700 border-lime-200',
  painting:         'bg-pink-50 text-pink-600 border-pink-200',
  general:          'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_CONFIG = {
  on_site:  { label: 'Op werf',   dot: 'bg-[#7669ff]',           cls: 'bg-[#e8fbf5] text-[#075e48] border border-[#88f0d4]' },
  off_site: { label: 'Afwezig',   dot: 'bg-slate-300',             cls: 'bg-slate-100 text-slate-500 border border-slate-200' },
  delayed:  { label: 'Vertraagd', dot: 'bg-red-400 animate-pulse', cls: 'bg-red-50 text-red-600 border border-red-200' },
};

const BLANK_FORM = { company: '', trade: 'electrical', contact: '', phone: '', crewSize: '', workArea: '', status: 'on_site', notes: '' };

const selectClass = "w-full h-10 border border-[var(--border-color)] bg-[var(--surface-2)] rounded-xl px-4 text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/50 cursor-pointer";
const labelClass  = "block label-caps mb-1.5";

function SubForm({ initial = BLANK_FORM, onSubmit, onCancel, submitLabel = 'Onderaannemer toevoegen' }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.company.trim()) return;
    onSubmit({ ...form, crewSize: parseInt(form.crewSize) || 0 });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelClass}>Bedrijf *</label>
          <Input placeholder="bijv. Elektro Janssen BV" required value={form.company} onChange={e => set('company', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Vak</label>
          <select className={selectClass} value={form.trade} onChange={e => set('trade', e.target.value)}>
            {TRADES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Contactpersoon</label>
          <Input placeholder="Ploegbaas / PM naam" value={form.contact} onChange={e => set('contact', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Telefoon</label>
          <Input placeholder="+32 ..." inputMode="tel" value={form.phone} onChange={e => set('phone', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Ploeggrootte</label>
          <Input type="number" inputMode="numeric" min="0" placeholder="0" value={form.crewSize} onChange={e => set('crewSize', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select className={selectClass} value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="on_site">Op werf</option>
            <option value="off_site">Afwezig</option>
            <option value="delayed">Vertraagd</option>
          </select>
        </div>
      </div>
      <div className="mb-3">
        <label className={labelClass}>Werkzone</label>
        <Input placeholder="bijv. Zone 3, Verdieping 2 — leidingwerk" value={form.workArea} onChange={e => set('workArea', e.target.value)} />
      </div>
      <div className="mb-4">
        <label className={labelClass}>Notities</label>
        <Textarea rows={2} placeholder="Eventuele opmerkingen…" value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          <Check className="w-3.5 h-3.5" /> {submitLabel}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          <X className="w-3.5 h-3.5" /> Annuleren
        </Button>
      </div>
    </form>
  );
}

function SubCard({ sub, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing]   = useState(false);

  const tradeLabel = TRADES.find(t => t.value === sub.trade)?.label || sub.trade;
  const statusCfg  = STATUS_CONFIG[sub.status] || STATUS_CONFIG.off_site;

  const cycleStatus = () => {
    const order = ['on_site', 'off_site', 'delayed'];
    const next  = order[(order.indexOf(sub.status) + 1) % order.length];
    onUpdate(sub.id, { status: next });
  };

  if (editing) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="glass-card rounded-2xl border-l-[3px] border-l-brand overflow-hidden p-5"
      >
        <div className="label-caps mb-3">Bewerken — {sub.company}</div>
        <SubForm
          initial={{ ...sub, crewSize: String(sub.crewSize || '') }}
          onSubmit={(form) => { onUpdate(sub.id, { ...form, crewSize: parseInt(form.crewSize) || 0 }); setEditing(false); }}
          onCancel={() => setEditing(false)}
          submitLabel="Wijzigingen opslaan"
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={spring}
      style={{ borderRadius: 16 }}
      className="glass-card overflow-hidden"
      whileHover={{ y: -1, borderRadius: 22, boxShadow: '0 0 0 1px rgba(255,255,255,0.9), 0 8px 32px rgba(0,0,0,0.09), inset 0 1px 0 rgba(255,255,255,0.9)' }}
    >
      <div className="flex items-start gap-4 p-5">
        <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center flex-shrink-0">
          <HardHat className="w-5 h-5 text-[var(--text-tertiary)]" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[var(--text-primary)] text-[13px]">{sub.company}</span>
            <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded-md border', TRADE_BADGE_CLASS[sub.trade] || TRADE_BADGE_CLASS.general)}>
              {tradeLabel}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
            {sub.contact && (
              <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                <Users className="w-3 h-3" /> {sub.contact}
              </span>
            )}
            {sub.phone && (
              <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                <Phone className="w-3 h-3" /> {sub.phone}
              </span>
            )}
            {sub.crewSize > 0 && (
              <span className="text-[11px] text-[var(--text-tertiary)] font-mono">{sub.crewSize} arbeiders</span>
            )}
          </div>
          {sub.workArea && (
            <div className="flex items-center gap-1 mt-1.5">
              <MapPin className="w-3 h-3 text-[var(--text-tertiary)]" />
              <span className="text-[11px] text-[var(--text-tertiary)]">{sub.workArea}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <motion.button
            onClick={cycleStatus}
            title="Klik om status te wijzigen"
            className={cn('flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-full transition-colors duration-150 hover:opacity-75 cursor-pointer', statusCfg.cls)}
            whileTap={{ scale: 0.92 }}
            transition={spring}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusCfg.dot)} />
            {statusCfg.label}
          </motion.button>
          <motion.button
            onClick={() => setEditing(true)}
            aria-label="Onderaannemer bewerken"
            className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            whileTap={{ scale: 0.9 }}
            transition={spring}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </motion.button>
          {sub.notes && (
            <motion.button
              onClick={() => setExpanded(e => !e)}
              aria-label={expanded ? 'Inklappen' : 'Notities uitklappen'}
              className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              whileTap={{ scale: 0.9 }}
              transition={spring}
            >
              <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={spring}>
                <ChevronDown className="w-3.5 h-3.5" />
              </motion.div>
            </motion.button>
          )}
          <motion.button
            onClick={() => onDelete(sub.id)}
            aria-label="Onderaannemer verwijderen"
            className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
            whileTap={{ scale: 0.9 }}
            transition={spring}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && sub.notes && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 pt-3 border-t border-[var(--border-color)] bg-[var(--surface-2)]">
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{sub.notes}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function SubcontractorTracker({ subs, onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm]         = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const onSite    = subs.filter(s => s.status === 'on_site');
  const delayed   = subs.filter(s => s.status === 'delayed');
  const totalCrew = onSite.reduce((acc, s) => acc + (s.crewSize || 0), 0);
  const filtered  = statusFilter === 'all' ? subs : subs.filter(s => s.status === statusFilter);

  const FILTERS = [
    { key: 'all',      label: `Alle (${subs.length})` },
    { key: 'on_site',  label: `Op werf (${onSite.length})` },
    { key: 'delayed',  label: `Vertraagd (${delayed.length})` },
    { key: 'off_site', label: `Afwezig (${subs.filter(s => s.status === 'off_site').length})` },
  ];

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <motion.div
        className="flex items-start justify-between mb-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div>
          <h1 className="title-xl">Onderaannemers</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">Volg vakgroepen, ploeggroottes en aanwezigheid op de werf.</p>
        </div>
        <Button onClick={() => setShowForm(v => !v)}>
          <Plus className="w-4 h-4" />
          {showForm ? 'Annuleren' : 'Toevoegen'}
        </Button>
      </motion.div>

      {/* Stats row */}
      <motion.div
        className="grid grid-cols-3 gap-3 mb-6"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
      >
        {[
          { value: subs.length,    label: 'Totaal aannemers',   color: 'text-[var(--text-primary)]' },
          { value: totalCrew,      label: 'Arbeiders op werf',  color: 'text-brand' },
          { value: delayed.length, label: 'Vertraagd',          color: delayed.length > 0 ? 'text-red-500' : 'text-[var(--text-primary)]' },
        ].map(({ value, label, color }) => (
          <motion.div
            key={label}
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
            transition={spring}
            style={{ borderRadius: 16 }}
            className="glass-card p-4 text-center"
            whileHover={{ y: -2, borderRadius: 22, boxShadow: '0 0 0 1px rgba(255,255,255,0.9), 0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)' }}
          >
            <div className={cn('text-[28px] font-bold tabular-nums tracking-tightest', color)}>
              <AnimatedNumber value={value} />
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5 font-medium">{label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring}
            className="glass-card rounded-2xl border-l-[3px] border-l-brand mb-5 p-5"
          >
            <div className="text-[13px] font-semibold text-[var(--text-primary)] mb-4">Onderaannemer toevoegen</div>
            <SubForm
              onSubmit={(sub) => { onAdd(sub); setShowForm(false); }}
              onCancel={() => setShowForm(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter tabs */}
      <motion.div
        className="flex gap-1 p-1 rounded-full bg-[var(--surface-2)] mb-4 w-fit flex-wrap"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {FILTERS.map(f => (
          <motion.button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={cn('filter-pill', statusFilter === f.key ? 'filter-pill-active' : 'filter-pill-inactive')}
            whileTap={{ scale: 0.95 }}
            transition={spring}
          >
            {f.label}
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
              className="glass-card rounded-2xl py-16 flex flex-col items-center justify-center text-center"
            >
              <div className="w-14 h-14 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center mb-3">
                <HardHat className="w-6 h-6 text-[var(--text-tertiary)]" />
              </div>
              <p className="text-[13px] font-medium text-[var(--text-secondary)]">Geen onderaannemers gevonden</p>
              <motion.button
                onClick={() => setShowForm(true)}
                className="mt-2 text-[12px] text-brand font-semibold hover:underline cursor-pointer"
                whileTap={{ scale: 0.95 }}
              >
                Voeg er een toe →
              </motion.button>
            </motion.div>
          ) : (
            filtered.map(sub => (
              <SubCard key={sub.id} sub={sub} onUpdate={onUpdate} onDelete={onDelete} />
            ))
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
