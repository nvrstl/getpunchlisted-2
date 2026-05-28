// Mirror of api/_lib/chunking.js — kept identical so client-side chunking
// matches what the backend would have produced. See that file for tuning
// notes (chunk size, overlap, sentence-boundary preference).

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
