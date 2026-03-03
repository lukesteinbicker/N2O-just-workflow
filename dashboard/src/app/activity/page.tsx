"use client";

import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import { ACTIVITY_FEED_QUERY } from "@/lib/graphql/queries";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { Card } from "@/components/ui/card";

// ── Feed helpers ─────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  task_started: "#EC9A3C",
  task_completed: "#238551",
  task_blocked: "#CD4246",
  phase_entered: "#2D72D2",
  skill_invoked: "#7157D9",
  tool_call: "#738694",
  subagent_spawn: "#238551",
  commit: "#238551",
  sync: "#738694",
};

function actionBadgeColor(action: string): string {
  return ACTION_COLORS[action] ?? "#738694";
}

function formatAction(action: string): string {
  return action.replace(/_/g, " ");
}

function formatFeedTimestamp(ts: string): { date: string; time: string } {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString([], { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

// ── Page ─────────────────────────────────────────────────

export default function ActivityPage() {
  const { data, loading, error, refetch } = useQuery<any>(ACTIVITY_FEED_QUERY);
  useRealtimeTable("workflow_events", refetch);

  const [actionFilter, setActionFilter] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading activity feed...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[#CD4246]">
        Error: {error.message}
      </div>
    );
  }

  const activities = data?.activityLog ?? [];
  const actionTypes = [...new Set<string>(activities.map((a: any) => a.action))].sort();
  const filtered = actionFilter
    ? activities.filter((a: any) => a.action === actionFilter)
    : activities;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">Activity</h1>
      </div>

      <div className="flex items-center gap-2">
        <select
          className="text-xs bg-[#252A31] border border-border rounded-sm px-2 py-1 text-foreground"
          value={actionFilter ?? ""}
          onChange={(e) => setActionFilter(e.target.value || null)}
        >
          <option value="">All actions</option>
          {actionTypes.map((a: string) => (
            <option key={a} value={a}>{formatAction(a)}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <Card className="p-0 bg-card border-border overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4">No activity data</p>
        ) : (
          <div className="divide-y divide-border/20 max-h-[calc(100vh-180px)] overflow-y-auto">
            {filtered.map((a: any) => {
              const { date, time } = formatFeedTimestamp(a.timestamp);
              return (
                <div key={a.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-[#2F343C] transition-colors">
                  <div className="shrink-0 w-[100px] text-right">
                    <div className="text-[10px] text-muted-foreground">{date}</div>
                    <div className="text-xs font-mono text-muted-foreground" data-mono>{time}</div>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium"
                      style={{
                        backgroundColor: `${actionBadgeColor(a.action)}20`,
                        color: actionBadgeColor(a.action),
                      }}
                    >
                      {formatAction(a.action)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {a.summary && <div className="text-xs text-foreground">{a.summary}</div>}
                    <div className="flex items-center gap-2 mt-0.5">
                      {a.sprint && (
                        <span className="text-[10px] text-muted-foreground font-mono" data-mono>
                          {a.sprint}{a.taskNum != null && ` #${a.taskNum}`}
                        </span>
                      )}
                      {a.developer && (
                        <span className="text-[10px] text-muted-foreground">{a.developer}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
