// Resolver composition: merges domain resolver modules into the root GraphQL resolver map.
import type { Context } from "../context.js";
import { queryAll } from "../db-adapter.js";
import { mapEvent, mapTranscript, mapSprint, mapDeveloper, mapTask } from "./mappers.js";
import { isAdmin, currentUserName, requireAdmin } from "../auth.js";
import { taskResolvers } from "./task.js";
import { sprintResolvers } from "./sprint.js";
import { projectResolvers } from "./project.js";
import { developerResolvers } from "./developer.js";
import { mutationResolvers } from "./mutations.js";
import { analyticsResolvers } from "./analytics.js";
import { conversationResolvers } from "./conversation.js";
import { healthResolvers } from "./health.js";
import { timeTrackingResolvers } from "./time-tracking.js";

// ── Type resolver factories for typed object references ────────────────

const resolveSkill = (parent: any) => {
  const name = parent._skillName;
  if (!name) return null;
  return { name };
};

const resolveSampleTasks = (filterField: string) => async (parent: any, _: any, ctx: Context) => {
  const value = parent[filterField];
  if (!value) return [];
  const rows = await queryAll(
    ctx.db,
    `SELECT * FROM tasks WHERE ${filterField === "type" ? "type" : "complexity"} = ? ORDER BY completed_at DESC LIMIT 5`,
    [value]
  );
  return rows.map(mapTask);
};

const resolveSprint = async (parent: any, _: any, ctx: Context) => {
  if (!parent._sprint) return null;
  const row = await ctx.loaders.sprint.load(parent._sprint);
  return row ? mapSprint(row) : { name: parent._sprint, status: "unknown" };
};

const resolveDeveloper = (field: string) => async (parent: any, _: any, ctx: Context) => {
  const val = parent[field];
  if (!val) return null;
  const row = await ctx.loaders.developer.load(val);
  if (row) return mapDeveloper(row);
  return { name: val, fullName: val, role: null };
};

const resolveTask = async (parent: any, _: any, ctx: Context) => {
  if (!parent._sprint || parent._taskNum == null) return null;
  const row = await ctx.loaders.task.load(`${parent._sprint}|${parent._taskNum}`);
  return row ? mapTask(row) : null;
};

// Standalone query resolvers for events, transcripts, activity
const standaloneResolvers = {
  Query: {
    me: (_: any, __: any, ctx: Context) => {
      if (!ctx.currentUser) return null;
      return {
        name: ctx.currentUser.name,
        email: ctx.currentUser.email,
        accessRole: ctx.currentUser.accessRole,
      };
    },

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

      // Engineers: force developer = self
      if (!isAdmin(ctx)) {
        const name = currentUserName(ctx);
        if (name) {
          conditions.push("t.owner = ?");
          params.push(name);
        }
      } else if (args.developer) {
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
          _developer: row.developer || null,
          action: row.event_type,
          _sprint: row.sprint,
          taskNum: row.task_num,
          _taskNum: row.task_num,
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
    ...timeTrackingResolvers.Query,
  },
  Mutation: {
    ...mutationResolvers.Mutation,
    ...timeTrackingResolvers.Mutation,
  },
  Task: taskResolvers.Task,
  Sprint: sprintResolvers.Sprint,
  Project: projectResolvers.Project,
  Developer: developerResolvers.Developer,

  // ── Typed object reference resolvers ──────────────────────
  Event: { sprint: resolveSprint, task: resolveTask },
  Transcript: { sprint: resolveSprint, task: resolveTask },
  Activity: { developer: resolveDeveloper("_developer"), sprint: resolveSprint, task: resolveTask },
  DeveloperSkill: { developer: resolveDeveloper("_developer") },
  DeveloperContext: { developer: resolveDeveloper("_developer") },
  Availability: { developer: resolveDeveloper("_developer") },
  SessionConversation: { developer: resolveDeveloper("_developer"), sprint: resolveSprint, task: resolveTask },
  LearningRate: { owner: resolveDeveloper("_owner"), sprint: resolveSprint },
  SkillUsage: { skill: resolveSkill },
  SkillTokenUsage: { skill: resolveSkill, sprint: resolveSprint },
  SkillDuration: { skill: resolveSkill, sprint: resolveSprint, task: resolveTask },
  SkillPrecision: { sprint: resolveSprint, task: resolveTask },
  SkillVersionTokenUsage: { skill: resolveSkill },
  SkillVersionDuration: { skill: resolveSkill },
  SkillVersionPrecision: { skill: resolveSkill },
  PhaseTimingDistribution: { sprint: resolveSprint, task: resolveTask },
  BlowUpFactor: { sprint: resolveSprint, task: resolveTask },
  EstimationAccuracy: { owner: resolveDeveloper("_owner") },
  EstimationAccuracyByType: { sampleTasks: resolveSampleTasks("type") },
  EstimationAccuracyByComplexity: { sampleTasks: resolveSampleTasks("complexity") },
  DeveloperQuality: { owner: resolveDeveloper("_owner") },
  AuditFindings: { owner: resolveDeveloper("_owner") },
  ReversionHotspot: { sampleTasks: resolveSampleTasks("type") },
  SprintVelocity: { sprint: resolveSprint },
  SessionTimelineEntry: { developer: resolveDeveloper("_developer"), sprint: resolveSprint, task: resolveTask },
  TokenEfficiency: { sprint: resolveSprint },
};
