/**
 * Project tools: list and fetch projects, optionally with rolled-up counts.
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

const ProjectStatus = z.enum([
  "active",
  "pre_construction",
  "punch_phase",
  "completed",
]);

const ListProjectsInput = z
  .object({
    status: ProjectStatus.optional().describe(
      "Filter by project status. One of: active, pre_construction, punch_phase, completed.",
    ),
    company_id: uuid
      .optional()
      .describe("Filter to a single tenant (companies.id)."),
    project_manager: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("Filter by project_manager (case-insensitive partial match)."),
    city: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("Filter by city (case-insensitive partial match)."),
    name_contains: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("Filter by name (case-insensitive partial match)."),
    ...paginationFields,
    ...responseFormatField,
  })
  .strict();

const GetProjectInput = z
  .object({
    project_id: uuid.describe("UUID of the project to fetch."),
    include_summary: z
      .boolean()
      .default(false)
      .describe(
        "If true, include rolled-up counts (open punch items, open RFIs, recent flagged field logs).",
      ),
    ...responseFormatField,
  })
  .strict();

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    "punchlister_list_projects",
    {
      title: "List PunchLister projects",
      description: `List construction projects with optional filters.

Returns paginated project rows: id, name, status, project_number, project_manager, client_name, city, contract_value, start_date, planned_completion, company_id.

Args:
  - status: one of 'active' | 'pre_construction' | 'punch_phase' | 'completed' (optional)
  - company_id: UUID of a tenant (optional)
  - project_manager: partial match on PM name (optional)
  - city: partial match on city (optional)
  - name_contains: partial match on project name (optional)
  - limit, offset: pagination (defaults 25 / 0)
  - response_format: 'markdown' (default) or 'json'

Use this when you need to discover projects or filter them by attribute. For deep-dives into a single project's logs/RFIs/punch list, follow up with the more specific list tools using its project_id.`,
      inputSchema: ListProjectsInput.shape,
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
          .from("projects")
          .select(
            "id, name, status, project_number, project_manager, client_name, city, contract_value, start_date, planned_completion, company_id, created_at",
            { count: "exact" },
          )
          .order("created_at", { ascending: false });

        if (params.status) query = query.eq("status", params.status);
        if (params.company_id) query = query.eq("company_id", params.company_id);
        if (params.project_manager)
          query = query.ilike("project_manager", `%${params.project_manager}%`);
        if (params.city) query = query.ilike("city", `%${params.city}%`);
        if (params.name_contains)
          query = query.ilike("name", `%${params.name_contains}%`);

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
            return "No projects matched the given filters.";
          const lines: string[] = [];
          lines.push(
            `# Projects (${r.count}${r.total != null ? ` of ${r.total}` : ""})`,
          );
          for (const p of r.items as Array<{
            id: string;
            name: string;
            status?: string;
            project_number?: string;
            project_manager?: string;
            client_name?: string;
            city?: string;
            contract_value?: number;
          }>) {
            const meta = [
              p.project_number,
              p.status,
              p.project_manager,
              p.client_name,
              p.city,
            ]
              .filter(Boolean)
              .join(" · ");
            lines.push(`- **${p.name}** \`${p.id}\``);
            if (meta) lines.push(`  ${meta}`);
            if (p.contract_value != null)
              lines.push(`  contract: € ${Number(p.contract_value).toLocaleString("nl-BE")}`);
          }
          if (r.has_more)
            lines.push(
              `\n_More available — call again with offset=${r.next_offset}._`,
            );
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
    "punchlister_get_project",
    {
      title: "Get a single PunchLister project",
      description: `Fetch a single project by UUID. Optionally include rolled-up activity counts.

Args:
  - project_id (UUID, required)
  - include_summary (boolean, default false): adds counts of open_punch_items, open_rfis, recent_flagged_logs (last 14 days).
  - response_format: 'markdown' (default) or 'json'

Returns the full project row plus role-based contacts (bouwheer, architect, calculator) and optional summary counts.`,
      inputSchema: GetProjectInput.shape,
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
        const { data: project, error } = await supabase
          .from("projects")
          .select("*")
          .eq("id", params.project_id)
          .maybeSingle();
        if (error) return toolError(describeSupabaseError(error));
        if (!project)
          return toolError(`No project found with id ${params.project_id}.`);

        let summary:
          | {
              open_punch_items: number;
              open_rfis: number;
              recent_flagged_logs: number;
            }
          | undefined;

        if (params.include_summary) {
          const fourteenDaysAgo = new Date(
            Date.now() - 14 * 24 * 60 * 60 * 1000,
          ).toISOString();
          const [openPunch, openRfis, flaggedLogs] = await Promise.all([
            supabase
              .from("punch_items")
              .select("id", { count: "exact", head: true })
              .eq("project_id", params.project_id)
              .neq("status", "completed"),
            supabase
              .from("rfis")
              .select("id", { count: "exact", head: true })
              .eq("project_id", params.project_id)
              .neq("status", "closed"),
            supabase
              .from("field_logs")
              .select("id", { count: "exact", head: true })
              .eq("project_id", params.project_id)
              .gte("created_at", fourteenDaysAgo)
              .gt("array_length(flags,1)", 0),
          ]);
          summary = {
            open_punch_items: openPunch.count ?? 0,
            open_rfis: openRfis.count ?? 0,
            recent_flagged_logs: flaggedLogs.count ?? 0,
          };
        }

        const result = summary ? { ...project, summary } : project;

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
            structuredContent: result,
          };
        }

        const p = project as Record<string, unknown>;
        const lines: string[] = [];
        lines.push(`# ${p.name as string} (\`${p.id as string}\`)`);
        lines.push("");
        const meta: string[] = [];
        if (p.project_number) meta.push(`#${String(p.project_number)}`);
        if (p.status) meta.push(String(p.status));
        if (p.project_manager) meta.push(`PM: ${String(p.project_manager)}`);
        if (p.client_name) meta.push(`Client: ${String(p.client_name)}`);
        if (p.city) meta.push(String(p.city));
        if (meta.length) lines.push(meta.join(" · "));
        if (p.contract_value != null)
          lines.push(
            `**Contract value:** € ${Number(p.contract_value).toLocaleString("nl-BE")}`,
          );
        if (p.start_date) lines.push(`**Start:** ${String(p.start_date)}`);
        if (p.planned_completion)
          lines.push(`**Planned completion:** ${String(p.planned_completion)}`);
        if (p.description)
          lines.push(`\n${snippet(p.description as string, 400)}`);

        const contacts: string[] = [];
        if (p.bouwheer_name || p.bouwheer_email)
          contacts.push(
            `- Bouwheer: ${p.bouwheer_name ?? ""}${p.bouwheer_email ? ` <${p.bouwheer_email}>` : ""}`,
          );
        if (p.architect_name || p.architect_email)
          contacts.push(
            `- Architect: ${p.architect_name ?? ""}${p.architect_email ? ` <${p.architect_email}>` : ""}`,
          );
        if (p.calculator_name || p.calculator_email)
          contacts.push(
            `- Calculator: ${p.calculator_name ?? ""}${p.calculator_email ? ` <${p.calculator_email}>` : ""}`,
          );
        if (contacts.length) {
          lines.push("\n## Contacts");
          lines.push(...contacts);
        }

        if (summary) {
          lines.push("\n## Activity summary");
          lines.push(`- Open punch items: ${summary.open_punch_items}`);
          lines.push(`- Open RFIs: ${summary.open_rfis}`);
          lines.push(
            `- Flagged field logs (last 14d): ${summary.recent_flagged_logs}`,
          );
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: result,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
