import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { resolve, join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import Database from "better-sqlite3";

// ── JSONL parser ────────────────────────────────────────

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

function summarizeTool(name: string, input: any): string {
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

function stripSystemTags(text: string): string {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<teammate-message[\s\S]*?<\/teammate-message>/g, "")
    .replace(/<\/?[a-z][-a-z]*(?:\s[^>]*)?\/?>/g, "")
    .trim();
}

// ── Local SQLite persistence ────────────────────────────

let _localDb: Database.Database | null = null;

function getLocalDb(): Database.Database | null {
  if (_localDb) return _localDb;
  const dbPath = resolve(process.cwd(), "..", ".pm", "tasks.db");
  if (!existsSync(dbPath)) return null;
  try {
    _localDb = new Database(dbPath);
    _localDb.pragma("journal_mode = WAL");
    return _localDb;
  } catch {
    return null;
  }
}

interface FullMessage {
  role: string;
  content: string | null;
  timestamp: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  stopReason: string | null;
}

interface FullToolCall {
  messageIndex: number;
  toolIndex: number;
  toolUseId: string | null;
  toolName: string;
  input: string; // JSON string
  timestamp: string | null;
}

function persistToSqlite(
  sessionId: string,
  messages: FullMessage[],
  toolCalls: FullToolCall[],
): void {
  const db = getLocalDb();
  if (!db) return;

  try {
    const insertMsg = db.prepare(`
      INSERT OR REPLACE INTO messages
        (session_id, message_index, role, content, timestamp, model, input_tokens, output_tokens, stop_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTool = db.prepare(`
      INSERT OR REPLACE INTO tool_calls
        (session_id, message_index, tool_index, tool_use_id, tool_name, input, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        insertMsg.run(sessionId, i, m.role, m.content, m.timestamp, m.model, m.inputTokens, m.outputTokens, m.stopReason);
      }
      for (const tc of toolCalls) {
        insertTool.run(sessionId, tc.messageIndex, tc.toolIndex, tc.toolUseId, tc.toolName, tc.input, tc.timestamp);
      }
    });

    tx();
  } catch {
    // Non-blocking: persist failures don't affect the resolver
  }
}

// ── JSONL parser ─────────────────────────────────────────

function parseJSONL(filePath: string, sessionId?: string): ConversationMessage[] {
  if (!existsSync(filePath)) return [];

  try {
    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    const messages: ConversationMessage[] = [];
    const fullMessages: FullMessage[] = [];
    const fullToolCalls: FullToolCall[] = [];

    for (const line of lines) {
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      // User messages
      if (entry.type === "user" && entry.message?.content) {
        let text = "";
        if (typeof entry.message.content === "string") {
          text = entry.message.content;
        } else if (Array.isArray(entry.message.content)) {
          text = entry.message.content
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text || "")
            .join("\n");
        }
        const fullText = stripSystemTags(text);
        if (fullText) {
          const msgIndex = fullMessages.length;
          fullMessages.push({
            role: "user",
            content: fullText,
            timestamp: entry.timestamp || null,
            model: null,
            inputTokens: null,
            outputTokens: null,
            stopReason: null,
          });
          messages.push({
            role: "user",
            content: fullText.substring(0, 5000),
            timestamp: entry.timestamp || null,
            toolCalls: [],
          });
        }
      }

      // Assistant messages
      if (entry.type === "assistant" && entry.message?.content) {
        const blocks = Array.isArray(entry.message.content)
          ? entry.message.content
          : [{ type: "text", text: String(entry.message.content) }];

        const textParts: string[] = [];
        const toolCalls: ToolCallInfo[] = [];
        let toolIndex = 0;
        const msgIndex = fullMessages.length;

        for (const block of blocks) {
          if (block.type === "text" && block.text?.trim()) {
            textParts.push(block.text);
          } else if (block.type === "tool_use" && block.name) {
            toolCalls.push({
              name: block.name,
              summary: summarizeTool(block.name, block.input),
            });
            fullToolCalls.push({
              messageIndex: msgIndex,
              toolIndex: toolIndex++,
              toolUseId: block.id || null,
              toolName: block.name,
              input: JSON.stringify(block.input || {}),
              timestamp: entry.timestamp || null,
            });
          }
        }

        const fullText = textParts.join("\n");
        if (fullText || toolCalls.length > 0) {
          const usage = entry.message?.usage;
          fullMessages.push({
            role: "assistant",
            content: fullText || null,
            timestamp: entry.timestamp || null,
            model: entry.message?.model || null,
            inputTokens: usage?.input_tokens ?? null,
            outputTokens: usage?.output_tokens ?? null,
            stopReason: entry.message?.stop_reason || null,
          });
          messages.push({
            role: "assistant",
            content: fullText ? fullText.substring(0, 5000) : null,
            timestamp: entry.timestamp || null,
            toolCalls,
          });
        }
      }
    }

    // Persist full data to local SQLite (non-blocking)
    if (sessionId && fullMessages.length > 0) {
      persistToSqlite(sessionId, fullMessages, fullToolCalls);
    }

    return messages;
  } catch {
    return [];
  }
}

// ── Quick metadata scan (reads first + last few lines only) ──

