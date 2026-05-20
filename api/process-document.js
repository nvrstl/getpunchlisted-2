import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { text, filename } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'No text provided' });

  const excerpt = text.length > 30000 ? text.slice(0, 30000) + '\n\n[... document truncated ...]' : text;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are an AI assistant for construction project management. The following is extracted text from a construction document: "${filename || 'uploaded document'}".

Extract the key information that would be useful as context for a site manager. Return ONLY valid JSON — no markdown, no code blocks, just raw JSON.

Document text:
${excerpt}

Return exactly this JSON:
{
  "title": "Short descriptive title (max 60 chars)",
  "summary": "2-4 sentence summary of what this document covers and its main purpose",
  "keyPoints": ["key obligation or fact 1", "key obligation or fact 2", "...up to 8 items"],
  "category": "contract or quote or note"
}

Rules:
- category "contract": specs, lastenboek, scope of work, technical requirements, contracts
- category "quote": price offers, estimates, bills of quantities, meetstaten, hoeveelheidsstaten
- category "note": meeting minutes, correspondence, general documents
- For spreadsheets/meetstaten: keyPoints should highlight the main work packages, total quantities, or cost totals — not individual line items`
      }]
    });

    const raw = response.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const data = JSON.parse(raw);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
