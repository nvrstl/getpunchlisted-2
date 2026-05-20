# PunchLister MCP Server

A Model Context Protocol server that exposes PunchLister's project data as tools for AI clients (Claude Code, Cowork, Claude Desktop, etc.).

Internal-use, read-only. The data plane is Supabase (service-role); the workflow plane wraps PunchLister's existing `/api/*` AI endpoints.

## What you get

**Read tools (Supabase)**

- `punchlister_list_projects` — filters: status, company_id, project_manager, city, name_contains
- `punchlister_get_project` — optional rolled-up activity counts
- `punchlister_list_field_logs` — filters: type, flag, impact, action_required, date range
- `punchlister_get_field_log`
- `punchlister_search_field_logs` — case-insensitive search across raw_note + processed_summary
- `punchlister_list_punch_items` — filters: status, priority, assignee, category, due_before, open_only
- `punchlister_list_rfis` — filters: status, number
- `punchlister_get_rfi`
- `punchlister_list_variations` — meerwerk
- `punchlister_list_subcontractors` — filters: status, trade
- `punchlister_list_project_members`
- `punchlister_list_project_contacts` — filters: role

**Workflow tools (call the local Express API)**

- `punchlister_draft_rfi` — formal RFI document
- `punchlister_draft_rfi_email` — short cover email
- `punchlister_extract_action_items` — from a note, summary, or field_log_id
- `punchlister_analyse_context` — risks/obligations/watch points
- `punchlister_generate_report` — daily site report (auto-pulls logs/RFIs/punch items)

None of these tools write to the database.

## Setup

```bash
cd mcp
npm install
npm run build
```

The MCP reads env from the parent `punchlister-app/.env` automatically. Required keys:

```
SUPABASE_URL=https://your-project.supabase.co        # or VITE_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional:

```
PUNCHLISTER_API_URL=http://localhost:3001            # for workflow tools
```

> The service-role key bypasses Supabase RLS — this MCP has god-mode read access across every tenant. Intended for internal team use only. Do not ship the connector to customers without swapping to per-user JWT auth.

## Running

The repo's `.mcp.json` already registers this server, so Claude Code in the project root picks it up automatically. To run it manually:

```bash
npm start                # node dist/index.js — uses the built JS
npm run dev              # tsx watch for development
```

The server speaks stdio. Logs go to stderr; stdout is reserved for the JSON-RPC stream.

## Adding it to other MCP clients

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "punchlister": {
      "command": "node",
      "args": ["/absolute/path/to/punchlister-app/mcp/dist/index.js"]
    }
  }
}
```

**Cowork** — add a custom MCP server pointing at the same `node dist/index.js` command, with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the connector's env.

## Architecture notes

- Tools call Supabase directly with the service role key — they do not go through `server.js`. This matches the existing Telegram bot's posture and avoids spinning up an HTTP middle layer.
- Workflow tools (the `/api/*` wrappers) need the Express server running. They time out at 60s (or 90s for `generate_report`) with a clear error if it isn't.
- Response defaults to markdown for chat ergonomics. Pass `response_format: "json"` for full structured rows.
- Pagination is `limit` + `offset`, with `has_more` / `next_offset` in the response.
- Responses over 25,000 characters are auto-halved until they fit, with a `truncated` flag — use `offset` or filters to drill in.

## Tool conventions

- Snake_case names with a `punchlister_` prefix so they don't collide with other MCPs.
- All inputs validated with Zod (`strict()`, descriptive error messages).
- All read tools are annotated `readOnlyHint: true`.
