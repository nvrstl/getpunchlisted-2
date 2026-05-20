import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_EMAIL = 'hello@gauthiertijtgat.be';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  // Get user by email
  const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers();
  if (usersErr) { console.error('listUsers:', usersErr.message); process.exit(1); }

  let user = users.find(u => u.email === USER_EMAIL);
  if (!user) {
    // Create the user if they don't exist yet
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: USER_EMAIL,
      password: 'Punchlister123!',
      email_confirm: true,
    });
    if (createErr) { console.error('createUser:', createErr.message); process.exit(1); }
    user = created.user;
    console.log('Created user:', user.email);
  } else {
    console.log('Found user:', user.email, user.id);
  }

  const uid = user.id;

  // ── Projects ────────────────────────────────────────────────────────────────
  const { data: projects, error: projErr } = await supabase.from('projects').insert([
    {
      name: 'Antwerp Office Tower', project_number: 'PRJ-2024-001',
      status: 'active', client_name: 'Immo Scheldt NV', project_manager: 'Gauthier Tijtgat',
      city: 'Antwerp', start_date: '2024-02-01', planned_completion: '2025-06-30',
      contract_value: 4200000, description: '12-storey commercial office build near Central Station.',
      owner_id: uid,
    },
    {
      name: 'Ghent Residential Phase 2', project_number: 'PRJ-2024-003',
      status: 'punch_phase', client_name: 'Stadswonen Gent', project_manager: 'Gauthier Tijtgat',
      city: 'Ghent', start_date: '2023-09-01', planned_completion: '2025-03-31',
      contract_value: 1850000, description: '24-unit residential apartment block, phase 2.',
      owner_id: uid,
    },
    {
      name: 'Brussels HQ Fit-Out', project_number: 'PRJ-2025-001',
      status: 'pre_construction', client_name: 'FinTech Belgium SA', project_manager: 'Lois Vermeersch',
      city: 'Brussels', start_date: '2025-05-01', planned_completion: '2025-10-15',
      contract_value: 980000, description: 'Full interior fit-out of 3 floors, 2400 m².',
      owner_id: uid,
    },
  ]).select();
  if (projErr) { console.error('projects:', projErr.message); process.exit(1); }
  console.log('Inserted', projects.length, 'projects');

  const [p1, p2, p3] = projects;

  // ── Field Logs ──────────────────────────────────────────────────────────────
  const { data: logs, error: logsErr } = await supabase.from('field_logs').insert([
    // P1 - Antwerp
    { project_id: p1.id, raw_note: 'Concrete pour on level 4 slab — 180m³ placed. Slight delay due to pump truck arriving 45 min late. Overall good quality finish.', location: 'Level 4 slab', type: 'progress', processed_summary: 'L4 slab poured (180m³). 45-min pump delay, quality acceptable.', flags: ['delay'], impact: 'low', action_required: false, suggest_rfi: false, processing: false },
    { project_id: p1.id, raw_note: 'Curtain wall subcontractor (Glasstek) only had 6 crew on site today instead of 10. Falling behind on grid axis B-C floors 3-5.', location: 'Facade B-C F3-F5', type: 'issue', processed_summary: 'Glasstek understaffed (6 vs 10). Risk of curtain wall delay on B-C.', flags: ['delay', 'subcontractor'], impact: 'medium', action_required: true, suggest_rfi: false, processing: false },
    { project_id: p1.id, raw_note: 'Structural engineer visited and approved rebar placement for core walls level 5. No issues raised. Pour can proceed Friday.', location: 'Core walls L5', type: 'approval', processed_summary: 'SE approved L5 core wall rebar. Pour cleared for Friday.', flags: [], impact: 'none', action_required: false, suggest_rfi: false, processing: false },
    { project_id: p1.id, raw_note: 'Water ingress found at joint between ground slab and north basement wall. About 2m wide damp patch. Not in drawings — need detail from engineer.', location: 'Basement north wall', type: 'issue', processed_summary: 'Water ingress at slab/wall joint (north basement). Engineering detail needed.', flags: ['defect', 'water'], impact: 'high', action_required: true, suggest_rfi: true, processing: false },
    // P2 - Ghent
    { project_id: p2.id, raw_note: 'Painter finished unit 12 and 14 first coat. Noted roller marks on ceiling of unit 12 bedroom — needs rework before second coat.', location: 'Units 12 & 14', type: 'quality', processed_summary: 'Paint first coat done U12+14. Ceiling roller marks in U12 bedroom — rework needed.', flags: ['defect', 'quality'], impact: 'low', action_required: true, suggest_rfi: false, processing: false },
    { project_id: p2.id, raw_note: 'Electrical inspection passed for floors 1-3. Certificate issued on site. Floors 4-6 booked for next Thursday.', location: 'Floors 1-3', type: 'approval', processed_summary: 'Electrical inspection passed F1-3. F4-6 inspection next Thursday.', flags: [], impact: 'none', action_required: false, suggest_rfi: false, processing: false },
    { project_id: p2.id, raw_note: 'Screed in units 3, 5, 7 cracking at doorways. Width up to 2mm. Possibly due to lack of movement joints. Need to check spec.', location: 'Units 3, 5, 7', type: 'issue', processed_summary: 'Screed cracking at doorways (up to 2mm) in U3/5/7. Movement joint compliance unclear.', flags: ['defect', 'structural'], impact: 'medium', action_required: true, suggest_rfi: true, processing: false },
    // P3 - Brussels
    { project_id: p3.id, raw_note: 'Site meeting with client to review floor plan layout. Client wants to shift the boardroom from east to west side. Will need revised drawing issue.', location: 'Floor 2', type: 'general', processed_summary: 'Client requests boardroom relocation E→W. Revised drawings required.', flags: ['variation'], impact: 'medium', action_required: true, suggest_rfi: false, processing: false },
  ]).select();
  if (logsErr) { console.error('field_logs:', logsErr.message); process.exit(1); }
  console.log('Inserted', logs.length, 'field logs');

  // ── RFIs ────────────────────────────────────────────────────────────────────
  const { error: rfiErr } = await supabase.from('rfis').insert([
    { project_id: p1.id, number: 'RFI-001', title: 'Basement wall waterproofing detail at slab junction', context: 'Water ingress found at ground slab / north basement wall joint. No waterproofing detail shown on drawings for this condition.', draft: 'We have identified water ingress at the junction of the ground-floor slab and the north basement retaining wall (Grid A, Ch. 0.0–2.0m). The current drawing set does not include a waterproofing detail for this condition. Please provide a remedial detail and specify the preferred membrane system.', status: 'open', field_log_id: logs[3].id },
    { project_id: p1.id, number: 'RFI-002', title: 'Curtain wall grid tolerance at level 3 transition', context: 'Grid axis B-C shows 6mm discrepancy between structural frame and curtain wall setting-out. Clarification needed before proceeding.', draft: 'During curtain wall installation on grid B-C (Levels 3–5) a 6mm horizontal discrepancy was measured between the structural frame and the approved curtain wall setting-out. Please advise whether this falls within acceptable tolerance or if the frame requires remediation prior to glazing installation.', status: 'draft' },
    { project_id: p2.id, number: 'RFI-001', title: 'Screed movement joint requirement at doorways', context: 'Screed cracking observed at all doorway thresholds on floors 1-3. Spec section 4.3 does not specify movement joint locations.', draft: 'Cracking (up to 2mm width) has been observed in the screed at doorway thresholds in Units 3, 5, and 7. Specification section 4.3 does not define movement joint locations. Please confirm whether movement joints are required at these locations and, if so, provide revised details.', status: 'open', field_log_id: logs[6].id },
  ]);
  if (rfiErr) { console.error('rfis:', rfiErr.message); process.exit(1); }
  console.log('Inserted RFIs');

  // ── Punch Items ─────────────────────────────────────────────────────────────
  const { error: punchErr } = await supabase.from('punch_items').insert([
    // P1 Antwerp
    { project_id: p1.id, task: 'Install temporary hoarding on north street boundary', assignee: 'Site Crew', priority: 'high', due_date: '2025-04-10', status: 'completed', completed_at: '2025-04-08T09:00:00Z' },
    { project_id: p1.id, task: 'Seal basement wall water ingress — apply SikaProof membrane', assignee: 'Sika contractor', priority: 'high', due_date: '2025-04-15', status: 'pending', notes: 'Awaiting RFI-001 response before proceeding' },
    { project_id: p1.id, task: 'Glasstek crew increase to 10 — confirm with foreman', assignee: 'Gauthier Tijtgat', priority: 'medium', due_date: '2025-04-11', status: 'pending' },
    { project_id: p1.id, task: 'Order rebar for L6 core walls (32T ref. BOM-047)', assignee: 'Procurement', priority: 'medium', due_date: '2025-04-18', status: 'pending' },
    { project_id: p1.id, task: 'Close out Level 3 snagging list from last inspection', assignee: 'Site Crew', priority: 'low', due_date: '2025-04-25', status: 'pending' },
    // P2 Ghent
    { project_id: p2.id, task: 'Repaint ceiling in Unit 12 bedroom (remove roller marks)', assignee: 'ColorPro BVBA', priority: 'medium', due_date: '2025-04-07', status: 'completed', completed_at: '2025-04-06T14:30:00Z' },
    { project_id: p2.id, task: 'Cut and fill screed cracks in Units 3, 5, 7 doorways', assignee: 'Screed subcontractor', priority: 'high', due_date: '2025-04-14', status: 'in_progress', notes: 'Pending RFI-001 clarification on movement joints' },
    { project_id: p2.id, task: 'Complete snagging walk-through floors 4-6 with client', assignee: 'Gauthier Tijtgat', priority: 'high', due_date: '2025-04-12', status: 'pending' },
    { project_id: p2.id, task: 'Install balcony balustrades units 18-24', assignee: 'MetalFab NV', priority: 'medium', due_date: '2025-04-20', status: 'pending' },
    { project_id: p2.id, task: 'Fire door certification — collect all certificates from supplier', assignee: 'Lois Vermeersch', priority: 'high', due_date: '2025-04-16', status: 'pending' },
    // P3 Brussels
    { project_id: p3.id, task: 'Obtain revised drawings for boardroom relocation', assignee: 'Architect', priority: 'high', due_date: '2025-05-05', status: 'pending' },
    { project_id: p3.id, task: 'Submit building permit amendment for layout change', assignee: 'Gauthier Tijtgat', priority: 'high', due_date: '2025-05-12', status: 'pending' },
  ]);
  if (punchErr) { console.error('punch_items:', punchErr.message); process.exit(1); }
  console.log('Inserted punch items');

  // ── Subcontractors ──────────────────────────────────────────────────────────
  const { error: subErr } = await supabase.from('subcontractors').insert([
    // P1 Antwerp
    { project_id: p1.id, company: 'Glasstek Facades NV', trade: 'Curtain Wall / Glazing', contact: 'Pieter Janssen', phone: '+32 477 123 456', crew_size: 6, work_area: 'Facade grid B-C, Floors 3-5', status: 'on_site', notes: 'Understaffed — escalate if not at 10 crew by Thu' },
    { project_id: p1.id, company: 'BetoCraft Belgium', trade: 'Concrete & Formwork', contact: 'Sofie De Backer', phone: '+32 489 654 321', crew_size: 14, work_area: 'Level 4-6 slabs and core walls', status: 'on_site' },
    { project_id: p1.id, company: 'ElectroPro Antwerpen', trade: 'Electrical', contact: 'Marc Willems', phone: '+32 465 789 012', crew_size: 8, work_area: 'Floors 1-6 rough-in', status: 'on_site' },
    { project_id: p1.id, company: 'Sika Waterproofing', trade: 'Waterproofing', contact: 'Tom Claes', phone: '+32 472 345 678', crew_size: 3, work_area: 'Basement', status: 'off_site', notes: 'Mobilising pending RFI-001 response' },
    // P2 Ghent
    { project_id: p2.id, company: 'ColorPro BVBA', trade: 'Painting & Finishing', contact: 'Nico Aerts', phone: '+32 491 234 567', crew_size: 4, work_area: 'Units 1-24 all floors', status: 'on_site' },
    { project_id: p2.id, company: 'MetalFab NV', trade: 'Steel & Balustrades', contact: 'Dirk Peeters', phone: '+32 483 901 234', crew_size: 3, work_area: 'Balconies units 18-24', status: 'on_site' },
    { project_id: p2.id, company: 'ScreedMasters Gent', trade: 'Screed & Flooring', contact: 'An Vermeulen', phone: '+32 476 567 890', crew_size: 5, work_area: 'All units', status: 'on_site', notes: 'Crack repair underway — monitor closely' },
    // P3 Brussels
    { project_id: p3.id, company: 'OfficeKit Belgium', trade: 'Interior Fit-Out', contact: 'Charlotte Leclercq', phone: '+32 488 112 233', crew_size: 0, work_area: 'Floors 1-3', status: 'off_site', notes: 'Mobilising May 2025' },
  ]);
  if (subErr) { console.error('subcontractors:', subErr.message); process.exit(1); }
  console.log('Inserted subcontractors');

  // ── Variations ──────────────────────────────────────────────────────────────
  const { error: varErr } = await supabase.from('variations').insert([
    // P1 Antwerp
    { project_id: p1.id, number: 'VAR-001', description: 'Additional waterproofing to basement north wall (unspecified in contract)', requested_by: 'Site Manager', estimated_cost: 18500, status: 'submitted', notes: 'Triggered by water ingress discovery. Awaiting client approval.', field_log_id: logs[3].id },
    { project_id: p1.id, number: 'VAR-002', description: 'Upgrade curtain wall glass spec from 6mm to 8mm toughened on level 3 per client request', requested_by: 'Client – Immo Scheldt', estimated_cost: 34000, status: 'approved', notes: 'Approved via email 2025-03-18.' },
    { project_id: p1.id, number: 'VAR-003', description: 'Additional lighting circuit to level 2 common area — not in original electrical scope', requested_by: 'ElectroPro', estimated_cost: 4200, status: 'draft' },
    // P2 Ghent
    { project_id: p2.id, number: 'VAR-001', description: 'Supply and install movement joints at all doorway thresholds — omission in spec', requested_by: 'Site Manager', estimated_cost: 6800, status: 'submitted', notes: 'Linked to RFI-001. Cost to be confirmed after engineer response.', field_log_id: logs[6].id },
    { project_id: p2.id, number: 'VAR-002', description: 'Upgrade balustrade finish from powder-coat to brushed stainless — client upgrade', requested_by: 'Client – Stadswonen Gent', estimated_cost: 11200, status: 'approved' },
    // P3 Brussels
    { project_id: p3.id, number: 'VAR-001', description: 'Boardroom relocation from east to west side — full redesign of floor 2 layout', requested_by: 'Client – FinTech Belgium', estimated_cost: 28000, status: 'draft', notes: 'Pending revised drawings and structural assessment.', field_log_id: logs[7].id },
  ]);
  if (varErr) { console.error('variations:', varErr.message); process.exit(1); }
  console.log('Inserted variations');

  console.log('\nSeed complete!');
}

seed().catch(console.error);
