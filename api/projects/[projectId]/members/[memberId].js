// PATCH  /api/projects/:projectId/members/:memberId → update whatsapp_phone
// DELETE /api/projects/:projectId/members/:memberId → remove member
// Both restricted to the project owner.

import { supabaseAdmin, authenticate } from '../../../_lib/auth.js';

export default async function handler(req, res) {
  const auth = await authenticate(req, res);
  if (!auth) return;
  const { userId, userEmail } = auth;

  const projectId = req.query.projectId;
  const memberId  = req.query.memberId;
  if (!projectId || !memberId) {
    return res.status(400).json({ success: false, error: 'projectId and memberId required' });
  }

  const { data: proj } = await supabaseAdmin
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });

  // Owner OR any member can PATCH (e.g. set teammate's WhatsApp phone).
  // Only the owner can DELETE — guardrail against accidental removals.
  // Match membership by user_id OR email (covers email-only invites that
  // haven't been back-linked yet).
  const orClauses = [`user_id.eq.${userId}`];
  if (userEmail) orClauses.push(`email.eq.${userEmail.toLowerCase()}`);
  const { data: membership } = await supabaseAdmin
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .or(orClauses.join(','))
    .maybeSingle();
  const isOwner  = proj.owner_id === userId;
  const isMember = !!membership;

  if (req.method === 'DELETE') {
    if (!isOwner) {
      return res.status(403).json({ success: false, error: 'Only the project owner can remove members' });
    }
    const { error } = await supabaseAdmin
      .from('project_members')
      .delete()
      .eq('id', memberId)
      .eq('project_id', projectId);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  }

  if (req.method === 'PATCH') {
    if (!isOwner && !isMember) {
      return res.status(403).json({ success: false, error: 'You must be a project member to edit' });
    }
    const { whatsapp_phone } = req.body || {};
    const { error } = await supabaseAdmin
      .from('project_members')
      .update({ whatsapp_phone: whatsapp_phone?.trim() || null })
      .eq('id', memberId)
      .eq('project_id', projectId);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
