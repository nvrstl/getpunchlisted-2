import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TYPE_LABELS = {
  timing:    'tijdsduur en vertragingen',
  meerwerk:  'meerwerk en scopewijzigingen',
  kwaliteit: 'kwaliteitsklachten',
  betaling:  'betaling en facturatie',
  other:     'overige claim',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { disputePointId } = req.body;
  if (!disputePointId) return res.status(400).json({ error: 'disputePointId required' });

  // Fetch dispute point
  const { data: point, error: pointErr } = await supabase
    .from('dispute_points')
    .select('*')
    .eq('id', disputePointId)
    .single();
  if (pointErr || !point) return res.status(404).json({ error: 'Dispute point not found' });

  // Fetch parent dispute
  const { data: dispute, error: dispErr } = await supabase
    .from('disputes')
    .select('*')
    .eq('id', point.dispute_id)
    .single();
  if (dispErr || !dispute) return res.status(404).json({ error: 'Dispute not found' });

  // Fetch project
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', dispute.project_id)
    .single();
  if (projErr || !project) return res.status(404).json({ error: 'Project not found' });

  // Gather all project evidence
  const [logsRes, rfisRes, varsRes, ctxRes] = await Promise.all([
    supabase
      .from('field_logs')
      .select('raw_note, processed_summary, type, flags, impact, log_date, created_at, location, source')
      .eq('project_id', project.id)
      .order('log_date',    { ascending: true, nullsFirst: false })
      .order('created_at',  { ascending: true })
      .limit(80),
    supabase
      .from('rfis')
      .select('number, title, context, status, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('variations')
      .select('number, description, status, estimated_cost, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('project_context')
      .select('category, title, content')
      .eq('project_id', project.id),
  ]);

  const formatDate = (d) => (d || '').slice(0, 10) || '?';

  const logsText = (logsRes.data || [])
    .map(l => `${formatDate(l.log_date || l.created_at)} | Veldverslag${l.source === 'email' ? ' (e-mail)' : ''} | ${l.processed_summary || l.raw_note}${l.location ? ` [${l.location}]` : ''}`)
    .join('\n') || '(geen veldverslagen)';

  const rfisText = (rfisRes.data || [])
    .map(r => `${formatDate(r.created_at)} | RFI ${r.number || ''} | ${r.title}${r.context ? ': ' + r.context.slice(0, 120) : ''} (${r.status})`)
    .join('\n') || '(geen RFI\'s)';

  const varsText = (varsRes.data || [])
    .map(v => `${formatDate(v.created_at)} | Meerwerk ${v.number || ''} | ${v.description}${v.estimated_cost ? ` — €${v.estimated_cost}` : ''} (${v.status})`)
    .join('\n') || '(geen meerwerkopdrachten)';

  const contractCtx = (ctxRes.data || [])
    .filter(c => ['contract', 'quote', 'document'].includes(c.category))
    .map(c => `${c.category.toUpperCase()}: ${c.title} — ${c.content?.slice(0, 200) || ''}`)
    .join('\n') || '(geen contractdocumenten)';

  const prompt = `Je bent een juridisch-technisch assistent voor bouwprojecten. Reconstrueer een feitelijke, chronologische tijdlijn uit de projectdocumentatie voor het volgende betwistpunt.

PROJECT: ${project.name}${project.city ? `, ${project.city}` : ''}
STARTDATUM: ${project.start_date || 'onbekend'}
GEPLANDE OPLEVERING: ${project.planned_completion || 'onbekend'}
BOUWHEER: ${dispute.sender_email || 'onbekend'}

BETWISTPUNT TYPE: ${TYPE_LABELS[point.type] || point.type}
OMSCHRIJVING CLAIM: ${point.description || dispute.subject || '(zie emailinhoud)'}

── CONTRACTCONTEXT ───────────────────────────────────────
${contractCtx}

── VELDVERSLAGEN (chronologisch) ─────────────────────────
${logsText}

── RFI'S / CHANGE LOGS ───────────────────────────────────
${rfisText}

── MEERWERK / VARIATIES ──────────────────────────────────
${varsText}

── OPDRACHT ──────────────────────────────────────────────
Schrijf een feitelijke chronologische tijdlijn van alle documenten die relevant zijn voor dit betwistpunt. Gebruik enkel wat in de documentatie staat — verzin niets.

Gebruik dit format per regel:
[DATUM] · [BRON] · [OBSERVATIE]

Sluit af met een paragraaf "Conclusie tijdlijn:" (2-3 zinnen) die samenvatten wat de documentatie aantoont in relatie tot de claim. Toon en taal zijn professioneel en zakelijk (Nederlands).`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const narrative = response.content[0].text.trim();

    await supabase
      .from('dispute_points')
      .update({ timeline_reconstruction: narrative, timeline_reconstructed_at: new Date().toISOString() })
      .eq('id', disputePointId);

    return res.json({ success: true, narrative });
  } catch (err) {
    console.error('[reconstruct-timeline] Claude error:', err.message);
    return res.status(500).json({ error: 'Timeline reconstruction failed', detail: err.message });
  }
}
