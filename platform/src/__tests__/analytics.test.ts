import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ApolloServer } from "@apollo/server";
import { typeDefs } from "../schema/typeDefs.js";
import { resolvers } from "../resolvers/index.js";
import { createTestDb } from "./test-helpers.js";
import type { Context } from "../context.js";
import type Database from "better-sqlite3";
import { createLoaders } from "../loaders.js";

let db: Database.Database;
let server: ApolloServer<Context>;

beforeAll(() => {
  db = createTestDb();
  seedAnalyticsData(db);
  server = new ApolloServer<Context>({ typeDefs, resolvers });
});

afterAll(() => {
  db.close();
});

function executeQuery(query: string, variables?: Record<string, any>) {
  return server.executeOperation(
    { query, variables },
    { contextValue: { db, loaders: createLoaders(db) } }
  );
}

function getData(res: any) {
  expect(res.body.kind).toBe("single");
  const result = (res.body as any).singleResult;
  if (result.errors) {
    throw new Error(
      `GraphQL errors: ${result.errors.map((e: any) => e.message).join(", ")}`
    );
  }
  return result.data;
}

/**
 * Seed data specifically for analytics views.
 * Designed so each view has at least one row to verify the query works.
 */
function seedAnalyticsData(db: Database.Database) {
  // Developers
  db.prepare(
    `INSERT INTO developers (name, full_name, role) VALUES ('alice', 'Alice Smith', 'fullstack')`
  ).run();
  db.prepare(
    `INSERT INTO developers (name, full_name, role) VALUES ('bob', 'Bob Jones', 'frontend')`
  ).run();

  // Project + Sprint
  db.prepare(
    `INSERT INTO projects (id, name, status) VALUES ('proj-1', 'Test Project', 'active')`
  ).run();
  db.prepare(
    `INSERT INTO sprints (name, project_id, start_at, status) VALUES ('sprint-1', 'proj-1', '2026-02-01', 'active')`
  ).run();
  db.prepare(
    `INSERT INTO sprints (name, project_id, start_at, status) VALUES ('sprint-2', 'proj-1', '2026-02-15', 'active')`
  ).run();

  // Tasks — need completed tasks with estimates for velocity/estimation/blow-up views
  // Task 1: alice, green, 120min est, actual 150min (1.25x) — normal
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, status, type, complexity, owner, estimated_minutes, priority, horizon,
       started_at, completed_at, reversions, testing_posture, pattern_audited, pattern_audit_notes)
     VALUES ('sprint-1', 1, 'Set up database', 'green', 'database', 'medium', 'alice', 120, 1.0, 'active',
       '2026-02-01T09:00:00', '2026-02-01T11:30:00', 0, 'A', 1, 'No violations')`
  ).run();

  // Task 2: alice, green, 60min est, actual 300min (5.0x) — blow-up!
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, status, type, complexity, owner, estimated_minutes, priority, horizon,
       started_at, completed_at, reversions, testing_posture, pattern_audited, pattern_audit_notes)
     VALUES ('sprint-1', 2, 'Auth middleware', 'green', 'actions', 'high', 'alice', 60, 2.0, 'active',
       '2026-02-01T12:00:00', '2026-02-01T17:00:00', 2, 'B', 1, 'Found fake test violation')`
  ).run();

  // Task 3: alice, green in sprint-2, 180min est, actual 210min (1.17x) — improving
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, status, type, complexity, owner, estimated_minutes, priority, horizon,
       started_at, completed_at, reversions, testing_posture, pattern_audited)
     VALUES ('sprint-2', 1, 'Build API', 'green', 'actions', 'high', 'alice', 180, 1.0, 'active',
       '2026-02-15T09:00:00', '2026-02-15T12:30:00', 0, 'A', 1)`
  ).run();

  // Task 4: bob, green in sprint-1 (for multi-developer metrics)
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, status, type, complexity, owner, estimated_minutes, priority, horizon,
       started_at, completed_at, reversions, testing_posture, pattern_audited)
     VALUES ('sprint-1', 3, 'Frontend components', 'green', 'frontend', 'low', 'bob', 120, 3.0, 'active',
       '2026-02-01T09:00:00', '2026-02-01T11:00:00', 0, 'A', 1)`
  ).run();

  // Task 5: blocked task
  db.prepare(
    `INSERT INTO tasks (sprint, task_num, title, status, type, priority, horizon, blocked_reason)
     VALUES ('sprint-1', 4, 'Deploy', 'blocked', 'infra', 4.0, 'active', 'Waiting on CI')`
  ).run();

  // Workflow events — tool calls for skill_usage view
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, tool_name, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'tool_call', 'Read', '2026-02-01T09:05:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, tool_name, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'tool_call', 'Read', '2026-02-01T09:10:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, tool_name, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'tool_call', 'Edit', '2026-02-01T09:15:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, tool_name, timestamp)
     VALUES ('sess-2', 'sprint-1', 2, 'tool_call', 'Read', '2026-02-01T12:05:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, tool_name, timestamp)
     VALUES ('sess-2', 'sprint-1', 2, 'tool_call', 'Bash', '2026-02-01T12:10:00')`
  ).run();

  // Skill invocations + completions for skill_duration
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, skill_name, skill_version, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'skill_invoked', 'tdd-agent', 'v2', '2026-02-01T09:00:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, skill_name, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'task_completed', 'tdd-agent', '2026-02-01T11:30:00')`
  ).run();

  // Phase events for phase_timing / phase_time_distribution
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, phase, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'phase_entered', 'RED', '2026-02-01T09:00:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, phase, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'phase_entered', 'GREEN', '2026-02-01T09:30:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, phase, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'phase_entered', 'REFACTOR', '2026-02-01T10:00:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, phase, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'phase_entered', 'AUDIT', '2026-02-01T10:15:00')`
  ).run();

  // Token usage on tool calls for skill_token_usage
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, tool_name, skill_name, skill_version,
       input_tokens, output_tokens, tool_calls_in_msg, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'tool_call', 'Read', 'tdd-agent', 'v2', 5000, 2000, 1, '2026-02-01T09:06:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, tool_name, skill_name, skill_version,
       input_tokens, output_tokens, tool_calls_in_msg, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'tool_call', 'Edit', 'tdd-agent', 'v2', 8000, 3000, 1, '2026-02-01T09:16:00')`
  ).run();

  // File path metadata for skill_precision
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, tool_name, metadata, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'tool_call', 'Read', '{"file_path": "/src/db.ts"}', '2026-02-01T09:07:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, tool_name, metadata, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'tool_call', 'Read', '{"file_path": "/src/schema.ts"}', '2026-02-01T09:08:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, tool_name, metadata, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'tool_call', 'Read', '{"file_path": "/src/utils.ts"}', '2026-02-01T09:09:00')`
  ).run();
  db.prepare(
    `INSERT INTO workflow_events (session_id, sprint, task_num, event_type, tool_name, metadata, timestamp)
     VALUES ('sess-1', 'sprint-1', 1, 'tool_call', 'Edit', '{"file_path": "/src/db.ts"}', '2026-02-01T09:20:00')`
  ).run();

  // Transcripts — primary session + subagent for session timeline
  db.prepare(
    `INSERT INTO transcripts (session_id, file_path, message_count, user_message_count, assistant_message_count,
       tool_call_count, total_input_tokens, total_output_tokens, model, started_at, ended_at, sprint, task_num)
     VALUES ('sess-1', '/transcripts/sess-1.jsonl', 20, 5, 15, 12, 15000, 8000, 'claude-opus-4-6',
       '2026-02-01T09:00:00', '2026-02-01T11:30:00', 'sprint-1', 1)`
  ).run();
  db.prepare(
    `INSERT INTO transcripts (session_id, parent_session_id, file_path, message_count, tool_call_count,
       total_input_tokens, total_output_tokens, model, started_at, ended_at, sprint, task_num)
     VALUES ('sess-1-sub-1', 'sess-1', '/transcripts/sess-1-sub-1.jsonl', 8, 5, 6000, 3000, 'claude-sonnet-4-5-20250929',
       '2026-02-01T10:15:00', '2026-02-01T10:30:00', 'sprint-1', 1)`
  ).run();
  db.prepare(
    `INSERT INTO transcripts (session_id, file_path, message_count, user_message_count, assistant_message_count,
       tool_call_count, total_input_tokens, total_output_tokens, model, started_at, ended_at, sprint, task_num)
     VALUES ('sess-2', '/transcripts/sess-2.jsonl', 30, 8, 22, 18, 22000, 12000, 'claude-opus-4-6',
       '2026-02-01T12:00:00', '2026-02-01T17:00:00', 'sprint-1', 2)`
  ).run();

  // Activity log
  db.prepare(
    `INSERT INTO activity_log (developer, action, sprint, task_num, summary)
     VALUES ('alice', 'task_completed', 'sprint-1', 1, 'Completed database setup')`
  ).run();
}

