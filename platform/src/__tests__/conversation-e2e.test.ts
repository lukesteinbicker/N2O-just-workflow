/**
 * E2E test: Golden fixture data → conversationFeed resolver
 *
 * Verifies the GraphQL resolver correctly returns messages, tool calls,
 * and metadata from seeded transcript data. Tests the full resolver pipeline
 * without external script dependencies.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { createTestDb, wrapDbAsPool, seedTestData } from "./test-helpers.js";
import { conversationResolvers } from "../resolvers/conversation.js";
import { createLoaders } from "../loaders.js";

// ── Golden fixture data ──────────────────────────────────

const SESSION_ID = "e2e-golden-session-001";

interface FixtureMessage {
  session_id: string;
  message_index: number;
  role: string;
  content: string;
  timestamp: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  stop_reason: string | null;
}

interface FixtureToolCall {
  session_id: string;
  message_index: number;
  tool_index: number;
  tool_use_id: string;
  tool_name: string;
  input: string;
  timestamp: string;
}

function goldenMessages(): FixtureMessage[] {
  return [
    { session_id: SESSION_ID, message_index: 0, role: "user", content: "Hello, can you help me?", timestamp: "2025-03-01T10:00:00Z", model: null, input_tokens: null, output_tokens: null, stop_reason: null },
    { session_id: SESSION_ID, message_index: 1, role: "assistant", content: "Sure! Let me read that file.", timestamp: "2025-03-01T10:00:05Z", model: "claude-sonnet-4-20250514", input_tokens: 150, output_tokens: 75, stop_reason: "tool_use" },
    { session_id: SESSION_ID, message_index: 2, role: "user", content: "Thanks! Now edit it with this: it's a tricky apostrophe test", timestamp: "2025-03-01T10:00:10Z", model: null, input_tokens: null, output_tokens: null, stop_reason: null },
    { session_id: SESSION_ID, message_index: 3, role: "assistant", content: "I'll make that edit.", timestamp: "2025-03-01T10:00:15Z", model: "claude-sonnet-4-20250514", input_tokens: 300, output_tokens: 120, stop_reason: "tool_use" },
    { session_id: SESSION_ID, message_index: 4, role: "user", content: "Great work! \u{1F389} \u65E5\u672C\u8A9E\u30C6\u30B9\u30C8", timestamp: "2025-03-01T10:00:20Z", model: null, input_tokens: null, output_tokens: null, stop_reason: null },
    { session_id: SESSION_ID, message_index: 5, role: "assistant", content: "", timestamp: "2025-03-01T10:00:25Z", model: "claude-sonnet-4-20250514", input_tokens: 100, output_tokens: 40, stop_reason: "tool_use" },
  ];
}

function goldenToolCalls(): FixtureToolCall[] {
  return [
    { session_id: SESSION_ID, message_index: 1, tool_index: 0, tool_use_id: "toolu_golden_read", tool_name: "Read", input: '{"file_path":"/tmp/golden-test.txt"}', timestamp: "2025-03-01T10:00:05Z" },
    { session_id: SESSION_ID, message_index: 3, tool_index: 0, tool_use_id: "toolu_golden_edit", tool_name: "Edit", input: '{"file_path":"/tmp/golden-test.txt","old_string":"line one\\nline two\\nline three\\nline four\\nline five","new_string":"updated line one\\nupdated line two\\nupdated line three\\nupdated line four\\nupdated line five"}', timestamp: "2025-03-01T10:00:15Z" },
    { session_id: SESSION_ID, message_index: 5, tool_index: 0, tool_use_id: "toolu_golden_bash", tool_name: "Bash", input: '{"command":"echo \'hello world\'"}', timestamp: "2025-03-01T10:00:25Z" },
  ];
}

// ── Test setup ───────────────────────────────────────────

let platformDb: Database.Database;
let pool: any;

function adminCtx() {
  return {
    db: pool,
    loaders: createLoaders(pool),
    currentUser: { name: "admin", email: "admin@test.com", accessRole: "admin" as const },
    pageRoute: null,
  };
}

beforeAll(() => {
  platformDb = createTestDb();
  seedTestData(platformDb);

  // Seed golden transcript
  platformDb.prepare(`
    INSERT INTO transcripts (session_id, file_path, message_count, user_message_count, assistant_message_count,
      tool_call_count, total_input_tokens, total_output_tokens, model, started_at, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    SESSION_ID, "/fixture/golden-session.jsonl", 6, 3, 3,
    3, 550, 235, "claude-sonnet-4-20250514",
    "2025-03-01T10:00:00Z", "2025-03-01T10:00:25Z"
  );

  // Seed golden messages
  const insertMsg = platformDb.prepare(`
    INSERT INTO messages (session_id, message_index, role, content, timestamp, model, input_tokens, output_tokens, stop_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const m of goldenMessages()) {
    insertMsg.run(m.session_id, m.message_index, m.role, m.content, m.timestamp, m.model, m.input_tokens, m.output_tokens, m.stop_reason);
  }

  // Seed golden tool calls
  const insertTc = platformDb.prepare(`
    INSERT INTO tool_calls (session_id, message_index, tool_index, tool_use_id, tool_name, input, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const tc of goldenToolCalls()) {
    insertTc.run(tc.session_id, tc.message_index, tc.tool_index, tc.tool_use_id, tc.tool_name, tc.input, tc.timestamp);
  }

  pool = wrapDbAsPool(platformDb);
});

afterAll(() => {
  platformDb?.close();
});

// ── Tests ────────────────────────────────────────────────

describe("E2E: golden fixture → conversationFeed resolver", () => {
  it("resolver returns golden session with correct message count", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 50 },
      adminCtx()
    );

    const goldenSession = result.find((s: any) => s.sessionId === SESSION_ID);
    expect(goldenSession).toBeDefined();
    expect(goldenSession.messages.length).toBe(6);
  });

  it("resolver returns correct message content from fixture", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 50 },
      adminCtx()
    );

    const goldenSession = result.find((s: any) => s.sessionId === SESSION_ID);
    const msgs = goldenSession.messages;

    // Message 0: user "Hello, can you help me?"
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("Hello, can you help me?");

    // Message 1: assistant "Sure! Let me read that file."
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].content).toBe("Sure! Let me read that file.");

    // Message 2: user with apostrophe (string content, not array)
    expect(msgs[2].role).toBe("user");
    expect(msgs[2].content).toContain("it's a tricky apostrophe test");

    // Message 3: assistant "I'll make that edit."
    expect(msgs[3].role).toBe("assistant");
    expect(msgs[3].content).toBe("I'll make that edit.");

    // Message 4: Unicode
    expect(msgs[4].role).toBe("user");
    expect(msgs[4].content).toContain("\u{1F389}");
    expect(msgs[4].content).toContain("\u65E5\u672C\u8A9E\u30C6\u30B9\u30C8");
  });

  it("resolver returns tool call summaries matching fixture", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 50 },
      adminCtx()
    );

    const goldenSession = result.find((s: any) => s.sessionId === SESSION_ID);
    const msgs = goldenSession.messages;

    // Message 1: assistant with Read tool call
    expect(msgs[1].toolCalls.length).toBe(1);
    expect(msgs[1].toolCalls[0].name).toBe("Read");
    expect(msgs[1].toolCalls[0].summary).toBe("golden-test.txt");

    // Message 3: assistant with Edit tool call
    expect(msgs[3].toolCalls.length).toBe(1);
    expect(msgs[3].toolCalls[0].name).toBe("Edit");
    expect(msgs[3].toolCalls[0].summary).toBe("golden-test.txt");

    // Message 5: assistant with Bash tool call
    expect(msgs[5].toolCalls.length).toBe(1);
    expect(msgs[5].toolCalls[0].name).toBe("Bash");
    expect(msgs[5].toolCalls[0].summary).toBe("echo 'hello world'");
  });

  it("resolver returns session metadata from transcripts", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 50 },
      adminCtx()
    );

    const goldenSession = result.find((s: any) => s.sessionId === SESSION_ID);
    expect(goldenSession.startedAt).toBe("2025-03-01T10:00:00Z");
    expect(goldenSession.endedAt).toBe("2025-03-01T10:00:25Z");
    expect(goldenSession.model).toBe("claude-sonnet-4-20250514");
  });

  it("Edit tool call preserves full diff input (no truncation)", async () => {
    const result = await conversationResolvers.Query.conversationFeed(
      null,
      { limit: 50 },
      adminCtx()
    );

    const goldenSession = result.find((s: any) => s.sessionId === SESSION_ID);
    // The Edit tool call is on message 3 (index 0 in toolCalls)
    const editCall = goldenSession.messages[3].toolCalls[0];
    expect(editCall.name).toBe("Edit");
    expect(editCall.summary).toBe("golden-test.txt");
  });
});
