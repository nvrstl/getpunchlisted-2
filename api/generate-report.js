import Anthropic from '@anthropic-ai/sdk';
import { generateReportHtml } from './reportTemplate.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { date, logs, rfis, tasks, context, projectName, projectLocation } = req.body;

  try {
    const logsSection = (logs || []).length
      ? logs.map(l => `- [${(l.type || 'general').toUpperCase()}] ${l.processedSummary || l.rawNote}${l.location ? ` (${l.location})` : ''}${l.impact && l.impact !== 'none' ? ` — ${l.impact} impact` : ''}`).join('\n')
      : 'No field log entries recorded today.';

    const rfisSection = (rfis || []).length
      ? rfis.map(r => `- ${r.number}: ${r.title} [${r.status.toUpperCase()}]`).join('\n')
      : 'Geen openstaande meerwerken.';

    const tasksSection = (tasks || []).length
      ? tasks.map(t => `- [${t.status === 'completed' ? 'DONE' : t.status === 'in_progress' ? 'IN PROGRESS' : 'PENDING'}] ${t.task} — ${t.assignee || 'Unassigned'}${t.priority === 'high' ? ' [HIGH]' : ''}`).join('\n')
      : 'No action items logged.';

    const dangerItems   = (context || []).filter(c => c.category === 'danger');
    const quoteItems    = (context || []).filter(c => c.category === 'quote');
    const contractItems = (context || []).filter(c => c.category === 'contract');
    const docItems      = (context || []).filter(c => c.category === 'document');
    const noteItems     = (context || []).filter(c => c.category === 'note');

    const contextSection = (context || []).length ? `
DANGER FLAGS (must appear in safetyNotes and alertBoxes):
${dangerItems.length ? dangerItems.map(c => `⚠️ ${c.title}: ${c.content}${c.source ? ` [${c.source}]` : ''}`).join('\n') : 'None.'}

RELEVANT QUOTES:
${quoteItems.length ? quoteItems.map(c => `"${c.content}" — ${c.title}${c.source ? ` (${c.source})` : ''}`).join('\n') : 'None.'}

CONTRACT / DOCUMENT CONTEXT:
${[...contractItems, ...docItems].length ? [...contractItems, ...docItems].map(c => `- ${c.title}: ${c.content}${c.source ? ` [${c.source}]` : ''}`).join('\n') : 'None.'}

BACKGROUND NOTES:
${noteItems.length ? noteItems.map(c => `- ${c.title}: ${c.content}`).join('\n') : 'None.'}
` : '';

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are a construction site report generator. Output ONLY a raw JSON object — no markdown, no code fences, no explanation before or after.

Generate a daily construction site report for: ${date}
Project: ${projectName || 'Construction Project'}
Location: ${projectLocation || 'On Site'}

FIELD LOGS:
${logsSection}

OPENSTAANDE MEERWERKEN:
${rfisSection}

ACTION ITEMS / PUNCH LIST:
${tasksSection}
${contextSection}${dangerItems.length ? `\nCRITICAL: ${dangerItems.length} danger flag(s) — must appear in alertBoxes AND safetyNotes.\n` : ''}
Output this JSON structure (fill every field from the data above):
{"projectName":"...","projectLocation":"...","preparedBy":"...","weather":"...","nextMilestone":"...","handoverTarget":"...","executiveSummary":"2-3 sentence summary, may use HTML bold/italic","workCompleted":[{"title":"...","description":"...","status":"completed"}],"issues":[{"title":"...","description":"...","impactType":"cost","status":"pending"}],"openRfis":[{"number":"...","description":"...","status":"draft"}],"actionItems":{"inProgress":[{"action":"...","responsible":"..."}],"pendingHigh":[{"action":"...","responsible":"..."}],"pendingStandard":[{"action":"...","responsible":"..."}]},"alertBoxes":[],"safetyNotes":{"incidentsReported":false,"reminders":["..."]}}

Rules:
- workCompleted = completed/DONE field logs and tasks
- issues = issue/delay/high-impact logs
- actionItems.inProgress = in_progress tasks
- actionItems.pendingHigh = pending tasks with high priority
- actionItems.pendingStandard = pending tasks with normal/medium priority
- openRfis = mirror the RFI list provided
- impactType must be one of: cost, schedule, quality, compliance, risk
- status values: pending, in_progress, awaiting_approval, closed, draft, submitted
- alertBoxes = empty array unless there are danger flags or critical issues
- If a section has no data use an empty array []`,
      }],
    });

    const rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    if (!rawText.trim()) {
      return res.status(500).json({ success: false, error: 'Claude returned an empty response. Please try again.' });
    }

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ success: false, error: `Claude did not return JSON. Response: "${rawText.slice(0, 120)}"` });
    }

    let reportData;
    try {
      reportData = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      return res.status(500).json({ success: false, error: `JSON parse error: ${parseErr.message}` });
    }

    let html;
    try {
      html = generateReportHtml(reportData, date);
    } catch (templateErr) {
      return res.status(500).json({ success: false, error: `Template error: ${templateErr.message}` });
    }

    if (!html) {
      return res.status(500).json({ success: false, error: 'HTML template returned empty result.' });
    }

    res.json({ success: true, html });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
