import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Circle, Clock, CheckCircle2, CheckSquare, Trash2, ChevronDown,
  User, Calendar, CheckCheck, Tag, Search, X,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Progress } from '../components/ui/progress';
import { cn } from '../lib/utils';

const PRIORITY = {
  high:   { dot: 'bg-red-400',     badge: 'destructive' },
  medium: { dot: 'bg-amber-400',   badge: 'warning'     },
  low:    { dot: 'bg-[#7669ff]', badge: 'success'      },
};

// Aligned with field log types
const CATEGORIES = ['delay', 'safety', 'progress', 'material', 'rfi', 'general'];

const CATEGORY_STYLE = {
  delay:    { cls: 'bg-red-50 text-red-600 border-red-200',            label: 'Vertraging' },
  safety:   { cls: 'bg-amber-50 text-amber-700 border-amber-200',      label: 'Veiligheid' },
  progress: { cls: 'bg-[#e8fbf5] text-[#075e48] border-[#88f0d4]', label: 'Voortgang' },
  material: { cls: 'bg-blue-50 text-blue-700 border-blue-200',         label: 'Materiaal'  },
  rfi:      { cls: 'bg-purple-50 text-purple-700 border-purple-200',   label: 'Meerwerk'   },
  general:  { cls: 'bg-slate-100 text-slate-600 border-slate-200',     label: 'Algemeen'   },
};

function CategoryBadge({ category }) {
  if (!category) return null;
  const s = CATEGORY_STYLE[category];
  if (!s) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
      <Tag className="w-2.5 h-2.5" />{category}
    </span>
  );
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', s.cls)}>
      <Tag className="w-2.5 h-2.5" />{s.label}
    </span>
  );
}

function memberInitials(email) {
  if (!email) return '?';
  const local = email.split('@')[0];
  const parts = local.split(/[._-]/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : local.slice(0, 2).toUpperCase();
}

function MemberAvatar({ email, size = 'sm' }) {
  const sz = size === 'sm' ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]';
  return (
    <span className={`${sz} rounded-full bg-brand/15 text-brand font-bold flex items-center justify-center flex-shrink-0`}>
      {memberInitials(email)}
    </span>
  );
}