// ── Skill Analytics ──────────────────────────────────────

describe("Skill analytics", () => {
  it("returns skill usage with invocation counts", async () => {
    const data = getData(
      await executeQuery(`query { skillUsage { toolName invocations sessions } }`)
    );
    expect(data.skillUsage.length).toBeGreaterThan(0);
    const readUsage = data.skillUsage.find(
      (s: any) => s.toolName === "Read"
    );
    expect(readUsage).toBeDefined();
    expect(readUsage.invocations).toBeGreaterThanOrEqual(2);
    expect(readUsage.sessions).toBeGreaterThanOrEqual(1);
  });

  it("returns skill token usage", async () => {
    const data = getData(
      await executeQuery(`query { skillTokenUsage { skillName sprint invocations totalInputTokens totalOutputTokens avgTokensPerCall } }`)
    );
    expect(data.skillTokenUsage.length).toBeGreaterThan(0);
    const tddUsage = data.skillTokenUsage.find(
      (s: any) => s.skillName === "tdd-agent"
    );
    expect(tddUsage).toBeDefined();
    expect(tddUsage.totalInputTokens).toBeGreaterThan(0);
    expect(tddUsage.totalOutputTokens).toBeGreaterThan(0);
  });

  it("filters skill token usage by sprint", async () => {
    const data = getData(
      await executeQuery(
        `query($sprint: String) { skillTokenUsage(sprint: $sprint) { skillName sprint } }`,
        { sprint: "sprint-1" }
      )
    );
    for (const row of data.skillTokenUsage) {
      expect(row.sprint).toBe("sprint-1");
    }
  });

  it("returns skill version token usage", async () => {
    const data = getData(
      await executeQuery(`query { skillVersionTokenUsage { skillName skillVersion invocations avgTokensPerCall } }`)
    );
    expect(data.skillVersionTokenUsage.length).toBeGreaterThan(0);
    const v2 = data.skillVersionTokenUsage.find(
      (s: any) => s.skillVersion === "v2"
    );
    expect(v2).toBeDefined();
    expect(v2.skillName).toBe("tdd-agent");
  });

  it("returns skill duration", async () => {
    const data = getData(
      await executeQuery(`query { skillDuration { skillName sprint taskNum seconds } }`)
    );
    expect(data.skillDuration.length).toBeGreaterThan(0);
    expect(data.skillDuration[0].skillName).toBe("tdd-agent");
    expect(data.skillDuration[0].seconds).toBeGreaterThan(0);
  });

  it("returns skill precision with exploration ratio", async () => {
    const data = getData(
      await executeQuery(`query { skillPrecision { sprint taskNum filesRead filesModified explorationRatio } }`)
    );
    expect(data.skillPrecision.length).toBeGreaterThan(0);
    const task1 = data.skillPrecision.find(
      (s: any) => s.sprint === "sprint-1" && s.taskNum === 1
    );
    expect(task1).toBeDefined();
    expect(task1.filesRead).toBeGreaterThan(0);
    expect(task1.filesModified).toBeGreaterThan(0);
    // 3 files read, 1 modified → exploration_ratio = 1 - 1/3 ≈ 0.67
    expect(task1.explorationRatio).toBeGreaterThan(0.5);
  });
});

