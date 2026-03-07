import type { Context } from "../context.js";
import { queryAll, whereClause } from "../db-adapter.js";

export const velocityQueryResolvers = {
  developerLearningRate: async (
    _: any,
    args: { owner?: string },
    ctx: Context
  ) => {
    const conditions: string[] = [];
    const params: any[] = [];
    if (args.owner) {
      conditions.push("owner = ?");
      params.push(args.owner);
    }
    const { where } = whereClause(conditions, params);
    const rows = await queryAll(
      ctx.db,
      `SELECT * FROM developer_learning_rate ${where} ORDER BY owner, sprint`,
      params
    );
    return rows.map((row: any) => ({
      _owner: row.owner,
      _sprint: row.sprint,
      tasks: parseInt(row.tasks),
      avgBlowUpRatio: row.avg_blow_up_ratio ? parseFloat(row.avg_blow_up_ratio) : null,
    }));
  },

  phaseTimingDistribution: async (
    _: any,
    args: { sprint?: string },
    ctx: Context
  ) => {
    const conditions: string[] = [];
    const params: any[] = [];
    if (args.sprint) {
      conditions.push("sprint = ?");
      params.push(args.sprint);
    }
    const { where } = whereClause(conditions, params);
    const rows = await queryAll(
      ctx.db,
      `SELECT * FROM phase_time_distribution ${where} ORDER BY sprint, task_num, phase`,
      params
    );
    return rows.map((row: any) => ({
      _sprint: row.sprint,
      taskNum: row.task_num,
      _taskNum: row.task_num,
      phase: row.phase,
      seconds: row.seconds ? parseFloat(row.seconds) : null,
      pctOfTotal: row.pct_of_total ? parseFloat(row.pct_of_total) : null,
    }));
  },

  tokenEfficiencyTrend: async (_: any, __: any, ctx: Context) => {
    const rows = await queryAll(
      ctx.db,
      "SELECT * FROM token_efficiency_trend ORDER BY sprint, complexity"
    );
    return rows.map((row: any) => ({
      _sprint: row.sprint,
      complexity: row.complexity,
      tasks: parseInt(row.tasks),
      avgTokensPerTask: row.avg_tokens_per_task ? parseFloat(row.avg_tokens_per_task) : null,
    }));
  },

  blowUpFactors: async (
    _: any,
    args: { sprint?: string },
    ctx: Context
  ) => {
    const conditions: string[] = [];
    const params: any[] = [];
    if (args.sprint) {
      conditions.push("sprint = ?");
      params.push(args.sprint);
    }
    const { where } = whereClause(conditions, params);
    const rows = await queryAll(
      ctx.db,
      `SELECT * FROM blow_up_factors ${where} ORDER BY blow_up_ratio DESC`,
      params
    );
    return rows.map((row: any) => ({
      _sprint: row.sprint,
      taskNum: row.task_num,
      _taskNum: row.task_num,
      title: row.title,
      type: row.type,
      complexity: row.complexity,
      estimatedMinutes: row.estimated_minutes ? parseFloat(row.estimated_minutes) : null,
      actualMinutes: row.actual_minutes ? parseFloat(row.actual_minutes) : null,
      blowUpRatio: row.blow_up_ratio ? parseFloat(row.blow_up_ratio) : null,
      reversions: row.reversions,
      testingPosture: row.testing_posture,
    }));
  },

  estimationAccuracy: async (
    _: any,
    args: { owner?: string; dateFrom?: string; dateTo?: string },
    ctx: Context
  ) => {
    const conditions: string[] = [
      "started_at IS NOT NULL",
      "completed_at IS NOT NULL",
      "estimated_minutes IS NOT NULL",
      "owner IS NOT NULL",
    ];
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
          COUNT(*) as tasks_with_estimates,
          ROUND(AVG(estimated_minutes), 1) as avg_estimated,
          ROUND(AVG((julianday(completed_at) - julianday(started_at)) * 1440), 1) as avg_actual,
          ROUND(
              AVG((julianday(completed_at) - julianday(started_at)) * 1440) /
              NULLIF(AVG(estimated_minutes), 0),
          2) as blow_up_ratio,
          ROUND(AVG(ABS(
              (julianday(completed_at) - julianday(started_at)) * 1440 - estimated_minutes
          )), 1) as avg_error_minutes
       FROM tasks
       ${where}
       GROUP BY owner
       ORDER BY owner`,
      params
    );
    return rows.map((row: any) => ({
      _owner: row.owner,
      tasksWithEstimates: parseInt(row.tasks_with_estimates),
      avgEstimated: row.avg_estimated ? parseFloat(row.avg_estimated) : null,
      avgActual: row.avg_actual ? parseFloat(row.avg_actual) : null,
      blowUpRatio: row.blow_up_ratio ? parseFloat(row.blow_up_ratio) : null,
      avgErrorMinutes: row.avg_error_minutes ? parseFloat(row.avg_error_minutes) : null,
    }));
  },

  estimationAccuracyByType: async (_: any, __: any, ctx: Context) => {
    const rows = await queryAll(
      ctx.db,
      "SELECT * FROM estimation_accuracy_by_type ORDER BY blow_up_ratio DESC"
    );
    return rows.map((row: any) => ({
      type: row.type,
      tasks: parseInt(row.tasks),
      avgEstimated: row.avg_estimated ? parseFloat(row.avg_estimated) : null,
      avgActual: row.avg_actual ? parseFloat(row.avg_actual) : null,
      blowUpRatio: row.blow_up_ratio ? parseFloat(row.blow_up_ratio) : null,
    }));
  },

  estimationAccuracyByComplexity: async (_: any, __: any, ctx: Context) => {
    const rows = await queryAll(
      ctx.db,
      "SELECT * FROM estimation_accuracy_by_complexity ORDER BY blow_up_ratio DESC"
    );
    return rows.map((row: any) => ({
      complexity: row.complexity,
      tasks: parseInt(row.tasks),
      avgEstimated: row.avg_estimated ? parseFloat(row.avg_estimated) : null,
      avgActual: row.avg_actual ? parseFloat(row.avg_actual) : null,
      blowUpRatio: row.blow_up_ratio ? parseFloat(row.blow_up_ratio) : null,
    }));
  },

  sprintVelocity: async (
    _: any,
    args: { sprint?: string; dateFrom?: string; dateTo?: string },
    ctx: Context
  ) => {
    const conditions: string[] = [
      "started_at IS NOT NULL",
      "completed_at IS NOT NULL",
    ];
    const params: any[] = [];
    if (args.sprint) {
      conditions.push("sprint = ?");
      params.push(args.sprint);
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
          sprint,
          COUNT(*) as completed_tasks,
          ROUND(AVG((julianday(completed_at) - julianday(started_at)) * 1440), 1) as avg_minutes_per_task,
          ROUND(SUM((julianday(completed_at) - julianday(started_at)) * 1440), 1) as total_minutes
       FROM tasks
       ${where}
       GROUP BY sprint
       ORDER BY sprint`,
      params
    );
    return rows.map((row: any) => ({
      _sprint: row.sprint,
      completedTasks: parseInt(row.completed_tasks),
      avgMinutesPerTask: row.avg_minutes_per_task ? parseFloat(row.avg_minutes_per_task) : null,
      totalMinutes: row.total_minutes ? parseFloat(row.total_minutes) : null,
    }));
  },
};
