/**
 * Generates a self-contained HTML document string for the
 * Punchlister Daily Construction Site Report.
 *
 * @param {object} data   – structured report data from Claude
 * @param {string} dateString – formatted date (e.g. "Tuesday, April 15, 2025")
 * @returns {string} complete <!DOCTYPE html> document
 */
export function generateReportHtml(data, dateString) {
  const {
    projectName      = 'Construction Project',
    projectLocation  = 'On Site',
    preparedBy       = 'Site Manager',
    weather          = 'Not recorded',
    nextMilestone    = 'TBD',
    handoverTarget   = 'TBD',
    executiveSummary = 'No summary available.',
    workCompleted    = [],
    issues           = [],
    openRfis         = [],
    actionItems      = {},
    alertBoxes       = [],
    safetyNotes      = {},
  } = data;

  const inProgress      = actionItems.inProgress     || [];
  const pendingHigh     = actionItems.pendingHigh    || [];
  const pendingStandard = actionItems.pendingStandard || [];
  const incidentsReported = safetyNotes.incidentsReported ?? false;
  const safetyReminders   = safetyNotes.reminders || [];

  const stats = {
    issues:    issues.length,
    rfis:      openRfis.length,
    actions:   inProgress.length + pendingHigh.length + pendingStandard.length,
    completed: workCompleted.length,
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function statusBadge(status) {
    const s = (status || '').toLowerCase();
    let color;
    if (['closed', 'completed', 'approved', 'submitted'].includes(s)) color = 'green';
    else if (s === 'draft')                                              color = 'grey';
    else if (['awaiting_approval', 'awaiting'].includes(s))             color = 'red';
    else if (s === 'in_progress')                                        color = 'blue';
    else                                                                 color = 'amber';
    const label = esc(String(status || '').replace(/_/g, ' '));
    return `<span class="badge badge-${color}"><span class="bdot bdot-${color}"></span>${label}</span>`;
  }

  function impactTag(type) {
    const t = (type || '').toLowerCase();
    let color;
    if      (t === 'cost')       color = 'amber';
    else if (t === 'schedule')   color = 'blue';
    else if (t === 'compliance') color = 'purple';
    else                         color = 'red';   // quality, risk, default
    return `<span class="itag itag-${color}">${esc(type)}</span>`;
  }

  // ── Section renderers ──────────────────────────────────────────────────────
  function renderWorkCompleted() {
    if (!workCompleted.length) {
      return `<p class="empty-state">No work completed entries recorded.</p>`;
    }
    return workCompleted.map(item => `
      <div class="work-item">
        <div class="work-check">
          <svg viewBox="0 0 12 12" fill="none" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="2,6 5,9 10,3"/>
          </svg>
        </div>
        <div class="work-body">
          <div class="work-title">${esc(item.title)}</div>
          ${item.description ? `<div class="work-desc">${esc(item.description)}</div>` : ''}
        </div>
        <span class="work-tag">${esc(item.status || 'completed').replace(/_/g, ' ')}</span>
      </div>`).join('');
  }

  function renderIssuesTable() {
    if (!issues.length) {
      return `<p class="empty-state">No issues or delays reported.</p>`;
    }
    const rows = issues.map((issue, i) => `
      <tr>
        <td><span class="mono-num">${String(i + 1).padStart(2, '0')}</span></td>
        <td>
          <div class="td-title">${esc(issue.title)}</div>
          ${issue.description ? `<div class="td-desc">${esc(issue.description)}</div>` : ''}
        </td>
        <td>${impactTag(issue.impactType || issue.impact || 'risk')}</td>
        <td>${statusBadge(issue.status || 'pending')}</td>
      </tr>`).join('');
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:44px">#</th>
              <th>Issue</th>
              <th>Impact</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderRfiTable() {
    if (!openRfis.length) {
      return `<p class="empty-state">No open RFIs.</p>`;
    }
    const rows = openRfis.map(rfi => `
      <tr>
        <td><span class="mono-num">${esc(rfi.number)}</span></td>
        <td>${esc(rfi.description || rfi.title)}</td>
        <td>${statusBadge(rfi.status || 'pending')}</td>
      </tr>`).join('');
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:90px">RFI #</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderActionSection(items, label, colorClass) {
    if (!items.length) return '';
    const rows = items.map(item => `
      <tr>
        <td>${esc(item.action)}</td>
        <td style="width:160px;white-space:nowrap">${esc(item.responsible || 'Unassigned')}</td>
      </tr>`).join('');
    return `
      <div class="action-group">
        <div class="action-header action-header-${colorClass}">${label}</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Action Item</th>
                <th style="width:160px">Responsible</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function renderAlertBoxes() {
    if (!alertBoxes.length) return '';
    return alertBoxes.map(msg => `
      <div class="alert-box">
        <span class="alert-icon">⚠️</span>
        <span class="alert-text">${esc(msg)}</span>
      </div>`).join('');
  }

  function renderSafety() {
    const incidentLine = incidentsReported
      ? `<div class="safety-row safety-incident"><span>🚨</span><span>Incident(s) reported — see details below</span></div>`
      : `<div class="safety-row safety-ok"><span>🛡</span><span>No incidents reported</span></div>`;

    const reminders = safetyReminders.length
      ? safetyReminders.map(r => `<div class="safety-reminder">— ${esc(r)}</div>`).join('')
      : '<div class="safety-reminder muted">No additional safety reminders.</div>';

    return incidentLine + reminders;
  }

  // ── Full HTML ──────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Daily Site Report — ${esc(dateString)}</title>
<style>
/* ── Reset ──────────────────────────────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:14px}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;
  background:#F5F3EF;
  color:#1C1917;
  line-height:1.6;
  -webkit-font-smoothing:antialiased;
}

/* ── Print bar (hidden in print) ───────────────────────────────────────── */
.print-bar{
  position:sticky;
  top:0;
  z-index:100;
  background:rgba(255,255,255,0.92);
  backdrop-filter:blur(8px);
  border-bottom:1px solid #E7E5E0;
  padding:10px 24px;
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:10px;
}
.print-bar-label{
  font-size:12px;
  font-weight:600;
  color:#78716C;
  margin-right:auto;
  letter-spacing:0.02em;
}
.btn-pdf{
  display:inline-flex;
  align-items:center;
  gap:7px;
  background:#1C1917;
  color:#fff;
  border:none;
  border-radius:8px;
  padding:8px 16px;
  font-size:13px;
  font-weight:700;
  cursor:pointer;
  transition:background 0.15s,transform 0.1s;
  letter-spacing:0.01em;
}
.btn-pdf:hover{background:#292524;transform:translateY(-1px)}
.btn-pdf:active{transform:translateY(0)}
.btn-pdf svg{width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none;flex-shrink:0}

/* ── Page ────────────────────────────────────────────────────────────────── */
.page{
  max-width:920px;
  margin:0 auto;
  padding:28px 24px 56px;
}

/* ── Cards ───────────────────────────────────────────────────────────────── */
.card{
  background:#fff;
  border:1px solid #E7E5E0;
  border-radius:14px;
  overflow:hidden;
  margin-bottom:20px;
}
.card-inner{padding:20px 24px}
.card-title{
  font-size:10px;
  font-weight:800;
  letter-spacing:0.10em;
  text-transform:uppercase;
  color:#A8A29E;
  margin-bottom:14px;
}

/* ── 1. HEADER ────────────────────────────────────────────────────────────── */
.header-card{
  background:#fff;
  border:1px solid #E7E5E0;
  border-radius:14px;
  overflow:hidden;
  margin-bottom:20px;
}
.header-top{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:20px 24px 14px;
  gap:12px;
}
.live-badge{
  display:inline-flex;
  align-items:center;
  gap:7px;
  background:#FEF3C7;
  color:#92400E;
  font-size:11px;
  font-weight:800;
  letter-spacing:0.07em;
  text-transform:uppercase;
  padding:5px 12px;
  border-radius:20px;
  border:1px solid #FDE68A;
  white-space:nowrap;
}
@keyframes pulse{
  0%,100%{opacity:1;transform:scale(1)}
  50%{opacity:.35;transform:scale(.65)}
}
.pulse-dot{
  width:7px;height:7px;border-radius:50%;
  background:#F59E0B;
  animation:pulse 2s ease-in-out infinite;
  flex-shrink:0;
}
.header-date{
  font-family:'Courier New',Courier,monospace;
  font-size:13px;
  font-weight:700;
  color:#78716C;
  white-space:nowrap;
}
.header-project{padding:0 24px 10px}
.project-name{
  font-family:Georgia,'Times New Roman',serif;
  font-size:26px;
  font-weight:700;
  color:#1C1917;
  letter-spacing:-0.025em;
  line-height:1.15;
}
.project-sub{
  font-size:13px;
  color:#78716C;
  margin-top:5px;
}
.header-meta{
  display:flex;
  flex-wrap:wrap;
  border-top:1px solid #F5F3EF;
}
.meta-chip{
  flex:1;
  min-width:140px;
  padding:12px 24px;
}
.meta-chip+.meta-chip{border-left:1px solid #F5F3EF}
.meta-label{
  font-size:10px;
  font-weight:800;
  letter-spacing:0.09em;
  text-transform:uppercase;
  color:#A8A29E;
  margin-bottom:3px;
}
.meta-value{
  font-size:13px;
  font-weight:600;
  color:#1C1917;
}

/* ── 2. STAT CARDS ──────────────────────────────────────────────────────── */
.stats-grid{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:12px;
  margin-bottom:20px;
}
.stat-card{
  background:#fff;
  border:1px solid #E7E5E0;
  border-radius:14px;
  padding:20px 20px 16px;
  transition:transform 0.18s ease,box-shadow 0.18s ease;
}
.stat-card:hover{
  transform:translateY(-3px);
  box-shadow:0 8px 24px rgba(0,0,0,0.07);
}
.stat-number{
  font-family:Georgia,'Times New Roman',serif;
  font-size:38px;
  font-weight:700;
  line-height:1;
  letter-spacing:-0.04em;
  margin-bottom:7px;
}
.stat-label{
  font-size:10px;
  font-weight:800;
  letter-spacing:0.09em;
  text-transform:uppercase;
  color:#78716C;
}
.stat-issues   .stat-number{color:#DC2626}
.stat-rfis     .stat-number{color:#D97706}
.stat-actions  .stat-number{color:#2563EB}
.stat-completed .stat-number{color:#16A34A}

/* ── Badges ──────────────────────────────────────────────────────────────── */
.badge{
  display:inline-flex;
  align-items:center;
  gap:5px;
  font-size:11px;
  font-weight:700;
  padding:3px 9px;
  border-radius:20px;
  white-space:nowrap;
  letter-spacing:0.02em;
}
.bdot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.badge-green{background:#DCFCE7;color:#15803D} .bdot-green{background:#16A34A}
.badge-amber{background:#FEF3C7;color:#92400E} .bdot-amber{background:#F59E0B}
.badge-blue {background:#DBEAFE;color:#1D4ED8} .bdot-blue {background:#3B82F6}
.badge-red  {background:#FEE2E2;color:#B91C1C} .bdot-red  {background:#EF4444}
.badge-grey {background:#F5F5F4;color:#57534E} .bdot-grey {background:#A8A29E}

/* ── Impact tags ─────────────────────────────────────────────────────────── */
.itag{
  display:inline-block;
  font-size:10px;
  font-weight:800;
  letter-spacing:0.06em;
  text-transform:uppercase;
  padding:2px 7px;
  border-radius:4px;
  white-space:nowrap;
}
.itag-amber {background:#FEF3C7;color:#92400E}
.itag-blue  {background:#DBEAFE;color:#1D4ED8}
.itag-red   {background:#FEE2E2;color:#B91C1C}
.itag-purple{background:#EDE9FE;color:#5B21B6}

/* ── 3. Executive summary ────────────────────────────────────────────────── */
.summary-text{
  font-size:14px;
  color:#57534E;
  line-height:1.75;
}
.summary-text strong{color:#1C1917;font-weight:700}
.summary-text em{font-style:italic}

/* ── 4. Work completed ───────────────────────────────────────────────────── */
.work-item{
  display:flex;
  align-items:flex-start;
  gap:12px;
  padding:12px 0;
  border-bottom:1px solid #F5F3EF;
}
.work-item:last-child{border-bottom:none}
.work-check{
  width:22px;height:22px;border-radius:50%;
  background:#DCFCE7;
  border:1.5px solid #86EFAC;
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;margin-top:1px;
}
.work-check svg{width:11px;height:11px}
.work-body{flex:1;min-width:0}
.work-title{font-size:13px;font-weight:700;color:#1C1917}
.work-desc {font-size:12px;color:#78716C;margin-top:2px}
.work-tag{
  font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;
  background:#DCFCE7;color:#15803D;
  padding:2px 8px;border-radius:4px;
  flex-shrink:0;white-space:nowrap;margin-top:2px;
}

/* ── 5 & 6. Tables ───────────────────────────────────────────────────────── */
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse}
thead th{
  font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;
  color:#A8A29E;
  padding:10px 14px;
  text-align:left;
  border-bottom:1px solid #E7E5E0;
  background:#FAFAF8;
  white-space:nowrap;
}
tbody tr{border-bottom:1px solid #F5F3EF;transition:background 0.1s}
tbody tr:last-child{border-bottom:none}
tbody tr:hover{background:#FAFAF8}
td{padding:12px 14px;vertical-align:top;font-size:13px}
.mono-num{
  font-family:'Courier New',Courier,monospace;
  font-size:11px;font-weight:700;
  background:#F5F3EF;border-radius:5px;
  padding:3px 7px;color:#57534E;
  display:inline-block;
  white-space:nowrap;
}
.td-title{font-weight:700;font-size:13px;color:#1C1917}
.td-desc {font-size:12px;color:#78716C;margin-top:2px}

/* ── 7. Action items ─────────────────────────────────────────────────────── */
.action-group{margin-bottom:16px}
.action-group:last-child{margin-bottom:0}
.action-header{
  padding:9px 16px;
  font-size:11px;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;
  color:#fff;border-radius:7px 7px 0 0;
}
.action-header-amber {background:linear-gradient(90deg,#B45309,#D97706)}
.action-header-red   {background:linear-gradient(90deg,#991B1B,#DC2626)}
.action-header-blue  {background:linear-gradient(90deg,#1E40AF,#2563EB)}
.action-group .table-wrap{border:1px solid #E7E5E0;border-top:none;border-radius:0 0 7px 7px;overflow:hidden}
.action-group table thead th{background:#FAFAF8}
.action-group table tbody tr:last-child td{border-bottom:none}

/* ── 8. Alerts ───────────────────────────────────────────────────────────── */
.alerts-section{margin-bottom:20px}
.alert-box{
  display:flex;gap:12px;align-items:flex-start;
  background:#FFFBEB;
  border:1px solid #FDE68A;
  border-radius:10px;
  padding:13px 16px;
  margin-bottom:10px;
}
.alert-box:last-child{margin-bottom:0}
.alert-icon{font-size:16px;flex-shrink:0;line-height:1.4}
.alert-text{font-size:13px;color:#78350F;line-height:1.55;font-weight:500}

/* ── 9. Safety ───────────────────────────────────────────────────────────── */
.safety-row{
  display:flex;align-items:center;gap:9px;
  font-weight:700;font-size:14px;
  margin-bottom:12px;
}
.safety-ok      {color:#15803D}
.safety-incident{color:#B91C1C}
.safety-reminder{
  font-size:13px;color:#78716C;
  padding-left:4px;margin-bottom:5px;
}
.safety-reminder.muted{font-style:italic}

/* ── 10. Footer ──────────────────────────────────────────────────────────── */
.footer{
  text-align:center;
  padding:24px 24px 20px;
  border-top:1px solid #E7E5E0;
  margin-top:8px;
}
.footer-brand{
  font-family:Georgia,'Times New Roman',serif;
  font-size:16px;font-weight:700;
  color:#D97706;
  letter-spacing:-0.01em;
}
.footer-date{font-size:11px;color:#A8A29E;margin-top:5px}

/* ── Misc ────────────────────────────────────────────────────────────────── */
.empty-state{
  font-size:13px;color:#A8A29E;font-style:italic;
  padding:4px 0;
}

/* ── Responsive: 2-col stat grid on mobile ───────────────────────────────── */
@media(max-width:640px){
  .stats-grid{grid-template-columns:repeat(2,1fr)}
  .header-meta{flex-direction:column}
  .meta-chip+.meta-chip{border-left:none;border-top:1px solid #F5F3EF}
  .page{padding:16px 14px 40px}
  .project-name{font-size:20px}
  th,td{padding:9px 10px}
  .print-bar{padding:8px 14px}
}

/* ── Print / PDF ─────────────────────────────────────────────────────────── */
@media print{
  .print-bar{display:none!important}
  body{background:#fff}
  .page{padding:0;max-width:100%}
  .stat-card:hover{transform:none;box-shadow:none}
  .stat-card,.card,.header-card{box-shadow:none}
  tbody tr:hover{background:transparent}
  @page{margin:18mm 14mm}
}
</style>
</head>
<body>

<!-- Print bar -->
<div class="print-bar">
  <span class="print-bar-label">Punchlister — Daily Site Report</span>
  <button class="btn-pdf" onclick="window.print()">
    <svg viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><rect x="6" y="17" width="12" height="5"/><path d="M6 17H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><circle cx="18" cy="13" r="1"/></svg>
    Export to PDF
  </button>
</div>

<div class="page">

  <!-- ── 1. HEADER ──────────────────────────────────────────────────────── -->
  <div class="header-card">
    <div class="header-top">
      <div class="live-badge"><span class="pulse-dot"></span>Daily Site Report</div>
      <div class="header-date">${esc(dateString)}</div>
    </div>
    <div class="header-project">
      <div class="project-name">${esc(projectName)}</div>
      <div class="project-sub">📍 ${esc(projectLocation)}</div>
    </div>
    <div class="header-meta">
      <div class="meta-chip">
        <div class="meta-label">Prepared By</div>
        <div class="meta-value">${esc(preparedBy)}</div>
      </div>
      <div class="meta-chip">
        <div class="meta-label">Weather</div>
        <div class="meta-value">${esc(weather)}</div>
      </div>
      <div class="meta-chip">
        <div class="meta-label">Next Milestone</div>
        <div class="meta-value">${esc(nextMilestone)}</div>
      </div>
      <div class="meta-chip">
        <div class="meta-label">Handover Target</div>
        <div class="meta-value">${esc(handoverTarget)}</div>
      </div>
    </div>
  </div>

  <!-- ── 2. STAT CARDS ──────────────────────────────────────────────────── -->
  <div class="stats-grid">
    <div class="stat-card stat-issues">
      <div class="stat-number">${stats.issues}</div>
      <div class="stat-label">Issues</div>
    </div>
    <div class="stat-card stat-rfis">
      <div class="stat-number">${stats.rfis}</div>
      <div class="stat-label">Open RFIs</div>
    </div>
    <div class="stat-card stat-actions">
      <div class="stat-number">${stats.actions}</div>
      <div class="stat-label">Action Items</div>
    </div>
    <div class="stat-card stat-completed">
      <div class="stat-number">${stats.completed}</div>
      <div class="stat-label">Completed</div>
    </div>
  </div>

  <!-- ── 3. EXECUTIVE SUMMARY ───────────────────────────────────────────── -->
  <div class="card">
    <div class="card-inner">
      <div class="card-title">Executive Summary</div>
      <div class="summary-text">${executiveSummary}</div>
    </div>
  </div>

  <!-- ── 4. WORK COMPLETED ──────────────────────────────────────────────── -->
  <div class="card">
    <div class="card-inner">
      <div class="card-title">Work Completed</div>
      ${renderWorkCompleted()}
    </div>
  </div>

  <!-- ── 5. ISSUES & DELAYS ─────────────────────────────────────────────── -->
  <div class="card">
    <div class="card-inner">
      <div class="card-title">Issues &amp; Delays</div>
      ${renderIssuesTable()}
    </div>
  </div>

  <!-- ── 6. OPEN RFIs ───────────────────────────────────────────────────── -->
  <div class="card">
    <div class="card-inner">
      <div class="card-title">Open RFIs</div>
      ${renderRfiTable()}
    </div>
  </div>

  <!-- ── 8. ALERT BOXES (after RFIs) ────────────────────────────────────── -->
  ${alertBoxes.length ? `<div class="alerts-section">${renderAlertBoxes()}</div>` : ''}

  <!-- ── 7. ACTION ITEMS ────────────────────────────────────────────────── -->
  <div class="card">
    <div class="card-inner">
      <div class="card-title">Action Items</div>
      ${renderActionSection(inProgress, 'In Progress', 'amber')}
      ${renderActionSection(pendingHigh, 'Pending — High Priority', 'red')}
      ${renderActionSection(pendingStandard, 'Pending — Standard Priority', 'blue')}
      ${(!inProgress.length && !pendingHigh.length && !pendingStandard.length)
        ? '<p class="empty-state">No action items recorded.</p>'
        : ''}
    </div>
  </div>

  <!-- ── 9. SAFETY NOTES ────────────────────────────────────────────────── -->
  <div class="card">
    <div class="card-inner">
      <div class="card-title">Safety Notes</div>
      ${renderSafety()}
    </div>
  </div>

  <!-- ── 10. FOOTER ─────────────────────────────────────────────────────── -->
  <div class="footer">
    <div class="footer-brand">Punchlister AI</div>
    <div class="footer-date">${esc(dateString)}</div>
  </div>

</div>
</body>
</html>`;
}
