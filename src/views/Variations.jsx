import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, TrendingUp, Loader2, X, ChevronRight,
  Edit3, Trash2, CheckCircle, Clock, Send, FileCheck,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { ShimmerButton } from '../components/magicui/shimmer';
import { cn } from '../lib/utils';

const spring = { type: 'spring', stiffness: 300, damping: 28 };

const STATUS_CONFIG = {
  draft:     { badge: 'secondary', icon: <Edit3 className="w-3 h-3" />,      label: 'Concept'       },
  submitted: { badge: 'warning',   icon: <Clock className="w-3 h-3" />,       label: 'Ingediend'     },
  approved:  { badge: 'success',   icon: <CheckCircle className="w-3 h-3" />, label: 'Goedgekeurd'   },
  invoiced:  { badge: 'info',      icon: <FileCheck className="w-3 h-3" />,   label: 'Gefactureerd'  },
};

const STATUS_FLOW = ['draft', 'submitted', 'approved', 'invoiced'];

function CreateVariationModal({ onClose, onSave, fieldLogs }) {
  const [description, setDescription] = useState('');
  const [requestedBy, setRequestedBy] = useState('client');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedLog, setSelectedLog] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogSelect = (e) => {
    const id = e.target.value;
    setSelectedLog(id);
    if (id) {
      const log = fieldLogs.find(l => l.id === id);
      if (log && !description) setDescription(log.processedSummary || log.rawNote.slice(0, 120));
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!description.trim()) return;
    setLoading(true);
    await onSave({
      description:   description.trim(),
      requestedBy:   requestedBy,
      estimatedCost: estimatedCost.trim() || null,
      notes:         notes.trim() || null,
      fieldLogId:    selectedLog || null,
    });
    onClose();
    setLoading(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-lg max-h-[90vh] flex flex-col md:rounded-2xl rounded-t-3xl glass-modal"
        initial={{ y: 60, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.97 }}
        transition={spring}
      >
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
        </div>
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0 border-b border-[var(--border-color)]">
          <div>
            <h2 className="font-bold text-[var(--text-primary)] text-[15px]">Meerwerk registreren</h2>
            <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">Registreer werk buiten de oorspronkelijke contractomvang</p>
          </div>
          <motion.button
            onClick={onClose}
            className="p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
            whileTap={{ scale: 0.9 }} transition={spring}
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {fieldLogs.length > 0 && (
            <div>
              <label className="label-caps mb-2 block">
                Vanuit werfnotitie <span className="font-normal normal-case text-[var(--text-tertiary)]">(optioneel)</span>
              </label>
              <select
                value={selectedLog}
                onChange={handleLogSelect}
                className="w-full h-10 border border-[var(--border-color)] bg-[var(--surface-2)] rounded-xl px-4 text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/50 cursor-pointer"
              >
                <option value="">— Selecteer een werfnotitie —</option>
                {fieldLogs.slice(0, 20).map(l => (
                  <option key={l.id} value={l.id}>
                    [{l.type || 'general'}] {(l.processedSummary || l.rawNote).slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label-caps mb-2 block">Omschrijving meerwerk *</label>
            <Textarea
              className="h-24"
              placeholder="bijv. Klant vroeg extra waterproofing voor keldermueren, niet opgenomen in oorspronkelijke omvang…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-caps mb-2 block">Aangevraagd door</label>
              <select
                value={requestedBy}
                onChange={e => setRequestedBy(e.target.value)}
                className="w-full h-10 border border-[var(--border-color)] bg-[var(--surface-2)] rounded-xl px-4 text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/50 cursor-pointer"
              >
                <option value="client">Klant</option>
                <option value="architect">Architect</option>
                <option value="engineer">Ingenieur</option>
                <option value="unforeseen">Onvoorziene omstandigheden</option>
                <option value="unknown">Onbekend</option>
              </select>
            </div>
            <div>
              <label className="label-caps mb-2 block">Geraamde kostprijs</label>
              <Input
                placeholder="bijv. €2.400"
                value={estimatedCost}
                onChange={e => setEstimatedCost(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label-caps mb-2 block">
              Notities <span className="font-normal normal-case text-[var(--text-tertiary)]">(optioneel)</span>
            </label>
            <Textarea
              className="h-16"
              placeholder="Bijkomende details, locatie, materialen…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </form>

        <div className="px-6 py-4 flex gap-3 flex-shrink-0 border-t border-[var(--border-color)]">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuleren</Button>
          <ShimmerButton
            type="button"
            onClick={handleSubmit}
            disabled={loading || !description.trim()}
            className="flex-1 justify-center"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Opslaan…</>
              : <><TrendingUp className="w-4 h-4" /> Meerwerk opslaan</>
            }
          </ShimmerButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

function VariationDetail({ variation, onClose, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(variation.description);
  const [estimatedCost, setEstimatedCost] = useState(variation.estimatedCost || '');
  const [notes, setNotes] = useState(variation.notes || '');

  const currentIdx = STATUS_FLOW.indexOf(variation.status);

  const handleSave = () => {
    onUpdate(variation.id, { description, estimatedCost: estimatedCost || null, notes: notes || null });
    setEditing(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col md:rounded-2xl rounded-t-3xl glass-modal"
        initial={{ y: 60, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.97 }}
        transition={spring}
      >
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
        </div>

        {/* Header */}
        <div className="px-6 py-5 flex-shrink-0 border-b border-[var(--border-color)]">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-mono text-[var(--text-tertiary)]">{variation.number}</span>
                <Badge variant={STATUS_CONFIG[variation.status]?.badge} className="inline-flex items-center gap-1">
                  {STATUS_CONFIG[variation.status]?.icon} {STATUS_CONFIG[variation.status]?.label}
                </Badge>
              </div>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                Aangevraagd door <span className="font-semibold capitalize">{variation.requestedBy || '—'}</span>
                {variation.estimatedCost && <> · Geraamd: <span className="font-semibold">{variation.estimatedCost}</span></>}
              </p>
            </div>
            <motion.button
              onClick={onClose}
              className="p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer ml-4 flex-shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
              whileTap={{ scale: 0.9 }} transition={spring}
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Status stepper */}
        <div className="px-6 py-3 flex-shrink-0 flex items-center gap-0.5 flex-wrap border-b border-[var(--border-color)] bg-[var(--surface-2)]">
          {STATUS_FLOW.map((s, i) => (
            <React.Fragment key={s}>
              <motion.button
                onClick={() => onUpdate(variation.id, { status: s })}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors duration-150 cursor-pointer',
                  variation.status === s
                    ? 'bg-brand text-white font-semibold'
                    : i < currentIdx
                    ? 'text-brand bg-brand/10'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-white'
                )}
                whileTap={{ scale: 0.95 }} transition={spring}
              >
                {STATUS_CONFIG[s]?.icon}
                <span>{STATUS_CONFIG[s]?.label}</span>
              </motion.button>
              {i < STATUS_FLOW.length - 1 && (
                <ChevronRight className="w-3 h-3 text-[var(--text-tertiary)] mx-0.5 flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {editing ? (
            <>
              <div>
                <label className="label-caps mb-2 block">Omschrijving</label>
                <Textarea className="h-28" value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-caps mb-2 block">Geraamde kostprijs</label>
                  <Input value={estimatedCost} onChange={e => setEstimatedCost(e.target.value)} placeholder="bijv. €2.400" />
                </div>
              </div>
              <div>
                <label className="label-caps mb-2 block">Notities</label>
                <Textarea className="h-16" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl p-5 bg-[var(--surface-2)] border border-[var(--border-color)]">
                <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{variation.description}</p>
              </div>
              {variation.notes && (
                <div>
                  <p className="label-caps mb-2">Notities</p>
                  <p className="text-[13px] text-[var(--text-secondary)]">{variation.notes}</p>
                </div>
              )}
              <div className="flex gap-6 text-[12px]">
                <div>
                  <span className="label-caps block mb-0.5">Geregistreerd</span>
                  <span className="text-[var(--text-secondary)]">{new Date(variation.createdAt).toLocaleDateString('nl-BE')}</span>
                </div>
                {variation.estimatedCost && (
                  <div>
                    <span className="label-caps block mb-0.5">Geraamde kostprijs</span>
                    <span className="text-[var(--text-primary)] font-semibold">{variation.estimatedCost}</span>
                  </div>
                )}
                <div>
                  <span className="label-caps block mb-0.5">Aangevraagd door</span>
                  <span className="text-[var(--text-secondary)] capitalize">{variation.requestedBy || '—'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex gap-2 flex-wrap items-center flex-shrink-0 border-t border-[var(--border-color)]">
          {editing ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(false)}>Annuleren</Button>
              <Button onClick={handleSave}>Opslaan</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Edit3 className="w-3.5 h-3.5" /> Bewerken
              </Button>
              {variation.status !== 'approved' && (
                <ShimmerButton type="button" onClick={() => onUpdate(variation.id, { status: 'approved' })} className="px-4 py-2">
                  <CheckCircle className="w-3.5 h-3.5" /> Goedkeuren
                </ShimmerButton>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { onDelete(variation.id); onClose(); }}
                className="ml-auto text-red-400 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Verwijderen
              </Button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Variations({ variations, fieldLogs, onAdd, onUpdate, onDelete }) {
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected]     = useState(null);
  const [filter, setFilter]         = useState('all');

  const filters  = ['all', 'draft', 'submitted', 'approved', 'invoiced'];
  const filtered = filter === 'all' ? variations : variations.filter(v => v.status === filter);

  const totalApproved = variations
    .filter(v => v.status === 'approved' || v.status === 'invoiced')
    .reduce((sum, v) => {
      const num = parseFloat((v.estimatedCost || '').replace(/[^0-9.]/g, ''));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);

  const totalPending = variations
    .filter(v => v.status === 'draft' || v.status === 'submitted')
    .reduce((sum, v) => {
      const num = parseFloat((v.estimatedCost || '').replace(/[^0-9.]/g, ''));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <motion.div
        className="flex items-start justify-between mb-6"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      >
        <div>
          <h1 className="title-xl">Meerwerken</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">Werk buiten de oorspronkelijke contractomvang.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> Meerwerk registreren
        </Button>
      </motion.div>

      {/* Budget summary strip */}
      {variations.length > 0 && (
        <motion.div
          className="grid grid-cols-3 gap-3 mb-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
        >
          {[
            { label: 'Totaal meerwerken',         value: variations.length, suffix: '', color: 'text-[var(--text-primary)]' },
            { label: 'Goedgekeurde waarde',        value: totalApproved > 0 ? `€${totalApproved.toLocaleString()}` : '—', suffix: '', color: 'text-[#0c7a5e]' },
            { label: 'Wachtend op goedkeuring',    value: totalPending > 0  ? `€${totalPending.toLocaleString()}`  : '—', suffix: '', color: 'text-amber-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="glass-card px-4 py-3">
              <p className="label-caps mb-1">{label}</p>
              <p className={cn('text-[18px] font-bold', color)}>{value}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* Filter pills */}
      <motion.div
        className="flex gap-1 p-1 rounded-full bg-[var(--surface-2)] mb-5 flex-wrap w-fit"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
      >
        {filters.map(f => (
          <motion.button
            key={f}
            onClick={() => setFilter(f)}
            className={cn('filter-pill', filter === f ? 'filter-pill-active' : 'filter-pill-inactive')}
            whileTap={{ scale: 0.95 }} transition={spring}
          >
            {f === 'all'
              ? `Alle (${variations.length})`
              : `${STATUS_CONFIG[f]?.label} (${variations.filter(v => v.status === f).length})`}
          </motion.button>
        ))}
      </motion.div>

      {/* List */}
      <motion.div className="space-y-3" layout>
        <AnimatePresence>
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center py-16"
            >
              <div className="w-14 h-14 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="w-6 h-6 text-[var(--text-tertiary)]" />
              </div>
              <p className="text-[13px] font-medium text-[var(--text-secondary)]">
                {filter === 'all' ? 'Nog geen meerwerken geregistreerd.' : `Geen ${STATUS_CONFIG[filter]?.label?.toLowerCase()} meerwerken.`}
              </p>
              {filter === 'all' && (
                <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
                  Ze worden automatisch gedetecteerd uit werfnotities of voeg ze hierboven manueel toe.
                </p>
              )}
            </motion.div>
          ) : (
            filtered.map(v => (
              <motion.button
                key={v.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={spring}
                onClick={() => setSelected(v)}
                style={{ borderRadius: 16 }}
                className="glass-card w-full text-left px-5 py-4 cursor-pointer group"
                whileHover={{ y: -1, borderRadius: 22, boxShadow: '0 0 0 1px rgba(255,255,255,0.9), 0 8px 32px rgba(0,0,0,0.09), inset 0 1px 0 rgba(255,255,255,0.9)' }}
                whileTap={{ scale: 0.99 }}
              >
                <div className="flex items-center gap-4">
                  <span className="text-[11px] font-mono text-[var(--text-tertiary)] flex-shrink-0 w-16 truncate">{v.number}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--text-primary)] text-[13px] truncate group-hover:text-brand transition-colors duration-150">
                      {v.description}
                    </p>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                      {new Date(v.createdAt).toLocaleDateString()}
                      {v.requestedBy && ` · ${v.requestedBy}`}
                      {v.estimatedCost && ` · ${v.estimatedCost}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={STATUS_CONFIG[v.status]?.badge} className="inline-flex items-center gap-1">
                      {STATUS_CONFIG[v.status]?.icon} {STATUS_CONFIG[v.status]?.label}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-brand transition-colors duration-150" />
                  </div>
                </div>
              </motion.button>
            ))
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {showCreate && (
          <CreateVariationModal fieldLogs={fieldLogs} onClose={() => setShowCreate(false)} onSave={onAdd} />
        )}
        {selected && (
          <VariationDetail
            variation={variations.find(v => v.id === selected.id) || selected}
            onClose={() => setSelected(null)}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
