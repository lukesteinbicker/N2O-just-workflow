/**
 * Executes GraphQL queries against the N2O data platform API.
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

  if (!res.ok) {
    return {
      data: null,
      errors: [{ message: `GraphQL request failed: ${res.status} ${res.statusText}` }],
    };
  }

  return res.json();
}
