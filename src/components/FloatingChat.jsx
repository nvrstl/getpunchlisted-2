import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Loader2, ArrowUp, MessageCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

async function callChat({ system, messages, max_tokens = 800 }) {
  const res = await fetch('/api/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ system, messages, max_tokens }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
  return json.text;
}

const spring = { type: 'spring', stiffness: 300, damping: 28 };

const SUGGESTIONS_GLOBAL = [
  'Toon alle openstaande beloftes van bouwheren',
  'Welke onderaannemers zijn nog niet bevestigd?',
  'Wat zijn de openstaande items voor mijn werfvergadering?',
  'Vat de status van al mijn projecten samen',
];

const SUGGESTIONS_PROJECT = [
  'Wat staat er nog open op dit project?',
  'Welke beloftes heb ik aan de bouwheer gedaan?',
  'Welke onderaannemers moeten nog bevestigen?',
  'Vat de laatste werfverslagen samen',
];

// Phased status indicator. Each phase shows a label + a thin progress bar
// so the user knows whether we're still pulling project data or actually
// waiting on the model. Phases:
//   'context'  — gathering inbox / docs / contacts (Supabase queries)
//   'thinking' — request sent to Claude, waiting on response
function PhasedIndicator({ phase }) {
  const meta = {
    context:  { label: 'Context verzamelen…',       width: '35%', hint: 'Memo\'s en documenten ophalen' },
    thinking: { label: 'Punchlister denkt na…',     width: '75%', hint: 'Claude verwerkt je vraag' },
  }[phase] || { label: 'Bezig…', width: '50%', hint: '' };
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold bg-[#280063] text-[#b3aaf5]">P</div>
      <div className="px-4 py-3 bg-[var(--surface-3)] border border-[var(--border-color)]/60 rounded-2xl rounded-tl-sm min-w-[200px]">
        <div className="flex items-center gap-2 mb-1.5">
          <Loader2 className="w-3 h-3 animate-spin text-[#7669ff]" />
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">{meta.label}</span>
        </div>
        {meta.hint && (
          <div className="text-[10px] text-[var(--text-tertiary)] mb-2">{meta.hint}</div>
        )}
        <div className="h-1 w-full bg-black/[0.06] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#7669ff] to-[#ffabff]"
            initial={{ width: '5%' }}
            animate={{ width: meta.width }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold bg-[#280063] text-[#b3aaf5]">P</div>
      <div className="px-4 py-3 bg-[var(--surface-3)] border border-[var(--border-color)]/60 rounded-2xl rounded-tl-sm">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message, userInitials, projects, onSelectProject }) {
  const isUser = message.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className={cn('flex gap-3', isUser ? 'ml-auto flex-row-reverse max-w-[82%]' : 'max-w-[88%]')}
    >
      <div className={cn(
        'w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold',
        isUser
          ? 'bg-[#eef2ff] text-[#6366f1] border border-[#c7d2fe]'
          : 'bg-[#280063] text-[#b3aaf5]'
      )}>
        {isUser ? userInitials : 'P'}
      </div>

      <div className={cn(
        'px-4 py-3 rounded-2xl text-[13.5px] leading-relaxed',
        isUser
          ? 'bg-[#6366f1] text-white rounded-tr-sm'
          : 'bg-[var(--surface-3)] border border-[var(--border-color)]/60 text-[var(--text-secondary)] rounded-tl-sm'
      )}>
        <p style={{ whiteSpace: 'pre-wrap' }}>{message.content}</p>

        {message.sources?.length > 0 && onSelectProject && (
          <div className="mt-3 pt-2.5 border-t border-[var(--border-color)]/60 flex flex-wrap gap-1.5">
            {message.sources.map((s, i) => {
              const proj = projects?.find(p => p.name === s.project);
              return (
                <button
                  key={i}
                  onClick={() => proj && onSelectProject(proj)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/70 border border-[var(--border-color)] rounded-md text-[11px] text-[var(--text-secondary)] transition-colors',
                    proj ? 'cursor-pointer hover:border-brand/40 hover:text-brand' : 'cursor-default'
                  )}
                >
                  <ChevronRight className="w-3 h-3 flex-shrink-0" />
                  <strong className="font-medium text-[var(--text-primary)]">{s.project}</strong>
                  {s.count != null && <span>· {s.count} bronnen</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ChatInterface({ project, projects, userInitials, onSelectProject }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [phase, setPhase]       = useState(null); // 'context' | 'thinking' | null
  const bottomRef  = useRef(null);

  const projectScope = !!project;
  const scopeKey = project?.id ?? 'all';

  // Reset chat history when scope changes
  useEffect(() => { setMessages([]); }, [scopeKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Always rebuild context from DB on every send — no caching, so deleted
  // items disappear immediately and we never answer from a stale snapshot.
  const buildContext = async () => {
    const scopeProjects = projectScope ? [project] : (projects || []);
    if (!scopeProjects.length) return 'Geen projecten gevonden.';

    const ids     = scopeProjects.map(p => p.id);
    const nameMap = Object.fromEntries(scopeProjects.map(p => [p.id, p.name]));
    const fmt     = (iso) => (iso ?? '').split('T')[0];
    const trunc   = (s, n) => s ? (s.length > n ? s.slice(0, n) + '…' : s) : '';

    const [logsRes, dispRes, punchRes, ctxRes] = await Promise.all([
      supabase.from('field_logs')
        .select('project_id, processed_summary, raw_note, log_date, created_at')
        .in('project_id', ids).order('created_at', { ascending: false }).limit(40),
      supabase.from('disputes')
        .select('project_id, subject, sender_email, status, created_at')
        .in('project_id', ids).limit(20),
      supabase.from('punch_items')
        .select('project_id, task, assignee, priority, due_date')
        .in('project_id', ids).eq('status', 'pending').limit(40),
      supabase.from('project_context')
        .select('project_id, category, title, content, raw_text, source')
        .in('project_id', ids).limit(60),
    ]);

    const sections = [
      '## Projecten\n' + scopeProjects.map(p =>
        `- ${p.name} [${p.status}]${p.client_name ? `, bouwheer: ${p.client_name}` : ''}${p.planned_completion ? `, gepland einde: ${p.planned_completion}` : ''}`
      ).join('\n'),
    ];

    // Include EVERY uploaded context document — grouped by category so the
    // model can reason about "contract says X but quote says Y" etc.
    // Previously only contract-tagged items were surfaced; quotes, notes,
    // danger flags etc. silently disappeared from chat memory.
    const CATEGORY_LABELS = {
      contract_client:        'Contracten met opdrachtgever',
      contract:               'Contracten met opdrachtgever',
      contract_subcontractor: 'Contracten met onderaannemers',
      quote:                  'Offertes / prijsopgaven',
      lastenboek:             'Lastenboek / specs',
      document:               'Documenten',
      note:                   'Notities',
      danger:                 'Risicoflags',
    };
    const ctx = ctxRes.data ?? [];
    const byCategory = {};
    for (const c of ctx) {
      const label = CATEGORY_LABELS[c.category] || (c.category ? `Categorie: ${c.category}` : 'Documenten');
      (byCategory[label] ||= []).push(c);
    }
    // Prefer raw_text (verbatim source) over content (AI summary). Label
    // each doc so the model knows whether it has full text or only a
    // summary — without this it hedges with "text extraction not done yet"
    // when only the summary is available.
    //
    // Adaptive per-doc cap so 1 contract doesn't get sliced to 6k when we
    // have plenty of context budget. Project scope: ~60k total doc budget.
    // Cross-project: tighter (10k) so prompts stay bounded.
    const totalDocs = ctx.length;
    const docBudget = projectScope ? 60000 : 10000;
    const perDocCap = totalDocs
      ? Math.max(2000, Math.min(40000, Math.floor(docBudget / totalDocs)))
      : 0;
    for (const [label, items] of Object.entries(byCategory)) {
      sections.push(
        `## ${label}\n` + items.map(c => {
          const hasRaw = !!(c.raw_text && c.raw_text.length > 50);
          const kind = hasRaw ? 'VOLLEDIGE TEKST' : 'SAMENVATTING';
          const body = hasRaw ? c.raw_text : c.content;
          return `[${nameMap[c.project_id]}] ${c.title}${c.source ? ` (${c.source})` : ''} — ${kind}: ${trunc(body, perDocCap)}`;
        }).join('\n')
      );
    }

    const logs = logsRes.data ?? [];
    if (logs.length) sections.push(
      '## Werfverslagen\n' + logs.map(l =>
        `[${nameMap[l.project_id]}] ${fmt(l.log_date || l.created_at)}: ${trunc(l.processed_summary || l.raw_note, 180)}`
      ).join('\n')
    );

    const disp = dispRes.data ?? [];
    if (disp.length) sections.push(
      '## Betwistingen\n' + disp.map(d =>
        `[${nameMap[d.project_id]}] ${d.subject || d.sender_email} (${d.status}, ${fmt(d.created_at)})`
      ).join('\n')
    );

    const punch = punchRes.data ?? [];
    if (punch.length) sections.push(
      '## Openstaande taken\n' + punch.map(p =>
        `[${nameMap[p.project_id]}] ${p.task}${p.assignee ? ` → ${p.assignee}` : ''}${p.due_date ? ` (deadline: ${p.due_date})` : ''}`
      ).join('\n')
    );

    return sections.join('\n\n');
  };

  const send = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setLoading(true);
    setPhase('context');

    try {
      const context = await buildContext();
      setPhase('thinking');
      const scopeHint = projectScope
        ? `Je werkt momenteel binnen één project: "${project.name}". Beperk je antwoord tot dit project tenzij anders gevraagd.`
        : 'Je werkt over alle projecten van de gebruiker.';

      const system = `Je bent Punchlister AI, assistent voor bouwprojectbeheer. ${scopeHint} Beantwoord ALTIJD in het Nederlands. Wees beknopt en concreet.

KRITISCHE REGEL — grounding:
- Gebruik ALLEEN informatie die letterlijk in het PROJECTGEHEUGEN hieronder staat. Niets anders.
- Verzin niets. Als iets niet in het PROJECTGEHEUGEN staat, antwoord expliciet: "Dat staat niet in het projectgeheugen."
- Eerder gevoerde gesprekken in deze chat zijn GEEN bron — als de gebruiker in een vorige beurt iets noemde dat nu uit het projectgeheugen verdwenen is, behandel het als afwezig.
- Maak een duidelijk onderscheid tussen contracten met de opdrachtgever (bouwheer) en contracten met onderaannemers — verschillende partijen, verschillende verplichtingen.

DOCUMENTEN:
Elke documentregel eindigt op "— VOLLEDIGE TEKST" of "— SAMENVATTING".
- Bij VOLLEDIGE TEKST mag je letterlijk citeren met aanhalingstekens en bronvermelding.
- Bij SAMENVATTING werk je gewoon met de samenvatting. Beweer NOOIT dat "de tekst nog niet geëxtraheerd is" of "het document nog verwerkt wordt" — de samenvatting IS de informatie die je hebt. Begin je antwoord met "Volgens de samenvatting van <titel>...".

PROJECTGEHEUGEN (enige bron van waarheid voor dit antwoord):
${context}

Sluit je antwoord af met een bronnenlijst op een aparte nieuwe regel (enkel als je projecten hebt geciteerd):
[SOURCES: [{"project":"ProjectNaam","count":N}]]`;

      const raw = (await callChat({
        system,
        max_tokens: 800,
        messages: [
          ...messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: trimmed },
        ],
      })).trim();
      const match = raw.match(/\[SOURCES:\s*(\[[\s\S]*?\])\]/);
      let sources = [], responseText = raw;

      if (match) {
        try { sources = JSON.parse(match[1]); } catch { /* ignore parse errors */ }
        responseText = raw.replace(match[0], '').trim();
      }

      setMessages(prev => [...prev, { role: 'assistant', content: responseText, sources }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role:    'assistant',
        content: `Er is een fout opgetreden: ${err.message}`,
        sources: [],
      }]);
    }
    setLoading(false);
    setPhase(null);
  };

  const empty = messages.length === 0;
  const suggestions = projectScope ? SUGGESTIONS_PROJECT : SUGGESTIONS_GLOBAL;
  const emptyTitle = projectScope ? `Stel een vraag over ${project.name}` : 'Stel een vraag over je projecten';
  const emptySub   = projectScope ? 'Ik zoek door werfverslagen, contracten, betwistingen en taken van dit project.' : 'Ik zoek door al je werfverslagen, betwistingen en taken.';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {empty ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="h-full flex flex-col items-center justify-center py-10 text-center"
            >
              <div className="w-12 h-12 bg-[#280063] rounded-2xl flex items-center justify-center mb-3" style={{ color: '#b3aaf5', fontSize: 20, fontWeight: 700 }}>P</div>
              <div className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">{emptyTitle}</div>
              <div className="text-[13px] text-[var(--text-tertiary)] max-w-xs">{emptySub}</div>
            </motion.div>
          ) : (
            messages.map((msg, i) => (
              <ChatBubble
                key={i}
                message={msg}
                userInitials={userInitials}
                projects={projects}
                onSelectProject={onSelectProject}
              />
            ))
          )}
        </AnimatePresence>
        {loading && <PhasedIndicator phase={phase} />}
        <div ref={bottomRef} />
      </div>

      <AnimatePresence>
        {empty && (
          <motion.div
            key="suggestions"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            className="px-4 pb-2"
          >
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="text-[12px] px-3 py-1.5 bg-[var(--surface-3)] border border-[var(--border-color)] rounded-full text-[var(--text-secondary)] hover:border-brand/40 hover:text-brand transition-colors cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-3 py-3 border-t border-[var(--border-color)]/60 flex items-center gap-2 bg-white">
        <input
          className="flex-1 bg-[var(--surface-3)] border border-[var(--border-color)] rounded-full px-4 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-brand/50 transition-colors"
          placeholder="Schrijf een bericht..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="w-9 h-9 rounded-full bg-brand flex items-center justify-center text-white flex-shrink-0 disabled:opacity-35 hover:bg-brand/90 transition-colors cursor-pointer"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function FloatingChat({ project, projects, userInitials, onSelectProject }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.button
        onClick={() => setOpen(o => !o)}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...spring, delay: 0.3 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center cursor-pointer"
        style={{ background: '#280063', color: '#b3aaf5' }}
        aria-label={open ? 'Sluit chat' : 'Open chat'}
      >
        <AnimatePresence initial={false} mode="wait">
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="w-6 h-6" />
            </motion.span>
          ) : (
            <motion.span key="msg" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MessageCircle className="w-6 h-6" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={spring}
            className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-8rem)] rounded-2xl overflow-hidden shadow-2xl border border-[var(--border-color)] bg-white flex flex-col"
            style={{ transformOrigin: 'bottom right' }}
          >
            <ChatInterface
              project={project}
              projects={projects}
              userInitials={userInitials}
              onSelectProject={(p) => { setOpen(false); onSelectProject?.(p); }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
