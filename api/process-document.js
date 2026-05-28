import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { text, filename } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'No text provided' });

  // For large documents the frontend already builds a sampled excerpt with
  // [BEGIN VAN DOCUMENT] / [MIDDEN VAN DOCUMENT] / [EINDE VAN DOCUMENT]
  // markers. Pass it through unchanged so the AI can see content from all
  // three regions; only truncate if it's still over the safety limit.
  const excerpt = text.length > 60000 ? text.slice(0, 60000) : text;
  const isSampled = excerpt.includes('[BEGIN VAN DOCUMENT]') && excerpt.includes('[MIDDEN VAN DOCUMENT]');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are an AI assistant for construction project management. The following is extracted text from a construction document: "${filename || 'uploaded document'}".

Extract the key information that would be useful as context for a site manager. Return ONLY valid JSON — no markdown, no code blocks, just raw JSON.

${isSampled
  ? `IMPORTANT: This is a LARGE document. You are seeing THREE samples (beginning, middle, end) marked with [BEGIN VAN DOCUMENT], [MIDDEN VAN DOCUMENT], and [EINDE VAN DOCUMENT]. The title and category MUST reflect the WHOLE document, not just the opening section.
- If the beginning talks about topic A but the middle/end mentions topics B and C, the title must capture all of them (e.g. "Bestek Technieken — Fluïda + Elektriciteit" not just "Bestek Technieken — Fluïda").
- If the document covers multiple chapters / disciplines / subjects, mention them in the title and summary.
- Look at the section headings in all three samples to determine scope.`
  : 'This document fits in one excerpt.'}

Document text:
${excerpt}

Return exactly this JSON:
{
  "title": "Descriptive title that reflects the WHOLE document's scope (max 80 chars)",
  "summary": "2-4 sentence summary covering all major sections present in the document",
  "keyPoints": ["key obligation or fact 1", "key obligation or fact 2", "...up to 8 items spanning the whole doc"],
  "category": "contract or quote or note"
}

Rules:
- category "contract": specs, lastenboek, scope of work, technical requirements, contracts
- category "quote": price offers, estimates, bills of quantities, meetstaten, hoeveelheidsstaten
- category "note": meeting minutes, correspondence, general documents
- For spreadsheets/meetstaten: keyPoints should highlight the main work packages, total quantities, or cost totals — not individual line items
- For multi-section documents: keyPoints should pull at least one item from each major section visible across the samples`
      }]
    });

    const raw = response.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const data = JSON.parse(raw);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