// ── Velocity Analytics ───────────────────────────────────

describe("Velocity analytics", () => {
  it("returns developer learning rate across sprints", async () => {
    const data = getData(
      await executeQuery(`query { developerLearningRate { owner sprint tasks avgBlowUpRatio } }`)
    );
    expect(data.developerLearningRate.length).toBeGreaterThan(0);
    const aliceSprint1 = data.developerLearningRate.find(
      (r: any) => r.owner === "alice" && r.sprint === "sprint-1"
    );
    expect(aliceSprint1).toBeDefined();
    expect(aliceSprint1.tasks).toBeGreaterThanOrEqual(2);
    expect(aliceSprint1.avgBlowUpRatio).toBeGreaterThan(1);
  });

  it("filters learning rate by owner", async () => {
    const data = getData(
      await executeQuery(
        `query($owner: String) { developerLearningRate(owner: $owner) { owner sprint } }`,
        { owner: "alice" }
      )
    );
    for (const row of data.developerLearningRate) {
      expect(row.owner).toBe("alice");
    }
  });

  it("returns phase timing distribution", async () => {
    const data = getData(
      await executeQuery(`query { phaseTimingDistribution { sprint taskNum phase seconds pctOfTotal } }`)
    );
    expect(data.phaseTimingDistribution.length).toBeGreaterThan(0);
    const phases = data.phaseTimingDistribution.filter(
      (p: any) => p.sprint === "sprint-1" && p.taskNum === 1
    );
    // We inserted RED→GREEN→REFACTOR→AUDIT transitions
    expect(phases.length).toBe(3); // 3 intervals between 4 phase events
    const redPhase = phases.find((p: any) => p.phase === "RED");
    expect(redPhase).toBeDefined();
    expect(redPhase.seconds).toBe(1800); // 30 min = 1800 sec
    expect(redPhase.pctOfTotal).toBeGreaterThan(0);
  });

  it("returns token efficiency trend", async () => {
    const data = getData(
      await executeQuery(`query { tokenEfficiencyTrend { sprint complexity tasks avgTokensPerTask } }`)
    );
    expect(data.tokenEfficiencyTrend.length).toBeGreaterThan(0);
    // sprint-1 task 1 (medium) has transcript with 15000+8000=23000 tokens
    const sprint1Medium = data.tokenEfficiencyTrend.find(
      (t: any) => t.sprint === "sprint-1" && t.complexity === "medium"
    );
    expect(sprint1Medium).toBeDefined();
    expect(sprint1Medium.avgTokensPerTask).toBeGreaterThan(0);
  });

  it("returns blow-up factors for tasks exceeding 2x estimate", async () => {
    const data = getData(
      await executeQuery(`query { blowUpFactors { sprint taskNum title type blowUpRatio reversions } }`)
    );
    expect(data.blowUpFactors.length).toBeGreaterThan(0);
    // Task sprint-1/#2: 1h est, 5h actual = 5.0x
    const authTask = data.blowUpFactors.find(
      (b: any) => b.sprint === "sprint-1" && b.taskNum === 2
    );
    expect(authTask).toBeDefined();
    expect(authTask.blowUpRatio).toBeGreaterThan(2);
    expect(authTask.title).toBe("Auth middleware");
    expect(authTask.reversions).toBe(2);
  });
});

