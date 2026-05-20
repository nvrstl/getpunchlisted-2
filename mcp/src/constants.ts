/**
 * Shared constants for the PunchLister MCP server.
 */

export const SERVER_NAME = "punchlister-mcp-server";
export const SERVER_VERSION = "0.1.0";

/** Maximum response size in characters before automatic truncation. */
export const CHARACTER_LIMIT = 25_000;

/** Default page size for list endpoints. */
export const DEFAULT_LIMIT = 25;

/** Maximum page size a caller can request. */
export const MAX_LIMIT = 100;

/**
 * Base URL of the local PunchLister Express server (server.js).
 * Used by workflow tools that wrap the existing /api/* AI endpoints.
 * Override with PUNCHLISTER_API_URL env var.
 */
export const DEFAULT_API_URL = "http://localhost:3001";
