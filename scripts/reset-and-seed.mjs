/**
 * Wipe all project-scoped data and seed the Renovatie Lange Violettestraat 47 demo.
 *
 * - Reads MD files from /Users/gauthiertijtgat/Downloads/Demo1PL/demo/
 * - Shifts all dates by DATE_OFFSET_DAYS so "today" lands between V-06 and V-07.
 * - Inbound emails → project_context (category 'email')
 * - Outbound emails → outbound_emails
 * - Voice notes → field_logs + AI-processed via api/process-log.js processNote()
 * - M-F3 → disputes
 *
 * Run:  node scripts/reset-and-seed.mjs
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { processNote } from '../api/process-log.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE env vars.'); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY.'); process.exit(1); }
const supa = createClient(url, key, { auth: { persistSession: false } });

const BUNDLE     = '/Users/gauthiertijtgat/Downloads/Demo1PL/demo';
const OWNER_MAIL = 'hello@gauthiertijtgat.be';

// Shift everything back 15 days so V-06 (real 12 mei) lands ~14 days before today and V-07 (real 9 juni) ~14 days after.
const DATE_OFFSET_DAYS = -15;

const OUR_DOMAIN = ['stijn@vandenbroucke-elektro.be', 'karen@vandenbroucke-elektro.be', 'boekhouding@vandenbroucke-elektro.be', 'mehdi@vandenbroucke-elektro.be'];

const MONTHS_NL = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7,
  augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
};

function parseDutchDate(str) {
  // "dinsdag 10 maart 2026, 09:14" or "16 maart 2026, 08:47"
  const m = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})(?:,\s*(\d{1,2}):(\d{2}))?/i);
  if (!m) return null;
  const [, day, monthName, year, hh, mm] = m;
  const month = MONTHS_NL[monthName.toLowerCase()];
  if (!month) return null;
  const d = new Date(Date.UTC(+year, month - 1, +day, hh ? +hh : 9, mm ? +mm : 0));
  d.setUTCDate(d.getUTCDate() + DATE_OFFSET_DAYS);
  return d;
}

function readMD(rel) {
  return fs.readFileSync(path.join(BUNDLE, rel), 'utf8');
}

function listMD(subdir) {
  return fs.readdirSync(path.join(BUNDLE, subdir))
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => path.join(subdir, f));
}

function parseEmailFile(rel) {
  const raw = readMD(rel);
  const head = {};
  const lines = raw.split('\n');
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const mm = line.match(/^\*\*(Van|Aan|CC|BCC|Datum|Onderwerp):\*\*\s*(.+)$/);
    if (mm) head[mm[1]] = mm[2].trim();
    else if (head.Onderwerp && line.trim() === '') { bodyStart = i + 1; break; }
  }
  // skip blank lines
  while (lines[bodyStart] !== undefined && lines[bodyStart].trim() === '') bodyStart++;
  const body = lines.slice(bodyStart).join('\n').trim();
  const date = head.Datum ? parseDutchDate(head.Datum) : null;
  const from = (head.Van || '').toLowerCase();
  const to   = (head.Aan || '').split(',').map(s => s.trim()).filter(Boolean);
  const cc   = (head.CC  || '').split(',').map(s => s.trim()).filter(Boolean);
  const isOutbound = OUR_DOMAIN.includes(from);
  return { id: rel, head, body, date, from, to, cc, isOutbound, subject: head.Onderwerp || '(geen onderwerp)' };
}

function parseVoiceNote(rel) {
  const raw = readMD(rel);
  const lines = raw.split('\n');
  // First line is e.g. "# V-01 · 16 maart 2026, 08:47"
  const headMatch = lines[0].match(/#\s*V-\d+\s*·\s*(.+)$/);
  const dateStr = headMatch ? headMatch[1] : '';
  const date = parseDutchDate(dateStr);
  const rest = lines.slice(1).join('\n').trim();
  // Strip ">" markdown blockquote markers — voice notes are written as blockquotes
  const cleaned = rest.replace(/^>\s?/gm, '').trim();
  return { id: rel, date, text: cleaned };
}

async function findUserId(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const m = (data?.users || []).find(u => (u.email || '').toLowerCase() === email);
    if (m) return m.id;
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return null;
}

async function main() {
  console.log('=== Punchlister demo seed ===\n');

  // ── 1. Resolve owner ─────────────────────────────────────────────────────
  const ownerId = await findUserId(OWNER_MAIL);
  if (!ownerId) { console.error(`No auth user for ${OWNER_MAIL}.`); process.exit(2); }
  console.log(`Owner: ${OWNER_MAIL}  (id=${ownerId})`);

  // ── 2. Wipe ──────────────────────────────────────────────────────────────
  const { data: existing } = await supa.from('projects').select('id, name');
  console.log(`\nWiping ${existing?.length || 0} existing projects (cascades to all child tables):`);
  (existing || []).forEach(p => console.log(`  - ${p.name}`));
  if (existing?.length) {
    const projectIds = existing.map(p => p.id);
    // Pre-delete tables that don't cascade
    for (const t of ['whatsapp_messages', 'wa_sender_state']) {
      const { error } = await supa.from(t).delete().in('project_id', projectIds);
      if (error && !/does not exist/.test(error.message)) console.warn(`  (skip ${t}: ${error.message})`);
    }
    const { error } = await supa.from('projects').delete().in('id', projectIds);
    if (error) throw error;
  }
  const { count: aiBefore } = await supa.from('ai_usage').select('*', { count: 'exact', head: true });
  await supa.from('ai_usage').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log(`Cleared ai_usage (${aiBefore || 0} rows).`);

  // ── 3. Create project ────────────────────────────────────────────────────
  const startDate    = new Date('2026-02-12'); startDate.setUTCDate(startDate.getUTCDate() + DATE_OFFSET_DAYS);
  const plannedEnd   = new Date('2026-09-30'); plannedEnd.setUTCDate(plannedEnd.getUTCDate() + DATE_OFFSET_DAYS);

  const { data: project, error: pErr } = await supa.from('projects').insert({
    name:                 'Renovatie Lange Violettestraat 47',
    description:          'Volledige elektrische installatie renovatie woning, 9000 Gent.',
    project_number:       '2026/0114',
    status:               'active',
    owner_id:             ownerId,
    client_name:          'Familie Janssens-Vermeire',
    bouwheer_name:        'Pieter Janssens & Sofie Vermeire',
    bouwheer_email:       'pieter.janssens@protonmail.com',
    architect_name:       'Jonas Lemahieu (Studio Lemahieu Architecten)',
    architect_email:      'j.lemahieu@studio-lemahieu.be',
    calculator_name:      'Karen De Pauw',
    calculator_email:     'karen@vandenbroucke-elektro.be',
    project_manager:      'Stijn Vandenbroucke',
    city:                 'Gent',
    start_date:           startDate.toISOString().split('T')[0],
    planned_completion:   plannedEnd.toISOString().split('T')[0],
    contract_value:       23000,
  }).select().single();
  if (pErr) throw pErr;
  console.log(`\nCreated project: ${project.name}  (id=${project.id})`);

  const PID = project.id;

  // ── 4. Members (internal team) ───────────────────────────────────────────
  const teamMembers = [
    { email: OWNER_MAIL, role: 'owner' },
    { email: 'stijn@vandenbroucke-elektro.be', role: 'member' },
    { email: 'mehdi@vandenbroucke-elektro.be', role: 'member' },
    { email: 'karen@vandenbroucke-elektro.be', role: 'member' },
    { email: 'boekhouding@vandenbroucke-elektro.be', role: 'member' },
  ];
  await supa.from('project_members').insert(
    teamMembers.map(m => ({ project_id: PID, email: m.email, role: m.role }))
  );
  console.log(`Inserted ${teamMembers.length} project_members.`);

  // ── 5. Contacts ─────────────────────────────────────────────────────────
  const contacts = [
    { name: 'Pieter Janssens',       role: 'Bouwheer',     email: 'pieter.janssens@protonmail.com' },
    { name: 'Sofie Vermeire',        role: 'Bouwheer',     email: 'sofie.vermeire@gmail.com' },
    { name: 'Jonas Lemahieu',        role: 'Architect',    email: 'j.lemahieu@studio-lemahieu.be',  notes: 'Studio Lemahieu Architecten' },
    { name: 'Patrick Devos',         role: 'Onderaannemer', email: 'info@sleufwerken-devos.be',     notes: 'Sleufwerken Devos BVBA — slijpwerk' },
    { name: 'Caroline Vandenberghe', role: 'Leverancier',  email: 'caroline@lichtatelier-modular.be', notes: 'Lichtatelier Modular Gent' },
    { name: 'Wouter Claes',          role: 'Leverancier',  email: 'w.claes@basalte.be',             notes: 'Basalte — schakelmateriaal' },
    { name: 'Mehdi Ouardi',          role: 'Andere',       email: 'mehdi@vandenbroucke-elektro.be', notes: 'Werfleider intern' },
    { name: 'Karen De Pauw',         role: 'Andere',       email: 'karen@vandenbroucke-elektro.be', notes: 'Calculator intern' },
    { name: 'Ann Verstraete',        role: 'Andere',       email: 'boekhouding@vandenbroucke-elektro.be', notes: 'Boekhouding intern' },
  ];
  const { data: insertedContacts } = await supa.from('project_contacts')
    .insert(contacts.map(c => ({ project_id: PID, ...c })))
    .select();
  console.log(`Inserted ${insertedContacts?.length || 0} project_contacts.`);

  // ── 6. Context: offerte + onderaannemerscontract ────────────────────────
  const offerteText  = readMD('01_quote/getekende_offerte.md');
  const subContract  = readMD('02_subcontractor_contract/onderaannemerscontract_devos.md');
  await supa.from('project_context').insert([
    {
      project_id: PID,
      category:   'quote',
      title:      'Getekende offerte 2026/0114 — Vandenbroucke ↔ Familie Janssens-Vermeire',
      content:    offerteText,
      source:     '01_quote/getekende_offerte.md',
    },
    {
      project_id: PID,
      category:   'contract_subcontractor',
      title:      'Onderaannemerscontract slijpwerk — Sleufwerken Devos BVBA',
      content:    subContract,
      source:     '02_subcontractor_contract/onderaannemerscontract_devos.md',
    },
  ]);
  console.log('Inserted offerte + subcontractor contract as project_context.');

  // ── 7. Emails ───────────────────────────────────────────────────────────
  const emailFiles = listMD('03_emails');
  const parsedEmails = emailFiles.map(parseEmailFile).filter(e => e.date);

  const inboundCtx = [];
  const outboundRows = [];
  for (const e of parsedEmails) {
    if (e.isOutbound) {
      outboundRows.push({
        project_id:    PID,
        user_id:       ownerId,
        to_addresses:  e.to,
        cc_addresses:  e.cc,
        subject:       e.subject,
        body_text:     e.body,
        provider:      'demo-seed',
        status:        'sent',
        sent_at:       e.date.toISOString(),
        created_at:    e.date.toISOString(),
        _sourceId:     e.id,
        _date:         e.date,
      });
    } else {
      inboundCtx.push({
        project_id: PID,
        category:   'email',
        title:      `[${e.from}] ${e.subject}`,
        content:    `Van: ${e.from}\nAan: ${e.to.join(', ')}${e.cc.length ? `\nCC: ${e.cc.join(', ')}` : ''}\nDatum: ${e.date.toISOString()}\nOnderwerp: ${e.subject}\n\n${e.body}`,
        source:     e.id,
        created_at: e.date.toISOString(),
      });
    }
  }
  if (inboundCtx.length) await supa.from('project_context').insert(inboundCtx);
  console.log(`Inserted ${inboundCtx.length} inbound emails as project_context.`);

  if (outboundRows.length) {
    // Strip helper fields before insert
    const rowsToInsert = outboundRows.map(({ _sourceId, _date, ...row }) => row);
    const { data: insertedOut, error: oErr } = await supa.from('outbound_emails').insert(rowsToInsert).select('id, subject, sent_at');
    if (oErr) throw oErr;
    console.log(`Inserted ${insertedOut.length} outbound_emails.`);

    // Mark replied_at on outbound rows that have a matching inbound reply (by subject prefix Re:)
    const subjectKey = (s) => s.replace(/^(Re:|RE:|Fwd:|FW:)\s*/gi, '').trim().toLowerCase();
    const inboundRepliesBySubject = {};
    for (const e of parsedEmails) {
      if (e.isOutbound) continue;
      const key = subjectKey(e.subject);
      (inboundRepliesBySubject[key] = inboundRepliesBySubject[key] || []).push(e);
    }
    for (const row of insertedOut) {
      const key = subjectKey(row.subject);
      const replies = (inboundRepliesBySubject[key] || []).filter(r => new Date(r.date) > new Date(row.sent_at));
      if (replies.length) {
        const earliest = replies.reduce((a, b) => a.date < b.date ? a : b);
        await supa.from('outbound_emails').update({ replied_at: earliest.date.toISOString(), status: 'replied' }).eq('id', row.id);
      }
    }
  }

  // ── 8. Field logs (voice notes) + AI processing ─────────────────────────
  const voiceFiles = listMD('04_voice_notes');
  const voiceNotes = voiceFiles.map(parseVoiceNote).filter(v => v.date);
  console.log(`\nProcessing ${voiceNotes.length} voice notes with Anthropic…`);

  // Build context items for AI prompt — quote + lastenboek + a few inbound mails (so AI knows what's been said)
  const aiContextItems = [
    { category: 'quote',                  title: 'Getekende offerte 2026/0114', content: offerteText, source: 'offerte' },
    { category: 'contract_subcontractor', title: 'Onderaannemerscontract Devos', content: subContract, source: 'contract' },
    ...inboundCtx.slice(0, 8).map(c => ({ category: c.category, title: c.title, content: c.content, source: c.source })),
  ];
  const aiContacts = contacts.map(c => ({ name: c.name, role: c.role, email: c.email }));

  let processed = 0;
  for (const v of voiceNotes) {
    const { data: row, error: insErr } = await supa.from('field_logs').insert({
      project_id:  PID,
      raw_note:    v.text,
      type:        'general',
      processing:  true,
      log_date:    v.date.toISOString().split('T')[0],
      created_at:  v.date.toISOString(),
      source:      'demo-seed',
      user_email:  'stijn@vandenbroucke-elektro.be',
    }).select().single();
    if (insErr) throw insErr;

    try {
      const ai = await processNote(v.text, '', {
        contacts:     aiContacts,
        contextItems: aiContextItems,
        projectName:  project.name,
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
      }).eq('id', row.id);
      processed++;
      console.log(`  ✓ ${path.basename(v.id)}  →  ${ai.label || ai.type}`);
    } catch (err) {
      await supa.from('field_logs').update({ processing: false }).eq('id', row.id);
      console.warn(`  ! ${path.basename(v.id)} AI failed: ${err.message}`);
    }
  }
  console.log(`\nAI-processed ${processed}/${voiceNotes.length} voice notes.`);

  // ── 8b. Seed open punch_items (pre-populated todo's) ────────────────────
  // Items derived from test_mapping.md — what the PM would have on their plate
  // given that "today" sits between V-06 (bekabeling af) and V-07 (basalte crisis).
  const today    = new Date();
  const inDays   = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
  const daysAgo  = (n) => inDays(-n);

  const punchItems = [
    {
      task:      '40% factuur (€ 9.752) versturen — bekabeling afgerond, milestone gehaald',
      assignee:  'Ann Verstraete (boekhouding)',
      priority:  'high',
      due_date:  inDays(2),
      notes:     'Trigger uit V-06: bekabeling volledig af. Conform offerte art. 3 — tweede betaalschijf 40% verschuldigd.',
      status:    'pending',
      created_at: daysAgo(3) + 'T16:30:00Z',
    },
    {
      task:      'Compensatie-discussie Devos beantwoorden — stilstand wegens balk-incident',
      assignee:  'Stijn Vandenbroucke',
      priority:  'high',
      due_date:  inDays(1),
      notes:     'V-04: Patrick vraagt compensatie voor stilstand. Geen beslissing genomen — eerst nakijken in onderaannemerscontract (art. aansprakelijkheid).',
      status:    'pending',
      created_at: daysAgo(10) + 'T11:30:00Z',
    },
    {
      task:      'AREI-keuring inplannen bij Certineo (4 weken voor oplevering)',
      assignee:  'Stijn Vandenbroucke',
      priority:  'medium',
      due_date:  inDays(7),
      notes:     'Conform offerte art. 4 — verplicht voor oplevering. Contact: afspraken@certineo.be',
      status:    'pending',
      created_at: daysAgo(2) + 'T09:00:00Z',
    },
    {
      task:      'Bevestigingsmail naar Pieter & Sofie — bekabeling klaar, mijlpaal',
      assignee:  'Stijn Vandenbroucke',
      priority:  'low',
      due_date:  inDays(3),
      notes:     'V-06: neutrale heads-up dat fase 2 (bekabeling) afgerond is. Volgende stap: plaatsing schakelmateriaal.',
      status:    'pending',
      created_at: daysAgo(2) + 'T18:45:00Z',
    },
    {
      task:      'Opvolgen meerwerkofferte 2026/0114-MW01 (extra lichtgroepen) — Karen heeft becijfering klaar',
      assignee:  'Stijn Vandenbroucke',
      priority:  'medium',
      due_date:  inDays(5),
      notes:     'Akkoord van bouwheer ontvangen op 25/03 (M-B5). Pieter wacht op definitieve factuur na werken.',
      status:    'pending',
      created_at: daysAgo(7) + 'T10:00:00Z',
    },
    {
      task:      'Mehdi briefen — basalte plaatsing wordt voorbereid, schriftelijk akkoord vereist',
      assignee:  'Mehdi Ouardi',
      priority:  'low',
      due_date:  inDays(10),
      notes:     'Anticipatie op V-07 (Sofie wil basalte). Mehdi mag niet bestellen zonder ondertekende meerwerkofferte.',
      status:    'pending',
      created_at: daysAgo(1) + 'T17:20:00Z',
    },
  ];
  const { data: insertedPunch, error: punchErr } = await supa.from('punch_items').insert(
    punchItems.map(p => ({ project_id: PID, ...p }))
  ).select('id, task, priority');
  if (punchErr) console.warn('punch_items insert failed:', punchErr.message);
  else console.log(`Inserted ${insertedPunch?.length || 0} punch_items.`);

  // ── 9. Dispute — M-F3 formele betwisting ────────────────────────────────
  const cf = parseEmailFile('05_complaint/M-F3_formele_betwisting.md');
  if (cf.date) {
    // Also store as inbound email in project_context
    await supa.from('project_context').insert({
      project_id: PID,
      category:   'email',
      title:      `[${cf.from}] ${cf.subject}`,
      content:    `Van: ${cf.from}\nAan: ${cf.to.join(', ')}\nDatum: ${cf.date.toISOString()}\nOnderwerp: ${cf.subject}\n\n${cf.body}`,
      source:     cf.id,
      created_at: cf.date.toISOString(),
    });
    const { data: disp, error: dErr } = await supa.from('disputes').insert({
      project_id:    PID,
      sender_email:  cf.from,
      subject:       cf.subject,
      status:        'open',
      created_at:    cf.date.toISOString(),
    }).select().single();
    if (dErr) console.warn('Dispute insert failed:', dErr.message);
    else console.log(`Inserted dispute: ${disp.subject}`);
  }

  console.log('\n=== Done. ===');
}

main().catch(err => { console.error('\nSEED FAILED:', err); process.exit(99); });
