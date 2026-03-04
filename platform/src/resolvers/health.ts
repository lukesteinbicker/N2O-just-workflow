import type { Context } from "../context.js";
import { queryAll } from "../db-adapter.js";

interface StreamConfig {
  stream: string;
  table: string;
  timestampCol: string;
}

const STREAMS: StreamConfig[] = [
  { stream: "transcripts", table: "transcripts", timestampCol: "started_at" },
  { stream: "workflow_events", table: "workflow_events", timestampCol: "timestamp" },
  { stream: "tasks", table: "tasks", timestampCol: "created_at" },
  { stream: "developer_context", table: "developer_context", timestampCol: "recorded_at" },
  { stream: "skill_versions", table: "skill_versions", timestampCol: "introduced_at" },
];

export const healthResolvers = {
  Query: {
    dataHealth: async (_: any, __: any, ctx: Context) => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19); // "YYYY-MM-DDTHH:mm:ss" — works in both Postgres and SQLite

      const results = await Promise.all(
        STREAMS.map(async ({ stream, table, timestampCol }) => {
          const rows = await queryAll(
            ctx.db,
            `SELECT
              COUNT(*) AS count,
              MAX(${timestampCol}) AS last_updated,
              SUM(CASE WHEN ${timestampCol} >= ? THEN 1 ELSE 0 END) AS recent_count
            FROM ${table}`,
            [oneHourAgo]
          );
          const row = rows[0] || { count: 0, last_updated: null, recent_count: 0 };
          return {
            stream,
            count: parseInt(row.count) || 0,
            lastUpdated: row.last_updated || null,
            recentCount: parseInt(row.recent_count) || 0,
          };
        })
      );
      return results;
    },
  },
};
