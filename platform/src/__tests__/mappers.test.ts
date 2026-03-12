import { describe, it, expect } from "vitest";
import { mapTask, mapDeveloper, mapProject, mapSprint, mapEvent, mapTranscript } from "../resolvers/mappers.js";

describe("mapTask", () => {
  it("returns null for null input", () => {
    expect(mapTask(null)).toBeNull();
  });

  it("maps snake_case columns to camelCase fields", () => {
    const row = {
      sprint: "s1",
      task_num: 3,
      spec: "spec.md",
      title: "Build API",
      description: "Create endpoints",
      done_when: "Tests pass",
      status: "green",
      blocked_reason: null,
      type: "backend",
      complexity: "2.5",
      estimated_minutes: 120,
      priority: 1.0,
      horizon: "active",
      started_at: "2026-02-22T09:00:00",
      completed_at: "2026-02-22T11:30:00",
      reversions: 0,
      testing_posture: "A",
      verified: 1,
      commit_hash: "abc123",
      owner: "alice",
    };

    const result = mapTask(row);
    expect(result).toEqual({
      sprint: "s1",
      taskNum: 3,
      spec: "spec.md",
      title: "Build API",
      description: "Create endpoints",
      doneWhen: "Tests pass",
      status: "green",
      blockedReason: null,
      type: "backend",
      complexity: 2.5,
      estimatedMinutes: 120,
      priority: 1.0,
      horizon: "active",
      startedAt: "2026-02-22T09:00:00",
      completedAt: "2026-02-22T11:30:00",
      reversions: 0,
      testingPosture: "A",
      verified: true,
      commitHash: "abc123",
      _owner: "alice",
    });
  });

  it("handles verified=false and null complexity", () => {
    const row = {
      sprint: "s1", task_num: 1, title: "x", status: "pending",
      complexity: null, verified: false, owner: null,
      spec: null, description: null, done_when: null, blocked_reason: null,
      type: null, estimated_minutes: null, priority: null, horizon: null,
      started_at: null, completed_at: null, reversions: null,
      testing_posture: null, commit_hash: null,
    };
    const result = mapTask(row);
    expect(result!.complexity).toBeNull();
    expect(result!.verified).toBe(false);
    expect(result!._owner).toBeNull();
  });
});

describe("mapDeveloper", () => {
  it("returns null for null input", () => {
    expect(mapDeveloper(null)).toBeNull();
  });

  it("maps developer row correctly", () => {
    const row = {
      name: "alice",
      full_name: "Alice Smith",
      role: "fullstack",
      baseline_competency: 4.0,
      strengths: "Systems thinking",
      growth_areas: "Testing",
    };
    expect(mapDeveloper(row)).toEqual({
      name: "alice",
      fullName: "Alice Smith",
      role: "fullstack",
      baselineCompetency: 4.0,
      strengths: "Systems thinking",
      growthAreas: "Testing",
      accessRole: "engineer",
      phoneNumber: null,
    });
  });
});

describe("mapProject", () => {
  it("returns null for null input", () => {
    expect(mapProject(null)).toBeNull();
  });

  it("maps project row correctly", () => {
    const row = {
      id: "proj-1",
      name: "NOS",
      description: "Workflow framework",
      repo_url: "https://github.com/test/repo",
      start_at: "2026-01-01",
      end_at: null,
      status: "active",
      metadata: null,
    };
    expect(mapProject(row)).toEqual({
      id: "proj-1",
      name: "NOS",
      description: "Workflow framework",
      repoUrl: "https://github.com/test/repo",
      startAt: "2026-01-01",
      endAt: null,
      status: "active",
      metadata: null,
    });
  });
});

describe("mapSprint", () => {
  it("returns null for null input", () => {
    expect(mapSprint(null)).toBeNull();
  });

  it("maps sprint row correctly", () => {
    const row = {
      name: "sprint-1",
      project_id: "proj-1",
      start_at: "2026-02-01",
      end_at: "2026-02-15",
      deadline: "2026-02-14",
      goal: "Launch MVP",
      status: "active",
    };
    expect(mapSprint(row)).toEqual({
      name: "sprint-1",
      projectId: "proj-1",
      startAt: "2026-02-01",
      endAt: "2026-02-15",
      deadline: "2026-02-14",
      goal: "Launch MVP",
      status: "active",
    });
  });
});

describe("mapEvent", () => {
  it("returns null for null input", () => {
    expect(mapEvent(null)).toBeNull();
  });

  it("maps event row correctly", () => {
    const row = {
      id: 1,
      timestamp: "2026-02-22T10:00:00",
      session_id: "sess-1",
      sprint: "s1",
      task_num: 2,
      event_type: "tool_call",
      tool_name: "Read",
      skill_name: null,
      skill_version: null,
      phase: null,
      agent_id: null,
      agent_type: null,
      input_tokens: 500,
      output_tokens: 200,
    };
    expect(mapEvent(row)).toEqual({
      id: 1,
      timestamp: "2026-02-22T10:00:00",
      sessionId: "sess-1",
      _sprint: "s1",
      taskNum: 2,
      _taskNum: 2,
      eventType: "tool_call",
      toolName: "Read",
      skillName: null,
      skillVersion: null,
      phase: null,
      agentId: null,
      agentType: null,
      inputTokens: 500,
      outputTokens: 200,
    });
  });
});

describe("mapTranscript", () => {
  it("returns null for null input", () => {
    expect(mapTranscript(null)).toBeNull();
  });

  it("maps transcript row correctly", () => {
    const row = {
      id: 1,
      session_id: "sess-1",
      parent_session_id: null,
      file_path: "/path/to/transcript.jsonl",
      file_size_bytes: 12345,
      message_count: 20,
      user_message_count: 8,
      assistant_message_count: 12,
      tool_call_count: 5,
      total_input_tokens: 10000,
      total_output_tokens: 5000,
      model: "claude-opus-4-6",
      started_at: "2026-02-22T09:00:00",
      ended_at: "2026-02-22T10:00:00",
      sprint: "s1",
      task_num: 1,
    };
    expect(mapTranscript(row)).toEqual({
      id: 1,
      sessionId: "sess-1",
      parentSessionId: null,
      filePath: "/path/to/transcript.jsonl",
      fileSize: 12345,
      messageCount: 20,
      userMessageCount: 8,
      assistantMessageCount: 12,
      toolCallCount: 5,
      totalInputTokens: 10000,
      totalOutputTokens: 5000,
      model: "claude-opus-4-6",
      startedAt: "2026-02-22T09:00:00",
      endedAt: "2026-02-22T10:00:00",
      _sprint: "s1",
      taskNum: 1,
      _taskNum: 1,
    });
  });
});