interface SessionMeta {
  filePath: string;
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  model: string | null;
  messageCount: number;
}

function scanSessionMeta(filePath: string): SessionMeta | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length === 0) return null;

    let sessionId: string | null = null;
    let startedAt: string | null = null;
    let endedAt: string | null = null;
    let model: string | null = null;
    let userCount = 0;

    // Scan all lines for timestamps and counts, but skip content parsing
    for (const line of lines) {
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (!sessionId && entry.sessionId) {
        sessionId = entry.sessionId;
      }
      if (entry.timestamp) {
        if (!startedAt) startedAt = entry.timestamp;
        endedAt = entry.timestamp;
      }
      if (!model && entry.type === "assistant" && entry.message?.model) {
        model = entry.message.model;
      }
      if (entry.type === "user") {
        userCount++;
      }
    }

    if (!sessionId || userCount === 0) return null;

    return {
      filePath,
      sessionId,
      startedAt,
      endedAt,
      model,
      messageCount: userCount,
    };
  } catch {
    return null;
  }
}

// ── Find JSONL directory for this project ──

function getClaudeProjectDir(): string | null {
  const projectRoot = resolve(process.cwd(), "..");
  const encoded = projectRoot.replace(/\//g, "-").replace(/^-/, "");
  const dir = join(homedir(), ".claude", "projects", `-${encoded}`);
  if (existsSync(dir)) return dir;
  // Try without leading dash
  const dir2 = join(homedir(), ".claude", "projects", encoded);
  if (existsSync(dir2)) return dir2;
  return null;
}

// Git user name for developer attribution
let gitUserName: string | null = null;
function getGitUserName(): string | null {
  if (gitUserName !== null) return gitUserName || null;
  try {
    const projectRoot = resolve(process.cwd(), "..");
    gitUserName = execSync("git config user.name", { cwd: projectRoot, encoding: "utf-8" }).trim();
  } catch {
    gitUserName = "";
  }
  return gitUserName || null;
}

// Session cache (refreshed when file list changes)
let cachedSessions: SessionMeta[] = [];
let cacheTime = 0;
const CACHE_TTL = 15_000; // 15s

function getAllSessions(): SessionMeta[] {
  const now = Date.now();
  if (cachedSessions.length > 0 && now - cacheTime < CACHE_TTL) {
    return cachedSessions;
  }

  const dir = getClaudeProjectDir();
  if (!dir) return [];

  // Only read top-level .jsonl files (parent sessions, not subagents)
  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".jsonl") && !f.startsWith("agent-")
  );

  const sessions: SessionMeta[] = [];
  for (const f of files) {
    const fullPath = join(dir, f);
    try {
      const stat = statSync(fullPath);
      if (!stat.isFile() || stat.size < 100) continue;
    } catch {
      continue;
    }
    const meta = scanSessionMeta(fullPath);
    if (meta) sessions.push(meta);
  }

  // Sort newest first
  sessions.sort((a, b) => {
    const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
    const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
    return tb - ta;
  });

  cachedSessions = sessions;
  cacheTime = now;
  return sessions;
}

// ── SQLite-backed message reader ─────────────────────────

function readMessagesFromSqlite(sessionId: string): ConversationMessage[] | null {
  const db = getLocalDb();
  if (!db) return null;

  try {
    const rows = db.prepare(
      "SELECT message_index, role, content, timestamp FROM messages WHERE session_id = ? ORDER BY message_index"
    ).all(sessionId) as any[];

    if (rows.length === 0) return null;

    const toolCallRows = db.prepare(
      "SELECT message_index, tool_name, input FROM tool_calls WHERE session_id = ? ORDER BY message_index, tool_index"
    ).all(sessionId) as any[];

    // Group tool calls by message_index
    const toolsByMsg = new Map<number, ToolCallInfo[]>();
    for (const tc of toolCallRows) {
      let input: any = {};
      try { input = JSON.parse(tc.input); } catch {}
      const list = toolsByMsg.get(tc.message_index) || [];
      list.push({ name: tc.tool_name, summary: summarizeTool(tc.tool_name, input) });
      toolsByMsg.set(tc.message_index, list);
    }

    return rows.map((r) => ({
      role: r.role,
      content: r.content ? r.content.substring(0, 5000) : null,
      timestamp: r.timestamp,
      toolCalls: toolsByMsg.get(r.message_index) || [],
    }));
  } catch {
    return null;
  }
}

// ── Resolver ────────────────────────────────────────────

export const conversationResolvers = {
  Query: {
    conversationFeed: async (
      _: any,
      args: { limit?: number; developer?: string },
    ) => {
      const allSessions = getAllSessions();
      const limit = Math.min(args.limit || 20, 100);

      // TODO: developer filter would need task linkage; skip for now
      const sessions = allSessions.slice(0, limit);

      const developer = getGitUserName();

      return sessions.map((s) => {
        // Try SQLite first (faster, no re-parse), fall back to JSONL
        const messages = readMessagesFromSqlite(s.sessionId) ?? parseJSONL(s.filePath, s.sessionId);
        return {
          sessionId: s.sessionId,
          developer,
          sprint: null,
          taskNum: null,
          taskTitle: null,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          model: s.model,
          messages,
        };
      });
    },
  },
};
