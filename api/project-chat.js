// Project Q&A chat. Loads project context (offerte / contacts / recent memos / sent mails)
// and asks Claude to answer a user question grounded in that context.
//
// POST /api/project-chat
// Body: { projectId, message, history?: [{role: 'user'|'assistant', content}] }

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { projectId, message, history = [] } = req.body || {};
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  try {
    // ── Gather project memory ──────────────────────────────────────────
    // field_logs is the canonical "inbox" — everything that arrives in the
    // app (voice notes, inbound emails, manual logs, WhatsApp) is a row here.
    // Pull a generous number (200) and trim each body to keep the prompt
    // under control; oldest entries beyond that cap are dropped.
    const [{ data: project }, { data: ctx }, { data: contacts }, { data: logs }] = await Promise.all([
      supabase.from('projects').select('id, name, city, project_number, status, client_name, project_manager').eq('id', projectId).maybeSingle(),
      supabase.from('project_context').select('category, title, content, source').eq('project_id', projectId).order('created_at', { ascending: false }).limit(12),
      supabase.from('project_contacts').select('name, role, email, phone').eq('project_id', projectId),
      supabase.from('field_logs')
        .select('processed_summary, raw_note, type, location, created_at, source, subject, treated')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    if (!project) return res.status(404).json({ error: 'Project not found' });

    const ctxBlock = (ctx || []).map(i =>
      `[${i.category?.toUpperCase()} — ${i.title}${i.source ? ` · ${i.source}` : ''}]\n${(i.content || '').slice(0, 1500)}`
    ).join('\n\n');

    const contactsBlock = (contacts || []).length
      ? (contacts || []).map(c => `· ${c.name}${c.role ? ` (${c.role})` : ''}${c.email ? ` — ${c.email}` : ''}${c.phone ? ` — ${c.phone}` : ''}`).join('\n')
      : '(geen contacten geregistreerd)';

    // Build the inbox block. Each entry trimmed to keep the prompt bounded
    // (~400 chars/log × 200 logs ≈ 80k chars upper bound — safely inside
    // Haiku's context). Prefers processed_summary, falls back to raw_note.
    const logsBlock = (logs || []).map(l => {
      const date = new Date(l.created_at).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
      const src  = l.source ? ` [${l.source}]` : '';
      const loc  = l.location ? ` · ${l.location}` : '';
      const subj = l.subject ? ` · "${l.subject}"` : '';
      const flag = l.treated ? '' : ' · ONBEHANDELD';
      const body = (l.processed_summary || l.raw_note || '').slice(0, 400);
      return `── ${date}${src}${loc}${subj}${flag} ──\n${body}`;
    }).join('\n\n');

    const systemPrompt = `Je bent Punchlister, de admin-assistent van een Belgische bouwondernemer. Je beantwoordt vragen over één specifiek project. Antwoord beknopt, in het Nederlands, en altijd grond je antwoord in de project-data hieronder. Als iets niet in de data staat, zeg dat expliciet ("Dit staat niet in het projectgeheugen") in plaats van te gokken.

PROJECT
· Naam: ${project.name}
${project.project_number ? `· Nummer: ${project.project_number}\n` : ''}${project.city ? `· Locatie: ${project.city}\n` : ''}${project.client_name ? `· Klant: ${project.client_name}\n` : ''}${project.project_manager ? `· PM: ${project.project_manager}\n` : ''}· Status: ${project.status || 'active'}

CONTACTEN
${contactsBlock}

CONTEXT-DOCUMENTEN (offerte, lastenboek, contract, e-mails)
${ctxBlock || '(geen documenten geüpload)'}

INBOX — alle binnenkomende berichten (voice, e-mail, manuele log, WhatsApp; max 200 recent)
${logsBlock || '(nog geen inbox-items)'}

Houd je antwoorden kort. Verwijs naar specifieke memo's of documenten als bewijs ("op 14 mei besproken", "in offerte v3 punt 2.4"). Geen markdown headers, gebruik korte alinea's.`;

    const messages = [
      ...history.filter(m => m && m.role && m.content).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content),
      })),
      { role: 'user', content: message },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: systemPrompt,
      messages,
    });

    const reply = response.content?.[0]?.text || '';
    return res.json({ success: true, reply });
  } catch (err) {
    console.error('[project-chat]', err);
    return res.status(500).json({ error: err.message });
  }
}
