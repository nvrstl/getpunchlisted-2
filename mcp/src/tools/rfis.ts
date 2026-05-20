/**
 * RFI tools: list and fetch Requests for Information.
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

const ListRfisInput = z
  .object({
    project_id: uuid.describe("UUID of the project."),
    status: z
      .enum(["draft", "submitted", "answered", "closed"])
      .optional()
      .describe("Filter by status."),
    number: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe("Filter by RFI number (case-insensitive partial match)."),
    ...paginationFields,
    ...responseFormatField,
  })
  .strict();

const GetRfiInput = z
  .object({
    rfi_id: uuid.describe("UUID of the RFI to fetch."),
    ...responseFormatField,
  })
  .strict();

export function registerRfiTools(server: McpServer): void {
  server.registerTool(
    "punchlister_list_rfis",
    {
      title: "List RFIs (Requests for Information)",
      description: `List RFIs for a project, newest first.

Args:
  - project_id (UUID, required)
  - status: 'draft' | 'submitted' | 'answered' | 'closed' (optional)
  - number: partial match on RFI number (optional)
  - limit, offset: pagination
  - response_format: 'markdown' (default) or 'json'

Returns id, number, title, status, context (snippet), field_log_id, created_at, updated_at. Use punchlister_get_rfi for the full draft + email_draft + pricing_proposition.`,
      inputSchema: ListRfisInput.shape,
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
          .from("rfis")
          .select(
            "id, project_id, number, title, status, context, field_log_id, created_at, updated_at",
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
          if (r.items.length === 0) return "No RFIs matched.";
          const lines: string[] = [];
          lines.push(
            `# RFIs (${r.count}${r.total != null ? ` of ${r.total}` : ""})`,
          );
          for (const rfi of r.items as Array<Record<string, unknown>>) {
            const head = [
              rfi.number ? `#${String(rfi.number)}` : null,
              rfi.status ? String(rfi.status) : null,
              String(rfi.created_at).slice(0, 10),
            ]
              .filter(Boolean)
              .join(" · ");
            lines.push(`- ${head} — **${String(rfi.title)}**`);
            if (rfi.context)
              lines.push(`  ${snippet(rfi.context as string, 200)}`);
            lines.push(`  \`${rfi.id}\``);
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
    "punchlister_get_rfi",
    {
      title: "Get a single RFI",
      description: `Fetch a single RFI by UUID, including the full draft, email_draft, pricing_proposition, and field_log linkage.

Args:
  - rfi_id (UUID, required)
  - response_format: 'markdown' (default) or 'json'`,
      inputSchema: GetRfiInput.shape,
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
        const { data: rfi, error } = await supabase
          .from("rfis")
          .select("*")
          .eq("id", params.rfi_id)
          .maybeSingle();
        if (error) return toolError(describeSupabaseError(error));
        if (!rfi) return toolError(`No RFI found with id ${params.rfi_id}.`);

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(rfi, null, 2) }],
            structuredContent: rfi as Record<string, unknown>,
          };
        }

        const r = rfi as Record<string, unknown>;
        const lines: string[] = [];
        lines.push(
          `# RFI ${r.number ? `#${String(r.number)} — ` : ""}${String(r.title)}`,
        );
        lines.push(
          `_${String(r.status)} · ${String(r.created_at).slice(0, 19)} · project \`${String(r.project_id)}\`_`,
        );
        if (r.context) {
          lines.push("\n## Context");
          lines.push(String(r.context));
        }
        if (r.draft) {
          lines.push("\n## RFI document");
          lines.push(String(r.draft));
        }
        if (r.email_draft) {
          lines.push("\n## Email draft");
          lines.push(String(r.email_draft));
        }
        if (r.pricing_proposition) {
          lines.push("\n## Pricing proposition");
          lines.push(String(r.pricing_proposition));
        }
        if (r.field_log_id)
          lines.push(`\n_(linked field log: \`${String(r.field_log_id)}\`)_`);
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: rfi as Record<string, unknown>,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
