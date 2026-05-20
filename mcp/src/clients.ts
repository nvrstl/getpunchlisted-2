/**
 * Shared clients: Supabase (service role) for DB reads, fetch for the
 * Express API for AI workflow tools. Built lazily so the server can boot
 * even if optional env vars are missing — the failing call surfaces the
 * configuration problem with a clear error.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_API_URL } from "./constants.js";

let cachedSupabase: SupabaseClient | null = null;

/**
 * Get a Supabase client configured with the service role key.
 * Bypasses RLS — the MCP is treated as a trusted internal client.
 *
 * Required env: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY.
 */
export function getSupabase(): SupabaseClient {
  if (cachedSupabase) return cachedSupabase;

  const url =
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in your .env.",
    );
  }

  cachedSupabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedSupabase;
}

/** Resolved base URL of the PunchLister Express API. */
export function getApiUrl(): string {
  return (process.env.PUNCHLISTER_API_URL ?? DEFAULT_API_URL).replace(/\/$/, "");
}

/**
 * POST JSON to a PunchLister Express endpoint. Returns the parsed JSON
 * body. Throws on non-2xx with the server's error message when available.
 */
export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
  timeoutMs = 60_000,
): Promise<T> {
  const url = `${getApiUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      /* non-JSON body — fall through */
    }

    if (!res.ok) {
      const errMsg =
        (json as { error?: string } | undefined)?.error ??
        (text.length > 0 ? text.slice(0, 500) : `HTTP ${res.status}`);
      throw new Error(
        `PunchLister API ${path} returned ${res.status}: ${errMsg}`,
      );
    }

    return json as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `PunchLister API ${path} timed out after ${timeoutMs}ms. Is the server running on ${getApiUrl()}?`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
