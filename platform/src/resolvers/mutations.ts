import { GraphQLError } from "graphql";
import type { Context } from "../context.js";
import { queryOne, queryAll } from "../db-adapter.js";
import { mapTask } from "./mappers.js";

export const mutationResolvers = {
  Mutation: {
    setAvailability: async (
      _: any,
      args: {
        developer: string;
        date: string;
        expectedMinutes: number;
        effectiveness?: number;
        status?: string;
        notes?: string;
      },
      ctx: Context
    ) => {
      await ctx.db.query(
        `INSERT INTO contributor_availability (developer, date, expected_minutes, effectiveness, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT(developer, date) DO UPDATE SET
           expected_minutes = excluded.expected_minutes,
           effectiveness = COALESCE(excluded.effectiveness, contributor_availability.effectiveness),
           status = COALESCE(excluded.status, contributor_availability.status),
           notes = COALESCE(excluded.notes, contributor_availability.notes)`,
        [
          args.developer,
          args.date,
          args.expectedMinutes,
          args.effectiveness ?? 1.0,
          args.status ?? "available",
          args.notes ?? null,
        ]
      );

      return {
        _developer: args.developer,
        date: args.date,
        expectedMinutes: args.expectedMinutes,
        effectiveness: args.effectiveness ?? 1.0,
        status: args.status ?? "available",
        notes: args.notes ?? null,
      };
    },

    setSkill: async (
      _: any,
      args: {
        developer: string;
        category: string;
        skill: string;
        rating: number;
        source?: string;
      },
      ctx: Context
    ) => {
      await ctx.db.query(
        `INSERT INTO developer_skills (developer, category, skill, rating, source, assessed_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT(developer, category, skill) DO UPDATE SET
           rating = excluded.rating,
           source = COALESCE(excluded.source, developer_skills.source),
           assessed_at = NOW()`,
        [
          args.developer,
          args.category,
          args.skill,
          args.rating,
          args.source ?? "manager",
        ]
      );

      return {
        _developer: args.developer,
        category: args.category,
        skill: args.skill,
        rating: args.rating,
        source: args.source ?? "manager",
        assessedAt: new Date().toISOString(),
      };
    },

    recordContext: async (
      _: any,
      args: {
        developer: string;
        concurrentSessions?: number;
        hourOfDay?: number;
        alertness?: number;
        environment?: string;
      },
      ctx: Context
    ) => {
      const { rows } = await ctx.db.query(
        `INSERT INTO developer_context (developer, concurrent_sessions, hour_of_day, alertness, environment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          args.developer,
          args.concurrentSessions ?? 1,
          args.hourOfDay ?? new Date().getHours(),
          args.alertness ?? null,
          args.environment ?? null,
        ]
      );
      const result = rows[0];

      return {
        id: result.id,
        _developer: result.developer,
        recordedAt: result.recorded_at,
        concurrentSessions: result.concurrent_sessions,
        hourOfDay: result.hour_of_day,
        alertness: result.alertness,
        environment: result.environment,
        notes: result.notes,
      };
    },

    logActivity: async (
      _: any,
      args: {
        developer?: string;
        action: string;
        sprint?: string;
        taskNum?: number;
        summary?: string;
        metadata?: string;
      },
      ctx: Context
    ) => {
      const { rows } = await ctx.db.query(
        `INSERT INTO activity_log (developer, action, sprint, task_num, summary, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          args.developer ?? null,
          args.action,
          args.sprint ?? null,
          args.taskNum ?? null,
          args.summary ?? null,
          args.metadata ?? null,
        ]
      );
      const result = rows[0];

      return {
        id: result.id,
        timestamp: result.timestamp,
        _developer: result.developer,
        action: result.action,
        _sprint: result.sprint,
        taskNum: result.task_num,
        _taskNum: result.task_num,
        summary: result.summary,
        metadata: result.metadata,
      };
    },

    claimTask: async (
      _: any,
      args: { sprint: string; taskNum: number; developer: string },
      ctx: Context
    ) => {
      // Fetch the task
      const task = await queryOne(
        ctx.db,
        "SELECT * FROM tasks WHERE sprint = ? AND task_num = ?",
        [args.sprint, args.taskNum]
      );
      if (!task) {
        throw new GraphQLError(`Task ${args.sprint}#${args.taskNum} not found`);
      }

      // Check if already claimed (has an owner or is not pending)
      if (task.owner || task.status !== "pending") {
        throw new GraphQLError(
          `Task ${args.sprint}#${args.taskNum} is already claimed or not pending`
        );
      }

      // Check for unfinished dependencies
      const unfinishedDeps = await queryAll(
        ctx.db,
        `SELECT t.sprint, t.task_num, t.status
         FROM task_dependencies d
         JOIN tasks t ON t.sprint = d.depends_on_sprint AND t.task_num = d.depends_on_task
         WHERE d.sprint = ? AND d.task_num = ? AND t.status != 'green'`,
        [args.sprint, args.taskNum]
      );
      if (unfinishedDeps.length > 0) {
        throw new GraphQLError(
          `Task ${args.sprint}#${args.taskNum} has unfinished dependencies`
        );
      }

      // Claim: set owner, status→red, started_at→now
      const now = new Date().toISOString();
      await ctx.db.query(
        `UPDATE tasks SET owner = $1, status = 'red', started_at = $2
         WHERE sprint = $3 AND task_num = $4`,
        [args.developer, now, args.sprint, args.taskNum]
      );

      // Return the updated task
      const updated = await queryOne(
        ctx.db,
        "SELECT * FROM tasks WHERE sprint = ? AND task_num = ?",
        [args.sprint, args.taskNum]
      );
      return mapTask(updated);
    },

    unclaimTask: async (
      _: any,
      args: { sprint: string; taskNum: number },
      ctx: Context
    ) => {
      // Fetch the task
      const task = await queryOne(
        ctx.db,
        "SELECT * FROM tasks WHERE sprint = ? AND task_num = ?",
        [args.sprint, args.taskNum]
      );
      if (!task) {
        throw new GraphQLError(`Task ${args.sprint}#${args.taskNum} not found`);
      }

      // Only allow unclaiming red tasks
      if (task.status !== "red") {
        throw new GraphQLError(
          `Can only unclaim red tasks (current status: ${task.status})`
        );
      }

      // Unclaim: set owner→null, status→pending, clear started_at
      await ctx.db.query(
        `UPDATE tasks SET owner = NULL, status = 'pending', started_at = NULL
         WHERE sprint = $1 AND task_num = $2`,
        [args.sprint, args.taskNum]
      );

      // Return the updated task
      const updated = await queryOne(
        ctx.db,
        "SELECT * FROM tasks WHERE sprint = ? AND task_num = ?",
        [args.sprint, args.taskNum]
      );
      return mapTask(updated);
    },

    resolveStaleTasks: async (_: any, __: any, ctx: Context) => {
      // Find all red tasks started more than 48h ago
      const staleTasks = await queryAll(
        ctx.db,
        `SELECT * FROM tasks
         WHERE status = 'red'
           AND started_at IS NOT NULL
           AND started_at < datetime('now', '-48 hours')`,
        []
      );

      if (staleTasks.length === 0) return [];

      // Bulk reset: owner→null, status→pending, clear started_at
      await ctx.db.query(
        `UPDATE tasks
         SET owner = NULL, status = 'pending', started_at = NULL
         WHERE status = 'red'
           AND started_at IS NOT NULL
           AND started_at < datetime('now', '-48 hours')`,
        []
      );

      // Return the now-reset tasks
      const sprintNums = staleTasks.map(
        (t: any) => `(sprint = '${t.sprint}' AND task_num = ${t.task_num})`
      );
      const updated = await queryAll(
        ctx.db,
        `SELECT * FROM tasks WHERE ${sprintNums.join(" OR ")}`,
        []
      );
      return updated.map(mapTask);
    },

    assignTask: async (
      _: any,
      args: { sprint: string; taskNum: number; developer: string },
      ctx: Context
    ) => {
      // Fetch the task
      const task = await queryOne(
        ctx.db,
        "SELECT * FROM tasks WHERE sprint = ? AND task_num = ?",
        [args.sprint, args.taskNum]
      );
      if (!task) {
        throw new GraphQLError(`Task ${args.sprint}#${args.taskNum} not found`);
      }

      // Assign: set owner (no status change requirement)
      await ctx.db.query(
        `UPDATE tasks SET owner = $1 WHERE sprint = $2 AND task_num = $3`,
        [args.developer, args.sprint, args.taskNum]
      );

      // Return the updated task
      const updated = await queryOne(
        ctx.db,
        "SELECT * FROM tasks WHERE sprint = ? AND task_num = ?",
        [args.sprint, args.taskNum]
      );
      return mapTask(updated);
    },
  },
};
