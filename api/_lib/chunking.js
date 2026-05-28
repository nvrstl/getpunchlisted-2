// Split a long document into overlapping chunks for embedding.
//
// Strategy:
//   - Aim for CHUNK_TARGET chars per chunk
//   - Slide with OVERLAP chars so a clause that straddles the boundary is
//     captured in at least one full chunk
//   - Prefer breaking at paragraph (\n\n) or sentence boundaries when the
//     window happens to be near one — keeps chunks semantically coherent
//
// These knobs are tuned for legal/technical Dutch documents where one
// "clause" or "artikel" averages 500-1500 chars. CHUNK_TARGET=1200 means
// most clauses fit fully inside one chunk; OVERLAP=240 means a clause
// spanning a boundary still appears intact in the next chunk.
const CHUNK_TARGET = 1200;
const OVERLAP      = 240;

export function chunkText(text) {
  if (!text || typeof text !== 'string') return [];
  const trimmed = text.replace(/\r\n/g, '\n').trim();
  if (trimmed.length <= CHUNK_TARGET) {
    return [trimmed];
  }

  const out = [];
  let i = 0;
  while (i < trimmed.length) {
    let end = Math.min(i + CHUNK_TARGET, trimmed.length);
    // Try to push `end` forward up to 200 chars to land on a paragraph or
    // sentence break — but don't undo if no good boundary is nearby.
    if (end < trimmed.length) {
      const lookahead = trimmed.slice(end, Math.min(end + 200, trimmed.length));
      const paraBreak = lookahead.search(/\n\n/);
      const sentBreak = lookahead.search(/[.!?]\s/);
      if (paraBreak !== -1 && paraBreak <= 200) {
        end += paraBreak;
      } else if (sentBreak !== -1 && sentBreak <= 200) {
        end += sentBreak + 1;
      }
    }
    const piece = trimmed.slice(i, end).trim();
    if (piece) out.push(piece);
    if (end >= trimmed.length) break;
    i = Math.max(end - OVERLAP, i + 1);
  }
  return out;
}