function MemberDropdown({ value, onChange, members, placeholder = 'Toewijzen aan…' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = members.find(m => m.email === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border border-[var(--border-color)] bg-white text-[12px] text-left hover:border-brand/40 transition-colors focus:outline-none focus:border-brand/40"
      >
        {selected
          ? <><MemberAvatar email={selected.email} /><span className="flex-1 truncate text-[var(--text-primary)]">{selected.email}</span></>
          : <><User className="w-4 h-4 text-[var(--text-tertiary)]" /><span className="flex-1 text-[var(--text-tertiary)]">{placeholder}</span></>
        }
        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-tertiary)] flex-shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute left-0 top-full mt-1 z-40 w-full glass-card rounded-xl shadow-lg overflow-hidden"
          >
            {value && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-500 hover:bg-red-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Toewijzing verwijderen
              </button>
            )}
            {members.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-[var(--text-tertiary)] italic">Nog geen leden — voeg ze toe in Projectinstellingen.</div>
            ) : (
              members.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onChange(m.email); setOpen(false); }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-[12px] transition-colors',
                    m.email === value ? 'bg-brand/10 text-brand font-semibold' : 'text-[var(--text-primary)] hover:bg-[var(--surface-2)]'
                  )}
                >
                  <MemberAvatar email={m.email} />
                  <span className="truncate">{m.email}</span>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AddTaskForm({ onAdd, onCancel, members }) {
  const [task, setTask]         = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate]   = useState('');
  const [notes, setNotes]       = useState('');
  const [category, setCategory] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!task.trim()) return;
    onAdd({ task: task.trim(), assignee, priority, dueDate, notes: notes.trim(), category: category || null });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="glass-card rounded-2xl overflow-hidden mb-4 border-l-[3px] border-l-brand"
    >
      <div className="p-5">
        <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-4">Nieuwe taak</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input placeholder="Taakomschrijving *" value={task} onChange={e => setTask(e.target.value)} required autoFocus />

          <div className="grid grid-cols-2 gap-3">
            <MemberDropdown value={assignee} onChange={setAssignee} members={members} />
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
              <Input type="date" className="pl-9" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Category — matches field log types */}
          <div className="space-y-2">
            <span className="label-caps">Categorie:</span>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => {
                const s = CATEGORY_STYLE[c];
                return (
                  <motion.button
                    key={c}
                    type="button"
                    onClick={() => setCategory(category === c ? '' : c)}
                    whileTap={{ scale: 0.94 }}
                    className={cn(
                      'text-[11px] px-2.5 py-1 rounded-full font-semibold cursor-pointer transition-all border',
                      category === c ? cn(s.cls) : 'bg-[var(--surface-2)] text-[var(--text-tertiary)] border-transparent hover:border-[var(--border-color)]'
                    )}
                  >
                    {s.label}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label-caps">Prioriteit:</span>
            {['low', 'medium', 'high'].map(p => (
              <motion.button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                whileTap={{ scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className={cn(
                  'text-[11px] px-3 py-1.5 rounded-full font-semibold cursor-pointer transition-all duration-150',
                  priority === p
                    ? p === 'high'   ? 'bg-red-50 text-red-600 shadow-sm'
                    : p === 'medium' ? 'bg-amber-50 text-amber-700 shadow-sm'
                    :                  'bg-[#e8fbf5] text-[#075e48] shadow-sm'
                    : 'bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:bg-[var(--surface-3)]'
                )}
              >
                {{ low: 'Laag', medium: 'Gemiddeld', high: 'Hoog' }[p]}
              </motion.button>
            ))}
          </div>

          <Textarea className="h-16" placeholder="Notities (optioneel)" value={notes} onChange={e => setNotes(e.target.value)} />

          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>Annuleren</Button>
            <Button type="submit" disabled={!task.trim()} className="flex-1">
              <Plus className="w-4 h-4" /> Taak toevoegen
            </Button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

const STATUS_OPTIONS = [
  { id: 'pending',     label: 'Openstaand',    Icon: Circle,       cls: 'text-[var(--text-tertiary)]' },
  { id: 'in_progress', label: 'In uitvoering', Icon: Clock,        cls: 'text-amber-500'              },
  { id: 'completed',   label: 'Voltooid',      Icon: CheckCircle2, cls: 'text-brand'                  },
];

const PRIORITY_OPTIONS = [
  { id: 'high',   label: 'Hoog',     dot: 'bg-red-400',     cls: 'text-red-600'     },
  { id: 'medium', label: 'Gemiddeld', dot: 'bg-amber-400',   cls: 'text-amber-600'   },
  { id: 'low',    label: 'Laag',     dot: 'bg-[#7669ff]', cls: 'text-[#0c7a5e]' },
];

function TaskRow({ item, onUpdate, onDelete, members }) {
  const [expanded, setExpanded]         = useState(false);
  const [editingDate, setEditingDate]   = useState(false);
  const [editingOwner, setEditingOwner] = useState(false);
  const [editingCat, setEditingCat]     = useState(false);
  const [editingStatus, setEditingStatus]     = useState(false);
  const [editingPriority, setEditingPriority] = useState(false);
  const dateRef = useRef(null);
  const completed = item.status === 'completed';

  const handleDateChange = (e) => {
    onUpdate(item.id, { dueDate: e.target.value });
    setEditingDate(false);
  };

  const handleCategoryPick = (cat) => {
    onUpdate(item.id, { category: item.category === cat ? null : cat });
    setEditingCat(false);
  };

  const isOverdue = !completed && item.dueDate && new Date(item.dueDate) < new Date();
  const currentStatus   = STATUS_OPTIONS.find(s => s.id === item.status) || STATUS_OPTIONS[0];
  const currentPriority = PRIORITY_OPTIONS.find(p => p.id === item.priority) || PRIORITY_OPTIONS[1];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      style={{ borderRadius: 16 }}
      className={cn('glass-card', !completed && 'transition-shadow')}
      whileHover={completed ? {} : { y: -1, borderRadius: 22 }}
      whileTap={{ borderRadius: 14 }}
    >
      <div className={cn('px-4 py-3.5 flex items-center gap-3', completed && 'opacity-60')}>

        {/* ── Status dropdown ───────────────────────────────── */}
        <span className="relative flex-shrink-0" onMouseLeave={() => setEditingStatus(false)}>
          <motion.button
            onClick={() => setEditingStatus(v => !v)}
            aria-label={`Status: ${item.status}`}
            className="cursor-pointer p-0.5"
            whileTap={{ scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 600, damping: 20 }}
          >
            {completed
              ? <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}>
                  <CheckCircle2 className="w-5 h-5 text-brand" />
                </motion.div>
              : item.status === 'in_progress'
              ? <Clock className="w-5 h-5 text-amber-500" />
              : <Circle className="w-5 h-5 text-[var(--text-tertiary)]" />
            }
          </motion.button>
          <AnimatePresence>
            {editingStatus && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="absolute left-0 top-7 z-40 glass-card rounded-xl shadow-lg overflow-hidden min-w-[148px]"
              >
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { onUpdate(item.id, { status: s.id }); setEditingStatus(false); }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors',
                      item.status === s.id
                        ? 'bg-brand/8 font-semibold ' + s.cls
                        : 'text-[var(--text-primary)] hover:bg-[var(--surface-2)]'
                    )}
                  >
                    <s.Icon className={cn('w-3.5 h-3.5 flex-shrink-0', item.status === s.id ? s.cls : 'text-[var(--text-tertiary)]')} />
                    {s.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </span>

        {/* ── Priority dropdown ─────────────────────────────── */}
        <span className="relative flex-shrink-0" onMouseLeave={() => setEditingPriority(false)}>
          <motion.button
            type="button"
            onClick={() => !completed && setEditingPriority(v => !v)}
            whileTap={{ scale: 0.85 }}
            className={cn('w-2 h-2 rounded-full block', currentPriority.dot, !completed && 'cursor-pointer')}
            title={`Prioriteit: ${currentPriority.label}`}
          />
          <AnimatePresence>
            {editingPriority && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="absolute left-0 top-5 z-40 glass-card rounded-xl shadow-lg overflow-hidden min-w-[120px]"
              >
                {PRIORITY_OPTIONS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onUpdate(item.id, { priority: p.id }); setEditingPriority(false); }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors',
                      item.priority === p.id
                        ? 'bg-brand/8 font-semibold ' + p.cls
                        : 'text-[var(--text-primary)] hover:bg-[var(--surface-2)]'
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', p.dot)} />
                    {p.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </span>

        <div className="flex-1 min-w-0">
          <p className={cn('text-[13px] font-medium leading-snug', completed ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]')}>
            {item.task}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">

            {/* Inline-editable category */}
            <span className="relative">
              <motion.button
                type="button"
                onClick={() => !completed && setEditingCat(v => !v)}
                whileTap={{ scale: 0.95 }}
                className={cn(!completed && 'cursor-pointer')}
              >
                {item.category
                  ? <CategoryBadge category={item.category} />
                  : !completed && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-dashed border-[var(--border-color)] text-[var(--text-tertiary)] opacity-60 hover:opacity-100 transition-opacity">
                      <Tag className="w-2.5 h-2.5" />Categorie
                    </span>
                  )}
              </motion.button>

              <AnimatePresence>
                {editingCat && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 4 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    className="absolute left-0 top-6 z-30 glass-card rounded-xl p-2 shadow-lg flex flex-wrap gap-1.5 min-w-[180px]"
                    onMouseLeave={() => setEditingCat(false)}
                  >
                    {item.category && (
                      <button
                        type="button"
                        onClick={() => { onUpdate(item.id, { category: null }); setEditingCat(false); }}
                        className="w-full text-left text-[10px] px-2 py-1 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] transition-colors"
                      >
                        Categorie wissen
                      </button>
                    )}
                    {CATEGORIES.map(c => {
                      const s = CATEGORY_STYLE[c];
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleCategoryPick(c)}
                          className={cn(
                            'text-[11px] px-2.5 py-1 rounded-full font-semibold cursor-pointer transition-all border',
                            item.category === c ? s.cls : 'bg-[var(--surface-2)] text-[var(--text-tertiary)] border-transparent hover:border-[var(--border-color)]'
                          )}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </span>

            {/* Inline-editable assignee */}
            {!completed ? (
              <span className="relative">
                {editingOwner ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="absolute left-0 top-6 z-30 w-56"
                    onMouseLeave={() => setEditingOwner(false)}
                  >
                    <MemberDropdown
                      value={item.assignee || ''}
                      onChange={(email) => { onUpdate(item.id, { assignee: email }); setEditingOwner(false); }}
                      members={members}
                    />
                  </motion.div>
                ) : null}
                <motion.button
                  type="button"
                  onClick={() => setEditingOwner(v => !v)}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-1 text-[11px] rounded-lg px-1.5 py-0.5 transition-colors cursor-pointer hover:bg-[var(--surface-2)]"
                >
                  {item.assignee
                    ? <><MemberAvatar email={item.assignee} /><span className="text-[var(--text-tertiary)]">{item.assignee.split('@')[0]}</span></>
                    : <><User className="w-3 h-3 text-[var(--text-tertiary)] opacity-50" /><span className="italic text-[var(--text-tertiary)] opacity-50">Verantwoordelijke</span></>
                  }
                </motion.button>
              </span>
            ) : (
              item.assignee && (
                <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                  <MemberAvatar email={item.assignee} />
                  {item.assignee.split('@')[0]}
                </span>
              )
            )}

            {/* Inline editable date */}
            <span className="relative flex items-center">
              {editingDate ? (
                <input
                  ref={dateRef}
                  type="date"
                  autoFocus
                  defaultValue={item.dueDate || ''}
                  onChange={handleDateChange}
                  onBlur={() => setEditingDate(false)}
                  className="text-[11px] border border-brand/40 rounded-lg px-2 py-0.5 outline-none bg-white text-[var(--text-primary)] cursor-pointer"
                />
              ) : (
                <motion.button
                  type="button"
                  onClick={() => !completed && setEditingDate(true)}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    'flex items-center gap-1 text-[11px] rounded-lg px-1.5 py-0.5 transition-colors',
                    completed ? 'cursor-default' : 'cursor-pointer hover:bg-[var(--surface-2)]',
                    item.dueDate
                      ? isOverdue ? 'text-red-500 font-medium' : 'text-[var(--text-tertiary)]'
                      : 'text-[var(--text-tertiary)] opacity-50'
                  )}
                >
                  <Calendar className="w-3 h-3" />
                  {item.dueDate
                    ? new Date(item.dueDate).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
                    : !completed && <span className="italic">Datum instellen</span>}
                </motion.button>
              )}
            </span>
          </div>
        </div>

        {item.notes && (
          <motion.button
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Inklappen' : 'Notities tonen'}
            className="p-1.5 rounded-full hover:bg-[var(--surface-2)] text-[var(--text-tertiary)] transition-colors cursor-pointer"
            whileTap={{ scale: 0.9 }}
          >
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
              <ChevronDown className="w-4 h-4" />
            </motion.div>
          </motion.button>
        )}

        <motion.button
          onClick={() => onDelete(item.id)}
          aria-label="Taak verwijderen"
          className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
          whileTap={{ scale: 0.9 }}
        >
          <Trash2 className="w-4 h-4" />
        </motion.button>
      </div>

      <AnimatePresence>
        {expanded && item.notes && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden rounded-b-2xl"
          >
            <div className="px-[52px] pb-3.5 pt-3 border-t border-[var(--border-color)] bg-[var(--surface-2)] rounded-b-2xl">
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{item.notes}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FilterDropdown({ label, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const handleToggle = () => setOpen(v => !v);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find(o => o.id === value);
  const isActive = value !== 'all';

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border font-medium transition-colors cursor-pointer select-none',
          isActive
            ? 'bg-brand/8 border-brand/30 text-brand'
            : 'bg-[var(--surface-2)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-brand/30 hover:text-[var(--text-primary)]'
        )}
      >
        <span className="text-[10px] font-bold uppercase tracking-wide opacity-50">{label}</span>
        <span className={cn('font-semibold', !isActive && 'text-[var(--text-tertiary)] font-normal')}>
          {isActive ? selected?.label : 'Alle'}
        </span>
        {isActive && selected?.count !== undefined && (
          <span className="opacity-55 tabular-nums font-normal">{selected.count}</span>
        )}
        <ChevronDown className={cn('w-3 h-3 flex-shrink-0 transition-transform duration-150', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0 }}
            className="z-[9999] glass-card rounded-xl shadow-lg overflow-hidden min-w-[160px]"
          >
            {options.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={cn(
                  'w-full flex items-center justify-between gap-3 px-3 py-2 text-[12px] transition-colors',
                  value === o.id
                    ? 'bg-brand/8 text-brand font-semibold'
                    : 'text-[var(--text-primary)] hover:bg-[var(--surface-2)]'
                )}
              >
                <span className="flex items-center gap-2">
                  {o.dot  && <span className={cn('w-2 h-2 rounded-full flex-shrink-0', o.dot)} />}
                  {o.Icon && <o.Icon className={cn('w-3.5 h-3.5 flex-shrink-0', value === o.id ? '' : 'text-[var(--text-tertiary)]')} />}
                  {o.label}
                </span>
                {o.count !== undefined && (
                  <span className="opacity-50 tabular-nums text-[11px]">{o.count}</span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PunchList({ items, onAdd, onUpdate, onDelete, projectMembers = [] }) {
  const [showForm, setShowForm]             = useState(false);
  const [search, setSearch]                 = useState('');
  const [statusFilter, setStatusFilter]     = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [ownerFilter, setOwnerFilter]       = useState('all');
  const [sortBy, setSortBy]                 = useState('created');


  const statusOptions = [
    { id: 'all',         label: 'Alle',          count: items.length },
    { id: 'pending',     label: 'Openstaand',    count: items.filter(i => i.status === 'pending').length,     Icon: Circle       },
    { id: 'in_progress', label: 'In uitvoering', count: items.filter(i => i.status === 'in_progress').length, Icon: Clock        },
    { id: 'completed',   label: 'Voltooid',      count: items.filter(i => i.status === 'completed').length,   Icon: CheckCircle2 },
  ];

  const priorityOptions = [
    { id: 'all', label: 'Alle' },
    ...['high', 'medium', 'low'].filter(p => items.some(i => i.priority === p)).map(p => ({
      id: p,
      label: { high: 'Hoog', medium: 'Gemiddeld', low: 'Laag' }[p],
      count: items.filter(i => i.priority === p).length,
      dot: PRIORITY[p].dot,
    })),
  ];

  const categoryOptions = [
    { id: 'all', label: 'Alle' },
    ...CATEGORIES.filter(c => items.some(i => i.category === c)).map(c => ({
      id: c,
      label: CATEGORY_STYLE[c].label,
      count: items.filter(i => i.category === c).length,
    })),
  ];

  const ownerOptions = [
    { id: 'all', label: 'Alle' },
    ...[...new Set(items.map(i => i.assignee).filter(Boolean))].sort().map(owner => ({
      id: owner,
      label: owner.split('@')[0],
      count: items.filter(i => i.assignee === owner).length,
    })),
  ];

  const filtered = items
    .filter(i => statusFilter === 'all'   || i.status   === statusFilter)
    .filter(i => priorityFilter === 'all' || i.priority === priorityFilter)
    .filter(i => categoryFilter === 'all' || i.category === categoryFilter)
    .filter(i => ownerFilter === 'all'    || i.assignee === ownerFilter)
    .filter(i => !search.trim() || i.task.toLowerCase().includes(search.trim().toLowerCase()) || (i.assignee || '').toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'priority') {
        const o = { high: 0, medium: 1, low: 2 };
        return (o[a.priority] || 1) - (o[b.priority] || 1);
      }
      if (sortBy === 'category') return (a.category || 'zzz').localeCompare(b.category || 'zzz');
      if (sortBy === 'dueDate')  return new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999');
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  const activeFilterCount = [
    statusFilter !== 'all',
    priorityFilter !== 'all',
    categoryFilter !== 'all',
    ownerFilter !== 'all',
    search.trim() !== '',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setStatusFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
    setOwnerFilter('all');
    setSearch('');
  };

  const pending = items.filter(i => i.status !== 'completed').length;
  const done    = items.filter(i => i.status === 'completed').length;
  const pct     = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        className="flex items-start justify-between mb-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div>
          <h1 className="title-xl">Takenlijst</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">{pending} openstaand · {done} voltooid</p>
        </div>
        <Button onClick={() => setShowForm(s => !s)}>
          <Plus className="w-4 h-4" /> Taak toevoegen
        </Button>
      </motion.div>

      {/* Progress */}
      {items.length > 0 && (
        <motion.div
          className="glass-card rounded-2xl p-5 mb-5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCheck className="w-4 h-4 text-brand" />
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">Voortgang</span>
            </div>
            <span className="text-[13px] font-bold text-brand tabular-nums">{pct}%</span>
          </div>
          <Progress value={pct} />
        </motion.div>
      )}

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <AddTaskForm
            onAdd={(item) => { onAdd(item); setShowForm(false); }}
            onCancel={() => setShowForm(false)}
            members={projectMembers}
          />
        )}
      </AnimatePresence>

      {/* ── Filter bar ──────────────────────────────────────── */}
      <motion.div
        className="glass-card rounded-2xl px-3 py-2.5 mb-4"
        style={{ overflow: 'visible', position: 'relative', zIndex: 20 }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)] pointer-events-none" />
            <input
              type="text"
              placeholder="Zoeken…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-[12px] pl-8 pr-3 py-1.5 rounded-full bg-[var(--surface-2)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-brand/40 transition-colors"
            />
          </div>

          {/* Filter dropdowns */}
          <FilterDropdown label="Status"       value={statusFilter}   onChange={setStatusFilter}   options={statusOptions}   />
          <FilterDropdown label="Prioriteit"   value={priorityFilter} onChange={setPriorityFilter} options={priorityOptions} />
          {categoryOptions.length > 1 && (
            <FilterDropdown label="Categorie" value={categoryFilter} onChange={setCategoryFilter} options={categoryOptions} />
          )}
          {ownerOptions.length > 2 && (
            <FilterDropdown label="Verantw." value={ownerFilter} onChange={setOwnerFilter} options={ownerOptions} />
          )}

          {/* Divider */}
          <span className="w-px h-5 bg-[var(--border-color)] flex-shrink-0" />

          {/* Sort */}
          <FilterDropdown
            label="Sorteren"
            value={sortBy}
            onChange={setSortBy}
            options={[
              { id: 'created',  label: 'Nieuwste eerst' },
              { id: 'priority', label: 'Op prioriteit'  },
              { id: 'category', label: 'Op categorie'   },
              { id: 'dueDate',  label: 'Op einddatum'   },
            ]}
          />

          {/* Clear */}
          <AnimatePresence>
            {activeFilterCount > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={resetFilters}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-full bg-red-50 text-red-500 font-semibold cursor-pointer hover:bg-red-100 transition-colors flex-shrink-0"
                whileTap={{ scale: 0.93 }}
              >
                <X className="w-3 h-3" /> Wissen ({activeFilterCount})
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Task list */}
      <motion.div className="space-y-2" layout>
        <AnimatePresence>
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-20"
            >
              <div className="w-16 h-16 bg-[var(--surface-2)] rounded-3xl flex items-center justify-center mx-auto mb-4">
                <CheckSquare className="w-7 h-7 text-[var(--text-tertiary)]" />
              </div>
              <p className="text-[14px] font-medium text-[var(--text-secondary)]">
                {activeFilterCount === 0 ? 'Nog geen taken' : 'Geen overeenkomende taken'}
              </p>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
                {activeFilterCount === 0 ? 'Voeg hierboven uw eerste taak toe.' : 'Probeer een ander filter.'}
              </p>
            </motion.div>
          ) : (
            filtered.map(item => (
              <TaskRow key={item.id} item={item} onUpdate={onUpdate} onDelete={onDelete} members={projectMembers} />
            ))
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
