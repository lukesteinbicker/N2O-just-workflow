import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { createTestDb, wrapDbAsPool, seedTestData } from "./test-helpers.js";
import { conversationResolvers } from "../resolvers/conversation.js";
import { createLoaders } from "../loaders.js";
import { readFileSync } from "fs";

let db: Database.Database;
let pool: any;
let ctx: any;

function adminCtx() {
  return {
    db: pool,
    loaders: createLoaders(pool),
    currentUser: { name: "admin", email: "admin@test.com", accessRole: "admin" as const },
    pageRoute: null,
  };
}

beforeAll(() => {
  db = createTestDb();
  seedTestData(db);

  // Seed transcripts for conversation tests
  db.prepare(`
    INSERT INTO transcripts (session_id, file_path, message_count, user_message_count, assistant_message_count,
      tool_call_count, total_input_tokens, total_output_tokens, model, started_at, ended_at, sprint, task_num)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "session-001", "/fake/path/session-001.jsonl", 4, 2, 2,
    1, 300, 130, "claude-sonnet-4-20250514",
    "2025-02-20T10:00:00Z", "2025-02-20T10:00:15Z",
    "test-sprint", 1
  );

  db.prepare(`
    INSERT INTO transcripts (session_id, file_path, message_count, started_at, ended_at, model)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    "session-002", "/fake/path/session-002.jsonl", 2,
    "2025-02-20T09:00:00Z", "2025-02-20T09:05:00Z",
    "claude-sonnet-4-20250514"
  );

  db.prepare(`
    INSERT INTO transcripts (session_id, file_path, message_count, started_at, ended_at, model)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    "session-003", "/fake/path/session-003.jsonl", 6,
    "2025-02-20T11:00:00Z", "2025-02-20T11:30:00Z",
    "claude-sonnet-4-20250514"
  );

  // Seed messages for session-001
  const insertMsg = db.prepare(`
    INSERT INTO messages (session_id, message_index, role, content, timestamp, model, input_tokens, output_tokens, stop_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertMsg.run("session-001", 0, "user", "Hello", "2025-02-20T10:00:00Z", null, null, null, null);
  insertMsg.run("session-001", 1, "assistant", "Hi there! How can I help?", "2025-02-20T10:00:05Z", "claude-sonnet-4-20250514", 100, 50, "end_turn");
  insertMsg.run("session-001", 2, "user", "Read <system-reminder>secret</system-reminder> my file", "2025-02-20T10:00:10Z", null, null, null, null);
  insertMsg.run("session-001", 3, "assistant", "I'll read the file.", "2025-02-20T10:00:15Z", "claude-sonnet-4-20250514", 200, 80, "tool_use");

  // Seed messages for session-002
  insertMsg.run("session-002", 0, "user", "What time is it?", "2025-02-20T09:00:00Z", null, null, null, null);
  insertMsg.run("session-002", 1, "assistant", "I can't tell time directly.", "2025-02-20T09:00:05Z", "claude-sonnet-4-20250514", 50, 30, "end_turn");

  // Seed tool calls for session-001
  const insertTc = db.prepare(`
    INSERT INTO tool_calls (session_id, message_index, tool_index, tool_use_id, tool_name, input, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertTc.run("session-001", 3, 0, "toolu_read1", "Read", '{"file_path":"/tmp/test.txt"}', "2025-02-20T10:00:15Z");
  insertTc.run("session-001", 3, 1, "toolu_edit1", "Edit", '{"file_path":"/tmp/test.txt","old_string":"a","new_string":"b"}', "2025-02-20T10:00:15Z");

  pool = wrapDbAsPool(db);
  ctx = adminCtx();
});

afterAll(() => {
  db.close();
});

describe("conversationFeed resolver", () => {
  it("returns sessions ordered by started_at DESC", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      {},
      adminCtx()
    );

    expect(result.length).toBe(3);
    // Newest first: session-003 (11:00), session-001 (10:00), session-002 (09:00)
    expect(result[0].sessionId).toBe("session-003");
    expect(result[1].sessionId).toBe("session-001");
    expect(result[2].sessionId).toBe("session-002");
  });

  it("respects limit parameter", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 2 },
      adminCtx()
    );

    expect(result.length).toBe(2);
    expect(result[0].sessionId).toBe("session-003");
    expect(result[1].sessionId).toBe("session-001");
  });

  it("caps limit at 100", async () => {
    // Should not error with limit > 100
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 500 },
      adminCtx()
    );

    expect(result.length).toBe(3); // Only 3 sessions exist
  });

  it("returns correct session metadata", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 10 },
      adminCtx()
    );

    const session1 = result.find((s: any) => s.sessionId === "session-001");
    expect(session1).toBeDefined();
    expect(session1.startedAt).toBe("2025-02-20T10:00:00Z");
    expect(session1.endedAt).toBe("2025-02-20T10:00:15Z");
    expect(session1.model).toBe("claude-sonnet-4-20250514");
    expect(session1.taskNum).toBe(1);
    expect(session1._sprint).toBe("test-sprint");
  });

  it("returns messages for sessions that have them", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 10 },
      adminCtx()
    );

    const session1 = result.find((s: any) => s.sessionId === "session-001");
    expect(session1.messages.length).toBe(4);
    expect(session1.messages[0].role).toBe("user");
    expect(session1.messages[0].content).toBe("Hello");
    expect(session1.messages[1].role).toBe("assistant");
    expect(session1.messages[1].content).toBe("Hi there! How can I help?");
  });

  it("strips system tags from message content", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 10 },
      adminCtx()
    );

    const session1 = result.find((s: any) => s.sessionId === "session-001");
    // Message at index 2 has <system-reminder>secret</system-reminder>
    expect(session1.messages[2].content).toBe("Read  my file");
    expect(session1.messages[2].content).not.toContain("system-reminder");
  });

  it("returns tool call summaries for messages with tool use", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 10 },
      adminCtx()
    );

    const session1 = result.find((s: any) => s.sessionId === "session-001");
    const msgWithTools = session1.messages[3]; // assistant message at index 3
    expect(msgWithTools.toolCalls).toBeDefined();
    expect(msgWithTools.toolCalls.length).toBe(2);
    expect(msgWithTools.toolCalls[0].name).toBe("Read");
    expect(msgWithTools.toolCalls[0].summary).toBe("test.txt");
    expect(msgWithTools.toolCalls[1].name).toBe("Edit");
    expect(msgWithTools.toolCalls[1].summary).toBe("test.txt");
  });

  it("returns empty messages array for sessions without messages", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 10 },
      adminCtx()
    );

    const session3 = result.find((s: any) => s.sessionId === "session-003");
    expect(session3.messages).toEqual([]);
  });

  it("returns empty toolCalls for messages without tool calls", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 10 },
      adminCtx()
    );

    const session2 = result.find((s: any) => s.sessionId === "session-002");
    expect(session2.messages[0].toolCalls).toEqual([]);
    expect(session2.messages[1].toolCalls).toEqual([]);
  });

  it("defaults limit to 20 when not specified", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      {},
      adminCtx()
    );

    // We only have 3 sessions, but this confirms no error with default limit
    expect(result.length).toBe(3);
  });

  it("filters by developer when task has an owner", async () => {
    // session-001 is linked to test-sprint task 1, owned by 'alice'
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { developer: "alice" },
      adminCtx()
    );

    // Should include session-001 (owned by alice via task)
    const sessionIds = result.map((s: any) => s.sessionId);
    expect(sessionIds).toContain("session-001");
  });
});

describe("conversation.ts has no filesystem imports", () => {
  it("does not import fs, path, child_process, os, or better-sqlite3", async () => {
    const source = readFileSync(
      new URL("../resolvers/conversation.ts", import.meta.url),
      "utf-8"
    );
    expect(source).not.toMatch(/from\s+["']fs["']/);
    expect(source).not.toMatch(/from\s+["']path["']/);
    expect(source).not.toMatch(/from\s+["']child_process["']/);
    expect(source).not.toMatch(/from\s+["']os["']/);
    expect(source).not.toMatch(/from\s+["']better-sqlite3["']/);
    expect(source).not.toMatch(/require\s*\(\s*["']fs["']\s*\)/);
  });
});
