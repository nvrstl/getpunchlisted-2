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

  const { data: point } = await supabase.from('dispute_points').select('*').eq('id', disputePointId).single();
  if (!point) return res.status(404).json({ error: 'Dispute point not found' });

  const { data: dispute } = await supabase.from('disputes').select('*').eq('id', point.dispute_id).single();
  if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

  const { data: project } = await supabase.from('projects').select('*').eq('id', dispute.project_id).single();
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Gather candidates — cap field_logs at 40 to avoid token overflow
  const [logsRes, rfisRes, varsRes] = await Promise.all([
    supabase.from('field_logs')
      .select('id, raw_note, processed_summary, log_date, created_at, type, flags')
      .eq('project_id', project.id)
      .order('log_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(40),
    supabase.from('rfis')
      .select('id, number, title, context, status, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false }),
    supabase.from('variations')
      .select('id, number, description, status, estimated_cost, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false }),
  ]);

  const fmtDate = (d) => (d || '').slice(0, 10);

  const candidateLines = [
    ...(logsRes.data || []).map(l =>
      `[ID:${l.id}|type:field_log] ${fmtDate(l.log_date || l.created_at)} | Veldverslag | ${(l.processed_summary || l.raw_note).slice(0, 130)}`
    ),
    ...(rfisRes.data || []).map(r =>
      `[ID:${r.id}|type:rfi] ${fmtDate(r.created_at)} | RFI ${r.number || ''}: ${r.title}${r.context ? ' — ' + r.context.slice(0, 80) : ''} (${r.status})`
    ),
    ...(varsRes.data || []).map(v =>
      `[ID:${v.id}|type:variation] ${fmtDate(v.created_at)} | Variatie ${v.number || ''}: ${v.description}${v.estimated_cost ? ` — €${v.estimated_cost}` : ''} (${v.status})`
    ),
  ].join('\n') || '(geen projectdocumenten beschikbaar)';

  const timeline = point.timeline_reconstruction || '(geen tijdlijn)';

  const prompt = `Je bent een juridisch-technisch assistent voor bouwprojecten. Selecteer de meest relevante bewijsstukken voor het volgende betwistpunt.

PROJECT: ${project.name}${project.city ? `, ${project.city}` : ''}
TYPE CLAIM: ${TYPE_LABELS[point.type] || point.type}
OMSCHRIJVING CLAIM: ${point.description || dispute.subject || ''}
AFZENDER: ${dispute.sender_email || 'onbekend'}

TIJDLIJN (reeds gereconstrueerd):
${timeline.slice(0, 1500)}

── BESCHIKBARE DOCUMENTEN ─────────────────────────────────────────────────────
${candidateLines}

── OPDRACHT ───────────────────────────────────────────────────────────────────
Selecteer 4 tot 8 documenten die het sterkste bewijsmateriaal vormen voor de verdediging van de aannemer tegen bovenstaande claim. Kies documenten die:
- Feiten bevestigen die de claim weerleggen of verzachten
- Een datum of locatie vaststellen die relevant is
- Officieel gedocumenteerd meerwerk of goedkeuring bewijzen

Geef ALLEEN een JSON-array terug — geen markdown, geen code-blok:
[
  { "id": "uuid-uit-bovenstaande-lijst", "sourceType": "field_log", "label": "Korte beschrijving", "relevanceNote": "Één zin waarom dit relevant is" }
]`;

  // Clean existing evidence for this point (regeneration)
  await supabase.from('dispute_evidence').delete().eq('dispute_point_id', disputePointId);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].text.trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '');
    const suggestions = JSON.parse(raw);
    if (!Array.isArray(suggestions)) throw new Error('Expected JSON array');

    // Validate IDs against actual candidates
    const validIds = new Set([
      ...(logsRes.data || []).map(l => l.id),
      ...(rfisRes.data || []).map(r => r.id),
      ...(varsRes.data || []).map(v => v.id),
    ]);

    const rows = suggestions
      .filter(s => s.id && validIds.has(s.id) && s.sourceType && s.label)
      .map(s => ({
        dispute_point_id: disputePointId,
        source_type: s.sourceType,
        source_id: s.id,
        label: s.label,
        relevance_note: s.relevanceNote || null,
      }));

    const { data: inserted, error: insertErr } = await supabase
      .from('dispute_evidence')
      .insert(rows)
      .select();

    if (insertErr) throw new Error(insertErr.message);

    console.log('[collect-evidence] Bundled', inserted.length, 'evidence items for point', disputePointId);
    return res.json({ success: true, evidence: inserted });
  } catch (err) {
    console.error('[collect-evidence] error:', err.message);
    return res.status(500).json({ error: 'Failed to collect evidence', detail: err.message });
  }
}
