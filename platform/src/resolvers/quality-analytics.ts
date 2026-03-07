import type { Context } from "../context.js";
import { queryAll, whereClause } from "../db-adapter.js";

export const qualityQueryResolvers = {
  developerQuality: async (
    _: any,
    args: { owner?: string; dateFrom?: string; dateTo?: string },
    ctx: Context
  ) => {
    const conditions: string[] = ["owner IS NOT NULL", "status = 'green'"];
    const params: any[] = [];
    if (args.owner) {
      conditions.push("owner = ?");
      params.push(args.owner);
    }
    if (args.dateFrom) {
      conditions.push("completed_at >= ?");
      params.push(args.dateFrom);
    }
    if (args.dateTo) {
      conditions.push("completed_at <= ?");
      params.push(args.dateTo);
    }
    const { where } = whereClause(conditions, params);
    const rows = await queryAll(
      ctx.db,
      `SELECT
          owner,
          COUNT(*) as total_tasks,
          SUM(reversions) as total_reversions,
          ROUND(1.0 * SUM(reversions) / COUNT(*), 2) as reversions_per_task,
          SUM(CASE WHEN testing_posture = 'A' THEN 1 ELSE 0 END) as a_grades,
          ROUND(100.0 * SUM(CASE WHEN testing_posture = 'A' THEN 1 ELSE 0 END) / COUNT(*), 1) as a_grade_pct
       FROM tasks
       ${where}
       GROUP BY owner
       ORDER BY owner`,
      params
    );
    return rows.map((row: any) => ({
      _owner: row.owner,
      totalTasks: parseInt(row.total_tasks),
      totalReversions: parseInt(row.total_reversions),
      reversionsPerTask: row.reversions_per_task ? parseFloat(row.reversions_per_task) : null,
      aGrades: parseInt(row.a_grades),
      aGradePct: row.a_grade_pct ? parseFloat(row.a_grade_pct) : null,
    }));
  },

  commonAuditFindings: async (
    _: any,
    args: { owner?: string; dateFrom?: string; dateTo?: string },
    ctx: Context
  ) => {
    const conditions: string[] = ["pattern_audited = 1", "owner IS NOT NULL"];
    const params: any[] = [];
    if (args.owner) {
      conditions.push("owner = ?");
      params.push(args.owner);
    }
    if (args.dateFrom) {
      conditions.push("completed_at >= ?");
      params.push(args.dateFrom);
    }
    if (args.dateTo) {
      conditions.push("completed_at <= ?");
      params.push(args.dateTo);
    }
    const { where } = whereClause(conditions, params);
    const rows = await queryAll(
      ctx.db,
      `SELECT owner,
          SUM(CASE WHEN pattern_audit_notes LIKE '%fake test%' THEN 1 ELSE 0 END) as fake_test_incidents,
          SUM(CASE WHEN pattern_audit_notes LIKE '%violation%' THEN 1 ELSE 0 END) as pattern_violations,
          SUM(CASE WHEN testing_posture != 'A' THEN 1 ELSE 0 END) as below_a_grade,
          SUM(reversions) as total_reversions,
          COUNT(*) as total_tasks
       FROM tasks
       ${where}
       GROUP BY owner
       ORDER BY owner`,
      params
    );
    return rows.map((row: any) => ({
      _owner: row.owner,
      fakeTestIncidents: parseInt(row.fake_test_incidents),
      patternViolations: parseInt(row.pattern_violations),
      belowAGrade: parseInt(row.below_a_grade),
      totalReversions: parseInt(row.total_reversions),
      totalTasks: parseInt(row.total_tasks),
    }));
  },

  reversionHotspots: async (_: any, __: any, ctx: Context) => {
    const rows = await queryAll(
      ctx.db,
      "SELECT * FROM reversion_hotspots ORDER BY total_reversions DESC"
    );
    return rows.map((row: any) => ({
      type: row.type,
      complexity: row.complexity,
      tasks: parseInt(row.tasks),
      totalReversions: parseInt(row.total_reversions),
      avgReversions: row.avg_reversions ? parseFloat(row.avg_reversions) : null,
      aGradeRate: row.a_grade_rate ? parseFloat(row.a_grade_rate) : null,
    }));
  },

  sessionTimeline: async (
    _: any,
    args: { developer?: string; dateFrom?: string; dateTo?: string },
    ctx: Context
  ) => {
    const conditions: string[] = [];
    const params: any[] = [];

    if (args.developer) {
      conditions.push("t.owner = ?");
      params.push(args.developer);
    }
    if (args.dateFrom) {
      conditions.push("tr.started_at >= ?");
      params.push(args.dateFrom);
    }
    if (args.dateTo) {
      conditions.push("tr.started_at <= ?");
      params.push(args.dateTo);
    }

    const baseConditions = [
      "tr.parent_session_id IS NULL",
      "tr.started_at IS NOT NULL",
    ];
    const allConditions = [...baseConditions, ...conditions];
    const fullWhere = `WHERE ${allConditions.join(" AND ")}`;

    const primarySessions = await queryAll(
      ctx.db,
      `SELECT DISTINCT ON (tr.session_id)
              tr.*, t.owner as developer, t.title as task_title,
              we.skill_name
       FROM transcripts tr
       LEFT JOIN tasks t ON tr.sprint = t.sprint AND tr.task_num = t.task_num
       LEFT JOIN (
         SELECT session_id, skill_name
         FROM workflow_events
         WHERE event_type = 'skill_invoked'
         GROUP BY session_id, skill_name
       ) we ON we.session_id = tr.session_id
       ${fullWhere}
       ORDER BY tr.session_id, tr.started_at DESC`,
      params
    );

    const allChildren = await queryAll(
      ctx.db,
      `SELECT DISTINCT ON (tr.session_id)
              tr.*, t.owner as developer, t.title as task_title
       FROM transcripts tr
       LEFT JOIN tasks t ON tr.sprint = t.sprint AND tr.task_num = t.task_num
       WHERE tr.parent_session_id IS NOT NULL AND tr.started_at IS NOT NULL
       ORDER BY tr.session_id, tr.started_at`
    );

    const childrenByParent = new Map<string, any[]>();
    for (const child of allChildren) {
      const parentId = child.parent_session_id;
      if (!childrenByParent.has(parentId)) {
        childrenByParent.set(parentId, []);
      }
      childrenByParent.get(parentId)!.push(child);
    }

    return primarySessions.map((row: any) =>
      mapSessionEntry(row, childrenByParent)
    );
  },
};

function mapSessionEntry(
  row: any,
  childrenByParent: Map<string, any[]>
): any {
  const durationMinutes =
    row.started_at && row.ended_at
      ? (new Date(row.ended_at).getTime() -
          new Date(row.started_at).getTime()) /
        60000
      : null;

  const children = childrenByParent.get(row.session_id) ?? [];

  return {
    sessionId: row.session_id,
    parentSessionId: row.parent_session_id ?? null,
    _developer: row.developer ?? null,
    _sprint: row.sprint,
    taskNum: row.task_num,
    _taskNum: row.task_num,
    taskTitle: row.task_title ?? null,
    skillName: row.skill_name ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMinutes,
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    toolCallCount: row.tool_call_count,
    messageCount: row.message_count,
    model: row.model,
    subagents: children.map((child: any) =>
      mapSessionEntry(child, childrenByParent)
    ),
  };
}
