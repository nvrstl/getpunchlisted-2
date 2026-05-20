/**
 * AI workflow tools — wrap PunchLister's existing /api/* endpoints
 * (server.js). These call Claude/OpenAI under the hood but DO NOT write to
 * the database; they return generated text for the agent to use.
 *
 * Requires the PunchLister Express server to be running (see PUNCHLISTER_API_URL).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, getSupabase } from "../clients.js";
import {
  isoDate,
  responseFormatField,
  ResponseFormat,
  uuid,
} from "../schemas.js";
import { describeSupabaseError, toolError } from "../utils.js";

const DraftRfiInput = z
  .object({
    title: z
      .string()
      .min(3)
      .max(200)
      .describe("Subject of the RFI (required)."),
    number: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe("RFI number, if pre-assigned (e.g. 'RFI-042')."),
    context: z
      .string()
      .min(1)
      .max(4000)
      .optional()
      .describe("Background context explaining why the RFI is being raised."),
    project_id: uuid
      .optional()
      .describe("Project UUID — passed through for usage logging."),
  })
  .strict();

const DraftRfiEmailInput = z
  .object({
    rfi_title: z
      .string()
      .min(3)
      .max(200)
      .describe("Subject of the RFI (required)."),
    rfi_number: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe("RFI number (e.g. 'RFI-042')."),
    rfi_context: z
      .string()
      .min(1)
      .max(4000)
      .optional()
      .describe("Background context."),
    rfi_draft: z
      .string()
      .min(1)
      .max(8000)
      .optional()
      .describe(
        "The full RFI document body, if available. The first ~800 chars are used as reference.",
      ),
    project_id: uuid
      .optional()
      .describe("Project UUID — passed through for usage logging."),
  })
  .strict();

const ExtractActionItemsInput = z
  .object({
    note: z
      .string()
      .min(1)
      .max(8000)
      .optional()
      .describe(
        "Raw field-log note. Either note or summary (or both) must be provided.",
      ),
    summary: z
      .string()
      .min(1)
      .max(4000)
      .optional()
      .describe("AI summary of the field log (optional)."),
    field_log_id: uuid
      .optional()
      .describe(
        "Alternative to note/summary: pass a field_log UUID and the MCP will fetch its raw_note + processed_summary.",
      ),
    project_id: uuid
      .optional()
      .describe(
        "If provided, the MCP fetches subcontractors for the project to give Claude context for assignment.",
      ),
  })
  .strict();

const AnalyseContextInput = z
  .object({
    items: z
      .array(
        z
          .object({
            title: z.string().min(1).max(200),
            content: z.string().min(1).max(20_000),
            category: z.enum([
              "danger",
              "quote",
              "contract",
              "document",
              "note",
            ]),
            source: z.string().max(200).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(40)
      .describe(
        "Context items to analyse. Categorise each as 'danger', 'quote', 'contract', 'document', or 'note'.",
      ),
  })
  .strict();

const GenerateReportInput = z
  .object({
    project_id: uuid.describe(
      "Project UUID. Logs/RFIs/punch items are auto-fetched for the date range.",
    ),
    date: isoDate
      .describe(
        "Report date (YYYY-MM-DD). Field logs created on this date are included.",
      ),
    project_name: z.string().min(1).max(200).optional(),
    project_location: z.string().min(1).max(200).optional(),
    ...responseFormatField,
  })
  .strict();

export function registerWorkflowTools(server: McpServer): void {
  server.registerTool(
    "punchlister_draft_rfi",
    {
      title: "Draft a formal RFI document",
      description: `Use the PunchLister AI pipeline to draft a formal Request for Information document. Does NOT write to the database — returns the draft for review.

Args:
  - title (string, required): subject of the RFI
  - number (string, optional): pre-assigned RFI number
  - context (string, optional): background information
  - project_id (UUID, optional): for usage logging

Returns the draft text in the standard PunchLister RFI format (SUBJECT, PROJECT, DATE, DESCRIPTION, REQUEST, IMPACT IF UNRESOLVED, ATTACHMENTS).

Requires the PunchLister server to be running locally (see PUNCHLISTER_API_URL).`,
      inputSchema: DraftRfiInput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await apiPost<{ success: boolean; draft?: string; error?: string }>(
          "/api/draft-rfi",
          {
            title: params.title,
            number: params.number,
            context: params.context,
            projectId: params.project_id,
          },
        );
        if (!result.success || !result.draft)
          return toolError(result.error ?? "draft-rfi returned no draft.");
        return {
          content: [{ type: "text", text: result.draft }],
          structuredContent: { draft: result.draft },
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "punchlister_draft_rfi_email",
    {
      title: "Draft a short email to send an RFI",
      description: `Draft a short (<150 words), plain-text email to send an RFI to an architect/client. Does NOT write to the database — returns the email body.

Args:
  - rfi_title (string, required)
  - rfi_number (string, optional)
  - rfi_context (string, optional)
  - rfi_draft (string, optional): the full RFI document body for reference
  - project_id (UUID, optional): for usage logging

Returns the email body. The closing 'Best regards,' is left on its own line so a signature can be appended.`,
      inputSchema: DraftRfiEmailInput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await apiPost<{ success: boolean; email?: string; error?: string }>(
          "/api/draft-rfi-email",
          {
            rfiTitle: params.rfi_title,
            rfiNumber: params.rfi_number,
            rfiContext: params.rfi_context,
            rfiDraft: params.rfi_draft,
            projectId: params.project_id,
          },
        );
        if (!result.success || !result.email)
          return toolError(result.error ?? "draft-rfi-email returned no body.");
        return {
          content: [{ type: "text", text: result.email }],
          structuredContent: { email: result.email },
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "punchlister_extract_action_items",
    {
      title: "Extract action items from a field log",
      description: `Use the PunchLister AI pipeline to extract concrete action items from a field-log note.

Provide either a note (raw text), a summary, or a field_log_id (the MCP will look it up). Optionally provide project_id to fetch subcontractors so the model can route tasks to the right trade.

Args:
  - note (string, optional): raw field-log text
  - summary (string, optional): AI summary of the log
  - field_log_id (UUID, optional): alternative — fetch raw_note + processed_summary from the DB
  - project_id (UUID, optional): pulls subcontractors for the project to inform task assignment

Returns an array of action items, each with: task, assignee, assigneeType ('back_office' | 'subcontractor'), priority ('low' | 'medium' | 'high'), notes. Maximum 5 items. Does NOT write to the database.`,
      inputSchema: ExtractActionItemsInput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        let note = params.note;
        let summary = params.summary;

        if (!note && !summary && params.field_log_id) {
          const { data: log, error } = await getSupabase()
            .from("field_logs")
            .select("raw_note, processed_summary")
            .eq("id", params.field_log_id)
            .maybeSingle();
          if (error) return toolError(describeSupabaseError(error));
          if (!log)
            return toolError(
              `No field log found with id ${params.field_log_id}.`,
            );
          note = log.raw_note as string | undefined;
          summary = log.processed_summary as string | undefined;
        }

        if (!note && !summary)
          return toolError(
            "Provide either 'note', 'summary', or a 'field_log_id' to look up.",
          );

        let subcontractors:
          | Array<{ company: string; trade: string | null }>
          | undefined;
        if (params.project_id) {
          const { data } = await getSupabase()
            .from("subcontractors")
            .select("company, trade")
            .eq("project_id", params.project_id);
          subcontractors = (data ?? []) as Array<{
            company: string;
            trade: string | null;
          }>;
        }

        const result = await apiPost<{ success: boolean; items?: unknown[]; error?: string }>(
          "/api/extract-action-items",
          { note, summary, subcontractors },
        );
        if (!result.success)
          return toolError(result.error ?? "extract-action-items failed.");

        const items = result.items ?? [];
        return {
          content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
          structuredContent: { items },
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "punchlister_analyse_context",
    {
      title: "Analyse project context for risks & obligations",
      description: `Pass an array of context items (danger flags, quotes, contracts, documents, notes) and get back a structured risk analysis: overall risk level, summary, risks, obligations, watch points.

Args:
  - items: array of { title, content, category, source? } — at least 1 item, max 40
    - category: 'danger' | 'quote' | 'contract' | 'document' | 'note'
    - content: per-item content (max 20k chars; longer items are truncated server-side at 1500 chars)

Returns JSON: { overallRisk, summary, risks[], obligations[], watchPoints[] }. Does NOT write to the database.`,
      inputSchema: AnalyseContextInput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await apiPost<{ success: boolean; data?: unknown; error?: string }>(
          "/api/analyse-context",
          { items: params.items },
        );
        if (!result.success || !result.data)
          return toolError(result.error ?? "analyse-context returned no data.");
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
          structuredContent: result.data as Record<string, unknown>,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "punchlister_generate_report",
    {
      title: "Generate a daily site report",
      description: `Generate a structured daily site report for a project on a specific date.

The MCP auto-fetches the day's field logs, the project's open RFIs, and pending punch items, then calls the PunchLister AI pipeline to produce a structured report.

Args:
  - project_id (UUID, required)
  - date (ISO date, required): the report day
  - project_name (string, optional): override the name passed to the AI
  - project_location (string, optional)
  - response_format: 'markdown' (default) or 'json'

Returns the raw API response (typically structured JSON for the report body).`,
      inputSchema: GenerateReportInput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const supabase = getSupabase();
        const start = `${params.date}T00:00:00Z`;
        const end = `${params.date}T23:59:59.999Z`;

        const [projectRes, logsRes, rfisRes, tasksRes] = await Promise.all([
          supabase
            .from("projects")
            .select("name, city")
            .eq("id", params.project_id)
            .maybeSingle(),
          supabase
            .from("field_logs")
            .select(
              "id, raw_note, processed_summary, location, type, impact",
            )
            .eq("project_id", params.project_id)
            .gte("created_at", start)
            .lte("created_at", end),
          supabase
            .from("rfis")
            .select("number, title, status")
            .eq("project_id", params.project_id)
            .neq("status", "closed"),
          supabase
            .from("punch_items")
            .select("task, assignee, priority, status")
            .eq("project_id", params.project_id)
            .neq("status", "completed"),
        ]);

        if (projectRes.error)
          return toolError(describeSupabaseError(projectRes.error));
        if (logsRes.error)
          return toolError(describeSupabaseError(logsRes.error));
        if (rfisRes.error)
          return toolError(describeSupabaseError(rfisRes.error));
        if (tasksRes.error)
          return toolError(describeSupabaseError(tasksRes.error));

        const payload = {
          date: params.date,
          projectName:
            params.project_name ?? projectRes.data?.name ?? "Unknown project",
          projectLocation:
            params.project_location ?? projectRes.data?.city ?? "",
          logs: (logsRes.data ?? []).map((l) => ({
            type: l.type,
            location: l.location,
            impact: l.impact,
            processedSummary: l.processed_summary,
            rawNote: l.raw_note,
          })),
          rfis: rfisRes.data ?? [],
          tasks: tasksRes.data ?? [],
          context: [],
        };

        const result = await apiPost<unknown>(
          "/api/generate-report",
          payload,
          90_000,
        );

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result as Record<string, unknown>,
          };
        }

        // Try to render a friendly markdown summary if the result looks structured;
        // fall back to JSON for safety.
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result as Record<string, unknown>,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
