import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DEFAULT_MODEL      = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 900;
const MAX_ALLOWED_TOKENS = 4000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { system, messages, max_tokens, model } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'messages required' });
  }
  if (typeof system !== 'string') {
    return res.status(400).json({ success: false, error: 'system required' });
  }

  try {
    const response = await anthropic.messages.create({
      model:      model || DEFAULT_MODEL,
      max_tokens: Math.min(MAX_ALLOWED_TOKENS, Number(max_tokens) || DEFAULT_MAX_TOKENS),
      system,
      messages,
    });
    const text = response.content?.[0]?.text?.trim() || '';
    res.json({ success: true, text, usage: response.usage });
  } catch (err) {
    console.error('[chat]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
