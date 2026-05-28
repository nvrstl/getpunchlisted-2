// OpenAI text-embedding-3-small wrapper. 1536 dims, $0.02 per 1M tokens.
// Used for context_chunks (semantic retrieval over uploaded documents) and
// for embedding the user's query at chat time.
//
// Batches requests so a 500-chunk document doesn't fan out into 500 round
// trips. OpenAI's embeddings endpoint accepts arrays — single call.

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMS = 1536;
// OpenAI's hard limit is 300k tokens / 2048 inputs per request. We stay
// well under by capping batches at 64 chunks; each chunk is < 8k tokens.
const BATCH_SIZE = 64;

export async function embedTexts(texts) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set — required for embeddings');
  }
  if (!texts?.length) return [];

  const out = new Array(texts.length);
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await fetch(OPENAI_EMBEDDING_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI embeddings failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    if (!Array.isArray(json.data)) {
      throw new Error('OpenAI embeddings: unexpected response shape');
    }
    for (let j = 0; j < json.data.length; j++) {
      out[i + j] = json.data[j].embedding;
    }
  }
  return out;
}

export async function embedOne(text) {
  const [v] = await embedTexts([text]);
  return v;
}

export { EMBED_MODEL, EMBED_DIMS };
