/**
 * Context builder for the Ask panel.
 *
 * Pure functions that assemble contextual information (date, route, filters,
 * visible data, past chats) into formatted strings for the system prompt.
 */

export interface AskContext {
  date: string;
  route: string;
  filters: {
    person: string | null;
    project: string | null;
    groupBy: string;
  };
  visibleDataSummary: string | null;
}

export interface VisibleDataSummary {
  page: string;
  totalItems: number;
  breakdown: Record<string, number>;
  context: string | null;
}

/** Build a context section for the system prompt from the current user context. */
export function buildContextPrompt(ctx: AskContext): string {
  const lines: string[] = [];

  lines.push("## User context\n");

  // Date
  lines.push(`Current date/time: ${ctx.date}`);

  // Route
  lines.push(`Current page: ${ctx.route}`);

  // Filters
  const activeFilters: string[] = [];
  if (ctx.filters.person) activeFilters.push(`person: ${ctx.filters.person}`);
  if (ctx.filters.project)
    activeFilters.push(`project: ${ctx.filters.project}`);
  if (ctx.filters.groupBy && ctx.filters.groupBy !== "project")
    activeFilters.push(`grouped by: ${ctx.filters.groupBy}`);

  if (activeFilters.length > 0) {
    lines.push(`Active filters: ${activeFilters.join(", ")}`);
  } else {
    lines.push("No active filters.");
  }

  // Visible data summary
  if (ctx.visibleDataSummary) {
    lines.push(`Visible data: ${ctx.visibleDataSummary}`);
  }

  return lines.join("\n");
}

/** Format a structured visible data summary into a human-readable string. */
export function formatVisibleDataSummary(data: VisibleDataSummary): string {
  const pageName =
    data.page.charAt(0).toUpperCase() + data.page.slice(1) + " page";

  const breakdownEntries = Object.entries(data.breakdown);
  const breakdownStr =
    breakdownEntries.length > 0
      ? ` (${breakdownEntries.map(([k, v]) => `${k}: ${v}`).join(", ")})`
      : "";

  const contextStr = data.context ? ` in ${data.context}` : "";

  return `${pageName}: ${data.totalItems} items${breakdownStr}${contextStr}`;
}

/** Format a list of past chat entries into a summary for tool responses. */
export function formatPastChatsSummary(
  chats: Array<{ id: string; title: string; createdAt: string }>
): string {
  if (chats.length === 0) {
    return "No past conversations found.";
  }

  const MAX_ENTRIES = 20;
  const limited = chats.slice(0, MAX_ENTRIES);

  const lines = limited.map(
    (c) => `- [${c.id}] "${c.title}" (${c.createdAt})`
  );

  return `Recent conversations:\n${lines.join("\n")}`;
}
