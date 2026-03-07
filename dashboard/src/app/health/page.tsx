// Data Health: Status table showing row counts, freshness, and staleness for each data stream.
"use client";

import { useQuery } from "@apollo/client/react";
import { DATA_HEALTH_QUERY } from "@/lib/graphql/queries";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ────────────────────────────────────────────────

interface DataHealthStream {
  stream: string;
  count: number;
  lastUpdated: string | null;
  recentCount: number;
}

// ── Staleness tolerance per stream (in hours) ───────────
// How long after the last session can this stream lag before we worry?

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

// ── Helpers ──────────────────────────────────────────────

function getStatus(
  stream: string,
  lastUpdated: string | null,
  lastSessionEndedAt: string | null
): "green" | "yellow" | "red" | "gray" {
  if (!lastUpdated) return "red";
  if (!lastSessionEndedAt) return "gray"; // no sessions yet — can't assess

  const tolerance = TOLERANCE[stream] ?? 24;
  const updatedMs = new Date(lastUpdated).getTime();
  const sessionMs = new Date(lastSessionEndedAt).getTime();
  if (isNaN(updatedMs) || isNaN(sessionMs)) return "red";

  // How far behind the last session is this stream?
  const lagHours = Math.max(0, (sessionMs - updatedMs) / (1000 * 60 * 60));

  if (lagHours <= tolerance) return "green";
  if (lagHours <= tolerance * 2) return "yellow";
  return "red";
}

const STATUS_DOT: Record<string, string> = {
  green: "bg-[#238551]",
  yellow: "bg-[#EC9A3C]",
  red: "bg-[#CD4246]",
  gray: "bg-[#5F6B7C]",
};

function formatThreshold(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function StatusTooltipContent({
  stream,
  lastUpdated,
  lastSessionEndedAt,
}: {
  stream: string;
  lastUpdated: string | null;
  lastSessionEndedAt: string | null;
}) {
  const tolerance = TOLERANCE[stream] ?? 24;
  const t = formatThreshold(tolerance);
  const t2 = formatThreshold(tolerance * 2);

  if (!lastSessionEndedAt) {
    return <p className="text-xs text-muted-foreground">No sessions recorded yet.</p>;
  }

  let lagStr = "no data";
  if (lastUpdated) {
    const updatedMs = new Date(lastUpdated).getTime();
    const sessionMs = new Date(lastSessionEndedAt).getTime();
    if (!isNaN(updatedMs) && !isNaN(sessionMs)) {
      const lagHours = Math.max(0, (sessionMs - updatedMs) / (1000 * 60 * 60));
      lagStr = lagHours < 1
        ? "up to date"
        : lagHours < 24
          ? `${Math.round(lagHours)}h behind`
          : `${Math.round(lagHours / 24)}d behind`;
    }
  }

  return (
    <div className="space-y-1.5 text-xs">
      <div className="grid grid-cols-[auto_1fr] gap-x-3">
        <span className="text-muted-foreground">Lag</span>
        <span>{lagStr}</span>
        <span className="text-muted-foreground">Threshold</span>
        <span>{t} / {t2} / {t2}+</span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#238551]" />≤{t}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#EC9A3C]" />≤{t2}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#CD4246]" />&gt;{t2}</span>
      </div>
    </div>
  );
}

function relativeTime(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Page ─────────────────────────────────────────────────

export default function HealthPage() {
  const { data, loading, error } = useQuery<any>(DATA_HEALTH_QUERY, {
    pollInterval: 30000,
  });

  const streams: DataHealthStream[] = data?.dataHealth?.streams ?? [];
  const lastSessionEndedAt: string | null = data?.dataHealth?.lastSessionEndedAt ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Data Health</h1>
        {!loading && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[#238551] animate-pulse" />
            Live
          </span>
        )}
      </div>

      {lastSessionEndedAt && (
        <div className="text-xs text-muted-foreground">
          Last session ended {relativeTime(lastSessionEndedAt)}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-[#CD4246]/30 bg-[#CD4246]/10 p-3 text-sm text-[#CD4246]">
          Failed to load health data: {error.message}
        </div>
      )}

      {loading && !data && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Stream</th>
                <th className="px-4 py-2 text-center font-medium text-muted-foreground w-20">Status</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground w-24">Count</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground w-32">Last Updated</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground w-24">Rate (1h)</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5"><Skeleton className="h-3.5 w-28" /></td>
                  <td className="px-4 py-2.5 text-center"><Skeleton className="h-2.5 w-2.5 rounded-full mx-auto" /></td>
                  <td className="px-4 py-2.5 text-right"><Skeleton className="h-3.5 w-12 ml-auto" /></td>
                  <td className="px-4 py-2.5 text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></td>
                  <td className="px-4 py-2.5 text-right"><Skeleton className="h-3.5 w-12 ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {streams.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Stream</th>
                <th className="px-4 py-2 text-center font-medium text-muted-foreground w-20">
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted underline-offset-4 decoration-muted-foreground/40">Status</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6} className="bg-[#1C2127] border border-border text-foreground p-2 max-w-[260px]">
                      <p className="text-xs">Freshness relative to last session. Green = within tolerance, Yellow = within 2x, Red = beyond 2x.</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground w-24">
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted underline-offset-4 decoration-muted-foreground/40">Count</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6} className="bg-[#1C2127] border border-border text-foreground p-2 max-w-[260px]">
                      <p className="text-xs">Total records synced to Supabase for this stream.</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground w-32">
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted underline-offset-4 decoration-muted-foreground/40">Last Updated</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6} className="bg-[#1C2127] border border-border text-foreground p-2 max-w-[260px]">
                      <p className="text-xs">Time since the most recent record was synced.</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground w-24">
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted underline-offset-4 decoration-muted-foreground/40">Rate (1h)</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6} className="bg-[#1C2127] border border-border text-foreground p-2 max-w-[260px]">
                      <p className="text-xs">Records synced in the last hour.</p>
                    </TooltipContent>
                  </Tooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {streams.map((s) => {
                const status = getStatus(s.stream, s.lastUpdated, lastSessionEndedAt);
                return (
                  <tr key={s.stream} className="border-b border-border last:border-0 hover:bg-card/50">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {LABELS[s.stream] ?? s.stream}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full cursor-help ${STATUS_DOT[status]}`}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8} className="bg-[#1C2127] border border-border text-foreground p-2 max-w-[260px]">
                          <StatusTooltipContent stream={s.stream} lastUpdated={s.lastUpdated} lastSessionEndedAt={lastSessionEndedAt} />
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {s.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                      {relativeTime(s.lastUpdated)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {s.recentCount > 0 ? `${s.recentCount}/hr` : "—"}
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
