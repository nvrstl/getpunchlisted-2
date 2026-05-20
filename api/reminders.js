// Reminder CRUD endpoint.
// POST   /api/reminders         { projectId, ... }     → create
// GET    /api/reminders?projectId=...                  → list pending + sent for project
// PATCH  /api/reminders         { id, status|sentAt|... } → update
// DELETE /api/reminders         { id }                 → cancel (sets status='cancelled')

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { projectId } = req.query;
      if (!projectId) return res.status(400).json({ error: 'projectId required' });
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('project_id', projectId)
        .order('due_at', { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, reminders: data || [] });
    }

    if (req.method === 'POST') {
      const {
        projectId, fieldLogId, userId,
        subject, body, recipient, recipientKind = 'external',
        dueAt,
      } = req.body || {};
      if (!projectId) return res.status(400).json({ error: 'projectId required' });
      if (!subject)   return res.status(400).json({ error: 'subject required' });
      if (!dueAt)     return res.status(400).json({ error: 'dueAt required' });

      const { data, error } = await supabase
        .from('reminders')
        .insert({
          project_id:     projectId,
          field_log_id:   fieldLogId || null,
          user_id:        userId || null,
          subject,
          body:           body || null,
          recipient:      recipient || null,
          recipient_kind: recipientKind,
          due_at:         dueAt,
          status:         'pending',
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, reminder: data });
    }

    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const db = { updated_at: new Date().toISOString() };
      if ('subject'   in updates) db.subject       = updates.subject;
      if ('body'      in updates) db.body          = updates.body;
      if ('recipient' in updates) db.recipient     = updates.recipient;
      if ('dueAt'     in updates) db.due_at        = updates.dueAt;
      if ('status'    in updates) db.status        = updates.status;
      if ('sentAt'    in updates) db.sent_at       = updates.sentAt;
      const { data, error } = await supabase
        .from('reminders')
        .update(db)
        .eq('id', id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, reminder: data });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase
        .from('reminders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
