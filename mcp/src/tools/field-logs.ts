/**
 * Field log tools: list, get, and search field logs (the primary source
 * of truth for what happened on site).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSupabase } from "../clients.js";
import {
  isoDate,
  paginationFields,
  responseFormatField,
  ResponseFormat,
  uuid,
} from "../schemas.js";
import {
  applyCharacterLimit,
  describeSupabaseError,
  paginate,
  snippet,
  toolError,
} from "../utils.js";

const FIELD_LOG_COLUMNS =
  "id, project_id, user_email, raw_note, location, processed_summary, type, flags, impact, action_required, suggest_rfi, created_at";

const ListFieldLogsInput = z
  .object({
    project_id: uuid.describe("UUID of the project to list logs for."),
    type: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe("Filter by log type (e.g. 'general', 'safety', 'delay')."),
    flag: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe("Filter to logs whose flags[] array contains this value."),
    impact: z
      .enum(["none", "low", "medium", "high", "critical"])
      .optional()
      .describe("Filter by impact level."),
    action_required: z
      .boolean()
      .optional()
      .describe("If true, return only logs where action_required is true."),
    since: isoDate
      .optional()
      .describe("Only logs created on/after this date (inclusive)."),
    until: isoDate
      .optional()
      .describe("Only logs created before this date (exclusive)."),
    ...paginationFields,
    ...responseFormatField,
  })
  .strict();

const GetFieldLogInput = z
  .object({
    field_log_id: uuid.describe("UUID of the field log to fetch."),
    ...responseFormatField,
  })
  .strict();

const SearchFieldLogsInput = z
  .object({
    query: z
      .string()
      .min(2, "Query must be at least 2 characters")
      .max(200)
      .describe("Search string matched against raw_note and processed_summary (case-insensitive)."),
    project_id: uuid
      .optional()
      .describe("Restrict the search to a single project."),
    ...paginationFields,
    ...responseFormatField,
  })
  .strict();

export function registerFieldLogTools(server: McpServer): void {
  server.registerTool(
    "punchlister_list_field_logs",
    {
      title: "List field logs for a project",
      description: `List field-log entries (site observations) for a single project, newest first.

Args:
  - project_id (UUID, required)
  - type: log type (optional)
  - flag: filter to logs whose flags[] contains this value (optional)
  - impact: 'none' | 'low' | 'medium' | 'high' | 'critical' (optional)
  - action_required: boolean (optional)
  - since / until: ISO date range (optional)
  - limit, offset: pagination
  - response_format: 'markdown' (default) or 'json'

Returns the log id, location, type, flags, impact, action_required, processed_summary, raw_note (snippet), created_at.

Use this for triage and reporting. For full body or photo URL, follow up with punchlister_get_field_log.`,
      inputSchema: ListFieldLogsInput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const supabase = getSupabase();
        let query = supabase
          .from("field_logs")
          .select(FIELD_LOG_COLUMNS, { count: "exact" })
          .eq("project_id", params.project_id)
          .order("created_at", { ascending: false });

        if (params.type) query = query.eq("type", params.type);
        if (params.flag) query = query.contains("flags", [params.flag]);
        if (params.impact) query = query.eq("impact", params.impact);
        if (params.action_required != null)
          query = query.eq("action_required", params.action_required);
        if (params.since) query = query.gte("created_at", params.since);
        if (params.until) query = query.lt("created_at", params.until);

        const { data, error, count } = await query.range(
          params.offset,
          params.offset + params.limit - 1,
        );
        if (error) return toolError(describeSupabaseError(error));

        const page = paginate(data ?? [], count ?? null, params.offset, params.limit);

        if (params.response_format === ResponseFormat.JSON) {
          const { text, response } = applyCharacterLimit(page, (r) =>
            JSON.stringify(r, null, 2),
          );
          return {
            content: [{ type: "text", text }],
            structuredContent: response,
          };
        }

        const render = (r: typeof page) => {
          if (r.items.length === 0) return "No field logs matched.";
          const lines: string[] = [];
          lines.push(
            `# Field logs (${r.count}${r.total != null ? ` of ${r.total}` : ""})`,
          );
          for (const log of r.items as Array<Record<string, unknown>>) {
            const tags: string[] = [];
            if (log.type) tags.push(String(log.type));
            if (log.impact && log.impact !== "none")
              tags.push(`impact:${String(log.impact)}`);
            if (log.action_required) tags.push("action_required");
            const flags = Array.isArray(log.flags) ? (log.flags as string[]) : [];
            if (flags.length) tags.push(`flags:${flags.join(",")}`);
            const head = [String(log.created_at).slice(0, 19), ...(log.location ? [String(log.location)] : []), ...tags]
              .filter(Boolean)
              .join(" · ");
            lines.push(`- ${head}`);
            lines.push(
              `  ${snippet((log.processed_summary as string) || (log.raw_note as string), 220)}`,
            );
            lines.push(`  \`${log.id}\``);
          }
          if (r.has_more)
            lines.push(`\n_More — call with offset=${r.next_offset}._`);
          if (r.truncated && r.truncation_message)
            lines.push(`\n_${r.truncation_message}_`);
          return lines.join("\n");
        };

        const { text, response } = applyCharacterLimit(page, render);
        return {
          content: [{ type: "text", text }],
          structuredContent: response,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "punchlister_get_field_log",
    {
      title: "Get a single field log",
      description: `Fetch the full body of a field log including raw_note, processed_summary, location, photo_url, type, flags, impact, action_required, suggest_rfi, and user attribution.

Args:
  - field_log_id (UUID, required)
  - response_format: 'markdown' (default) or 'json'`,
      inputSchema: GetFieldLogInput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const supabase = getSupabase();
        const { data: log, error } = await supabase
          .from("field_logs")
          .select("*")
          .eq("id", params.field_log_id)
          .maybeSingle();
        if (error) return toolError(describeSupabaseError(error));
        if (!log)
          return toolError(`No field log found with id ${params.field_log_id}.`);

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(log, null, 2) }],
            structuredContent: log as Record<string, unknown>,
          };
        }

        const l = log as Record<string, unknown>;
        const lines: string[] = [];
        lines.push(`# Field log \`${l.id as string}\``);
        const meta = [
          String(l.created_at).slice(0, 19),
          l.user_email ? String(l.user_email) : null,
          l.location ? String(l.location) : null,
          l.type ? `type:${String(l.type)}` : null,
          l.impact && l.impact !== "none" ? `impact:${String(l.impact)}` : null,
          l.action_required ? "action_required" : null,
          l.suggest_rfi ? "suggest_rfi" : null,
        ]
          .filter(Boolean)
          .join(" · ");
        if (meta) lines.push(meta);
        const flags = Array.isArray(l.flags) ? (l.flags as string[]) : [];
        if (flags.length) lines.push(`**Flags:** ${flags.join(", ")}`);
        if (l.processed_summary) {
          lines.push("\n## Summary");
          lines.push(String(l.processed_summary));
        }
        if (l.raw_note) {
          lines.push("\n## Raw note");
          lines.push(String(l.raw_note));
        }
        if (l.photo_url) lines.push(`\n_(photo attached)_`);
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: log as Record<string, unknown>,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "punchlister_search_field_logs",
    {
      title: "Search field logs (full-text)",
      description: `Case-insensitive text search across field_logs.raw_note and field_logs.processed_summary, newest first.

Args:
  - query (string, 2-200 chars, required)
  - project_id (UUID, optional): restrict to one project
  - limit, offset: pagination
  - response_format: 'markdown' (default) or 'json'

Returns matching logs with the same shape as punchlister_list_field_logs.`,
      inputSchema: SearchFieldLogsInput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const supabase = getSupabase();
        // Escape special characters for ILIKE wildcards
        const safe = params.query.replace(/[\\%_]/g, (m) => `\\${m}`);
        const filter = `raw_note.ilike.%${safe}%,processed_summary.ilike.%${safe}%`;
        let query = supabase
          .from("field_logs")
          .select(FIELD_LOG_COLUMNS, { count: "exact" })
          .or(filter)
          .order("created_at", { ascending: false });
        if (params.project_id) query = query.eq("project_id", params.project_id);
        const { data, error, count } = await query.range(
          params.offset,
          params.offset + params.limit - 1,
        );
        if (error) return toolError(describeSupabaseError(error));

        const page = paginate(data ?? [], count ?? null, params.offset, params.limit);

        if (params.response_format === ResponseFormat.JSON) {
          const { text, response } = applyCharacterLimit(page, (r) =>
            JSON.stringify(r, null, 2),
          );
          return {
            content: [{ type: "text", text }],
            structuredContent: response,
          };
        }

        const render = (r: typeof page) => {
          if (r.items.length === 0)
            return `No field logs matching '${params.query}'.`;
          const lines: string[] = [];
          lines.push(
            `# Search '${params.query}' — ${r.count}${r.total != null ? ` of ${r.total}` : ""} hits`,
          );
          for (const log of r.items as Array<Record<string, unknown>>) {
            lines.push(
              `- ${String(log.created_at).slice(0, 19)} · \`${log.id}\` · project \`${log.project_id}\``,
            );
            lines.push(
              `  ${snippet((log.processed_summary as string) || (log.raw_note as string), 220)}`,
            );
          }
          if (r.has_more)
            lines.push(`\n_More — call with offset=${r.next_offset}._`);
          if (r.truncated && r.truncation_message)
            lines.push(`\n_${r.truncation_message}_`);
          return lines.join("\n");
        };

        const { text, response } = applyCharacterLimit(page, render);
        return {
          content: [{ type: "text", text }],
          structuredContent: response,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
