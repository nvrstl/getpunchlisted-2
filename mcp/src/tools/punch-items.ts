/**
 * Punch list tool: outstanding tasks per project.
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

const ListPunchItemsInput = z
  .object({
    project_id: uuid.describe("UUID of the project to list punch items for."),
    status: z
      .enum(["pending", "in_progress", "completed", "blocked"])
      .optional()
      .describe("Filter by status."),
    priority: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe("Filter by priority."),
    assignee: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("Case-insensitive partial match on assignee."),
    category: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe("Filter by category (exact match)."),
    due_before: isoDate
      .optional()
      .describe("Only items with due_date strictly before this date."),
    open_only: z
      .boolean()
      .default(false)
      .describe(
        "Shortcut: when true, excludes completed items regardless of the status filter.",
      ),
    ...paginationFields,
    ...responseFormatField,
  })
  .strict();

export function registerPunchItemTools(server: McpServer): void {
  server.registerTool(
    "punchlister_list_punch_items",
    {
      title: "List punch list items",
      description: `List punch list items (outstanding tasks) for a project.

Args:
  - project_id (UUID, required)
  - status: 'pending' | 'in_progress' | 'completed' | 'blocked' (optional)
  - priority: 'low' | 'medium' | 'high' (optional)
  - assignee: partial match on assignee (optional)
  - category: exact category (optional)
  - due_before: ISO date — only items due strictly before (optional)
  - open_only: when true, excludes completed items
  - limit, offset: pagination
  - response_format: 'markdown' (default) or 'json'

Returns id, task, assignee, priority, due_date, status, category, notes, created_at, completed_at. Useful for "what's still on my plate for project X" / "show high-priority overdue items".`,
      inputSchema: ListPunchItemsInput.shape,
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
          .from("punch_items")
          .select(
            "id, project_id, task, assignee, priority, due_date, notes, status, category, created_at, completed_at",
            { count: "exact" },
          )
          .eq("project_id", params.project_id)
          .order("priority", { ascending: false })
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false });

        if (params.status) query = query.eq("status", params.status);
        if (params.priority) query = query.eq("priority", params.priority);
        if (params.assignee)
          query = query.ilike("assignee", `%${params.assignee}%`);
        if (params.category) query = query.eq("category", params.category);
        if (params.due_before) query = query.lt("due_date", params.due_before);
        if (params.open_only) query = query.neq("status", "completed");

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
          if (r.items.length === 0) return "No punch items matched.";
          const lines: string[] = [];
          lines.push(
            `# Punch items (${r.count}${r.total != null ? ` of ${r.total}` : ""})`,
          );
          for (const item of r.items as Array<Record<string, unknown>>) {
            const head = [
              item.priority ? `[${String(item.priority).toUpperCase()}]` : null,
              item.status ? String(item.status) : null,
              item.assignee ? `→ ${String(item.assignee)}` : null,
              item.due_date ? `due ${String(item.due_date)}` : null,
              item.category ? `(${String(item.category)})` : null,
            ]
              .filter(Boolean)
              .join(" ");
            lines.push(`- ${head}`);
            lines.push(`  ${snippet(String(item.task), 200)}`);
            if (item.notes)
              lines.push(`  _${snippet(item.notes as string, 160)}_`);
            lines.push(`  \`${item.id}\``);
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
