import { describe, it, expect } from "vitest";
import {
  buildContextPrompt,
  formatVisibleDataSummary,
  formatPastChatsSummary,
  type AskContext,
  type VisibleDataSummary,
} from "../context-builder";

describe("buildContextPrompt", () => {
  it("includes the current date", () => {
    const ctx: AskContext = {
      date: "2026-03-04T12:00:00.000Z",
      route: "/",
      filters: { filters: {}, groupBy: [], sortBy: [] },
      visibleDataSummary: null,
    };
    const result = buildContextPrompt(ctx);
    expect(result).toContain("2026-03-04");
  });

  it("includes the active route", () => {
    const ctx: AskContext = {
      date: "2026-03-04T12:00:00.000Z",
      route: "/tasks",
      filters: { filters: {}, groupBy: [], sortBy: [] },
      visibleDataSummary: null,
    };
    const result = buildContextPrompt(ctx);
    expect(result).toContain("/tasks");
    expect(result).toContain("Current page");
  });

  it("includes filter state when filters are active", () => {
    const ctx: AskContext = {
      date: "2026-03-04T12:00:00.000Z",
      route: "/tasks",
      filters: {
        filters: { person: ["Alice"], project: ["coordination"] },
        groupBy: ["developer"],
        sortBy: [],
      },
      visibleDataSummary: null,
    };
    const result = buildContextPrompt(ctx);
    expect(result).toContain("Alice");
    expect(result).toContain("coordination");
    expect(result).toContain("developer");
  });

  it("omits filter section when no filters are active", () => {
    const ctx: AskContext = {
      date: "2026-03-04T12:00:00.000Z",
      route: "/",
      filters: { filters: {}, groupBy: [], sortBy: [] },
      visibleDataSummary: null,
    };
    const result = buildContextPrompt(ctx);
    expect(result).toContain("No active filters");
  });

  it("includes visible data summary when provided", () => {
    const ctx: AskContext = {
      date: "2026-03-04T12:00:00.000Z",
      route: "/tasks",
      filters: { filters: {}, groupBy: [], sortBy: [] },
      visibleDataSummary: "Tasks page: 31 tasks, 12 done, 3 blocked in coordination sprint",
    };
    const result = buildContextPrompt(ctx);
    expect(result).toContain("31 tasks");
    expect(result).toContain("12 done");
    expect(result).toContain("3 blocked");
    expect(result).toContain("Visible data");
  });

  it("omits visible data section when summary is null", () => {
    const ctx: AskContext = {
      date: "2026-03-04T12:00:00.000Z",
      route: "/",
      filters: { filters: {}, groupBy: [], sortBy: [] },
      visibleDataSummary: null,
    };
    const result = buildContextPrompt(ctx);
    expect(result).not.toContain("Visible data");
  });

  it("returns a non-empty string for minimal context", () => {
    const ctx: AskContext = {
      date: "2026-03-04T12:00:00.000Z",
      route: "/",
      filters: { filters: {}, groupBy: [], sortBy: [] },
      visibleDataSummary: null,
    };
    const result = buildContextPrompt(ctx);
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes sort-by clauses when present", () => {
    const ctx: AskContext = {
      date: "2026-03-04T12:00:00.000Z",
      route: "/tasks",
      filters: {
        filters: {},
        groupBy: [],
        sortBy: [{ key: "blowUp", direction: "desc" }],
      },
      visibleDataSummary: null,
    };
    const result = buildContextPrompt(ctx);
    expect(result).toContain("blowUp");
    expect(result).toContain("desc");
    expect(result).toContain("sorted by");
  });

  it("includes multi-select filter values", () => {
    const ctx: AskContext = {
      date: "2026-03-04T12:00:00.000Z",
      route: "/tasks",
      filters: {
        filters: { status: ["red", "blocked"] },
        groupBy: [],
        sortBy: [],
      },
      visibleDataSummary: null,
    };
    const result = buildContextPrompt(ctx);
    expect(result).toContain("red");
    expect(result).toContain("blocked");
    expect(result).toContain("status");
  });
});

describe("formatVisibleDataSummary", () => {
  it("formats a tasks summary", () => {
    const data: VisibleDataSummary = {
      page: "tasks",
      totalItems: 31,
      breakdown: { done: 12, red: 8, blocked: 3, pending: 8 },
      context: "coordination sprint",
    };
    const result = formatVisibleDataSummary(data);
    expect(result).toContain("Tasks page");
    expect(result).toContain("31");
    expect(result).toContain("done: 12");
    expect(result).toContain("coordination sprint");
  });

  it("formats a sprints summary", () => {
    const data: VisibleDataSummary = {
      page: "sprints",
      totalItems: 5,
      breakdown: { active: 2, completed: 3 },
      context: null,
    };
    const result = formatVisibleDataSummary(data);
    expect(result).toContain("Sprints page");
    expect(result).toContain("5");
    expect(result).toContain("active: 2");
  });

  it("handles empty breakdown", () => {
    const data: VisibleDataSummary = {
      page: "dashboard",
      totalItems: 0,
      breakdown: {},
      context: null,
    };
    const result = formatVisibleDataSummary(data);
    expect(result).toContain("Dashboard page");
    expect(result).toContain("0");
  });
});

describe("formatPastChatsSummary", () => {
  it("formats a list of past chats", () => {
    const chats = [
      { id: "abc", title: "Sprint status", createdAt: "2026-03-04T10:00:00Z" },
      { id: "def", title: "Who has capacity?", createdAt: "2026-03-03T15:00:00Z" },
    ];
    const result = formatPastChatsSummary(chats);
    expect(result).toContain("Sprint status");
    expect(result).toContain("Who has capacity?");
    expect(result).toContain("abc");
    expect(result).toContain("def");
  });

  it("returns a message when no past chats exist", () => {
    const result = formatPastChatsSummary([]);
    expect(result).toContain("No past conversations");
  });

  it("limits to most recent chats", () => {
    const chats = Array.from({ length: 25 }, (_, i) => ({
      id: `chat-${i}`,
      title: `Chat ${i}`,
      createdAt: new Date(2026, 2, 4, i).toISOString(),
    }));
    const result = formatPastChatsSummary(chats);
    // Should only include up to 20 entries
    const idMatches = result.match(/chat-\d+/g) ?? [];
    expect(idMatches.length).toBeLessThanOrEqual(20);
  });
});
