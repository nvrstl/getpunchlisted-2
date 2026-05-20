/**
 * People-related list tools: subcontractors, project members (auth-linked
 * users), project contacts (external address book).
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
  toolError,
} from "../utils.js";

const ListSubcontractorsInput = z
  .object({
    project_id: uuid.describe("UUID of the project."),
    status: z
      .enum(["on_site", "off_site", "scheduled", "completed"])
      .optional()
      .describe("Filter by status."),
    trade: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe("Filter by trade (case-insensitive partial match)."),
    ...paginationFields,
    ...responseFormatField,
  })
  .strict();

const ListProjectMembersInput = z
  .object({
    project_id: uuid.describe("UUID of the project."),
    ...paginationFields,
    ...responseFormatField,
  })
  .strict();

const ListProjectContactsInput = z
  .object({
    project_id: uuid.describe("UUID of the project."),
    role: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe(
        "Filter by role (e.g. 'klant', 'architect', 'schilder', 'loodgieter').",
      ),
    ...paginationFields,
    ...responseFormatField,
  })
  .strict();

export function registerPeopleTools(server: McpServer): void {
  server.registerTool(
    "punchlister_list_subcontractors",
    {
      title: "List subcontractors on a project",
      description: `List subcontractors registered on a project.

Args:
  - project_id (UUID, required)
  - status: 'on_site' | 'off_site' | 'scheduled' | 'completed' (optional)
  - trade: partial match on trade (optional)
  - limit, offset: pagination
  - response_format: 'markdown' (default) or 'json'

Returns id, company, trade, contact, phone, crew_size, work_area, status, notes, created_at.`,
      inputSchema: ListSubcontractorsInput.shape,
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
          .from("subcontractors")
          .select(
            "id, project_id, company, trade, contact, phone, crew_size, work_area, status, notes, created_at",
            { count: "exact" },
          )
          .eq("project_id", params.project_id)
          .order("company", { ascending: true });
        if (params.status) query = query.eq("status", params.status);
        if (params.trade) query = query.ilike("trade", `%${params.trade}%`);
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
          if (r.items.length === 0) return "No subcontractors registered.";
          const lines: string[] = [];
          lines.push(
            `# Subcontractors (${r.count}${r.total != null ? ` of ${r.total}` : ""})`,
          );
          for (const s of r.items as Array<Record<string, unknown>>) {
            const head = [
              s.trade ? String(s.trade) : null,
              s.status ? String(s.status) : null,
              s.crew_size ? `crew ${String(s.crew_size)}` : null,
              s.work_area ? `area: ${String(s.work_area)}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            lines.push(`- **${String(s.company)}** — ${head}`);
            if (s.contact || s.phone)
              lines.push(
                `  ${s.contact ? String(s.contact) : ""}${s.phone ? ` · ${String(s.phone)}` : ""}`,
              );
            lines.push(`  \`${s.id}\``);
          }
          if (r.has_more)
            lines.push(`\n_More — call with offset=${r.next_offset}._`);
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
    "punchlister_list_project_members",
    {
      title: "List project members (auth-linked users)",
      description: `List Supabase auth-linked members of a project. These are people who can sign in and access the project.

Args:
  - project_id (UUID, required)
  - limit, offset: pagination
  - response_format: 'markdown' (default) or 'json'

Returns id, email, role ('owner' | 'member'), user_id (nullable until first sign-in), created_at.`,
      inputSchema: ListProjectMembersInput.shape,
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
        const { data, error, count } = await supabase
          .from("project_members")
          .select("id, project_id, user_id, email, role, created_at", {
            count: "exact",
          })
          .eq("project_id", params.project_id)
          .order("created_at", { ascending: true })
          .range(params.offset, params.offset + params.limit - 1);
        if (error) return toolError(describeSupabaseError(error));

        const page = paginate(data ?? [], count ?? null, params.offset, params.limit);

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
            structuredContent: page,
          };
        }

        if (page.items.length === 0) {
          return {
            content: [{ type: "text", text: "No project members." }],
            structuredContent: page,
          };
        }

        const lines: string[] = [];
        lines.push(`# Project members (${page.count})`);
        for (const m of page.items as Array<Record<string, unknown>>) {
          lines.push(
            `- ${String(m.email)} (${String(m.role)})${m.user_id ? " · signed in" : " · invite pending"}`,
          );
        }
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: page,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "punchlister_list_project_contacts",
    {
      title: "List project contacts (address book)",
      description: `List external contacts associated with a project — klant, architect, schilder, loodgieter, leverancier, etc. Distinct from project_members (which are auth-linked).

Args:
  - project_id (UUID, required)
  - role: filter by role (optional)
  - limit, offset: pagination
  - response_format: 'markdown' (default) or 'json'

Returns id, name, role, email, phone, notes, created_at, updated_at.`,
      inputSchema: ListProjectContactsInput.shape,
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
          .from("project_contacts")
          .select(
            "id, project_id, name, role, email, phone, notes, created_at, updated_at",
            { count: "exact" },
          )
          .eq("project_id", params.project_id)
          .order("role", { ascending: true })
          .order("name", { ascending: true });
        if (params.role) query = query.eq("role", params.role);
        const { data, error, count } = await query.range(
          params.offset,
          params.offset + params.limit - 1,
        );
        if (error) return toolError(describeSupabaseError(error));

        const page = paginate(data ?? [], count ?? null, params.offset, params.limit);

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
            structuredContent: page,
          };
        }

        if (page.items.length === 0) {
          return {
            content: [{ type: "text", text: "No project contacts." }],
            structuredContent: page,
          };
        }

        const lines: string[] = [];
        lines.push(`# Project contacts (${page.count})`);
        for (const c of page.items as Array<Record<string, unknown>>) {
          const head = [c.role ? `[${String(c.role)}]` : null, c.name]
            .filter(Boolean)
            .join(" ");
          lines.push(`- ${head}`);
          if (c.email || c.phone)
            lines.push(
              `  ${c.email ? `<${String(c.email)}>` : ""}${c.phone ? ` · ${String(c.phone)}` : ""}`,
            );
        }
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: page,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
