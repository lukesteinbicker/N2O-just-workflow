import type { Context } from "../context.js";
import { queryAll } from "../db-adapter.js";
import { mapEvent, mapTranscript } from "./mappers.js";
import { taskResolvers } from "./task.js";
import { sprintResolvers } from "./sprint.js";
import { projectResolvers } from "./project.js";
import { developerResolvers } from "./developer.js";
import { mutationResolvers } from "./mutations.js";
import { analyticsResolvers } from "./analytics.js";

// Standalone query resolvers for events, transcripts, activity
const standaloneResolvers = {
  Query: {
    events: async (
      _: any,
      args: {
        sessionId?: string;
        sprint?: string;
        taskNum?: number;
        eventType?: string;
        limit?: number;
      },
      ctx: Context
    ) => {
      const conditions: string[] = [];
      const params: any[] = [];

      if (args.sessionId) {
        conditions.push("session_id = ?");
        params.push(args.sessionId);
      }
      if (args.sprint) {
        conditions.push("sprint = ?");
        params.push(args.sprint);
      }
      if (args.taskNum !== undefined) {
        conditions.push("task_num = ?");
        params.push(args.taskNum);
      }
      if (args.eventType) {
        conditions.push("event_type = ?");
        params.push(args.eventType);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
      let sql = `SELECT * FROM workflow_events ${where} ORDER BY timestamp DESC`;
      if (args.limit) {
        sql += ` LIMIT ?`;
        params.push(args.limit);
      }

      const rows = await queryAll(ctx.db, sql, params);
      return rows.map(mapEvent);
    },

    transcripts: async (
      _: any,
      args: { sprint?: string; taskNum?: number; sessionId?: string },
      ctx: Context
    ) => {
      const conditions: string[] = [];
      const params: any[] = [];

      if (args.sprint) {
        conditions.push("sprint = ?");
        params.push(args.sprint);
      }
      if (args.taskNum !== undefined) {
        conditions.push("task_num = ?");
        params.push(args.taskNum);
      }
      if (args.sessionId) {
        conditions.push("session_id = ?");
        params.push(args.sessionId);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
      const rows = await queryAll(
        ctx.db,
        `SELECT * FROM transcripts ${where} ORDER BY started_at DESC`,
        params
      );
      return rows.map(mapTranscript);
    },

    activityLog: async (
      _: any,
      args: { limit?: number; developer?: string },
      ctx: Context
    ) => {
      const params: any[] = [];
      let sql = `SELECT id, timestamp, event_type, sprint, task_num,
        tool_name, skill_name, phase, agent_type, metadata, session_id
        FROM workflow_events ORDER BY timestamp DESC`;
      if (args.limit) {
        sql += ` LIMIT ?`;
        params.push(args.limit);
      }

      const rows = await queryAll(ctx.db, sql, params);
      return rows.map((row: any) => {
        let summary = "";
        if (row.event_type === "tool_call" && row.tool_name) {
          summary = row.tool_name;
        } else if (row.event_type === "skill_invoked" && row.skill_name) {
          summary = row.skill_name;
        } else if (row.event_type === "subagent_spawn" && row.agent_type) {
          summary = `Spawned ${row.agent_type} agent`;
        } else if (row.event_type === "phase_entered" && row.phase) {
          summary = row.phase;
        }
        return {
          id: row.id,
          timestamp: row.timestamp,
          developer: null,
          action: row.event_type,
          sprint: row.sprint,
          taskNum: row.task_num,
          summary,
          metadata: row.metadata,
        };
      });
    },
  },
};

// Merge all resolver maps
export const resolvers = {
  Query: {
    ...taskResolvers.Query,
    ...sprintResolvers.Query,
    ...projectResolvers.Query,
    ...developerResolvers.Query,
    ...standaloneResolvers.Query,
    ...analyticsResolvers.Query,
  },
  Mutation: {
    ...mutationResolvers.Mutation,
  },
  Task: taskResolvers.Task,
  Sprint: sprintResolvers.Sprint,
  Project: projectResolvers.Project,
  Developer: developerResolvers.Developer,
};