// ── Estimation Analytics ─────────────────────────────────

describe("Estimation analytics", () => {
  it("returns estimation accuracy by developer", async () => {
    const data = getData(
      await executeQuery(`query { estimationAccuracy { owner tasksWithEstimates avgEstimated avgActual blowUpRatio } }`)
    );
    expect(data.estimationAccuracy.length).toBeGreaterThan(0);
    const alice = data.estimationAccuracy.find(
      (e: any) => e.owner === "alice"
    );
    expect(alice).toBeDefined();
    expect(alice.tasksWithEstimates).toBeGreaterThanOrEqual(2);
    expect(alice.blowUpRatio).toBeGreaterThan(1);
  });

  it("returns estimation accuracy by type", async () => {
    const data = getData(
      await executeQuery(`query { estimationAccuracyByType { type tasks avgEstimated avgActual blowUpRatio } }`)
    );
    expect(data.estimationAccuracyByType.length).toBeGreaterThan(0);
    const actions = data.estimationAccuracyByType.find(
      (e: any) => e.type === "actions"
    );
    expect(actions).toBeDefined();
    expect(actions.tasks).toBeGreaterThanOrEqual(1);
  });

  it("returns estimation accuracy by complexity", async () => {
    const data = getData(
      await executeQuery(`query { estimationAccuracyByComplexity { complexity tasks blowUpRatio } }`)
    );
    expect(data.estimationAccuracyByComplexity.length).toBeGreaterThan(0);
    const high = data.estimationAccuracyByComplexity.find(
      (e: any) => e.complexity === "high"
    );
    expect(high).toBeDefined();
    expect(high.blowUpRatio).toBeGreaterThan(1);
  });
});

// ── Quality Analytics ────────────────────────────────────

describe("Quality analytics", () => {
  it("returns developer quality metrics", async () => {
    const data = getData(
      await executeQuery(`query { developerQuality { owner totalTasks totalReversions reversionsPerTask aGrades aGradePct } }`)
    );
    expect(data.developerQuality.length).toBeGreaterThan(0);
    const alice = data.developerQuality.find(
      (q: any) => q.owner === "alice"
    );
    expect(alice).toBeDefined();
    expect(alice.totalTasks).toBeGreaterThanOrEqual(2);
    expect(alice.totalReversions).toBe(2); // task 2 has 2 reversions
    expect(alice.aGrades).toBeGreaterThanOrEqual(1); // task 1 has A grade
  });

  it("returns common audit findings", async () => {
    const data = getData(
      await executeQuery(`query { commonAuditFindings { owner fakeTestIncidents patternViolations belowAGrade totalTasks } }`)
    );
    expect(data.commonAuditFindings.length).toBeGreaterThan(0);
    const alice = data.commonAuditFindings.find(
      (f: any) => f.owner === "alice"
    );
    expect(alice).toBeDefined();
    // Task 2 has "fake test violation" in notes → fakeTestIncidents >= 1
    expect(alice.fakeTestIncidents).toBeGreaterThanOrEqual(1);
    // Task 2 has testing_posture B → below_a_grade >= 1
    expect(alice.belowAGrade).toBeGreaterThanOrEqual(1);
  });

  it("returns reversion hotspots by type and complexity", async () => {
    const data = getData(
      await executeQuery(`query { reversionHotspots { type complexity tasks totalReversions avgReversions aGradeRate } }`)
    );
    expect(data.reversionHotspots.length).toBeGreaterThan(0);
    // actions/high has 2 reversions from task 2
    const actionsHigh = data.reversionHotspots.find(
      (h: any) => h.type === "actions" && h.complexity === "high"
    );
    expect(actionsHigh).toBeDefined();
    expect(actionsHigh.totalReversions).toBeGreaterThanOrEqual(2);
  });
});

