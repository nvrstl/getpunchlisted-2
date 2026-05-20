/**
 * Generates a self-contained HTML document string for a Punchlister Dispute Dossier.
 *
 * @param {object} data
 * @param {object} data.dispute     – dispute record
 * @param {object} data.project     – project record
 * @param {Array}  data.points      – dispute points, each with .questions and .evidence arrays
 * @param {string} data.generatedAt – ISO timestamp
 * @returns {string} complete <!DOCTYPE html> document
 */
export function generateDisputeDossierHtml({ dispute, project, points, generatedAt }) {
  function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const TYPE_LABELS = {
    timing:    'Timing & vertraging',
    meerwerk:  'Meerwerk & scopewijziging',
    kwaliteit: 'Kwaliteitsklacht',
    betaling:  'Betaling & facturatie',
    other:     'Overig',
  };

  const TYPE_COLORS = {
    timing:    '#92400E:#FEF3C7',
    meerwerk:  '#1D4ED8:#DBEAFE',
    kwaliteit: '#5B21B6:#EDE9FE',
    betaling:  '#B91C1C:#FEE2E2',
    other:     '#57534E:#F5F5F4',
  };

  function typeStyle(type) {
    const raw = TYPE_COLORS[type] || TYPE_COLORS.other;
    const [text, bg] = raw.split(':');
    return `color:${text};background:${bg}`;
  }

  const EVIDENCE_LABELS = {
    field_log: 'Veldverslag',
    rfi:       'RFI',
    variation: 'Variatie',
  };

  const EVIDENCE_COLORS = {
    field_log: '#92400E:#FEF3C7',
    rfi:       '#1D4ED8:#DBEAFE',
    variation: '#5B21B6:#EDE9FE',
  };

  function evidenceStyle(sourceType) {
    const raw = EVIDENCE_COLORS[sourceType] || '#57534E:#F5F5F4';
    const [text, bg] = raw.split(':');
    return `color:${text};background:${bg}`;
  }

  function renderPoint(point, index) {
    const typeLabel = TYPE_LABELS[point.type] || point.type;
    const questions = point.questions || [];
    const evidence  = point.evidence  || [];
    const hasTimeline = !!point.timeline_reconstruction;
    const hasDraft    = !!point.draft_response;
    const answeredQs  = questions.filter(q => q.answer?.trim());

    const timelineHtml = hasTimeline
      ? `<div class="section-block">
          <div class="block-label">Gereconstrueerde tijdlijn</div>
          ${point.timeline_reconstructed_at
            ? `<p class="meta-note">Gereconstrueerd op ${esc(fmtDateTime(point.timeline_reconstructed_at))}</p>`
            : ''}
          <pre class="timeline-pre">${esc(point.timeline_reconstruction)}</pre>
        </div>`
      : `<div class="section-block empty-block">Tijdlijn nog niet gereconstrueerd.</div>`;

    const qaHtml = questions.length > 0
      ? `<div class="section-block">
          <div class="block-label">PM-input (${answeredQs.length}/${questions.length} beantwoord)</div>
          <div class="qa-list">
            ${questions.map(q => `
              <div class="qa-item">
                <div class="qa-question">${esc(q.question)}</div>
                <div class="qa-answer ${q.answer?.trim() ? '' : 'qa-empty'}">
                  ${q.answer?.trim() ? esc(q.answer.trim()) : '(geen antwoord)'}
                </div>
              </div>`).join('')}
          </div>
        </div>`
      : '';

    const evidenceHtml = evidence.length > 0
      ? `<div class="section-block">
          <div class="block-label">Gebundelde bewijsstukken (${evidence.length})</div>
          <div class="evidence-list">
            ${evidence.map(e => `
              <div class="evidence-item">
                <span class="ev-type" style="${evidenceStyle(e.source_type)}">${esc(EVIDENCE_LABELS[e.source_type] || e.source_type)}</span>
                <div class="ev-body">
                  <div class="ev-label">${esc(e.label)}</div>
                  ${e.relevance_note ? `<div class="ev-note">${esc(e.relevance_note)}</div>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>`
      : '';

    const draftHtml = hasDraft
      ? `<div class="section-block draft-block">
          <div class="block-label">Conceptantwoord</div>
          ${point.draft_generated_at
            ? `<p class="meta-note">Gegenereerd op ${esc(fmtDateTime(point.draft_generated_at))}</p>`
            : ''}
          <div class="draft-text">${esc(point.draft_response).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</div>
        </div>`
      : `<div class="section-block empty-block">Conceptantwoord nog niet gegenereerd.</div>`;

    return `
      <div class="point-card">
        <div class="point-header">
          <span class="point-num">${String(index + 1).padStart(2, '0')}</span>
          <span class="type-chip" style="${typeStyle(point.type)}">${esc(typeLabel)}</span>
          <span class="point-desc">${esc(point.description || '—')}</span>
        </div>
        <div class="point-body">
          ${timelineHtml}
          ${qaHtml}
          ${evidenceHtml}
          ${draftHtml}
        </div>
      </div>`;
  }

  const statusLabels = {
    open:         'Open',
    awaiting_pm:  'Wacht op PM',
    draft_ready:  'Draft klaar',
    under_review: 'In review',
    sent:         'Verzonden',
    archived:     'Gearchiveerd',
  };

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Betwistingsdossier — ${esc(dispute.number || 'DIS')}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:14px}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;
  background:#F5F3EF;
  color:#1C1917;
  line-height:1.6;
  -webkit-font-smoothing:antialiased;
}

