import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { rfiTitle, rfiContext, rfiDraft, contextItems } = req.body;
  if (!rfiTitle) return res.status(400).json({ success: false, error: 'RFI title is required' });

  const quoteItems    = (contextItems || []).filter(c => c.category === 'quote');
  const contractItems = (contextItems || []).filter(c => c.category === 'contract');
  const docItems      = (contextItems || []).filter(c => c.category === 'document');
  const noteItems     = (contextItems || []).filter(c => c.category === 'note');

  const formatItems = (items) => items.map(c =>
    `- [${c.title}]${c.source ? ` (${c.source})` : ''}: ${c.content.slice(0, 800)}`
  ).join('\n');

  const contextSection = [
    quoteItems.length    ? `QUOTES / PRICE OFFERS:\n${formatItems(quoteItems)}`       : '',
    contractItems.length ? `CONTRACT / SPECIFICATIONS:\n${formatItems(contractItems)}` : '',
    docItems.length      ? `DOCUMENTS:\n${formatItems(docItems)}`                      : '',
    noteItems.length     ? `NOTES:\n${formatItems(noteItems)}`                         : '',
  ].filter(Boolean).join('\n\n');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const userContent = [];

    // Project context is cached — same per project across multiple RFI pricings
    if (contextSection) {
      userContent.push({
        type: 'text',
        text: `PROJECT CONTEXT:\n${contextSection}`,
        cache_control: { type: 'ephemeral' },
      });
    }

    userContent.push({
      type: 'text',
      text: [
        `RFI SUBJECT: ${rfiTitle}`,
        `RFI CONTEXT: ${rfiContext || 'See subject.'}`,
        rfiDraft ? `RFI DOCUMENT:\n${rfiDraft.slice(0, 1000)}` : '',
        '',
        'Return ONLY a JSON object in this exact structure, no other text:',
        '{"items":[{"description":"...","qty":1,"unit":"ls","unit_rate":0}],"assumptions":["..."]}',
        'Rules: unit_rate is a plain number (no currency symbol). Credits have negative unit_rate.',
        'Keep descriptions concise. Reference specific quotes/documents in assumptions.',
      ].filter(Boolean).join('\n'),
    });

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [{
        type: 'text',
        text: 'You are a senior construction quantity surveyor. Produce accurate, concise pricing propositions based on project context. Always respond with valid JSON as instructed.',
        cache_control: { type: 'ephemeral' },
      }],
      stream: true,
      messages: [{ role: 'user', content: userContent }],
    });

    let fullText = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
        res.write(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, proposition: fullText })}\n\n`);
    res.end();
  } catch (error) {
    console.error('price-rfi error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
}
