/** Re-process any field_logs that still have processing=true OR no processed_summary. */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { processNote } from '../api/process-log.js';

const supa = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: logs } = await supa.from('field_logs').select('*').is('processed_summary', null);
console.log(`Found ${logs?.length || 0} unprocessed logs.`);
if (!logs?.length) process.exit(0);

const pid = logs[0].project_id;
const [{ data: ctxRows }, { data: contacts }, { data: proj }] = await Promise.all([
  supa.from('project_context').select('category, title, content, source').eq('project_id', pid).limit(20),
  supa.from('project_contacts').select('name, role, email').eq('project_id', pid),
  supa.from('projects').select('name').eq('id', pid).single(),
]);

for (const l of logs) {
  try {
    const ai = await processNote(l.raw_note, l.location || '', {
      contacts: contacts || [],
      contextItems: ctxRows || [],
      projectName: proj?.name || '',
    });
    const wp = Array.isArray(ai.workpoints) ? ai.workpoints : [];
    const meerwerkAny = wp.find(p => p.classification === 'meerwerk');
    const meerwerkSummary = meerwerkAny ? 'meerwerk'
      : (wp.length && wp.every(p => p.classification === 'in_scope') ? 'in_scope'
        : (wp.length ? 'twijfel' : null));
    await supa.from('field_logs').update({
      processed_summary:       ai.summary || null,
      type:                    ai.type || 'general',
      flags:                   Array.isArray(ai.flags) ? ai.flags : [],
      impact:                  ai.impact || 'none',
      action_required:         !!ai.actionRequired,
      suggest_rfi:             !!ai.suggestRFI,
      label:                   ai.label || null,
      workpoints:              wp,
      recommended_outputs:     ai.recommendedOutputs || [],
      meerwerk_classification: meerwerkSummary,
      meerwerk_reasoning:      meerwerkAny?.reasoning || null,
      dispute_types:           Array.isArray(ai.disputeTypes) && ai.disputeTypes.length ? ai.disputeTypes : null,
      processing:              false,
    }).eq('id', l.id);
    console.log(`  ✓ ${l.id.slice(0,8)}  →  ${ai.label || ai.type}`);
  } catch (err) {
    console.warn(`  ! ${l.id.slice(0,8)} failed: ${err.message}`);
  }
}
