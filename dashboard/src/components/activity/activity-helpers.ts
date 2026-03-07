// Pure filter functions for the Activity panel.
// No React imports — these are testable without a component tree.

export type ActivityToolCall = { name: string; summary: string | null };

export type ActivityMessage = {
  role: string;
  content: string | null;
  timestamp: string | null;
  toolCalls: ActivityToolCall[];
};

export type ActivitySession = {
  sessionId: string;
  developer: { name: string } | null;
  sprint: { name: string } | null;
  taskNum: number | null;
  taskTitle: string | null;
  startedAt: string | null;
  endedAt: string | null;
  model: string | null;
  messages: ActivityMessage[];
};

/** Full-text search across message content and tool call names/summaries. */
export function filterBySearch(
  sessions: ActivitySession[],
  query: string
): ActivitySession[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;

  return sessions.filter((session) =>
    session.messages.some((msg) => {
      // Check message content
      if (msg.content && msg.content.toLowerCase().includes(q)) return true;
      // Check tool call names and summaries
      return msg.toolCalls.some(
        (tc) =>
          tc.name.toLowerCase().includes(q) ||
          (tc.summary && tc.summary.toLowerCase().includes(q))
      );
    })
  );
}

/** Filter sessions that contain at least one tool call matching the given type. */
export function filterByToolType(
  sessions: ActivitySession[],
  toolType: string
): ActivitySession[] {
  if (!toolType) return sessions;

  return sessions.filter((session) =>
    session.messages.some((msg) =>
      msg.toolCalls.some((tc) => tc.name === toolType)
    )
  );
}

/** Filter sessions whose startedAt falls within [startDate, endDate] (inclusive).
 *  Dates are ISO date strings (YYYY-MM-DD). Sessions with null startedAt are excluded
 *  when any date filter is active. */
export function filterByDateRange(
  sessions: ActivitySession[],
  startDate: string | null,
  endDate: string | null
): ActivitySession[] {
  if (!startDate && !endDate) return sessions;

  const startMs = startDate ? new Date(startDate + "T00:00:00Z").getTime() : -Infinity;
  // endDate is inclusive — include the entire day
  const endMs = endDate ? new Date(endDate + "T23:59:59.999Z").getTime() : Infinity;

  return sessions.filter((session) => {
    if (!session.startedAt) return false;
    const ts = new Date(session.startedAt).getTime();
    return ts >= startMs && ts <= endMs;
  });
}

/** Filter sessions to a single session by ID. Returns all if sessionId is null/undefined. */
export function filterBySessionId(
  sessions: ActivitySession[],
  sessionId: string | null | undefined
): ActivitySession[] {
  if (!sessionId) return sessions;
  return sessions.filter((s) => s.sessionId === sessionId);
}

/** Extract sorted unique tool type names from all sessions. */
export function getUniqueToolTypes(sessions: ActivitySession[]): string[] {
  const types = new Set<string>();
  for (const session of sessions) {
    for (const msg of session.messages) {
      for (const tc of msg.toolCalls) {
        types.add(tc.name);
      }
    }
  }
  return [...types].sort();
}
