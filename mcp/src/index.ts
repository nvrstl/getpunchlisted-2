#!/usr/bin/env node
/**
 * PunchLister MCP server — read-only access to PunchLister project data
 * (Supabase) plus a handful of AI workflow tools wrapping the PunchLister
 * Express API.
 *
 * Transport: stdio (run as a subprocess of your MCP client).
 *
 * Required env (typically loaded from punchlister-app/.env):
 *   - SUPABASE_URL or VITE_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env:
 *   - PUNCHLISTER_API_URL (defaults to http://localhost:3001)
 *
 * Important: stdout is reserved for the MCP protocol. All logging goes to
 * stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerFieldLogTools } from "./tools/field-logs.js";
import { registerPunchItemTools } from "./tools/punch-items.js";
import { registerRfiTools } from "./tools/rfis.js";
import { registerVariationTools } from "./tools/variations.js";
import { registerPeopleTools } from "./tools/people.js";
import { registerWorkflowTools } from "./tools/workflows.js";

// Load parent .env (punchlister-app/.env) so the MCP picks up the same
// SUPABASE_*/PUNCHLISTER_* config the rest of the app uses.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../.env") });
// Also load .env in the MCP folder itself if present (for overrides).
loadEnv({ path: path.resolve(here, "../.env"), override: false });

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

registerProjectTools(server);
registerFieldLogTools(server);
registerPunchItemTools(server);
registerRfiTools(server);
registerVariationTools(server);
registerPeopleTools(server);
registerWorkflowTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so we don't corrupt the JSON-RPC stream on stdout.
  console.error(`${SERVER_NAME} v${SERVER_VERSION} ready (stdio)`);
}

main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
