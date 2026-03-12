// Time tracking GraphQL resolvers.
// Synced data (entries, projects, clients, tags) reads from Postgres tt_* tables.
// Live data (currentTimer, dashboardActivity, summary) still calls Toggl API.
import type { Context } from "../context.js";
import { queryAll, queryOne } from "../db-adapter.js";
import { requireAdmin } from "../auth.js";
import {
  fetchToggl,
  cacheGet,
  cacheSet,
  getToken,
  TOGGL_API_BASE,
  TOGGL_REPORTS_BASE,
} from "../services/toggl-api.js";
import { runSync } from "../services/toggl-sync.js";

const ONE_HOUR = 60 * 60 * 1000;
const FOUR_MIN = 4 * 60 * 1000;

// Role and active overrides keyed by Toggl user ID.
// These supplement the developers DB table — entries here take lowest priority
// (DB role wins if set, then this map, then default "developer").
const MEMBER_OVERRIDES: Record<number, { role?: string; active?: boolean }> = {
  12780578: { role: "leadership" },          // Wiley Simonds
  12780390: { role: "leadership" },          // Srimaan Bekkari
  12900990: { role: "non-developer" },       // Ben
  12900991: { role: "non-developer" },       // Mckenzie
  12879802: { active: false },               // Justinnrobot (inactive account)
};

// Cached workspace ID — fetched once then reused.
let cachedWorkspaceId: number | null = null;

async function getWorkspaceId(token: string): Promise<number> {
  if (cachedWorkspaceId) return cachedWorkspaceId;
  const workspaces = await fetchToggl(`${TOGGL_API_BASE}/workspaces`, token);
  if (!workspaces?.length) throw new Error("No Toggl workspaces found");
  const id: number = workspaces[0].id;
  cachedWorkspaceId = id;
  return id;
}

