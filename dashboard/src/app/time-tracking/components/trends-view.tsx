"use client";

import { useState, useMemo } from "react";
import {
  formatHours,
  formatDateKey,
  getWeeksInRange,
  getNonOverlappingSeconds,
  getMemberColor,
} from "./utils";
import type { TimeEntry, TimeTrackingMember } from "../use-time-tracking-data";

// ---------- Types ----------

interface TrendData {
  periodLabels: string[];
  data: Record<number, Record<number, number>>; // periodIndex → { userId → seconds }
}

type Granularity = "day" | "week" | "month";

// ---------- TrendTable ----------

function TrendTable({
  trendData,
  members,
  memberColors,
}: {
  trendData: TrendData;
  members: TimeTrackingMember[];
  memberColors: Record<number, string>;
}) {
  const { periodLabels, data } = trendData;
  const [sortKey, setSortKey] = useState<"name" | "total">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: "name" | "total") => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "total" ? "desc" : "asc");
    }
  };

  const arrow = (key: string) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const memberTotals = useMemo(() => {
    const t: Record<number, number> = {};
    members.forEach((m) => {
      t[m.id] = periodLabels.reduce(
        (sum, _, i) => sum + (data[i]?.[m.id] || 0),
        0,
      );
    });
    return t;
  }, [members, periodLabels, data]);

  const sortedMembers = useMemo(() => {
    const arr = [...members];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "name") {
        return (
          dir *
          (a.togglName || "").localeCompare(b.togglName || "")
        );
      }
      return dir * ((memberTotals[a.id] || 0) - (memberTotals[b.id] || 0));
    });
    return arr;
  }, [members, sortKey, sortDir, memberTotals]);

  const allVals: number[] = [];
  members.forEach((m) => {
    periodLabels.forEach((_, i) => {
      allVals.push(data[i]?.[m.id] || 0);
    });
  });
  const maxVal = Math.max(...allVals, 1);

  return (
    <div className="flex">
      {/* Pinned left: Name */}
      <div className="shrink-0 w-[140px] border-r-2 border-[#2a2f3a] z-[2]">
        <div
          className="h-[38px] flex items-center px-3 text-xs font-medium text-[#8a8f9a] bg-[#1a1d24] border-b border-[#2a2f3a] cursor-pointer select-none"
          onClick={() => toggleSort("name")}
          style={{ color: sortKey === "name" ? "#e0e0e0" : undefined }}
        >
          Name{arrow("name")}
        </div>
        {sortedMembers.map((m) => (
          <div
            key={m.id}
            className="h-10 flex items-center px-3 border-b border-[#1e2330]"
          >
            <span className="text-xs font-medium" style={{ color: memberColors[m.id] }}>
              {m.togglName?.split(" ")[0] || "?"}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable middle: period columns */}
      <div className="flex-1 overflow-x-auto min-w-0">
        <div className="flex" style={{ minWidth: periodLabels.length * 56 }}>
          {periodLabels.map((label, i) => (
            <div key={i} className="w-14 shrink-0">
              <div className="h-[38px] flex items-center justify-center text-xs font-medium text-[#8a8f9a] bg-[#1a1d24] border-b border-[#2a2f3a]">
                {label}
              </div>
              {sortedMembers.map((m) => {
                const val = data[i]?.[m.id] || 0;
                const intensity = val / maxVal;
                return (
                  <div
                    key={m.id}
                    className="h-10 flex items-center justify-center text-xs text-[#e0e0e0] border-b border-[#1e2330] tabular-nums"
                    style={{
                      background:
                        val > 0
                          ? `rgba(92, 107, 192, ${0.1 + intensity * 0.3})`
                          : "transparent",
                    }}
                  >
                    {val > 0 ? formatHours(val) : "—"}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Pinned right: Total */}
      <div className="shrink-0 w-20 border-l-2 border-[#2a2f3a] z-[2]">
        <div
          className="h-[38px] flex items-center justify-center text-xs font-medium text-[#8a8f9a] bg-[#1a1d24] border-b border-[#2a2f3a] cursor-pointer select-none"
          onClick={() => toggleSort("total")}
          style={{ color: sortKey === "total" ? "#e0e0e0" : undefined }}
        >
          Total{arrow("total")}
        </div>
        {sortedMembers.map((m) => (
          <div
            key={m.id}
            className="h-10 flex items-center justify-center text-xs font-semibold text-[#e0e0e0] border-b border-[#1e2330] tabular-nums"
          >
            {formatHours(memberTotals[m.id] || 0)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- LineGraph ----------

function LineGraph({
  trendData,
  members,
  memberColors,
}: {
  trendData: TrendData;
  members: TimeTrackingMember[];
  memberColors: Record<number, string>;
}) {
  const { periodLabels, data } = trendData;
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    lines: { label: string; value: string; color?: string }[];
  } | null>(null);

  if (!periodLabels || periodLabels.length === 0) return null;

  const width = 900;
  const height = 300;
  const pad = { top: 20, right: 20, bottom: 40, left: 55 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  let maxY = 0;
  members.forEach((m) => {
    periodLabels.forEach((_, i) => {
      const val = (data[i]?.[m.id] || 0) / 3600;
      if (val > maxY) maxY = val;
    });
  });
  maxY = maxY || 1;
  const niceMax =
    Math.ceil(maxY / (maxY > 10 ? 5 : 1)) * (maxY > 10 ? 5 : 1);

  const xScale = (i: number) =>
    pad.left +
    (periodLabels.length > 1
      ? (i / (periodLabels.length - 1)) * chartW
      : chartW / 2);
  const yScale = (v: number) => pad.top + chartH - (v / niceMax) * chartH;

  const yTicks: number[] = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) yTicks.push((niceMax / tickCount) * i);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block"
      >
        {/* Y axis grid + labels */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              y1={yScale(tick)}
              x2={width - pad.right}
              y2={yScale(tick)}
              stroke="#1e2330"
              strokeWidth="1"
            />
            <text
              x={pad.left - 8}
              y={yScale(tick) + 4}
              fill="#5a5f6a"
              fontSize="10"
              textAnchor="end"
              fontFamily="Inter, -apple-system, sans-serif"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {tick.toFixed(tick % 1 === 0 ? 0 : 1)}h
            </text>
          </g>
        ))}
        {/* X axis labels */}
        {periodLabels.map((label, i) => (
          <text
            key={i}
            x={xScale(i)}
            y={height - 8}
            fill="#5a5f6a"
            fontSize="9"
            textAnchor="middle"
            fontFamily="Inter, sans-serif"
          >
            {label}
          </text>
        ))}
        {/* Lines per member */}
        {members.map((m) => {
          const pts = periodLabels
            .map((_, i) => {
              const val = (data[i]?.[m.id] || 0) / 3600;
              return `${xScale(i)},${yScale(val)}`;
            })
            .join(" ");
          const firstName = (m.togglName || "?").split(" ")[0];
          return (
            <g key={m.id}>
              <polyline
                points={pts}
                fill="none"
                stroke={memberColors[m.id]}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {periodLabels.map((label, i) => {
                const val = (data[i]?.[m.id] || 0) / 3600;
                if (val === 0) return null;
                return (
                  <circle
                    key={i}
                    cx={xScale(i)}
                    cy={yScale(val)}
                    r="3"
                    fill={memberColors[m.id]}
                    style={{ cursor: "pointer" }}
                    onMouseMove={(e) =>
                      setTooltip({
                        x: e.clientX,
                        y: e.clientY,
                        lines: [
                          { label: `${firstName} — ${label}`, value: "" },
                          {
                            label: "Hours",
                            value: `${val.toFixed(1)}h`,
                            color: memberColors[m.id],
                          },
                        ],
                      })
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed bg-[#1a1e2a] border border-[#2a2f3a] rounded-md px-3 py-2 pointer-events-none min-w-[120px]"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            zIndex: 9999,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {tooltip.lines.map((l, i) => (
            <div
              key={i}
              className="flex gap-3 leading-[18px]"
              style={{
                justifyContent: l.value ? "space-between" : "flex-start",
                fontSize: i === 0 ? 11 : 10,
              }}
            >
              <span
                style={{
                  color: i === 0 ? "#e0e0e0" : "#8a8f9a",
                  fontWeight: i === 0 ? 600 : 400,
                }}
              >
                {l.label}
              </span>
              {l.value && (
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: l.color || "#e0e0e0" }}
                >
                  {l.value}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- TrendsView ----------

function autoGranularity(start: Date, end: Date): Granularity {
  const days = Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 14) return "day";
  if (days <= 90) return "week";
  return "month";
}

interface TrendsViewProps {
  entries: TimeEntry[];
  members: TimeTrackingMember[];
  memberColors: Record<number, string>;
  dateRange: { start: Date; end: Date };
}

export function TrendsView({
  entries,
  members,
  memberColors,
  dateRange,
}: TrendsViewProps) {
  const [mode, setMode] = useState<"graph" | "table">("graph");
  const [granularity, setGranularity] = useState<Granularity | "auto">("auto");

  const effectiveGranularity =
    granularity === "auto"
      ? autoGranularity(dateRange.start, dateRange.end)
      : granularity;

  // Build calendarData: { dateKey: { userId: entries[] } }
  const calendarData = useMemo(() => {
    const data: Record<string, Record<number, TimeEntry[]>> = {};
    for (const entry of entries) {
      if (!entry.start) continue;
      const dateKey = entry.start.split("T")[0];
      if (!data[dateKey]) data[dateKey] = {};
      if (!data[dateKey][entry.userId]) data[dateKey][entry.userId] = [];
      data[dateKey][entry.userId].push(entry);
    }
    return data;
  }, [entries]);

  // Compute trend data
  const trendData: TrendData = useMemo(() => {
    const periodLabels: string[] = [];
    const data: Record<number, Record<number, number>> = {};

    if (effectiveGranularity === "day") {
      const cur = new Date(dateRange.start);
      let idx = 0;
      while (cur <= dateRange.end) {
        const key = formatDateKey(cur);
        periodLabels.push(`${cur.getMonth() + 1}/${cur.getDate()}`);
        data[idx] = {};
        const dayEntries = calendarData[key] || {};
        for (const [uid, ents] of Object.entries(dayEntries)) {
          data[idx][parseInt(uid)] =
            (data[idx][parseInt(uid)] || 0) + getNonOverlappingSeconds(ents);
        }
        cur.setDate(cur.getDate() + 1);
        idx++;
      }
    } else if (effectiveGranularity === "week") {
      const weeks = getWeeksInRange(dateRange.start, dateRange.end);
      weeks.forEach((w, idx) => {
        periodLabels.push(w.label);
        data[idx] = {};
      });
      for (const [dateKey, dayEntries] of Object.entries(calendarData)) {
        const d = new Date(dateKey);
        const wIdx = weeks.findIndex((w) => d >= w.start && d <= w.end);
        if (wIdx === -1) continue;
        for (const [uid, ents] of Object.entries(dayEntries)) {
          data[wIdx][parseInt(uid)] =
            (data[wIdx][parseInt(uid)] || 0) + getNonOverlappingSeconds(ents);
        }
      }
    } else {
      // month
      const cur = new Date(
        dateRange.start.getFullYear(),
        dateRange.start.getMonth(),
        1,
      );
      const periods: string[] = [];
      let idx = 0;
      while (cur <= dateRange.end) {
        periods.push(
          `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`,
        );
        periodLabels.push(
          cur.toLocaleDateString("en-US", { month: "short" }),
        );
        data[idx] = {};
        cur.setMonth(cur.getMonth() + 1);
        idx++;
      }
      for (const [dateKey, dayEntries] of Object.entries(calendarData)) {
        const d = new Date(dateKey);
        const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const mIdx = periods.indexOf(mKey);
        if (mIdx === -1) continue;
        for (const [uid, ents] of Object.entries(dayEntries)) {
          data[mIdx][parseInt(uid)] =
            (data[mIdx][parseInt(uid)] || 0) + getNonOverlappingSeconds(ents);
        }
      }
    }

    return { periodLabels, data };
  }, [calendarData, dateRange, effectiveGranularity]);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(["auto", "day", "week", "month"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                granularity === g
                  ? "bg-[rgba(92,107,192,0.2)] text-[#b0b8ff] border border-[rgba(92,107,192,0.4)]"
                  : "text-[#8a8f9a] hover:text-[#b0b0b0]"
              }`}
            >
              {g === "auto"
                ? `Auto (${autoGranularity(dateRange.start, dateRange.end)})`
                : g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(["graph", "table"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                mode === m
                  ? "bg-[rgba(92,107,192,0.2)] text-[#b0b8ff] border border-[rgba(92,107,192,0.4)]"
                  : "text-[#8a8f9a] hover:text-[#b0b0b0]"
              }`}
            >
              {m === "graph" ? "Graph" : "Table"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="rounded border border-[#2a2f3a] bg-[#12151c] p-4">
        {trendData.periodLabels.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-[#5a5f6a] text-sm">
            No data for the selected period
          </div>
        ) : mode === "graph" ? (
          <LineGraph
            trendData={trendData}
            members={members}
            memberColors={memberColors}
          />
        ) : (
          <TrendTable
            trendData={trendData}
            members={members}
            memberColors={memberColors}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1">
        {members
          .filter((m) => m.active)
          .map((m) => (
            <div key={m.id} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-0.5 rounded-sm"
                style={{ background: memberColors[m.id] }}
              />
              <span className="text-[10px] text-[#8a8f9a]">
                {m.togglName?.split(" ")[0]}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
