// Project contacts CRUD (klant, architect, schilder, …).
// GET    /api/project-contacts?projectId=...
// POST   /api/project-contacts        { projectId, name, role, email, phone, notes }
// PATCH  /api/project-contacts        { id, ...fields }
// DELETE /api/project-contacts        { id }

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
        .from('project_contacts')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, contacts: data || [] });
    }

    if (req.method === 'POST') {
      const { projectId, name, role, email, phone, notes } = req.body || {};
      if (!projectId) return res.status(400).json({ error: 'projectId required' });
      if (!name?.trim()) return res.status(400).json({ error: 'name required' });
      const { data, error } = await supabase
        .from('project_contacts')
        .insert({
          project_id: projectId,
          name:  name.trim(),
          role:  role?.trim() || null,
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          notes: notes?.trim() || null,
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, contact: data });
    }

    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const db = { updated_at: new Date().toISOString() };
      for (const k of ['name', 'role', 'email', 'phone', 'notes']) {
        if (k in updates) db[k] = updates[k]?.toString().trim() || null;
      }
      const { data, error } = await supabase
        .from('project_contacts').update(db).eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, contact: data });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('project_contacts').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