export const timeTrackingResolvers = {
  Query: {
    timeTrackingMe: async () => {
      const token = getToken();
      const cacheKey = "toggl:me";
      const cached = cacheGet(cacheKey, ONE_HOUR);
      if (cached) return cached;

      const me = await fetchToggl(`${TOGGL_API_BASE}/me`, token);
      const result = { id: me.id, fullname: me.fullname, email: me.email };
      cacheSet(cacheKey, result);
      return result;
    },

    timeTrackingWorkspace: async () => {
      const token = getToken();
      const cacheKey = "toggl:workspace";
      const cached = cacheGet(cacheKey, ONE_HOUR);
      if (cached) return cached;

      const workspaces = await fetchToggl(`${TOGGL_API_BASE}/workspaces`, token);
      if (!workspaces?.length) return null;
      const ws = workspaces[0];
      const result = { id: ws.id, name: ws.name };
      cacheSet(cacheKey, result);
      cachedWorkspaceId = ws.id;
      return result;
    },

    timeTrackingMembers: async (_: any, __: any, ctx: Context) => {
      const token = getToken();
      const wsId = await getWorkspaceId(token);
      const cacheKey = "toggl:members";
      const cached = cacheGet(cacheKey, ONE_HOUR);
      if (cached) return cached;

      // Fetch members from Toggl API (same cascade as TogglDashboard)
      let memberList: Array<{ id: number; name: string; email: string | null }> = [];

      // Try /workspaces/{id}/members first
      try {
        const wsMembers = await fetchToggl(
          `${TOGGL_API_BASE}/workspaces/${wsId}/members`,
          token
        );
        memberList = (wsMembers || []).map((m: any) => ({
          id: m.user_id,
          name: m.name || m.email?.split("@")[0] || `User ${m.user_id}`,
          email: m.email || null,
        }));
      } catch {
        // Fallback to /workspaces/{id}/users
        try {
          const wsUsers = await fetchToggl(
            `${TOGGL_API_BASE}/workspaces/${wsId}/users`,
            token
          );
          memberList = (wsUsers || []).map((m: any) => ({
            id: m.id,
            name: m.fullname || m.email?.split("@")[0] || `User ${m.id}`,
            email: m.email || null,
          }));
        } catch (e) {
          console.warn("Could not fetch workspace members:", e);
        }
      }

      // Merge with developers table for role overrides (keyed by time_tracking_user_id)
      const devMap = new Map<number, { name: string; fullName: string; role: string }>();
      try {
        const dbRows = await queryAll(
          ctx.db,
          `SELECT name, full_name, role, time_tracking_user_id FROM developers WHERE time_tracking_user_id IS NOT NULL`
        );
        for (const r of dbRows as any[]) {
          devMap.set(r.time_tracking_user_id, {
            name: r.name,
            fullName: r.full_name,
            role: r.role || "developer",
          });
        }
      } catch {
        // Column doesn't exist yet — use defaults
      }

      // Deduplicate by user ID (Toggl API can return duplicates)
      const seen = new Set<number>();
      const deduped = memberList.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      const result = deduped.map((m) => {
        const dev = devMap.get(m.id);
        const override = MEMBER_OVERRIDES[m.id];
        return {
          id: m.id,
          name: m.name,
          email: m.email,
          role: dev?.role ?? override?.role ?? "developer",
          active: override?.active ?? true,
        };
      });

      cacheSet(cacheKey, result);
      return result;
    },

    timeTrackingEntries: async (
      _: any,
      args: { startDate: string; endDate: string; limit?: number; offset?: number },
      ctx: Context,
    ) => {
      const limit = args.limit ?? 5000;
      const offset = args.offset ?? 0;
      const { rows } = await ctx.db.query(
        `SELECT id, description, start, stop, seconds, user_id, project_id, tag_ids, billable
         FROM tt_entries
         WHERE deleted_at IS NULL AND start >= $1 AND start < $2
         ORDER BY start DESC
         LIMIT $3 OFFSET $4`,
        [args.startDate, args.endDate, limit, offset],
      );
      return rows.map((r: any) => ({
        id: String(r.id),
        description: r.description || "",
        start: r.start,
        stop: r.stop,
        seconds: r.seconds ?? 0,
        projectId: r.project_id,
        tagIds: r.tag_ids || [],
        userId: r.user_id,
        billable: r.billable ?? false,
      }));
    },

    timeTrackingProjects: async (_: any, __: any, ctx: Context) => {
      const { rows } = await ctx.db.query(
        `SELECT id, name, client_id, color, active FROM tt_projects ORDER BY name`,
      );
      return rows.map((p: any) => ({
        id: p.id,
        name: p.name,
        clientId: p.client_id,
        color: p.color,
        active: p.active,
      }));
    },

    timeTrackingClients: async (_: any, __: any, ctx: Context) => {
      const { rows } = await ctx.db.query(
        `SELECT id, name FROM tt_clients ORDER BY name`,
      );
      return rows.map((c: any) => ({
        id: c.id,
        name: c.name,
      }));
    },

    timeTrackingTags: async (_: any, __: any, ctx: Context) => {
      const { rows } = await ctx.db.query(
        `SELECT id, name FROM tt_tags ORDER BY name`,
      );
      return rows.map((t: any) => ({
        id: t.id,
        name: t.name,
      }));
    },

    timeTrackingCurrentTimer: async () => {
      const token = getToken();
      // No cache — always fetch fresh for current timer
      const entry = await fetchToggl(
        `${TOGGL_API_BASE}/me/time_entries/current`,
        token
      );
      if (!entry) return null;
      return {
        description: entry.description,
        start: entry.start,
        duration: entry.duration,
        projectId: entry.project_id,
      };
    },

    timeTrackingSummary: async (_: any, args: { startDate: string; endDate: string }, ctx: Context) => {
      const token = getToken();
      const wsId = await getWorkspaceId(token);

      // Fetch entries (reuses cache from timeTrackingEntries)
      const entriesCacheKey = `toggl:entries:${args.startDate}:${args.endDate}`;
      let entries = cacheGet(entriesCacheKey, FOUR_MIN) as any[] | null;
      if (!entries) {
        const data = await fetchToggl(
          `${TOGGL_REPORTS_BASE}/workspace/${wsId}/search/time_entries`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              start_date: args.startDate,
              end_date: args.endDate,
              page_size: 5000,
            }),
          }
        );
        const items = (Array.isArray(data) ? data : []).flat();
        entries = [];
        for (const item of items) {
          const subEntries = item.time_entries || [];
          for (const te of subEntries) {
            entries.push({
              id: te.id,
              description: item.description || "",
              start: te.start,
              stop: te.stop,
              seconds: te.seconds ?? 0,
              projectId: item.project_id,
              userId: item.user_id,
            });
          }
        }
        cacheSet(entriesCacheKey, entries);
      }

      // Fetch members for name resolution
      const membersCacheKey = "toggl:members";
      let members = cacheGet(membersCacheKey, ONE_HOUR) as any[] | null;
      if (!members) {
        // Trigger members fetch via the existing resolver
        members = await timeTrackingResolvers.Query.timeTrackingMembers(null, null, ctx) as any[];
      }
      const memberMap = new Map<number, { name: string; role: string }>();
      for (const m of members || []) {
        memberMap.set(m.id, { name: m.name, role: m.role });
      }

      // Fetch projects for name resolution
      const projectsCacheKey = "toggl:projects";
      let projects = cacheGet(projectsCacheKey, ONE_HOUR) as any[] | null;
      if (!projects) {
        projects = await timeTrackingResolvers.Query.timeTrackingProjects(null, null, ctx);
      }
      const projectMap = new Map<number, string>();
      for (const p of projects || []) {
        projectMap.set(p.id, p.name);
      }

      // Aggregate: hours per member, daily breakdown, top entries
      const byMember = new Map<number, {
        totalSeconds: number;
        daily: Map<string, number>;
        byDescription: Map<string, { seconds: number; projectId: number | null }>;
      }>();

      for (const e of entries) {
        if (!e.userId) continue;
        if (!byMember.has(e.userId)) {
          byMember.set(e.userId, { totalSeconds: 0, daily: new Map(), byDescription: new Map() });
        }
        const m = byMember.get(e.userId)!;
        m.totalSeconds += e.seconds;

        // Daily breakdown
        const day = e.start ? e.start.slice(0, 10) : "unknown";
        m.daily.set(day, (m.daily.get(day) || 0) + e.seconds);

        // Group by description
        const desc = e.description || "(no description)";
        const existing = m.byDescription.get(desc);
        if (existing) {
          existing.seconds += e.seconds;
        } else {
          m.byDescription.set(desc, { seconds: e.seconds, projectId: e.projectId });
        }
      }

      let totalHours = 0;
      const memberSummaries = [];

      for (const [userId, data] of byMember) {
        const hours = Math.round((data.totalSeconds / 3600) * 100) / 100;
        totalHours += hours;
        const info = memberMap.get(userId);

        // Top 5 entries by hours
        const topEntries = [...data.byDescription.entries()]
          .map(([desc, d]) => ({
            description: desc,
            hours: Math.round((d.seconds / 3600) * 100) / 100,
            projectName: d.projectId ? (projectMap.get(d.projectId) || null) : null,
          }))
          .sort((a, b) => b.hours - a.hours)
          .slice(0, 5);

        // Daily hours sorted by date
        const dailyHours = [...data.daily.entries()]
          .map(([date, secs]) => ({
            date,
            hours: Math.round((secs / 3600) * 100) / 100,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        memberSummaries.push({
          userId,
          name: info?.name || `User ${userId}`,
          role: info?.role || "developer",
          totalHours: hours,
          dailyHours,
          topEntries,
        });
      }

      // Sort by total hours descending
      memberSummaries.sort((a, b) => b.totalHours - a.totalHours);

      return {
        startDate: args.startDate,
        endDate: args.endDate,
        totalHours: Math.round(totalHours * 100) / 100,
        memberCount: memberSummaries.length,
        members: memberSummaries,
      };
    },

    timeTrackingDashboardActivity: async () => {
      const token = getToken();
      const wsId = await getWorkspaceId(token);
      const cacheKey = "toggl:dashboard_activity";
      const cached = cacheGet(cacheKey, FOUR_MIN);
      if (cached) return cached;

      const activity = await fetchToggl(
        `${TOGGL_API_BASE}/workspaces/${wsId}/dashboard/all_activity`,
        token
      );
      const result = (activity || []).map((a: any) => ({
        userId: a.user_id,
        description: a.description,
        duration: a.duration,
        projectId: a.project_id,
        start: a.start,
        stop: a.stop,
      }));
      cacheSet(cacheKey, result);
      return result;
    },
  },

  Mutation: {
    triggerTimeTrackingSync: async (_: any, __: any, ctx: Context) => {
      requireAdmin(ctx);
      const result = await runSync(ctx.db);
      return {
        status: result.status,
        lastSyncAt: result.lastSyncAt ?? null,
        entriesUpserted: result.entriesUpserted,
      };
    },

    updateTimeTrackingMember: async (
      _: any,
      args: { id: number; role?: string; active?: boolean },
      ctx: Context
    ) => {
      requireAdmin(ctx);
      // args.id is the time tracking user_id. Find the matching developer by time_tracking_user_id.
      const dev = await queryOne(
        ctx.db,
        `SELECT name, full_name, role FROM developers WHERE time_tracking_user_id = $1`,
        [args.id]
      ) as any;

      if (!dev) throw new Error(`No developer linked to time tracking user ID ${args.id}`);

      const role = args.role ?? dev.role ?? "developer";

      // Update the developer's role in the developers table
      await queryAll(
        ctx.db,
        `UPDATE developers SET role = $1, updated_at = NOW() WHERE time_tracking_user_id = $2`,
        [role, args.id]
      );

      // Invalidate members cache so next fetch picks up the change
      cacheSet("toggl:members", null);

      // Resolve name from cached members
      let memberName = dev.full_name;
      const cached = cacheGet("toggl:members", ONE_HOUR) as any[] | null;
      if (cached) {
        const found = cached.find((m: any) => m.id === args.id);
        if (found) memberName = found.name;
      }

      return {
        id: args.id,
        name: memberName,
        email: null,
        role,
        active: args.active ?? true,
      };
    },
  },
};
