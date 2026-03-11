"use client";

import { useQuery, useMutation } from "@apollo/client/react";
import { useMemo } from "react";
import {
  TIME_TRACKING_ME_QUERY,
  TIME_TRACKING_WORKSPACE_QUERY,
  TIME_TRACKING_MEMBERS_QUERY,
  TIME_TRACKING_ENTRIES_QUERY,
  TIME_TRACKING_PROJECTS_QUERY,
  TIME_TRACKING_CLIENTS_QUERY,
  TIME_TRACKING_TAGS_QUERY,
  TIME_TRACKING_CURRENT_TIMER_QUERY,
  TIME_TRACKING_DASHBOARD_ACTIVITY_QUERY,
  UPDATE_TIME_TRACKING_MEMBER_MUTATION,
} from "@/lib/graphql/queries";

const FIVE_MIN = 5 * 60 * 1000;

export interface TimeTrackingMember {
  id: number;
  name: string;
  email: string | null;
  role: string;
  active: boolean;
}

export interface TimeEntry {
  id: number | null;
  description: string;
  start: string;
  stop: string | null;
  seconds: number;
  projectId: number | null;
  tagIds: number[];
  userId: number;
}

export interface TimeTrackingProject {
  id: number;
  name: string;
  clientId: number | null;
  color: string;
  active: boolean;
}

export interface TimeTrackingClient {
  id: number;
  name: string;
}

export interface TimeTrackingTag {
  id: number;
  name: string;
}

export interface DashboardActivity {
  userId: number;
  description: string;
  duration: number;
  projectId: number | null;
  start: string;
  stop: string | null;
}

export function useTimeTrackingData(startDate: string, endDate: string) {
  const { data: meData, loading: meLoading } = useQuery(TIME_TRACKING_ME_QUERY);
  const { data: wsData, loading: wsLoading } = useQuery(TIME_TRACKING_WORKSPACE_QUERY);

  const { data: membersData, loading: membersLoading, refetch: refetchMembers } =
    useQuery(TIME_TRACKING_MEMBERS_QUERY, { errorPolicy: "all" });

  const { data: entriesData, loading: entriesLoading } = useQuery(
    TIME_TRACKING_ENTRIES_QUERY,
    { variables: { startDate, endDate }, pollInterval: FIVE_MIN }
  );

  const { data: activityData, loading: activityLoading } = useQuery(
    TIME_TRACKING_DASHBOARD_ACTIVITY_QUERY,
    { pollInterval: FIVE_MIN }
  );

  const { data: projectsData, loading: projectsLoading } = useQuery(TIME_TRACKING_PROJECTS_QUERY);
  const { data: clientsData, loading: clientsLoading } = useQuery(TIME_TRACKING_CLIENTS_QUERY);
  const { data: tagsData, loading: tagsLoading } = useQuery(TIME_TRACKING_TAGS_QUERY);

  const { data: timerData } = useQuery(TIME_TRACKING_CURRENT_TIMER_QUERY, {
    pollInterval: FIVE_MIN,
  });

  const [updateMember] = useMutation(UPDATE_TIME_TRACKING_MEMBER_MUTATION);

  const me = meData?.timeTrackingMe ?? null;
  const workspace = wsData?.timeTrackingWorkspace ?? null;
  const members: TimeTrackingMember[] = membersData?.timeTrackingMembers ?? [];
  const entries: TimeEntry[] = entriesData?.timeTrackingEntries ?? [];
  const dashboardActivity: DashboardActivity[] = activityData?.timeTrackingDashboardActivity ?? [];
  const projects: TimeTrackingProject[] = projectsData?.timeTrackingProjects ?? [];
  const clients: TimeTrackingClient[] = clientsData?.timeTrackingClients ?? [];
  const tags: TimeTrackingTag[] = tagsData?.timeTrackingTags ?? [];
  const currentTimer = timerData?.timeTrackingCurrentTimer ?? null;

  // Build lookup maps for fast access
  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const clientMap = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients]
  );

  // Build current entries map from dashboard activity (running timers per user)
  const currentEntries = useMemo(() => {
    const map: Record<number, DashboardActivity> = {};
    for (const a of dashboardActivity) {
      if (a.duration < 0) {
        // Negative duration = running timer
        map[a.userId] = a;
      }
    }
    return map;
  }, [dashboardActivity]);

  const loading =
    meLoading || wsLoading || membersLoading || entriesLoading ||
    activityLoading || projectsLoading || clientsLoading || tagsLoading;

  return {
    me,
    workspace,
    members,
    entries,
    dashboardActivity,
    currentEntries,
    currentTimer,
    projects,
    clients,
    tags,
    projectMap,
    clientMap,
    loading,
    updateMember: async (id: number, role?: string, active?: boolean) => {
      await updateMember({ variables: { id, role, active } });
      refetchMembers();
    },
  };
}