/* ── Print bar ─────────────────────────────────────────────────────────────── */
.print-bar{
  position:sticky;top:0;z-index:100;
  background:rgba(255,255,255,0.92);
  backdrop-filter:blur(8px);
  border-bottom:1px solid #E7E5E0;
  padding:10px 24px;
  display:flex;align-items:center;justify-content:flex-end;gap:10px;
}
.print-bar-label{font-size:12px;font-weight:600;color:#78716C;margin-right:auto;letter-spacing:0.02em}
.btn-pdf{
  display:inline-flex;align-items:center;gap:7px;
  background:#1C1917;color:#fff;border:none;border-radius:8px;
  padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;
  transition:background 0.15s,transform 0.1s;letter-spacing:0.01em;
}
.btn-pdf:hover{background:#292524;transform:translateY(-1px)}
.btn-pdf svg{width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none;flex-shrink:0}

/* ── Page ──────────────────────────────────────────────────────────────────── */
.page{max-width:960px;margin:0 auto;padding:28px 24px 56px}

/* ── Header card ───────────────────────────────────────────────────────────── */
.header-card{
  background:#fff;border:1px solid #E7E5E0;border-radius:14px;
  overflow:hidden;margin-bottom:20px;
}
.header-top{
  display:flex;justify-content:space-between;align-items:center;
  padding:20px 24px 14px;gap:12px;
}
.dossier-badge{
  display:inline-flex;align-items:center;gap:7px;
  background:#EDE9FE;color:#5B21B6;
  font-size:11px;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;
  padding:5px 12px;border-radius:20px;border:1px solid #DDD6FE;white-space:nowrap;
}
.header-num{font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;color:#78716C}
.header-project{padding:0 24px 10px}
.project-name{
  font-family:Georgia,'Times New Roman',serif;
  font-size:24px;font-weight:700;color:#1C1917;
  letter-spacing:-0.025em;line-height:1.2;
}
.dispute-subject{font-size:15px;color:#57534E;margin-top:6px;font-weight:500}
.header-meta{display:flex;flex-wrap:wrap;border-top:1px solid #F5F3EF}
.meta-chip{flex:1;min-width:140px;padding:12px 24px}
.meta-chip+.meta-chip{border-left:1px solid #F5F3EF}
.meta-label{font-size:10px;font-weight:800;letter-spacing:0.09em;text-transform:uppercase;color:#A8A29E;margin-bottom:3px}
.meta-value{font-size:13px;font-weight:600;color:#1C1917}

/* ── Status badge ──────────────────────────────────────────────────────────── */
.status-badge{
  display:inline-block;padding:3px 10px;border-radius:20px;
  font-size:11px;font-weight:700;
}

/* ── Points ────────────────────────────────────────────────────────────────── */
.points-header{
  font-size:10px;font-weight:800;letter-spacing:0.10em;text-transform:uppercase;
  color:#A8A29E;margin-bottom:12px;padding-left:2px;
}
.point-card{
  background:#fff;border:1px solid #E7E5E0;border-radius:14px;
  overflow:hidden;margin-bottom:20px;
}
.point-header{
  display:flex;align-items:center;gap:10px;
  padding:14px 20px;border-bottom:1px solid #F5F3EF;
}
.point-num{
  font-family:'Courier New',Courier,monospace;
  font-size:11px;font-weight:700;background:#F5F3EF;
  border-radius:5px;padding:3px 7px;color:#57534E;
  flex-shrink:0;
}
.type-chip{
  display:inline-flex;align-items:center;gap:4px;
  padding:3px 10px;border-radius:20px;
  font-size:11px;font-weight:700;letter-spacing:0.02em;
  flex-shrink:0;
}
.point-desc{font-size:13px;color:#57534E;flex:1;min-width:0}
.point-body{padding:0}

/* ── Section blocks ────────────────────────────────────────────────────────── */
.section-block{
  padding:16px 20px;
  border-top:1px solid #F5F3EF;
}
.section-block:first-child{border-top:none}
.block-label{
  font-size:10px;font-weight:800;letter-spacing:0.09em;text-transform:uppercase;
  color:#A8A29E;margin-bottom:10px;
}
.meta-note{font-size:11px;color:#A8A29E;font-family:'Courier New',monospace;margin-bottom:8px}
.empty-block{color:#A8A29E;font-style:italic;font-size:13px}

/* ── Timeline ──────────────────────────────────────────────────────────────── */
.timeline-pre{
  font-size:12px;color:#57534E;line-height:1.7;
  white-space:pre-wrap;font-family:inherit;
}

/* ── Q&A ───────────────────────────────────────────────────────────────────── */
.qa-list{display:flex;flex-direction:column;gap:12px}
.qa-item{}
.qa-question{font-size:12px;font-weight:600;color:#1C1917;margin-bottom:4px}
.qa-answer{
  font-size:12px;color:#57534E;line-height:1.6;
  background:#F9F8F6;border-radius:8px;padding:8px 12px;
  border:1px solid #E7E5E0;
}
.qa-empty{color:#A8A29E;font-style:italic}

/* ── Evidence ──────────────────────────────────────────────────────────────── */
.evidence-list{display:flex;flex-direction:column;gap:8px}
.evidence-item{display:flex;align-items:flex-start;gap:10px}
.ev-type{
  display:inline-block;padding:2px 8px;border-radius:4px;
  font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;
  white-space:nowrap;flex-shrink:0;margin-top:1px;
}
.ev-body{flex:1;min-width:0}
.ev-label{font-size:13px;font-weight:600;color:#1C1917}
.ev-note{font-size:11px;color:#78716C;margin-top:2px}

/* ── Draft ─────────────────────────────────────────────────────────────────── */
.draft-block{background:#FFFBEB;border-top:1px solid #FDE68A!important}
.draft-text{
  font-size:13px;color:#1C1917;line-height:1.75;
}
.draft-text p{margin-bottom:10px}
.draft-text p:last-child{margin-bottom:0}

/* ── Footer ────────────────────────────────────────────────────────────────── */
.footer{
  text-align:center;padding:24px 24px 20px;
  border-top:1px solid #E7E5E0;margin-top:8px;
}
.footer-brand{font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:700;color:#D97706}
.footer-date{font-size:11px;color:#A8A29E;margin-top:5px}
.footer-note{font-size:11px;color:#A8A29E;margin-top:3px;font-style:italic}

/* ── Print ─────────────────────────────────────────────────────────────────── */
@media print{
  .print-bar{display:none!important}
  body{background:#fff}
  .page{padding:0;max-width:100%}
  .point-card,.header-card{box-shadow:none}
  @page{margin:16mm 14mm}
}
@media(max-width:640px){
  .header-meta{flex-direction:column}
  .meta-chip+.meta-chip{border-left:none;border-top:1px solid #F5F3EF}
  .page{padding:16px 14px 40px}
  .project-name{font-size:19px}
  .print-bar{padding:8px 14px}
}
</style>
</head>
<body>

<div class="print-bar">
  <span class="print-bar-label">Punchlister — Betwistingsdossier ${esc(dispute.number || '')}</span>
  <button class="btn-pdf" onclick="window.print()">
    <svg viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><rect x="6" y="17" width="12" height="5"/><path d="M6 17H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><circle cx="18" cy="13" r="1"/></svg>
    Exporteer PDF
  </button>
</div>

<div class="page">

  <!-- Header -->
  <div class="header-card">
    <div class="header-top">
      <div class="dossier-badge">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;flex-shrink:0">
          <path d="M4 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M5 7h6M5 10h4"/>
        </svg>
        Betwistingsdossier
      </div>
      <span class="header-num">${esc(dispute.number || '—')}</span>
    </div>
    <div class="header-project">
      <div class="project-name">${esc(project.name || 'Onbekend project')}${project.city ? esc(' · ' + project.city) : ''}</div>
      <div class="dispute-subject">${esc(dispute.subject || 'Betwisting')}</div>
    </div>
    <div class="header-meta">
      <div class="meta-chip">
        <div class="meta-label">Afzender claim</div>
        <div class="meta-value">${esc(dispute.sender_email || '—')}</div>
      </div>
      <div class="meta-chip">
        <div class="meta-label">Ontvangen op</div>
        <div class="meta-value">${esc(fmtDate(dispute.created_at))}</div>
      </div>
      <div class="meta-chip">
        <div class="meta-label">Status</div>
        <div class="meta-value">${esc(statusLabels[dispute.status] || dispute.status || '—')}</div>
      </div>
      <div class="meta-chip">
        <div class="meta-label">Betwistpunten</div>
        <div class="meta-value">${points.length}</div>
      </div>
    </div>
  </div>

  <!-- Points -->
  <div class="points-header">Betwistpunten</div>
  ${points.map((p, i) => renderPoint(p, i)).join('\n')}

  <!-- Footer -->
  <div class="footer">
    <div class="footer-brand">Punchlister AI</div>
    <div class="footer-date">Dossier gegenereerd op ${esc(fmtDateTime(generatedAt))}</div>
    <div class="footer-note">Dit dossier is ter voorbereiding — niet voor externe communicatie zonder PM-goedkeuring.</div>
  </div>

</div>
</body>
</html>`;
}
