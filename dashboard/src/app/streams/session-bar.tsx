"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SessionWithLane } from "./types";
import {
  formatTokens,
  formatDuration,
  formatTime,
  formatDate,
  shortModel,
  truncate,
  modelColor,
} from "./helpers";

interface SessionBarProps {
  session: SessionWithLane;
  rangeStart: number;
  totalRange: number;
  now: number;
  showModelBadges: boolean;
}

export function SessionBar({ session: s, rangeStart, totalRange, now, showModelBadges }: SessionBarProps) {
  const startMs = new Date(s.startedAt).getTime();
  const endMs = s.endedAt ? new Date(s.endedAt).getTime() : now;
  const isActive = s.endedAt === null;

  const leftPct = ((startMs - rangeStart) / totalRange) * 100;
  const widthPct = Math.max(((endMs - startMs) / totalRange) * 100, 1);

  const model = shortModel(s.model);
  const title = s.taskTitle ? truncate(s.taskTitle, 20) : s.sessionId.slice(0, 8);
  const subCount = s.subagents?.length ?? 0;
  const barHeight = 24;
  const laneGap = 4;
  const topOffset = 4 + s.lane * (barHeight + laneGap);

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <div
          className={`absolute rounded-sm flex items-center gap-1 px-1.5 overflow-hidden cursor-default transition-opacity ${
            isActive ? "streams-pulse" : ""
          }`}
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            top: `${topOffset}px`,
            height: `${barHeight}px`,
            backgroundColor: isActive ? "#2D72D2" : "#404854",
            minWidth: "12px",
          }}
        >
          <span className="text-[11px] text-white truncate leading-none">{title}</span>
          {s.sprint?.name && s.taskNum != null && widthPct > 12 && (
            <span
              className="text-[9px] px-1 py-0 rounded-sm shrink-0 leading-none font-mono"
              style={{ backgroundColor: "rgba(0,0,0,0.3)", color: "#A7B6C2" }}
              data-mono
            >
              {s.sprint?.name} #{s.taskNum}
            </span>
          )}
          {s.skillName && widthPct > 12 && (
            <span
              className="text-[9px] px-1 py-0 rounded-sm shrink-0 leading-none"
              style={{ backgroundColor: "rgba(0,0,0,0.3)", color: "#2D72D2" }}
            >
              {s.skillName}
            </span>
          )}
          {showModelBadges && model && widthPct > 6 && (
            <span
              className="text-[9px] px-1 py-0 rounded-sm shrink-0 leading-none font-mono"
              style={{ backgroundColor: "rgba(0,0,0,0.3)", color: isActive ? "#fff" : modelColor(s.model) }}
              data-mono
            >
              {model}
            </span>
          )}
          {subCount > 0 && widthPct > 10 && (
            <span
              className="text-[9px] px-1 py-0 rounded-sm shrink-0 leading-none font-mono"
              style={{ backgroundColor: "rgba(0,0,0,0.3)", color: "#238551" }}
              data-mono
            >
              +{subCount}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="bg-[#1C2127] border border-border text-foreground p-2 max-w-[280px]"
      >
        <div className="space-y-1.5">
          <div className="text-xs font-semibold">
            {s.taskTitle ?? s.sessionId.slice(0, 12)}
          </div>
          {s.sprint?.name && s.taskNum != null && (
            <div className="text-[11px] text-muted-foreground">
              {s.sprint?.name} #{s.taskNum}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-mono text-right" data-mono>{formatDuration(s.durationMinutes)}</span>

            <span className="text-muted-foreground">Input tokens</span>
            <span className="font-mono text-right" data-mono>{formatTokens(s.totalInputTokens)}</span>

            <span className="text-muted-foreground">Output tokens</span>
            <span className="font-mono text-right" data-mono>{formatTokens(s.totalOutputTokens)}</span>

            <span className="text-muted-foreground">Tool calls</span>
            <span className="font-mono text-right" data-mono>{s.toolCallCount ?? 0}</span>

            <span className="text-muted-foreground">Subagents</span>
            <span className="font-mono text-right" data-mono>{subCount}</span>

            {s.skillName && (
              <>
                <span className="text-muted-foreground">Skill</span>
                <span className="text-right">{s.skillName}</span>
              </>
            )}

            {model && (
              <>
                <span className="text-muted-foreground">Model</span>
                <span className="font-mono text-right" style={{ color: modelColor(s.model) }} data-mono>
                  {model}
                </span>
              </>
            )}
          </div>

          <div className="text-[10px] text-muted-foreground border-t border-border/30 pt-1">
            {formatDate(s.startedAt)} {formatTime(s.startedAt)}
            {" \u2192 "}
            {s.endedAt ? `${formatDate(s.endedAt)} ${formatTime(s.endedAt)}` : "active"}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
