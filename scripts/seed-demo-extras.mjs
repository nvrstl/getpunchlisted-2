/**
 * Adds for the Lange Violettestraat demo project:
 *   • 1 urgent open punch_item
 *   • 1 upcoming reminder
 *   • 1 overdue reminder
 *   • 3 corresponding werfnotities (field_logs, treated=false) — they appear in the Inbox.
 *
 * All copy is in Dutch and fits the existing demo narrative (basalte plaatsing,
 * Devos compensatie-discussie, AREI-keuring).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: proj } = await supa.from('projects').select('id, owner_id, name').ilike('name', '%Violettestraat%').maybeSingle();
if (!proj) { console.error('No project found.'); process.exit(1); }
console.log(`Seeding extras into "${proj.name}"…\n`);
const PID = proj.id;

const today    = new Date();
const inDays   = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
const daysAgo  = (n) => inDays(-n);

// ── Werfnotities (Inbox) ────────────────────────────────────────────────────
const logs = [
  {
    raw_note: `Mehdi belt vanaf de werf. Basalte plaatsing is begonnen vandaag voor de schakelaars in de master en kinderkamers. Sofie heeft mondeling akkoord gegeven op de werf 30 juni, en ik heb ook op die dag een spraakmemo gemaakt. Maar ik vind nergens een ondertekende meerwerkofferte voor de basalte switch terug in mijn mails. Mehdi vraagt of hij gewoon kan doorgaan. Dit moet ik vandaag nog formeel laten bevestigen door de bouwheer.`,
    processed_summary: `Basalte-plaatsing is gestart zonder dat er een schriftelijke bevestiging van het meerwerk-akkoord in de mails terug te vinden is. Mondeling akkoord wel gekregen op de werf op 30 juni, maar geen ondertekende meerwerkofferte. Vraagt onmiddellijke schriftelijke bevestiging van Pieter en Sofie.`,
    type: 'rfi',
    flags: ['meerwerk', 'paper trail', 'urgent'],
    impact: 'cost',
    action_required: true,
    suggest_rfi: true,
    label: 'Materiaalwijziging',
    log_date: today.toISOString().split('T')[0],
    created_at: new Date(today.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    meerwerk_classification: 'meerwerk',
  },
  {
    raw_note: `Patrick Devos belde gisteren laat. Hij is nogal scherp: zegt dat zijn ploeg twee dagen heeft stilgelegen door het balk-incident en wil compensatie. Hij verwacht een reactie tegen vandaag, anders gaat hij ermee naar zijn jurist. Ik heb hem beloofd dat ik vandaag zou terugbellen. Moet nakijken wat er in zijn onderaannemerscontract staat over aansprakelijkheid stilstand voor ik antwoord.`,
    processed_summary: `Onderaannemer Devos eist financiële compensatie voor 2 dagen stilstand na het balk-incident. Dreigt met juridische stappen als er vandaag geen antwoord komt. Reactie moet onderbouwd op contract — eerst aansprakelijkheidsclausule nakijken.`,
    type: 'dispute',
    flags: ['onderaannemer', 'aansprakelijkheid', 'urgent'],
    impact: 'cost',
    action_required: true,
    suggest_rfi: false,
    label: 'Aansprakelijkheid',
    log_date: daysAgo(1).toISOString().split('T')[0],
    created_at: daysAgo(1).toISOString(),
    meerwerk_classification: 'twijfel',
  },
  {
    raw_note: `Bij koffie met Lemahieu de architect op de werf. Hij benadrukt dat we de AREI-keuring uiterlijk vier weken voor oplevering moeten ingeboekt hebben bij Certineo. Anders kan hij geen voorlopige oplevering ondertekenen. Niet vergeten — afspraken@certineo.be is het juiste adres voor de boeking.`,
    processed_summary: `Architect bevestigt: AREI-keuring moet minimum 4 weken voor oplevering geboekt zijn bij Certineo (afspraken@certineo.be). Zonder geldig keuringsattest geen voorlopige oplevering.`,
    type: 'general',
    flags: ['oplevering', 'planning'],
    impact: 'schedule',
    action_required: true,
    suggest_rfi: false,
    label: 'Oplevering',
    log_date: daysAgo(2).toISOString().split('T')[0],
    created_at: daysAgo(2).toISOString(),
    meerwerk_classification: 'in_scope',
  },
];

const { data: insertedLogs, error: logErr } = await supa.from('field_logs').insert(
  logs.map(l => ({
    project_id:        PID,
    raw_note:          l.raw_note,
    processed_summary: l.processed_summary,
    type:              l.type,
    flags:             l.flags,
    impact:            l.impact,
    action_required:   l.action_required,
    suggest_rfi:       l.suggest_rfi,
    label:             l.label,
    log_date:          l.log_date,
    created_at:        l.created_at,
    meerwerk_classification: l.meerwerk_classification,
    source:            'demo-seed',
    user_email:        'stijn@vandenbroucke-elektro.be',
    processing:        false,
  }))
).select('id, label, log_date');
if (logErr) { console.error('Logs insert failed:', logErr.message); process.exit(2); }
console.log(`✓ Inserted ${insertedLogs.length} werfnotities (Inbox):`);
insertedLogs.forEach(l => console.log(`    - ${l.log_date}  ${l.label}`));

const [basalteLog, devosLog, areiLog] = insertedLogs;

// ── Urgent punch_item ───────────────────────────────────────────────────────
const { data: punch, error: punchErr } = await supa.from('punch_items').insert({
  project_id: PID,
  task:       'Schriftelijke bevestiging meerwerk Basalte vragen aan Pieter en Sofie — plaatsing is bezig',
  assignee:   'Stijn Vandenbroucke',
  priority:   'high',
  due_date:   inDays(1).toISOString().split('T')[0],
  status:     'pending',
  notes:      'Mondeling akkoord op de werf 30/06 (V-08), maar geen ondertekende meerwerkofferte. Mehdi staat met de bestelling klaar. Vraag bouwheer om akkoord per mail vóór einde dag.',
  created_at: new Date(today.getTime() - 30 * 60 * 1000).toISOString(),
}).select('id, task, priority, due_date').single();
if (punchErr) { console.error('Punch insert failed:', punchErr.message); process.exit(3); }
console.log(`\n✓ Inserted urgent punch_item: "${punch.task}" (due ${punch.due_date})`);

// ── Reminders: 1 upcoming + 1 overdue ───────────────────────────────────────
const reminders = [
  {
    project_id:      PID,
    field_log_id:    areiLog.id,
    user_id:         proj.owner_id,
    subject:         'AREI-keuring inplannen bij Certineo',
    body:            'Vier weken voor oplevering — boeken bij afspraken@certineo.be. Architect verwacht keuringsattest om voorlopige oplevering te ondertekenen.',
    recipient:       'afspraken@certineo.be',
    recipient_kind:  'external',
    due_at:          inDays(4).toISOString(),
    status:          'pending',
  },
  {
    project_id:      PID,
    field_log_id:    devosLog.id,
    user_id:         proj.owner_id,
    subject:         'Devos terugbellen — compensatie stilstand balk-incident',
    body:            'Patrick verwachtte reactie gisteren. Eerst onderaannemerscontract artikel aansprakelijkheid stilstand checken vóór terugbellen.',
    recipient:       'Patrick Devos',
    recipient_kind:  'internal',
    due_at:          daysAgo(1).toISOString(),
    status:          'pending',
  },
];

const { data: insertedRems, error: remErr } = await supa.from('reminders').insert(reminders).select('id, subject, due_at, status');
if (remErr) { console.error('Reminders insert failed:', remErr.message); process.exit(4); }
console.log(`\n✓ Inserted ${insertedRems.length} reminders:`);
insertedRems.forEach(r => {
  const overdue = new Date(r.due_at) < today;
  console.log(`    - ${overdue ? 'OVERDUE  ' : 'upcoming '} ${r.due_at.slice(0,16)}  ${r.subject}`);
});

console.log('\nDone.');
