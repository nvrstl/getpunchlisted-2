/**
 * Shared utilities: error formatting, pagination wrapping, response
 * formatting, character-limit truncation.
 */

import { CHARACTER_LIMIT } from "./constants.js";

export interface PaginatedResponse<T> {
  total: number | null;
  count: number;
  offset: number;
  items: T[];
  has_more: boolean;
  next_offset?: number;
  truncated?: boolean;
  truncation_message?: string;
  // Index signature so this can be passed as MCP `structuredContent`.
  [key: string]: unknown;
}

/** Wrap a Supabase list result into the standard paginated shape. */
export function paginate<T>(
  items: T[],
  total: number | null,
  offset: number,
  limit: number,
): PaginatedResponse<T> {
  const count = items.length;
  const has_more =
    total != null ? offset + count < total : count === limit;
  return {
    total,
    count,
    offset,
    items,
    has_more,
    ...(has_more ? { next_offset: offset + count } : {}),
  };
}

/**
 * If a rendered text response is over CHARACTER_LIMIT, halve the items list
 * and re-render. Attach a `truncated` flag + helpful message.
 */
export function applyCharacterLimit<T>(
  response: PaginatedResponse<T>,
  render: (r: PaginatedResponse<T>) => string,
): { text: string; response: PaginatedResponse<T> } {
  let text = render(response);
  let current = response;
  while (text.length > CHARACTER_LIMIT && current.items.length > 1) {
    const next = Math.max(1, Math.floor(current.items.length / 2));
    current = {
      ...current,
      items: current.items.slice(0, next),
      count: next,
      has_more: true,
      next_offset: current.offset + next,
      truncated: true,
      truncation_message: `Response truncated from ${response.items.length} to ${next} items. Use 'offset' or add filters to see more.`,
    };
    text = render(current);
  }
  return { text, response: current };
}

/** Build a uniform error response for MCP tool failures. */
export function toolError(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

/** Catch + format an unknown error for the model. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Format a Supabase error code into something more actionable. */
export function describeSupabaseError(err: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}): string {
  const parts = [err.message ?? "Supabase error"];
  if (err.code) parts.push(`(code ${err.code})`);
  if (err.hint) parts.push(`Hint: ${err.hint}`);
  if (err.details) parts.push(`Details: ${err.details}`);
  return parts.join(" ");
}

/** Truncate a long string for markdown summaries. */
export function snippet(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
