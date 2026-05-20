import { createClient } from '@supabase/supabase-js';
import { generateDisputeDossierHtml } from './disputeDossierTemplate.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { disputeId } = req.body;
  if (!disputeId) return res.status(400).json({ error: 'disputeId required' });

  const { data: dispute, error: dispErr } = await supabase
    .from('disputes')
    .select('*')
    .eq('id', disputeId)
    .single();
  if (dispErr || !dispute) return res.status(404).json({ error: 'Dispute not found' });

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, name, city, project_number, start_date, planned_completion')
    .eq('id', dispute.project_id)
    .single();
  if (projErr || !project) return res.status(404).json({ error: 'Project not found' });

  const { data: points } = await supabase
    .from('dispute_points')
    .select('*')
    .eq('dispute_id', disputeId)
    .order('created_at', { ascending: true });

  if (!points?.length) {
    return res.status(400).json({ error: 'Dispute has no points' });
  }

  const [questionsRes, evidenceRes] = await Promise.all([
    supabase
      .from('dispute_questions')
      .select('*')
      .in('dispute_point_id', points.map(p => p.id))
      .order('created_at', { ascending: true }),
    supabase
      .from('dispute_evidence')
      .select('*')
      .in('dispute_point_id', points.map(p => p.id))
      .order('created_at', { ascending: true }),
  ]);

  const questions = questionsRes.data || [];
  const evidence  = evidenceRes.data  || [];

  const enrichedPoints = points.map(p => ({
    ...p,
    questions: questions.filter(q => q.dispute_point_id === p.id),
    evidence:  evidence.filter(e => e.dispute_point_id === p.id),
  }));

  const html = generateDisputeDossierHtml({
    dispute,
    project,
    points: enrichedPoints,
    generatedAt: new Date().toISOString(),
  });

  console.log('[generate-dispute-dossier] Dossier generated for dispute', dispute.number || disputeId);
  return res.json({ success: true, html });
}
