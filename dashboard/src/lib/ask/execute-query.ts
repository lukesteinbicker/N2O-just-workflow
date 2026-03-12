/**
 * Executes GraphQL queries against the NOS data platform API.
 * Read-only: rejects mutations.
 */

const GRAPHQL_URL = process.env.GRAPHQL_URL || "http://localhost:4000/graphql";

export interface QueryResult {
  data: Record<string, unknown> | null;
  errors?: Array<{ message: string; locations?: unknown; path?: unknown }>;
}

export async function executeQuery(
  query: string,
  variables?: Record<string, unknown>
): Promise<QueryResult> {
  // Reject mutations — read-only access
  const trimmed = query.trim().toLowerCase();
  if (trimmed.startsWith("mutation")) {
    return {
      data: null,
      errors: [{ message: "Mutations are not allowed. Only queries are supported." }],
    };
  }

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  // Parse body even on non-200 — Apollo Server returns detailed errors in the body
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    // Try to extract GraphQL-level errors from the response body
    if (body?.errors?.length) {
      return { data: null, errors: body.errors };
    }
    return {
      data: null,
      errors: [{ message: `GraphQL request failed: ${res.status} ${res.statusText}` }],
    };
  }

  return body ?? { data: null };
}
