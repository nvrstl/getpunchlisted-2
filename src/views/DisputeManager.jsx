import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, Clock, Wrench, Star, CreditCard, HelpCircle,
  ChevronRight, RefreshCw, Plus, X, Mail, Calendar, Loader2,
  CheckCircle2, ChevronDown, ChevronUp, MessageSquare, Package, FileText,
  Send, ShieldCheck, Archive, RotateCcw, Download,
} from 'lucide-react';
import { cn } from '../lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_META = {
  timing:    { label: 'Timing',    icon: Clock,        color: 'bg-amber-100 text-amber-700 border-amber-200'    },
  meerwerk:  { label: 'Meerwerk',  icon: Wrench,       color: 'bg-blue-100 text-blue-700 border-blue-200'       },
  kwaliteit: { label: 'Kwaliteit', icon: Star,         color: 'bg-purple-100 text-purple-700 border-purple-200' },
  betaling:  { label: 'Betaling',  icon: CreditCard,   color: 'bg-red-100 text-red-700 border-red-200'          },
  other:     { label: 'Overig',    icon: HelpCircle,   color: 'bg-gray-100 text-gray-600 border-gray-200'       },
};

const STATUS_META = {
  open:          { label: 'Open',             color: 'bg-blue-100 text-blue-700'   },
  awaiting_pm:   { label: 'Wacht op PM',      color: 'bg-amber-100 text-amber-700' },
  draft_ready:   { label: 'Draft klaar',      color: 'bg-yellow-100 text-yellow-700' },
  under_review:  { label: 'In review',        color: 'bg-purple-100 text-purple-700' },
  sent:          { label: 'Verzonden',        color: 'bg-[#d4f7ec] text-[#075e48]' },
  archived:      { label: 'Gearchiveerd',     color: 'bg-gray-100 text-gray-500'   },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeChip({ type }) {
  const meta = TYPE_META[type] || TYPE_META.other;
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border', meta.color)}>
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.open;
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold', meta.color)}>
      {meta.label}
    </span>
  );
}

function QuestionItem({ question, onSave }) {
  const [text, setText] = useState(question.answer || '');
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved'

  const save = async () => {
    if (text === (question.answer || '')) return;
    setSaveStatus('saving');
    await onSave(question.id, text);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(null), 2000);
  };

  return (
    <div>
      <p className="text-[12px] font-medium text-[var(--text-secondary)] leading-snug mb-1.5">
        {question.question}
      </p>
      <div className="relative">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={save}
          rows={2}
          placeholder="Uw antwoord…"
          className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/25 resize-none transition-colors"
        />
        {saveStatus && (
          <span className={cn(
            'absolute right-2.5 bottom-2 text-[10px] font-medium pointer-events-none',
            saveStatus === 'saving' ? 'text-[var(--text-tertiary)]' : 'text-[#0c7a5e]'
          )}>
            {saveStatus === 'saving' ? 'Opslaan…' : '✓ Opgeslagen'}
          </span>
        )}
      </div>
    </div>
  );
}

const EVIDENCE_TYPE_META = {
  field_log: { label: 'Werfnotitie', color: 'bg-amber-100 text-amber-700'   },
  rfi:       { label: 'Meerwerk',    color: 'bg-blue-100 text-blue-700'     },
  variation: { label: 'Variatie',    color: 'bg-purple-100 text-purple-700' },
};

