/**
 * Shared Zod schema fragments — keep them DRY across tools.
 */

import { z } from "zod";
import { DEFAULT_LIMIT, MAX_LIMIT } from "./constants.js";

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

/** Pagination fields. Spread into a tool's input schema. */
export const paginationFields = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe(`Maximum number of items to return (1-${MAX_LIMIT}).`),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of items to skip for pagination."),
} as const;

/** Response-format field. */
export const responseFormatField = {
  response_format: z
    .nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe(
      "Output format: 'markdown' for human-readable summaries, 'json' for full structured data.",
    ),
} as const;

/** A UUID string (Supabase primary key). */
export const uuid = z
  .string()
  .uuid("Must be a valid UUID (Supabase project/field-log/RFI/punch-item ID).");

/** ISO 8601 date string (date-only or full timestamp). */
export const isoDate = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/,
    "Must be ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ).",
  );
