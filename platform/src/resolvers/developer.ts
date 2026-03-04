import type { Context } from "../context.js";
import { queryAll, queryOne } from "../db-adapter.js";
import { mapDeveloper, mapTask } from "./mappers.js";

export { mapDeveloper };

export const developerResolvers = {
  Query: {
    developer: async (_: any, args: { name: string }, ctx: Context) => {
      const row = await queryOne(
        ctx.db,
        "SELECT * FROM developers WHERE name = ?",
        [args.name]
      );
      return mapDeveloper(row);
    },

    developers: async (_: any, __: any, ctx: Context) => {
      const rows = await queryAll(
        ctx.db,
        "SELECT * FROM developers ORDER BY name"
      );
      return rows.map(mapDeveloper);
    },
  },

  Developer: {
    skills: async (dev: any, _: any, ctx: Context) => {
      const rows = await queryAll(
        ctx.db,
        `SELECT * FROM developer_skills WHERE developer = ? ORDER BY category, skill`,
        [dev.name]
      );
      return rows.map((row: any) => ({
        developer: row.developer,
        category: row.category,
        skill: row.skill,
        rating: row.rating,
        source: row.source,
        evidence: row.evidence,
        assessedAt: row.assessed_at,
      }));
    },

    tasks: async (
      dev: any,
      args: { status?: string; sprint?: string },
      ctx: Context
    ) => {
      const conditions = ["owner = ?"];
      const params: any[] = [dev.name];

      if (args.status) {
        conditions.push("status = ?");
        params.push(args.status);
      }
      if (args.sprint) {
        conditions.push("sprint = ?");
        params.push(args.sprint);
      }

      const rows = await queryAll(
        ctx.db,
        `SELECT * FROM tasks WHERE ${conditions.join(" AND ")} ORDER BY sprint, task_num`,
        params
      );
      return rows.map(mapTask);
    },

    availability: async (dev: any, args: { date?: string }, ctx: Context) => {
      const date = args.date ?? new Date().toISOString().split("T")[0];
      const row = await queryOne(
        ctx.db,
        `SELECT * FROM contributor_availability WHERE developer = ? AND date = ?`,
        [dev.name, date]
      );

      if (!row) return null;
      return {
        developer: row.developer,
        date: row.date,
        expectedMinutes: row.expected_minutes,
        effectiveness: row.effectiveness,
        status: row.status,
        notes: row.notes,
      };
    },

    context: async (dev: any, args: { latest?: boolean }, ctx: Context) => {
      const limit = args.latest ? "LIMIT 1" : "LIMIT 20";
      const rows = await queryAll(
        ctx.db,
        `SELECT * FROM developer_context WHERE developer = ? ORDER BY recorded_at DESC ${limit}`,
        [dev.name]
      );
      return rows.map((row: any) => ({
        id: row.id,
        developer: row.developer,
        recordedAt: row.recorded_at,
        concurrentSessions: row.concurrent_sessions,
        hourOfDay: row.hour_of_day,
        alertness: row.alertness,
        environment: row.environment,
        notes: row.notes,
      }));
    },

    velocity: async (dev: any, _: any, ctx: Context) => {
      const row = await queryOne(
        ctx.db,
        `SELECT
          ROUND(AVG(actual_minutes)) as avg_minutes,
          ROUND(AVG(blow_up_ratio)::numeric, 2) as blow_up_ratio,
          COUNT(*) as total
         FROM effective_velocity
         WHERE owner = ?`,
        [dev.name]
      );

      if (!row || parseInt(row.total) === 0) {
        const basic = await queryOne(
          ctx.db,
          `SELECT avg_minutes, completed_tasks FROM developer_velocity WHERE owner = ?`,
          [dev.name]
        );

        if (!basic) {
          return { avgMinutes: null, blowUpRatio: null, totalTasksCompleted: 0 };
        }
        return {
          avgMinutes: basic.avg_minutes ? parseFloat(basic.avg_minutes) : null,
          blowUpRatio: null,
          totalTasksCompleted: parseInt(basic.completed_tasks) ?? 0,
        };
      }

      return {
        avgMinutes: row.avg_minutes ? parseFloat(row.avg_minutes) : null,
        blowUpRatio: row.blow_up_ratio ? parseFloat(row.blow_up_ratio) : null,
        totalTasksCompleted: parseInt(row.total),
      };
    },
  },
};
