import { requireAdmin } from "../auth.js";
import { queryAll } from "../db-adapter.js";
import type { Context } from "../context.js";

// ── Types ────────────────────────────────────────────────

export interface ToolCallInfo {
  name: string;
  summary: string;
}

export interface ConversationMessage {
  role: string;
  content: string | null;
  timestamp: string | null;
  toolCalls: ToolCallInfo[];
}

// ── Helpers ──────────────────────────────────────────────

export function summarizeTool(name: string, input: any): string {
  if (!input) return "";
  if (input.file_path) return input.file_path.split("/").pop() || input.file_path;
  if (input.command) return input.command.substring(0, 150);
  if (input.pattern) return `${input.pattern}${input.path ? ` in ${input.path.split("/").pop()}` : ""}`;
  if (input.query) return input.query;
  if (input.description) return input.description;
  if (input.skill) return input.skill;
  if (input.url) return input.url.substring(0, 100);
  if (input.content) return `${input.content.substring(0, 60)}...`;
  return "";
}

export function stripSystemTags(text: string): string {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<teammate-message[\s\S]*?<\/teammate-message>/g, "")
    .replace(/<\/?[a-z][-a-z]*(?:\s[^>]*)?\/?>/g, "")
    .trim();
}

// ── Resolver ─────────────────────────────────────────────

export const conversationResolvers = {
  Query: {
    conversationFeed: async (
      _: any,
      args: { limit?: number; developer?: string },
      ctx: Context,
    ) => {
      requireAdmin(ctx);
      const limit = Math.min(args.limit || 20, 100);

      // Query 1: Get session list from transcripts
      let transcriptSql = `SELECT session_id, file_path, model, started_at, ended_at, sprint, task_num
        FROM transcripts`;
      const params: any[] = [];
      const conditions: string[] = [];

      if (args.developer) {
        conditions.push(`session_id IN (
          SELECT t.session_id FROM transcripts t
          JOIN tasks tk ON t.sprint = tk.sprint AND t.task_num = tk.task_num
          WHERE tk.owner = ?
        )`);
        params.push(args.developer);
      }

      if (conditions.length > 0) {
        transcriptSql += ` WHERE ${conditions.join(" AND ")}`;
      }

      transcriptSql += ` ORDER BY started_at DESC LIMIT ?`;
      params.push(limit);

      const sessions = await queryAll(ctx.db, transcriptSql, params);

      if (sessions.length === 0) {
        return [];
      }

      // Collect session IDs for batched queries
      const sessionIds = sessions.map((s: any) => s.session_id);
      const placeholders = sessionIds.map(() => "?").join(",");

      // Query 2: Batch fetch all messages for these sessions
      const messageRows = await queryAll(
        ctx.db,
        `SELECT session_id, message_index, role, content, timestamp
         FROM messages
         WHERE session_id IN (${placeholders})
         ORDER BY session_id, message_index`,
        sessionIds
      );

      // Query 3: Batch fetch all tool calls for these sessions
      const toolCallRows = await queryAll(
        ctx.db,
        `SELECT session_id, message_index, tool_index, tool_name, input
         FROM tool_calls
         WHERE session_id IN (${placeholders})
         ORDER BY session_id, message_index, tool_index`,
        sessionIds
      );

      // Group messages by session_id
      const messagesBySession = new Map<string, any[]>();
      for (const row of messageRows) {
        const list = messagesBySession.get(row.session_id) || [];
        list.push(row);
        messagesBySession.set(row.session_id, list);
      }

      // Group tool calls by session_id + message_index
      const toolCallsByKey = new Map<string, ToolCallInfo[]>();
      for (const row of toolCallRows) {
        const key = `${row.session_id}:${row.message_index}`;
        const list = toolCallsByKey.get(key) || [];
        let input: any = {};
        try { input = JSON.parse(row.input); } catch {}
        list.push({
          name: row.tool_name,
          summary: summarizeTool(row.tool_name, input),
        });
        toolCallsByKey.set(key, list);
      }

      // Assemble response
      return sessions.map((s: any) => {
        const msgs = messagesBySession.get(s.session_id) || [];
        const messages: ConversationMessage[] = msgs.map((m: any) => ({
          role: m.role,
          content: m.content ? stripSystemTags(m.content) : null,
          timestamp: m.timestamp || null,
          toolCalls: toolCallsByKey.get(`${s.session_id}:${m.message_index}`) || [],
        }));

        return {
          sessionId: s.session_id,
          _developer: null, // resolved via task owner
          _sprint: s.sprint || null,
          taskNum: s.task_num || null,
          _taskNum: s.task_num || null,
          taskTitle: null,
          startedAt: s.started_at || null,
          endedAt: s.ended_at || null,
          model: s.model || null,
          messages,
        };
      });
    },
  },
};
