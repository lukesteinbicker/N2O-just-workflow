import type { Context } from "../context.js";
import { queryAll, whereClause } from "../db-adapter.js";
import { requireAdmin } from "../auth.js";

export const skillQueryResolvers = {
  skillUsage: async (
    _: any,
    args: { dateFrom?: string; dateTo?: string },
    ctx: Context
  ) => {
    requireAdmin(ctx);
    const conditions: string[] = ["event_type = 'tool_call'"];
    const params: any[] = [];
    if (args.dateFrom) {
      conditions.push("timestamp >= ?");
      params.push(args.dateFrom);
    }
    if (args.dateTo) {
      conditions.push("timestamp <= ?");
      params.push(args.dateTo);
    }
    const { where } = whereClause(conditions, params);
    const rows = await queryAll(
      ctx.db,
      `SELECT tool_name,
          COUNT(*) as invocations,
          COUNT(DISTINCT session_id) as sessions,
          MIN(timestamp) as first_used,
          MAX(timestamp) as last_used
       FROM workflow_events
       ${where}
       GROUP BY tool_name
       ORDER BY invocations DESC`,
      params
    );
    return rows.map((row: any) => ({
      _skillName: row.tool_name,
      invocations: parseInt(row.invocations),
      sessions: parseInt(row.sessions),
      firstUsed: row.first_used,
      lastUsed: row.last_used,
    }));
  },

  skillTokenUsage: async (
    _: any,
    args: { sprint?: string },
    ctx: Context
  ) => {
    requireAdmin(ctx);
    const conditions: string[] = [];
    const params: any[] = [];
    if (args.sprint) {
      conditions.push("sprint = ?");
      params.push(args.sprint);
    }
    const { where } = whereClause(conditions, params);
    const rows = await queryAll(
      ctx.db,
      `SELECT * FROM skill_token_usage ${where} ORDER BY total_input_tokens + total_output_tokens DESC`,
      params
    );
    return rows.map((row: any) => ({
      _skillName: row.skill_name,
      _sprint: row.sprint,
      invocations: parseInt(row.invocations),
      totalInputTokens: parseInt(row.total_input_tokens),
      totalOutputTokens: parseInt(row.total_output_tokens),
      avgTokensPerCall: row.avg_tokens_per_call ? parseFloat(row.avg_tokens_per_call) : null,
    }));
  },

  skillVersionTokenUsage: async (
    _: any,
    args: { skillName?: string },
    ctx: Context
  ) => {
    requireAdmin(ctx);
    const conditions: string[] = [];
    const params: any[] = [];
    if (args.skillName) {
      conditions.push("skill_name = ?");
      params.push(args.skillName);
    }
    const { where } = whereClause(conditions, params);
    const rows = await queryAll(
      ctx.db,
      `SELECT * FROM skill_version_token_usage ${where} ORDER BY skill_name, skill_version`,
      params
    );
    return rows.map((row: any) => ({
      _skillName: row.skill_name,
      skillVersion: row.skill_version,
      invocations: parseInt(row.invocations),
      totalInputTokens: parseInt(row.total_input_tokens),
      totalOutputTokens: parseInt(row.total_output_tokens),
      avgTokensPerCall: row.avg_tokens_per_call ? parseFloat(row.avg_tokens_per_call) : null,
    }));
  },

  skillDuration: async (
    _: any,
    args: { sprint?: string },
    ctx: Context
  ) => {
    requireAdmin(ctx);
    const conditions: string[] = [];
    const params: any[] = [];
    if (args.sprint) {
      conditions.push("sprint = ?");
      params.push(args.sprint);
    }
    const { where } = whereClause(conditions, params);
    const rows = await queryAll(
      ctx.db,
      `SELECT * FROM skill_duration ${where} ORDER BY skill_name`,
      params
    );
    return rows.map((row: any) => ({
      _skillName: row.skill_name,
      _sprint: row.sprint,
      taskNum: row.task_num,
      _taskNum: row.task_num,
      seconds: row.seconds ? parseFloat(row.seconds) : null,
    }));
  },

  skillVersionDuration: async (
    _: any,
    args: { skillName?: string },
    ctx: Context
  ) => {
    requireAdmin(ctx);
    const conditions: string[] = [];
    const params: any[] = [];
    if (args.skillName) {
      conditions.push("skill_name = ?");
      params.push(args.skillName);
    }
    const { where } = whereClause(conditions, params);
    const rows = await queryAll(
      ctx.db,
      `SELECT * FROM skill_version_duration ${where} ORDER BY skill_name, skill_version`,
      params
    );
    return rows.map((row: any) => ({
      _skillName: row.skill_name,
      skillVersion: row.skill_version,
      invocations: parseInt(row.invocations),
      avgSeconds: row.avg_seconds ? parseFloat(row.avg_seconds) : null,
      minSeconds: row.min_seconds ? parseFloat(row.min_seconds) : null,
      maxSeconds: row.max_seconds ? parseFloat(row.max_seconds) : null,
    }));
  },

  skillPrecision: async (
    _: any,
    args: { sprint?: string },
    ctx: Context
  ) => {
    requireAdmin(ctx);
    const conditions: string[] = [];
    const params: any[] = [];
    if (args.sprint) {
      conditions.push("sprint = ?");
      params.push(args.sprint);
    }
    const { where } = whereClause(conditions, params);
    const rows = await queryAll(
      ctx.db,
      `SELECT * FROM skill_precision ${where} ORDER BY sprint, task_num`,
      params
    );
    return rows.map((row: any) => ({
      _sprint: row.sprint,
      taskNum: row.task_num,
      _taskNum: row.task_num,
      filesRead: parseInt(row.files_read),
      filesModified: parseInt(row.files_modified),
      explorationRatio: row.exploration_ratio ? parseFloat(row.exploration_ratio) : null,
    }));
  },

  skillVersionPrecision: async (
    _: any,
    args: { skillName?: string },
    ctx: Context
  ) => {
    requireAdmin(ctx);
    const conditions: string[] = [];
    const params: any[] = [];
    if (args.skillName) {
      conditions.push("skill_name = ?");
      params.push(args.skillName);
    }
    const { where } = whereClause(conditions, params);
    const rows = await queryAll(
      ctx.db,
      `SELECT * FROM skill_version_precision ${where} ORDER BY skill_name, skill_version`,
      params
    );
    return rows.map((row: any) => ({
      _skillName: row.skill_name,
      skillVersion: row.skill_version,
      tasks: parseInt(row.tasks),
      avgExplorationRatio: row.avg_exploration_ratio ? parseFloat(row.avg_exploration_ratio) : null,
    }));
  },
};
