import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { number, title, context } = req.body;
  if (!title) return res.status(400).json({ success: false, error: 'Title is required' });
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a senior construction project engineer. Draft a professional RFI (Request for Information) document.

RFI Number: ${number || 'TBD'}
Subject: ${title}
Background/Context: ${context || 'See subject line.'}

Write a formal, professional RFI with these exact sections:
**SUBJECT:** (one line)
**PROJECT:** Main Campus Build — Phase 2
**DATE:** ${new Date().toLocaleDateString()}
**SUBMITTED BY:** Project Engineer

**DESCRIPTION:**
(2-3 sentences describing the issue clearly)

**REQUEST:**
(Specific questions or clarifications needed — use numbered list)

**IMPACT IF UNRESOLVED:**
(Schedule, cost, or quality impact)

**ATTACHMENTS:** None

Keep it concise, factual, and professional. Use plain text, not excessive formatting.`
      }]
    });

    const draft = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    res.json({ success: true, draft });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