function EvidenceItem({ item, onRemove }) {
  const meta = EVIDENCE_TYPE_META[item.sourceType] || { label: item.sourceType, color: 'bg-gray-100 text-gray-600' };
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-[var(--border-color)]/40 last:border-0">
      <span className={cn('flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold mt-0.5', meta.color)}>
        {meta.label}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-[var(--text-primary)] leading-snug truncate">{item.label}</p>
        {item.relevanceNote && (
          <p className="text-[11px] text-[var(--text-tertiary)] leading-snug mt-0.5 line-clamp-2">{item.relevanceNote}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(item.id)}
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function DisputePointCard({ point, questions, evidence, onReconstruct, reconstructing, onGenerateQuestions, generatingQuestions, onAnswerQuestion, onCollectEvidence, collectingEvidence, onRemoveEvidence, onGenerateDraft, generatingDraft, onSaveDraft }) {
  const [timelineOpen, setTimelineOpen] = useState(!!point.timeline_reconstruction);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(!!point.draftResponse);
  const [draftText, setDraftText] = useState(point.draftResponse || '');
  const [draftSaveStatus, setDraftSaveStatus] = useState(null);

  useEffect(() => {
    if (questions.length > 0) setQuestionsOpen(true);
  }, [questions.length]);

  useEffect(() => {
    if (evidence.length > 0) setEvidenceOpen(true);
  }, [evidence.length]);

  useEffect(() => {
    if (point.draftResponse) {
      setDraftText(point.draftResponse);
      setDraftOpen(true);
    }
  }, [point.draftResponse]);

  const saveDraft = async () => {
    if (draftText === (point.draftResponse || '')) return;
    setDraftSaveStatus('saving');
    await onSaveDraft(point.id, draftText);
    setDraftSaveStatus('saved');
    setTimeout(() => setDraftSaveStatus(null), 2000);
  };

  const answeredCount = questions.filter(q => q.answer?.trim()).length;

  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden bg-white/60">
      {/* Point header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <TypeChip type={point.type} />
        <p className="flex-1 text-[13px] text-[var(--text-secondary)] leading-snug line-clamp-1">
          {point.description || '—'}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          {point.timeline_reconstruction && (
            <button
              onClick={() => setTimelineOpen(v => !v)}
              className="text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] flex items-center gap-1 cursor-pointer"
            >
              Tijdlijn
              {timelineOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          {questions.length > 0 && (
            <button
              onClick={() => setQuestionsOpen(v => !v)}
              className={cn(
                'text-[11px] font-medium flex items-center gap-1 cursor-pointer',
                answeredCount === questions.length
                  ? 'text-[#0c7a5e] hover:text-[#075e48]'
                  : 'text-indigo-600 hover:text-indigo-700'
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {answeredCount}/{questions.length}
              {questionsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          {evidence.length > 0 && (
            <button
              onClick={() => setEvidenceOpen(v => !v)}
              className="text-[11px] font-medium text-[#0c7a5e] hover:text-[#075e48] flex items-center gap-1 cursor-pointer"
            >
              <Package className="w-3.5 h-3.5" />
              {evidence.length}
              {evidenceOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          {point.draftResponse && (
            <button
              onClick={() => setDraftOpen(v => !v)}
              className="text-[11px] font-medium text-yellow-600 hover:text-yellow-700 flex items-center gap-1 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              Concept
              {draftOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          <button
            onClick={() => onReconstruct(point.id)}
            disabled={reconstructing}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer',
              reconstructing
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-brand/10 text-brand hover:bg-brand/20'
            )}
          >
            {reconstructing
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Bezig…</>
              : <><RefreshCw className="w-3.5 h-3.5" /> {point.timeline_reconstruction ? 'Herreconstrueer' : 'Reconstrueer'}</>
            }
          </button>
        </div>
      </div>

      {/* Gap questions CTA — only shows when timeline exists */}
      {point.timeline_reconstruction && (
        <div className="border-t border-indigo-100 px-4 py-2 bg-indigo-50/60 flex items-center justify-between gap-3">
          <p className="text-[11px] text-indigo-600/70 leading-none">
            {questions.length > 0
              ? `${answeredCount} van ${questions.length} vragen beantwoord`
              : 'Identificeer informatiegaten voor de verdediging'}
          </p>
          <button
            onClick={() => onGenerateQuestions(point.id)}
            disabled={generatingQuestions}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex-shrink-0',
              generatingQuestions
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
            )}
          >
            {generatingQuestions
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Bezig…</>
              : <><HelpCircle className="w-3 h-3" /> {questions.length > 0 ? 'Hergenerate' : 'Genereer vragen'}</>
            }
          </button>
        </div>
      )}

      {/* Evidence CTA bar */}
      {point.timeline_reconstruction && (
        <div className="border-t border-[#b2f9eb] px-4 py-2 bg-[#e8fbf5]/60 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[#0c7a5e]/70 leading-none">
            {evidence.length > 0
              ? `${evidence.length} bewijsstuk${evidence.length !== 1 ? 'ken' : ''} gebundeld`
              : 'Bundel relevante bewijsstukken voor de verdediging'}
          </p>
          <button
            onClick={() => onCollectEvidence(point.id)}
            disabled={collectingEvidence}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex-shrink-0',
              collectingEvidence
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-[#d4f7ec] text-[#075e48] hover:bg-[#a8f0d4]'
            )}
          >
            {collectingEvidence
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Bezig…</>
              : <><Package className="w-3 h-3" /> {evidence.length > 0 ? 'Herbundel' : 'Bundel'}</>
            }
          </button>
        </div>
      )}

      {/* Draft CTA bar */}
      {point.timeline_reconstruction && (
        <div className="border-t border-yellow-100 px-4 py-2 bg-yellow-50/60 flex items-center justify-between gap-3">
          <p className="text-[11px] text-yellow-600/70 leading-none">
            {point.draftResponse
              ? `Concept gegenereerd op ${new Date(point.draftGeneratedAt).toLocaleDateString('nl-BE')}`
              : 'Genereer een conceptantwoord op basis van tijdlijn, vragen en bewijsstukken'}
          </p>
          <button
            onClick={() => onGenerateDraft(point.id)}
            disabled={generatingDraft}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex-shrink-0',
              generatingDraft
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
            )}
          >
            {generatingDraft
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Bezig…</>
              : <><FileText className="w-3 h-3" /> {point.draftResponse ? 'Hergenereer' : 'Genereer concept'}</>
            }
          </button>
        </div>
      )}

      {/* Draft section */}
      <AnimatePresence>
        {draftOpen && point.draftResponse && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border-color)] px-4 py-4 bg-yellow-50/20">
              <p className="label-caps text-yellow-600/60 mb-2">Conceptantwoord</p>
              <div className="relative">
                <textarea
                  value={draftText}
                  onChange={e => setDraftText(e.target.value)}
                  onBlur={saveDraft}
                  rows={8}
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-color)] text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400/30 resize-y transition-colors leading-relaxed"
                />
                {draftSaveStatus && (
                  <span className={cn(
                    'absolute right-2.5 bottom-2.5 text-[10px] font-medium pointer-events-none',
                    draftSaveStatus === 'saving' ? 'text-[var(--text-tertiary)]' : 'text-[#0c7a5e]'
                  )}>
                    {draftSaveStatus === 'saving' ? 'Opslaan…' : '✓ Opgeslagen'}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Q&A section */}
      <AnimatePresence>
        {questionsOpen && questions.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border-color)] px-4 py-4 bg-indigo-50/20 space-y-4">
              <p className="label-caps text-indigo-600/60">PM input vereist</p>
              {questions.map(q => (
                <QuestionItem key={q.id} question={q} onSave={onAnswerQuestion} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Evidence section */}
      <AnimatePresence>
        {evidenceOpen && evidence.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border-color)] px-4 py-3 bg-[#e8fbf5]/20">
              <p className="label-caps text-[#0c7a5e]/60 mb-2">Bewijsstukken</p>
              {evidence.map(item => (
                <EvidenceItem key={item.id} item={item} onRemove={onRemoveEvidence} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline narrative */}
      <AnimatePresence>
        {timelineOpen && point.timeline_reconstruction && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border-color)] px-4 py-4 bg-[var(--surface-2)]/60">
              {point.timeline_reconstructed_at && (
                <p className="text-[10px] text-[var(--text-tertiary)] font-mono mb-3">
                  Gereconstrueerd op {new Date(point.timeline_reconstructed_at).toLocaleString('nl-BE')}
                </p>
              )}
              <pre className="text-[12px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap font-sans">
                {point.timeline_reconstruction}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SendConfirmModal({ dispute, points, onClose, onConfirm, sending }) {
  const [recipient, setRecipient] = useState(dispute.senderEmail || '');
  const draftedPoints = points.filter(p => p.draftResponse);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-[#0c7a5e]" />
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Antwoord versturen</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label-caps mb-1.5 block">Ontvanger</label>
            <input
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="bouwheer@example.com"
              className="w-full h-9 px-3 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <div>
            <label className="label-caps mb-2 block">Conceptantwoorden die worden meegestuurd</label>
            <div className="space-y-1.5">
              {draftedPoints.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#e8fbf5] border border-[#b2f9eb]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#0c7a5e] flex-shrink-0" />
                  <TypeChip type={p.type} />
                  <span className="text-[12px] text-[var(--text-secondary)] truncate flex-1">{p.description || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100">
            <p className="text-[12px] text-amber-700 leading-snug">
              <strong>Menselijke controle vereist.</strong> Controleer de conceptantwoorden zorgvuldig voor het verzenden. Punchlister communiceert nooit autonoom met de bouwheer.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border-color)]">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--text-secondary)] hover:bg-gray-50 cursor-pointer">
            Annuleer
          </button>
          <button
            onClick={() => onConfirm(recipient)}
            disabled={sending || !recipient.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold bg-[#0c7a5e] text-white hover:bg-[#075e48] disabled:opacity-50 cursor-pointer transition-colors"
          >
            {sending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Versturen…</>
              : <><Send className="w-3.5 h-3.5" /> Verstuur e-mail</>
            }
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ReviewGate({ dispute, points, onMarkReview, onMarkSent, onArchive, onReopen, markingStatus }) {
  const total = points.length;
  const withDraft = points.filter(p => p.draftResponse).length;
  const allDrafted = total > 0 && withDraft === total;
  const isSent = dispute.status === 'sent';
  const isUnderReview = dispute.status === 'under_review';
  const isArchived = dispute.status === 'archived';
  const [showSendModal, setShowSendModal] = useState(false);

  if (total === 0) return null;

  if (isArchived) {
    return (
      <div className="glass rounded-2xl border border-gray-200 bg-gray-50/60 px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Archive className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-[var(--text-secondary)]">Gearchiveerd</p>
            {dispute.archivedAt && (
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                {new Date(dispute.archivedAt).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => onReopen(dispute.id)}
          disabled={markingStatus === 'reopen'}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer',
            markingStatus === 'reopen'
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-white'
          )}
        >
          {markingStatus === 'reopen'
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Bezig…</>
            : <><RotateCcw className="w-3.5 h-3.5" /> Heropen</>
          }
        </button>
      </div>
    );
  }

  return (
    <div className={cn(
      'glass rounded-2xl border overflow-hidden',
      isSent
        ? 'border-[#88f0d4] bg-[#e8fbf5]/40'
        : isUnderReview
          ? 'border-purple-200 bg-purple-50/40'
          : allDrafted
            ? 'border-yellow-200 bg-yellow-50/40'
            : 'border-[var(--border-color)]'
    )}>
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {isSent
              ? <CheckCircle2 className="w-5 h-5 text-[#0c7a5e] flex-shrink-0" />
              : isUnderReview
                ? <ShieldCheck className="w-5 h-5 text-purple-500 flex-shrink-0" />
                : <Send className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            }
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                {isSent
                  ? 'Antwoord verzonden'
                  : isUnderReview
                    ? 'In review — wacht op goedkeuring'
                    : 'Klaar voor review en verzending'}
              </p>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                {isSent
                  ? `Verzonden op ${dispute.sentAt ? new Date(dispute.sentAt).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : 'onbekende datum'}`
                  : `${withDraft} van ${total} betwistpunten hebben een conceptantwoord`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isSent && (
              <button
                onClick={() => onArchive(dispute.id)}
                disabled={markingStatus === 'archive'}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer',
                  markingStatus === 'archive'
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {markingStatus === 'archive'
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Bezig…</>
                  : <><Archive className="w-3.5 h-3.5" /> Archiveer</>
                }
              </button>
            )}
            {!isSent && !isUnderReview && allDrafted && (
              <button
                onClick={() => onMarkReview(dispute.id)}
                disabled={markingStatus === 'review'}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer',
                  markingStatus === 'review'
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                )}
              >
                {markingStatus === 'review'
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Bezig…</>
                  : <><ShieldCheck className="w-3.5 h-3.5" /> Naar review</>
                }
              </button>
            )}
            {(isUnderReview || allDrafted) && !isSent && (
              <button
                onClick={() => setShowSendModal(true)}
                disabled={markingStatus === 'sent'}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer',
                  markingStatus === 'sent'
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-[#d4f7ec] text-[#075e48] hover:bg-[#a8f0d4]'
                )}
              >
                {markingStatus === 'sent'
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Versturen…</>
                  : <><Send className="w-3.5 h-3.5" /> Goedkeuren & verzenden</>
                }
              </button>
            )}
          </div>
        </div>

        {/* Draft checklist */}
        {!isSent && (
          <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50 flex flex-col gap-1.5">
            {points.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <div className={cn(
                  'w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center',
                  p.draftResponse ? 'bg-[#d4f7ec]' : 'bg-gray-100'
                )}>
                  {p.draftResponse
                    ? <CheckCircle2 className="w-3 h-3 text-[#0c7a5e]" />
                    : <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  }
                </div>
                <TypeChip type={p.type} />
                <p className="text-[11px] text-[var(--text-tertiary)] truncate flex-1">{p.description || '—'}</p>
                {!p.draftResponse && (
                  <span className="text-[10px] text-amber-500 font-medium flex-shrink-0">Concept ontbreekt</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showSendModal && (
          <SendConfirmModal
            dispute={dispute}
            points={points}
            sending={markingStatus === 'sent'}
            onClose={() => setShowSendModal(false)}
            onConfirm={async (recipientEmail) => {
              await onMarkSent(dispute.id, recipientEmail);
              setShowSendModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DisputeDetail({ dispute, points, disputeQuestions, disputeEvidence, onReconstruct, reconstructingId, onUpdateStatus, onGenerateGapQuestions, generatingQuestionsId, onAnswerQuestion, onCollectEvidence, collectingEvidenceId, onRemoveEvidence, onGenerateDraft, generatingDraftId, onSaveDraft, onMarkReview, onMarkSent, onArchive, onReopen, onExportDossier }) {
  const disputePoints = points.filter(p => p.disputeId === dispute.id);
  const [markingStatus, setMarkingStatus] = useState(null); // null | 'review' | 'sent' | 'archive' | 'reopen'
  const [exportingDossier, setExportingDossier] = useState(false);

  const handleExportDossier = async () => {
    setExportingDossier(true);
    try {
      await onExportDossier(dispute.id);
    } finally {
      setExportingDossier(false);
    }
  };

  const handleMarkReview = async (id) => {
    setMarkingStatus('review');
    try { await onMarkReview(id); } finally { setMarkingStatus(null); }
  };
  const handleMarkSent = async (id) => {
    setMarkingStatus('sent');
    try { await onMarkSent(id); } finally { setMarkingStatus(null); }
  };
  const handleArchive = async (id) => {
    setMarkingStatus('archive');
    try { await onArchive(id); } finally { setMarkingStatus(null); }
  };
  const handleReopen = async (id) => {
    setMarkingStatus('reopen');
    try { await onReopen(id); } finally { setMarkingStatus(null); }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header card */}
      <div className="glass rounded-2xl p-5 border border-[var(--border-color)]">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono text-[var(--text-tertiary)]">{dispute.number}</span>
              <StatusBadge status={dispute.status} />
            </div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)] leading-snug">
              {dispute.subject || 'Betwisting'}
            </h2>
          </div>
          <button
            onClick={handleExportDossier}
            disabled={exportingDossier}
            title="Exporteer volledig betwistingsdossier als PDF"
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer flex-shrink-0',
              exportingDossier
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
            )}
          >
            {exportingDossier
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Genereren…</>
              : <><Download className="w-3.5 h-3.5" /> Dossier</>
            }
          </button>
        </div>
        <div className="flex flex-wrap gap-3 text-[12px] text-[var(--text-tertiary)]">
          {dispute.senderEmail && (
            <span className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              {dispute.senderEmail}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {new Date(dispute.createdAt).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>

        {/* Status control */}
        <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
          <p className="text-[11px] text-[var(--text-tertiary)] font-medium mb-2">Status bijwerken</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => onUpdateStatus(dispute.id, key)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border',
                  dispute.status === key
                    ? 'ring-2 ring-brand border-brand/30 bg-brand/5'
                    : 'border-[var(--border-color)] text-[var(--text-tertiary)] hover:border-brand/40 hover:text-[var(--text-secondary)]'
                )}
              >
                {meta.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dispute points */}
      <div>
        <h3 className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
          Betwistpunten
        </h3>
        {disputePoints.length === 0 ? (
          <p className="text-[13px] text-[var(--text-tertiary)] italic">Geen betwistpunten gevonden.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {disputePoints.map(point => (
              <DisputePointCard
                key={point.id}
                point={point}
                questions={disputeQuestions.filter(q => q.disputePointId === point.id)}
                evidence={disputeEvidence.filter(e => e.disputePointId === point.id)}
                onReconstruct={onReconstruct}
                reconstructing={reconstructingId === point.id}
                onGenerateQuestions={onGenerateGapQuestions}
                generatingQuestions={generatingQuestionsId === point.id}
                onAnswerQuestion={onAnswerQuestion}
                onCollectEvidence={onCollectEvidence}
                collectingEvidence={collectingEvidenceId === point.id}
                onRemoveEvidence={onRemoveEvidence}
                onGenerateDraft={onGenerateDraft}
                generatingDraft={generatingDraftId === point.id}
                onSaveDraft={onSaveDraft}
              />
            ))}
          </div>
        )}
      </div>

      {/* Review gate */}
      <ReviewGate
        dispute={dispute}
        points={disputePoints}
        onMarkReview={handleMarkReview}
        onMarkSent={handleMarkSent}
        onArchive={handleArchive}
        onReopen={handleReopen}
        markingStatus={markingStatus}
      />
    </div>
  );
}

// ── Add dispute modal ─────────────────────────────────────────────────────────

function AddDisputeModal({ onClose, onAdd }) {
  const [senderEmail, setSenderEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleType = (type) =>
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);

  const handleAdd = async () => {
    if (!selectedTypes.length) return;
    setSaving(true);
    await onAdd({ senderEmail, subject, disputeTypes: selectedTypes, description });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Nieuwe betwisting</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label-caps mb-1.5 block">E-mail afzender</label>
            <input
              value={senderEmail}
              onChange={e => setSenderEmail(e.target.value)}
              placeholder="bouwheer@example.com"
              className="w-full h-9 px-3 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div>
            <label className="label-caps mb-1.5 block">Onderwerp</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Protest eindfactuur — vertraging"
              className="w-full h-9 px-3 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div>
            <label className="label-caps mb-2 block">Type betwistpunten</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TYPE_META).map(([key, meta]) => {
                const Icon = meta.icon;
                const selected = selectedTypes.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleType(key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold border transition-all cursor-pointer',
                      selected ? 'bg-brand text-white border-brand' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-brand/40'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="label-caps mb-1.5 block">Omschrijving claim</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Korte omschrijving van de betwisting…"
              className="w-full px-3 py-2 rounded-xl border border-[var(--border-color)] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border-color)]">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--text-secondary)] hover:bg-gray-50 cursor-pointer">
            Annuleer
          </button>
          <button
            onClick={handleAdd}
            disabled={saving || selectedTypes.length === 0}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold bg-brand text-white hover:bg-brand/90 disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Opslaan…' : 'Aanmaken'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function DisputeManager({
  disputes,
  disputePoints,
  disputeQuestions,
  disputeEvidence,
  onAddDispute,
  onUpdateDispute,
  onReconstructTimeline,
  onGenerateGapQuestions,
  onAnswerQuestion,
  onCollectEvidence,
  onRemoveEvidence,
  onGenerateDraftResponse,
  onSaveDraftResponse,
  onMarkReview,
  onMarkSent,
  onArchiveDispute,
  onReopenDispute,
  onExportDossier,
}) {
  const [selectedId, setSelectedId] = useState(disputes[0]?.id || null);
  const [reconstructingId, setReconstructingId] = useState(null);
  const [generatingQuestionsId, setGeneratingQuestionsId] = useState(null);
  const [collectingEvidenceId, setCollectingEvidenceId] = useState(null);
  const [generatingDraftId, setGeneratingDraftId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const selected = disputes.find(d => d.id === selectedId) || null;

  const handleReconstruct = async (pointId) => {
    setReconstructingId(pointId);
    try {
      await onReconstructTimeline(pointId);
    } finally {
      setReconstructingId(null);
    }
  };

  const handleGenerateQuestions = async (pointId) => {
    setGeneratingQuestionsId(pointId);
    try {
      await onGenerateGapQuestions(pointId);
    } finally {
      setGeneratingQuestionsId(null);
    }
  };

  const handleCollectEvidence = async (pointId) => {
    setCollectingEvidenceId(pointId);
    try {
      await onCollectEvidence(pointId);
    } finally {
      setCollectingEvidenceId(null);
    }
  };

  const handleGenerateDraft = async (pointId) => {
    setGeneratingDraftId(pointId);
    try {
      await onGenerateDraftResponse(pointId);
    } finally {
      setGeneratingDraftId(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-[var(--border-color)] bg-white/40 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-bold text-[var(--text-primary)] tracking-tight">Betwistingen</h1>
            <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
              {disputes.length} betwisting{disputes.length !== 1 ? 'en' : ''}
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-[13px] font-semibold hover:bg-brand/90 transition-colors cursor-pointer shadow-brand-sm"
          >
            <Plus className="w-4 h-4" />
            Nieuw
          </button>
        </div>
      </div>

      {disputes.length === 0 ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[var(--text-primary)]">Geen betwistingen</p>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-1 max-w-xs">
              Betwistingen worden automatisch aangemaakt wanneer een inkomende e-mail als claim wordt herkend, of je kunt er handmatig één aanmaken.
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-[13px] font-semibold hover:bg-brand/90 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Eerste betwisting aanmaken
          </button>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: dispute list */}
          <div className="w-[280px] flex-shrink-0 border-r border-[var(--border-color)] overflow-y-auto flex flex-col">
            {/* Archive toggle */}
            {disputes.some(d => d.status === 'archived') && (
              <div className="px-3 pt-2.5 pb-1 flex-shrink-0">
                <button
                  onClick={() => setShowArchived(v => !v)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-white/60 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5" />
                    Gearchiveerde {showArchived ? 'verbergen' : 'tonen'}
                  </span>
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {disputes.filter(d => d.status === 'archived').length}
                  </span>
                </button>
              </div>
            )}
            <div className="flex-1 p-3 space-y-1.5">
            {disputes
              .filter(d => showArchived ? d.status === 'archived' : d.status !== 'archived')
              .map(dispute => {
              const pts = disputePoints.filter(p => p.disputeId === dispute.id);
              const active = dispute.id === selectedId;
              return (
                <motion.button
                  key={dispute.id}
                  onClick={() => setSelectedId(dispute.id)}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    'w-full text-left px-3.5 py-3 rounded-xl border transition-all cursor-pointer',
                    active
                      ? 'bg-white border-brand/30 shadow-sm'
                      : 'bg-transparent border-transparent hover:bg-white/60 hover:border-[var(--border-color)]',
                    dispute.status === 'archived' && 'opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{dispute.number}</span>
                    <StatusBadge status={dispute.status} />
                  </div>
                  <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug line-clamp-2 mb-2">
                    {dispute.subject || 'Betwisting'}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {pts.map(p => <TypeChip key={p.id} type={p.type} />)}
                  </div>
                  {dispute.senderEmail && (
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5 truncate">{dispute.senderEmail}</p>
                  )}
                </motion.button>
              );
            })}
            </div>
          </div>

          {/* Right: dispute detail */}
          <div className="flex-1 overflow-y-auto p-6">
            {selected ? (
              <DisputeDetail
                dispute={selected}
                points={disputePoints}
                disputeQuestions={disputeQuestions}
                disputeEvidence={disputeEvidence}
                onReconstruct={handleReconstruct}
                reconstructingId={reconstructingId}
                onUpdateStatus={(id, status) => onUpdateDispute(id, { status })}
                onGenerateGapQuestions={handleGenerateQuestions}
                generatingQuestionsId={generatingQuestionsId}
                onAnswerQuestion={onAnswerQuestion}
                onCollectEvidence={handleCollectEvidence}
                collectingEvidenceId={collectingEvidenceId}
                onRemoveEvidence={onRemoveEvidence}
                onGenerateDraft={handleGenerateDraft}
                generatingDraftId={generatingDraftId}
                onSaveDraft={onSaveDraftResponse}
                onMarkReview={onMarkReview}
                onMarkSent={onMarkSent}
                onArchive={onArchiveDispute}
                onReopen={onReopenDispute}
                onExportDossier={onExportDossier}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-[13px] text-[var(--text-tertiary)]">Selecteer een betwisting</p>
              </div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <AddDisputeModal
            onClose={() => setShowAdd(false)}
            onAdd={onAddDispute}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
