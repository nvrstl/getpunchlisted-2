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

  const [questionsRes, evidenceRes] = await Promise.all([
    supabase.from('dispute_questions').select('*').eq('dispute_point_id', disputePointId).order('created_at', { ascending: true }),
    supabase.from('dispute_evidence').select('*').eq('dispute_point_id', disputePointId).order('created_at', { ascending: true }),
  ]);

  const questions = questionsRes.data || [];
  const evidence = evidenceRes.data || [];

  const qaSection = questions.length > 0
    ? questions.map(q => `V: ${q.question}\nA: ${q.answer?.trim() || '(geen antwoord)'}`).join('\n\n')
    : '(geen aanvullende PM-input beschikbaar)';

  const evidenceSection = evidence.length > 0
    ? evidence.map(e => `- [${e.source_type}] ${e.label}${e.relevance_note ? ': ' + e.relevance_note : ''}`).join('\n')
    : '(geen bewijsstukken gebundeld)';

  const timeline = point.timeline_reconstruction || '(geen tijdlijn beschikbaar)';

  const prompt = `Je bent een juridisch-technisch assistent gespecialiseerd in bouwgeschillen. Schrijf een professioneel conceptantwoord op het volgende betwistpunt, vanuit het standpunt van de aannemer.

PROJECT: ${project.name}${project.city ? `, ${project.city}` : ''}
AFZENDER CLAIM: ${dispute.sender_email || 'onbekend'}
TYPE CLAIM: ${TYPE_LABELS[point.type] || point.type}
OMSCHRIJVING CLAIM: ${point.description || dispute.subject || '(zie context)'}

── GERECONSTRUEERDE TIJDLIJN ──────────────────────────────────────────────────
${timeline.slice(0, 2000)}

── PM-ANTWOORDEN OP INFORMATIELEEMTEN ────────────────────────────────────────
${qaSection}

── GEBUNDELDE BEWIJSSTUKKEN ──────────────────────────────────────────────────
${evidenceSection}

── OPDRACHT ───────────────────────────────────────────────────────────────────
Schrijf een conceptantwoord van 2 tot 4 alinea's voor dit specifieke betwistpunt. Het antwoord:
- Is professioneel, zakelijk en feitelijk (geen emotionele taal)
- Verwijst concreet naar de tijdlijn en specifieke bewijsstukken waar relevant
- Weerlegt of relativeert de claim op basis van de vastgestelde feiten
- Eindigt met een duidelijke conclusie of tegenvoorstel indien van toepassing

Schrijf enkel de alinea's — geen aanhef, geen ondertekening, geen json, geen markdown.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const draft = response.content[0].text.trim();

    await supabase.from('dispute_points').update({
      draft_response: draft,
      draft_generated_at: new Date().toISOString(),
    }).eq('id', disputePointId);

    console.log('[generate-draft-response] Draft generated for point', disputePointId);
    return res.json({ success: true, draft, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[generate-draft-response] error:', err.message);
    return res.status(500).json({ error: 'Failed to generate draft', detail: err.message });
  }
}
