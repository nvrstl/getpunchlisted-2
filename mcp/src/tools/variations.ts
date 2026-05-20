/**
 * Variations / Meerwerk tool: contract variations with status tracking.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSupabase } from "../clients.js";
import {
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

const ListVariationsInput = z
  .object({
    project_id: uuid.describe("UUID of the project."),
    status: z
      .enum(["draft", "submitted", "approved", "invoiced"])
      .optional()
      .describe("Filter by variation status."),
    number: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe("Filter by variation number (case-insensitive partial match)."),
    ...paginationFields,
    ...responseFormatField,
  })
  .strict();

export function registerVariationTools(server: McpServer): void {
  server.registerTool(
    "punchlister_list_variations",
    {
      title: "List contract variations (meerwerk)",
      description: `List contract variations / meerwerk for a project, newest first.

Args:
  - project_id (UUID, required)
  - status: 'draft' | 'submitted' | 'approved' | 'invoiced' (optional)
  - number: partial match (optional)
  - limit, offset: pagination
  - response_format: 'markdown' (default) or 'json'

Returns id, number, description, requested_by, estimated_cost, status, notes, field_log_id, created_at, updated_at.`,
      inputSchema: ListVariationsInput.shape,
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
          .from("variations")
          .select(
            "id, project_id, field_log_id, number, description, requested_by, estimated_cost, status, notes, created_at, updated_at",
            { count: "exact" },
          )
          .eq("project_id", params.project_id)
          .order("created_at", { ascending: false });
        if (params.status) query = query.eq("status", params.status);
        if (params.number) query = query.ilike("number", `%${params.number}%`);
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
          if (r.items.length === 0) return "No variations matched.";
          const lines: string[] = [];
          lines.push(
            `# Variations (${r.count}${r.total != null ? ` of ${r.total}` : ""})`,
          );
          for (const v of r.items as Array<Record<string, unknown>>) {
            const head = [
              v.number ? `#${String(v.number)}` : null,
              v.status ? String(v.status) : null,
              v.estimated_cost ? `€ ${String(v.estimated_cost)}` : null,
              v.requested_by ? `by ${String(v.requested_by)}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            lines.push(`- ${head}`);
            lines.push(`  ${snippet(v.description as string, 220)}`);
            lines.push(`  \`${v.id}\``);
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
