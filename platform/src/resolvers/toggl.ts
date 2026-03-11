// Toggl GraphQL resolvers — live API calls with rate limiting and caching.
// Replaces the stale pre-synced resolver with direct Toggl API access.
import type { Context } from "../context.js";
import { queryAll, queryOne } from "../db-adapter.js";
import {
  fetchToggl,
  cacheGet,
  cacheSet,
  getToken,
  TOGGL_API_BASE,
  TOGGL_REPORTS_BASE,
} from "../services/toggl-api.js";

const ONE_HOUR = 60 * 60 * 1000;
const FOUR_MIN = 4 * 60 * 1000;

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

export const togglResolvers = {
  Query: {
    togglMe: async () => {
      const token = getToken();
      const cacheKey = "toggl:me";
      const cached = cacheGet(cacheKey, ONE_HOUR);
      if (cached) return cached;

      const me = await fetchToggl(`${TOGGL_API_BASE}/me`, token);
      const result = { id: me.id, fullname: me.fullname, email: me.email };
      cacheSet(cacheKey, result);
      return result;
    },

    togglWorkspace: async () => {
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

    togglMembers: async (_: any, __: any, ctx: Context) => {
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

      const result = memberList.map((m) => {
        const dev = devMap.get(m.id);
        return {
          id: m.id,  // Toggl user_id — matches entry.userId
          togglName: m.name,
          email: m.email,
          role: dev?.role ?? "developer",
          active: true,
        };
      });

      cacheSet(cacheKey, result);
      return result;
    },

    togglTimeEntries: async (_: any, args: { startDate: string; endDate: string }) => {
      const token = getToken();
      const wsId = await getWorkspaceId(token);
      const cacheKey = `toggl:entries:${args.startDate}:${args.endDate}`;
      const cached = cacheGet(cacheKey, FOUR_MIN);
      if (cached) return cached;

      const data = await fetchToggl(
        `${TOGGL_REPORTS_BASE}/workspace/${wsId}/search/time_entries`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            start_date: args.startDate,
            end_date: args.endDate,
          }),
        }
      );

      // Reports API returns grouped items, each with a time_entries[] sub-array.
      // Double-loop: outer item has user_id/description/project_id/tag_ids,
      // each time_entries[i] has id/start/stop/seconds.
      const items = (Array.isArray(data) ? data : []).flat();
      const entries: any[] = [];
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
            tagIds: item.tag_ids || [],
            userId: item.user_id,
          });
        }
      }

      cacheSet(cacheKey, entries);
      return entries;
    },

    togglProjects: async () => {
      const token = getToken();
      const wsId = await getWorkspaceId(token);
      const cacheKey = "toggl:projects";
      const cached = cacheGet(cacheKey, ONE_HOUR);
      if (cached) return cached;

      const projects = await fetchToggl(
        `${TOGGL_API_BASE}/workspaces/${wsId}/projects`,
        token
      );
      const result = (projects || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        clientId: p.client_id,
        color: p.color,
        active: p.active,
      }));
      cacheSet(cacheKey, result);
      return result;
    },

    togglClients: async () => {
      const token = getToken();
      const wsId = await getWorkspaceId(token);
      const cacheKey = "toggl:clients";
      const cached = cacheGet(cacheKey, ONE_HOUR);
      if (cached) return cached;

      const clients = await fetchToggl(
        `${TOGGL_API_BASE}/workspaces/${wsId}/clients`,
        token
      );
      const result = (clients || []).map((c: any) => ({
        id: c.id,
        name: c.name,
      }));
      cacheSet(cacheKey, result);
      return result;
    },

    togglTags: async () => {
      const token = getToken();
      const wsId = await getWorkspaceId(token);
      const cacheKey = "toggl:tags";
      const cached = cacheGet(cacheKey, ONE_HOUR);
      if (cached) return cached;

      const tags = await fetchToggl(
        `${TOGGL_API_BASE}/workspaces/${wsId}/tags`,
        token
      );
      const result = (tags || []).map((t: any) => ({
        id: t.id,
        name: t.name,
      }));
      cacheSet(cacheKey, result);
      return result;
    },

    togglCurrentTimer: async () => {
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

    togglDashboardActivity: async () => {
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
    updateTogglMember: async (
      _: any,
      args: { id: number; role?: string; active?: boolean },
      ctx: Context
    ) => {
      // args.id is the Toggl user_id. Find the matching developer by time_tracking_user_id.
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

      // Resolve name from cached members for the togglName field
      let togglName = dev.full_name;
      const cached = cacheGet("toggl:members", ONE_HOUR) as any[] | null;
      if (cached) {
        const found = cached.find((m: any) => m.id === args.id);
        if (found) togglName = found.togglName;
      }

      return {
        id: args.id,
        togglName,
        email: null,
        role,
        active: args.active ?? true,
      };
    },
  },
};
