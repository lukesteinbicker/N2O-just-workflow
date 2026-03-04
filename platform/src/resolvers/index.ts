import type { Context } from "../context.js";
import { queryAll } from "../db-adapter.js";
import { mapEvent, mapTranscript } from "./mappers.js";
import { taskResolvers } from "./task.js";
import { sprintResolvers } from "./sprint.js";
import { projectResolvers } from "./project.js";
import { developerResolvers } from "./developer.js";
import { mutationResolvers } from "./mutations.js";
import { analyticsResolvers } from "./analytics.js";
import { conversationResolvers } from "./conversation.js";
import { healthResolvers } from "./health.js";

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
      const conditions: string[] = [];

      if (args.developer) {
        conditions.push("t.owner = ?");
        params.push(args.developer);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      let sql = `SELECT we.id, we.timestamp, we.event_type, we.sprint, we.task_num,
        we.tool_name, we.skill_name, we.phase, we.agent_type, we.metadata, we.session_id,
        t.owner as developer, t.title as task_title
        FROM workflow_events we
        LEFT JOIN tasks t ON we.sprint = t.sprint AND we.task_num = t.task_num
        ${where}
        ORDER BY we.timestamp DESC`;
      if (args.limit) {
        sql += ` LIMIT ?`;
        params.push(args.limit);
      }

      const rows = await queryAll(ctx.db, sql, params);
      return rows.map((row: any) => {
        let summary = "";
        let meta: any = null;
        if (row.metadata) {
          try { meta = JSON.parse(row.metadata); } catch {}
        }

        if (row.event_type === "tool_call" && row.tool_name) {
          if (meta?.file_path) {
            const basename = meta.file_path.split("/").pop() || meta.file_path;
            summary = `${row.tool_name}: ${basename}`;
          } else if (meta?.command) {
            summary = `Bash: ${meta.command.substring(0, 120)}`;
          } else if (meta?.pattern) {
            summary = `${row.tool_name}: ${meta.pattern}`;
          } else if (meta?.description) {
            summary = `Task: ${meta.description}`;
          } else if (meta?.query) {
            summary = `WebSearch: ${meta.query}`;
          } else if (meta?.skill) {
            summary = `Skill: ${meta.skill}`;
          } else {
            summary = row.tool_name;
          }
        } else if (row.event_type === "user_prompt") {
          const text = meta?.prompt_text || "";
          summary = text ? text.substring(0, 500) : "User prompt";
        } else if (row.event_type === "subagent_start") {
          const agentType = meta?.agent_type || row.agent_type || "";
          summary = agentType ? `Started ${agentType} agent` : "Subagent started";
        } else if (row.event_type === "subagent_stop") {
          const agentType = meta?.agent_type || row.agent_type || "";
          summary = agentType ? `${agentType} agent completed` : "Subagent stopped";
        } else if (row.event_type === "turn_complete") {
          summary = "Turn complete";
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
          developer: row.developer || null,
          action: row.event_type,
          sprint: row.sprint,
          taskNum: row.task_num,
          summary,
          metadata: typeof row.metadata === "string" ? row.metadata : row.metadata != null ? JSON.stringify(row.metadata) : null,
          sessionId: row.session_id,
          taskTitle: row.task_title || null,
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
    ...conversationResolvers.Query,
    ...healthResolvers.Query,
  },
  Mutation: {
    ...mutationResolvers.Mutation,
  },
  Task: taskResolvers.Task,
  Sprint: sprintResolvers.Sprint,
  Project: projectResolvers.Project,
  Developer: developerResolvers.Developer,
};
