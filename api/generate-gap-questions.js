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

  const { data: point, error: pointErr } = await supabase
    .from('dispute_points')
    .select('*')
    .eq('id', disputePointId)
    .single();
  if (pointErr || !point) return res.status(404).json({ error: 'Dispute point not found' });

  const { data: dispute, error: dispErr } = await supabase
    .from('disputes')
    .select('*')
    .eq('id', point.dispute_id)
    .single();
  if (dispErr || !dispute) return res.status(404).json({ error: 'Dispute not found' });

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', dispute.project_id)
    .single();
  if (projErr || !project) return res.status(404).json({ error: 'Project not found' });

  const timeline = point.timeline_reconstruction || '(geen tijdlijn beschikbaar)';

  const prompt = `Je bent een juridisch-technisch assistent voor bouwprojecten. Analyseer de tijdlijn en de claim van de bouwheer. Identificeer specifieke informatiegaten die de projectmanager moet opvullen om een sterk tegenargument te kunnen schrijven.

PROJECT: ${project.name}${project.city ? `, ${project.city}` : ''}
TYPE CLAIM: ${TYPE_LABELS[point.type] || point.type}
OMSCHRIJVING CLAIM: ${point.description || dispute.subject || '(zie context)'}
AFZENDER: ${dispute.sender_email || 'onbekend'}

GERECONSTRUEERDE TIJDLIJN:
${timeline}

OPDRACHT:
Genereer 3 tot 5 gerichte vragen die de PM moet beantwoorden om ontbrekende informatie aan te vullen. Focus op:
- Feiten die ontbreken in de tijdlijn maar relevant zijn voor de verdediging
- Bewijsstukken (foto's, e-mails, leveringsbonnen) die mogelijk beschikbaar zijn maar niet vermeld
- Nuances of context die de claim weerleggen of verzachten
- Contractuele afspraken die van toepassing kunnen zijn

Geef enkel een JSON-array terug — geen markdown, geen code-blok, geen uitleg:
["Vraag 1?", "Vraag 2?", "Vraag 3?"]`;

  // Delete existing questions so this is a clean regeneration
  await supabase.from('dispute_questions').delete().eq('dispute_point_id', disputePointId);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].text.trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '');
    const questions = JSON.parse(raw);
    if (!Array.isArray(questions)) throw new Error('Expected JSON array');

    const rows = questions
      .filter(q => typeof q === 'string' && q.trim())
      .map(q => ({ dispute_point_id: disputePointId, question: q.trim() }));

    const { data: inserted, error: insertErr } = await supabase
      .from('dispute_questions')
      .insert(rows)
      .select();

    if (insertErr) throw new Error(insertErr.message);

    console.log('[generate-gap-questions] Generated', inserted.length, 'questions for point', disputePointId);
    return res.json({ success: true, questions: inserted });
  } catch (err) {
    console.error('[generate-gap-questions] error:', err.message);
    return res.status(500).json({ error: 'Failed to generate questions', detail: err.message });
  }
}
