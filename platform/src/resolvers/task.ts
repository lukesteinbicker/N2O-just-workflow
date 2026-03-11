import type { Context } from "../context.js";
import { queryAll, queryOne } from "../db-adapter.js";
import { mapTask, mapDeveloper, mapEvent, mapTranscript } from "./mappers.js";
import { isAdmin, currentUserName } from "../auth.js";

export { mapTask, mapEvent, mapTranscript };

export const taskResolvers = {
  Query: {
    task: async (_: any, args: { sprint: string; taskNum: number }, ctx: Context) => {
      const row = await queryOne(
        ctx.db,
        "SELECT * FROM tasks WHERE sprint = ? AND task_num = ?",
        [args.sprint, args.taskNum]
      );
      if (!row) return null;
      // Engineers can only see their own tasks
      if (!isAdmin(ctx) && row.owner !== currentUserName(ctx)) return null;
      return mapTask(row);
    },

    tasks: async (
      _: any,
      args: {
        sprint?: string;
        status?: string;
        owner?: string;
        horizon?: string;
      },
      ctx: Context
    ) => {
      const conditions: string[] = [];
      const params: any[] = [];

      if (args.sprint) {
        conditions.push("sprint = ?");
        params.push(args.sprint);
      }
      if (args.status) {
        conditions.push("status = ?");
        params.push(args.status);
      }

      // Engineers: force owner = self, ignore owner arg
      if (!isAdmin(ctx)) {
        const name = currentUserName(ctx);
        if (name) {
          conditions.push("owner = ?");
          params.push(name);
        }
      } else if (args.owner) {
        conditions.push("owner = ?");
        params.push(args.owner);
      }

      if (args.horizon) {
        conditions.push("horizon = ?");
        params.push(args.horizon);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
      const rows = await queryAll(
        ctx.db,
        `SELECT * FROM tasks ${where} ORDER BY sprint, priority ASC NULLS LAST, task_num`,
        params
      );
      return rows.map(mapTask);
    },

    availableTasks: async (_: any, __: any, ctx: Context) => {
      const rows = await queryAll(ctx.db, "SELECT * FROM available_tasks");
      return rows.map(mapTask);
    },
  },

  Task: {
    owner: async (task: any, _: any, ctx: Context) => {
      if (!task._owner) return null;
      const row = await ctx.loaders.developer.load(task._owner);
      if (row) return mapDeveloper(row);
      // Fallback for agent IDs like "agent-MacBook-Pro-86278-1771899422"
      const raw: string = task._owner;
      const match = raw.match(/agent-.*?-(\d+)-/);
      const name = match ? `agent-${match[1]}` : raw;
      return { name, fullName: raw, role: "agent" };
    },

    dependencies: async (task: any, _: any, ctx: Context) => {
      const rows = await ctx.loaders.taskDependencies.load(
        `${task.sprint}|${task.taskNum}`
      );
      return rows.map(mapTask);
    },

    dependents: async (task: any, _: any, ctx: Context) => {
      const rows = await ctx.loaders.taskDependents.load(
        `${task.sprint}|${task.taskNum}`
      );
      return rows.map(mapTask);
    },

    events: async (
      task: any,
      args: { eventType?: string; limit?: number },
      ctx: Context
    ) => {
      let sql = `SELECT * FROM workflow_events WHERE sprint = ? AND task_num = ?`;
      const params: any[] = [task.sprint, task.taskNum];
      if (args.eventType) {
        sql += ` AND event_type = ?`;
        params.push(args.eventType);
      }
      sql += ` ORDER BY timestamp DESC`;
      if (args.limit) {
        sql += ` LIMIT ?`;
        params.push(args.limit);
      }
      const rows = await queryAll(ctx.db, sql, params);
      return rows.map(mapEvent);
    },

    transcripts: async (task: any, _: any, ctx: Context) => {
      const rows = await queryAll(
        ctx.db,
        `SELECT * FROM transcripts WHERE sprint = ? AND task_num = ? ORDER BY started_at`,
        [task.sprint, task.taskNum]
      );
      return rows.map(mapTranscript);
    },

    actualMinutes: (task: any) => {
      if (!task.startedAt || !task.completedAt) return null;
      const start = new Date(task.startedAt).getTime();
      const end = new Date(task.completedAt).getTime();
      return Math.round((end - start) / 60000);
    },

    blowUpRatio: (task: any) => {
      if (!task.startedAt || !task.completedAt || !task.estimatedMinutes)
        return null;
      const start = new Date(task.startedAt).getTime();
      const end = new Date(task.completedAt).getTime();
      const actualMinutes = (end - start) / 60000;
      return Math.round((actualMinutes / task.estimatedMinutes) * 100) / 100;
    },
  },
};
