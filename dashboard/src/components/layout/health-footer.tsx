"use client";

import { useState } from "react";
import { useQuery } from "@apollo/client/react";
import { DATA_HEALTH_QUERY } from "@/lib/graphql/queries";

// ── Types ────────────────────────────────────────────────

interface DataHealthStream {
  stream: string;
  count: number;
  lastUpdated: string | null;
  recentCount: number;
}

type Status = "green" | "yellow" | "red" | "gray";

interface DataHealthResponse {
  dataHealth: {
    lastSessionEndedAt: string | null;
    streams: DataHealthStream[];
  };
}

// ── Staleness tolerance per stream (in hours) ────────────
// Mirrors the thresholds from the health page.

const TOLERANCE: Record<string, number> = {
  transcripts: 1,
  workflow_events: 1,
  tasks: 24,
  developer_context: 168, // 7 days
  skill_versions: 720, // 30 days
};

// ── Stream display labels ────────────────────────────────

const LABELS: Record<string, string> = {
  transcripts: "Transcripts",
  workflow_events: "Workflow Events",
  tasks: "Tasks",
  developer_context: "Developer Context",
  skill_versions: "Skill Versions",
};

// ── Status helpers ───────────────────────────────────────

function getStreamStatus(
  stream: string,
  lastUpdated: string | null,
  lastSessionEndedAt: string | null
): Status {
  if (!lastUpdated) return "red";
  if (!lastSessionEndedAt) return "gray";

  const tolerance = TOLERANCE[stream] ?? 24;
  const updatedMs = new Date(lastUpdated).getTime();
  const sessionMs = new Date(lastSessionEndedAt).getTime();
  if (isNaN(updatedMs) || isNaN(sessionMs)) return "red";

  const lagHours = Math.max(0, (sessionMs - updatedMs) / (1000 * 60 * 60));

  if (lagHours <= tolerance) return "green";
  if (lagHours <= tolerance * 2) return "yellow";
  return "red";
}

/**
 * Compute aggregate pipeline status from stream data.
 * - green: all streams within tolerance
 * - yellow: at least one stream stale (within 2x tolerance)
 * - red: at least one stream very stale (beyond 2x tolerance) or missing data
 * - gray: no session data or no streams
 */
export function computeAggregateStatus(
  streams: DataHealthStream[],
  lastSessionEndedAt: string | null
): Status {
  if (!lastSessionEndedAt || streams.length === 0) return "gray";

  let worst: Status = "green";
  const priority: Record<Status, number> = { green: 0, gray: 1, yellow: 2, red: 3 };

  for (const s of streams) {
    const status = getStreamStatus(s.stream, s.lastUpdated, lastSessionEndedAt);
    if (priority[status] > priority[worst]) {
      worst = status;
    }
  }

  return worst;
}

// ── Display helpers ──────────────────────────────────────

const STATUS_DOT_COLOR: Record<Status, string> = {
  green: "bg-[#238551]",
  yellow: "bg-[#EC9A3C]",
  red: "bg-[#CD4246]",
  gray: "bg-[#5F6B7C]",
};

function relativeTime(ts: string | null): string {
  if (!ts) return "--";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatThreshold(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

// ── Component ────────────────────────────────────────────

export function HealthFooter() {
  const [expanded, setExpanded] = useState(false);

  const { data, loading } = useQuery<DataHealthResponse>(DATA_HEALTH_QUERY, {
    pollInterval: 30000,
  });

  const streams: DataHealthStream[] = data?.dataHealth?.streams ?? [];
  const lastSessionEndedAt: string | null =
    data?.dataHealth?.lastSessionEndedAt ?? null;

  const aggregate = computeAggregateStatus(streams, lastSessionEndedAt);

  // Don't render anything while initial load is in progress and there's no data
  if (loading && !data) return null;

  return (
    <div className="border-t border-border bg-card flex-shrink-0">
      {/* Collapsed bar */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-4 h-8 text-xs text-muted-foreground hover:bg-secondary/50 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          Pipeline:
          <span
            className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_COLOR[aggregate]}`}
          />
          <span className="text-[11px]">
            {aggregate === "green"
              ? "Healthy"
              : aggregate === "yellow"
                ? "Stale"
                : aggregate === "red"
                  ? "Degraded"
                  : "Unknown"}
          </span>
        </span>
        <span>
          Last session: {relativeTime(lastSessionEndedAt)}
          <span className="ml-2">{expanded ? "\u25B2" : "\u25BC"}</span>
        </span>
      </button>

      {/* Expanded detail table */}
      {expanded && streams.length > 0 && (
        <div className="border-t border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-1.5 text-left font-medium text-muted-foreground">
                  Stream
                </th>
                <th className="px-4 py-1.5 text-center font-medium text-muted-foreground w-16">
                  Status
                </th>
                <th className="px-4 py-1.5 text-right font-medium text-muted-foreground w-20">
                  Count
                </th>
                <th className="px-4 py-1.5 text-right font-medium text-muted-foreground w-20">
                  Threshold
                </th>
                <th className="px-4 py-1.5 text-right font-medium text-muted-foreground w-28">
                  Last Updated
                </th>
                <th className="px-4 py-1.5 text-right font-medium text-muted-foreground w-20">
                  Rate (1h)
                </th>
              </tr>
            </thead>
            <tbody>
              {streams.map((s) => {
                const status = getStreamStatus(
                  s.stream,
                  s.lastUpdated,
                  lastSessionEndedAt
                );
                const tolerance = TOLERANCE[s.stream] ?? 24;
                return (
                  <tr
                    key={s.stream}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-1.5 font-mono">
                      {LABELS[s.stream] ?? s.stream}
                    </td>
                    <td className="px-4 py-1.5 text-center">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_COLOR[status]}`}
                      />
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono">
                      {s.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-1.5 text-right text-muted-foreground">
                      {formatThreshold(tolerance)}
                    </td>
                    <td className="px-4 py-1.5 text-right text-muted-foreground">
                      {relativeTime(s.lastUpdated)}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono">
                      {s.recentCount > 0 ? `${s.recentCount}/hr` : "\u2014"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