// ── Sprint Analytics ─────────────────────────────────────

describe("Sprint analytics", () => {
  it("returns sprint velocity", async () => {
    const data = getData(
      await executeQuery(`query { sprintVelocity { sprint completedTasks avgMinutesPerTask totalMinutes } }`)
    );
    expect(data.sprintVelocity.length).toBeGreaterThan(0);
    const sprint1 = data.sprintVelocity.find(
      (v: any) => v.sprint === "sprint-1"
    );
    expect(sprint1).toBeDefined();
    expect(sprint1.completedTasks).toBeGreaterThanOrEqual(3);
    expect(sprint1.avgMinutesPerTask).toBeGreaterThan(0);
  });

  it("filters sprint velocity by sprint name", async () => {
    const data = getData(
      await executeQuery(
        `query($sprint: String) { sprintVelocity(sprint: $sprint) { sprint completedTasks } }`,
        { sprint: "sprint-2" }
      )
    );
    expect(data.sprintVelocity.length).toBe(1);
    expect(data.sprintVelocity[0].sprint).toBe("sprint-2");
  });
});

// ── Session Timeline ─────────────────────────────────────

describe("Session timeline", () => {
  it("returns primary sessions with subagents nested", async () => {
    const data = getData(
      await executeQuery(`query { sessionTimeline {
        sessionId parentSessionId developer sprint taskNum taskTitle
        startedAt endedAt durationMinutes
        totalInputTokens totalOutputTokens toolCallCount messageCount model
        subagents { sessionId parentSessionId model }
      }}`)
    );
    expect(data.sessionTimeline.length).toBeGreaterThanOrEqual(2);

    // sess-1 is a primary session for alice on sprint-1/#1
    const sess1 = data.sessionTimeline.find(
      (s: any) => s.sessionId === "sess-1"
    );
    expect(sess1).toBeDefined();
    expect(sess1.parentSessionId).toBeNull();
    expect(sess1.developer).toBe("alice");
    expect(sess1.sprint).toBe("sprint-1");
    expect(sess1.taskNum).toBe(1);
    expect(sess1.taskTitle).toBe("Set up database");
    expect(sess1.totalInputTokens).toBe(15000);
    expect(sess1.durationMinutes).toBe(150); // 9:00 to 11:30 = 150 min
    expect(sess1.model).toBe("claude-opus-4-6");

    // sess-1-sub-1 should be nested under sess-1
    expect(sess1.subagents.length).toBe(1);
    expect(sess1.subagents[0].sessionId).toBe("sess-1-sub-1");
    expect(sess1.subagents[0].parentSessionId).toBe("sess-1");
    expect(sess1.subagents[0].model).toBe("claude-sonnet-4-5-20250929");
  });

  it("filters session timeline by developer", async () => {
    const data = getData(
      await executeQuery(
        `query($dev: String) { sessionTimeline(developer: $dev) { sessionId developer } }`,
        { dev: "alice" }
      )
    );
    for (const session of data.sessionTimeline) {
      expect(session.developer).toBe("alice");
    }
  });

  it("filters session timeline by date range", async () => {
    const data = getData(
      await executeQuery(
        `query($from: String, $to: String) { sessionTimeline(dateFrom: $from, dateTo: $to) { sessionId startedAt } }`,
        { from: "2026-02-01T11:00:00", to: "2026-02-01T18:00:00" }
      )
    );
    // Only sess-2 starts after 11:00 (at 12:00)
    expect(data.sessionTimeline.length).toBe(1);
    expect(data.sessionTimeline[0].sessionId).toBe("sess-2");
  });
});
