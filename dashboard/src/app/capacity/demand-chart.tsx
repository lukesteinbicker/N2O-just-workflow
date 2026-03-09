"use client";

import { useMemo } from "react";
import type { DailyPoint } from "./capacity-data";
import { getPS, SUPPLY } from "./capacity-utils";
import type { FlatProject } from "./project-sidebar";

// ─── Probability legend colors ───

const LEGEND_ITEMS: [string, string][] = [
  ["Committed", "#00E676"],
  ["90%", "#69F0AE"],
  ["80%", "#FFD740"],
  ["70%", "#FF9100"],
  ["40%", "#FF5252"],
  ["20%", "#EF5350"],
  ["10%", "#CE93D8"],
];

// ─── Layer builder ───

interface Layer {
  projectId: string;
  style: { bar: string; bg: string };
  path: string;
}

function buildLayers(
  active: FlatProject[],
  daily: DailyPoint[],
  chartMax: number,
  timelineWidth: number,
  gran: string
): Layer[] {
  const sorted = [...active].sort((a, b) => b.prob - a.prob);
  const result: Layer[] = [];
  const sr = gran === "week" ? 1 : gran === "quarter" ? 2 : 3;

  for (let pi = 0; pi < sorted.length; pi++) {
    const p = sorted[pi];
    const ps = getPS(p.prob);
    const topPts: { x: number; v: number }[] = [];
    const botPts: { x: number; v: number }[] = [];

    for (let di = 0; di < daily.length; di++) {
      if (di % sr !== 0 && di !== daily.length - 1) continue;
      const day = daily[di];
      let below = 0;
      for (let j = 0; j < pi; j++) {
        const sp = sorted[j];
        below +=
          new Date(sp.start).getTime() <= day.ms && new Date(sp.end).getTime() >= day.ms
            ? sp.seats
            : 0;
      }
      const on =
        new Date(p.start).getTime() <= day.ms && new Date(p.end).getTime() >= day.ms;
      const xPx = day.frac * timelineWidth;
      topPts.push({ x: xPx, v: below + (on ? p.seats : 0) });
      botPts.push({ x: xPx, v: below });
    }

    const fwd = topPts.map((pt) => `${pt.x},${100 - (pt.v / chartMax) * 100}`).join(" L");
    const rev = [...botPts]
      .reverse()
      .map((pt) => `${pt.x},${100 - (pt.v / chartMax) * 100}`)
      .join(" L");
    result.push({ projectId: p.id, style: ps, path: `M${fwd} L${rev} Z` });
  }

  return result;
}

// ─── Types ───

export interface OverlayBand {
  id: string;
  label: string;
  leftPx: number;
  widthPx: number;
  color: string;
}

interface DemandChartProps {
  active: FlatProject[];
  daily: DailyPoint[];
  gran: string;
  timelineWidth: number;
  chartMax: number;
  hovProj: string | null;
  selectedId: string | null;
  hoverData: DailyPoint | null;
  hoverX: number | null;
  todayPx: number;
  majorTicks: { px: number }[];
  overlayBands: OverlayBand[];
}

// ─── Component ───

export function DemandChart({
  active,
  daily,
  gran,
  timelineWidth,
  chartMax,
  hovProj,
  selectedId,
  hoverData,
  hoverX,
  todayPx,
  majorTicks,
  overlayBands,
}: DemandChartProps) {
  const layers = useMemo(
    () => buildLayers(active, daily, chartMax, timelineWidth, gran),
    [active, daily, chartMax, timelineWidth, gran]
  );

  const gridLines = useMemo(
    () => Array.from({ length: Math.floor(chartMax / 5) + 1 }, (_, i) => i * 5),
    [chartMax]
  );

  return (
    <div className="relative flex-1">
      <svg
        width={timelineWidth}
        height="100%"
        viewBox={`0 0 ${timelineWidth} 100`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {/* Grid lines */}
        {gridLines.map((v) => (
          <line
            key={`h-${v}`}
            x1="0"
            y1={100 - (v / chartMax) * 100}
            x2={timelineWidth}
            y2={100 - (v / chartMax) * 100}
            stroke="var(--border)"
            strokeWidth="0.3"
          />
        ))}
        {majorTicks.map((t, i) => (
          <line
            key={`v-${i}`}
            x1={t.px}
            y1="0"
            x2={t.px}
            y2="100"
            stroke="var(--border)"
            strokeWidth="0.3"
          />
        ))}

        {/* Timeline overlay bands */}
        {overlayBands.map((o) => (
          <g key={`ov-${o.id}`}>
            <rect x={o.leftPx} y={0} width={o.widthPx} height={100} fill={o.color} />
            <line x1={o.leftPx} y1={0} x2={o.leftPx} y2={100} stroke="rgba(255,255,255,0.12)" strokeWidth="0.3" strokeDasharray="2,1" />
            <line x1={o.leftPx + o.widthPx} y1={0} x2={o.leftPx + o.widthPx} y2={100} stroke="rgba(255,255,255,0.12)" strokeWidth="0.3" strokeDasharray="2,1" />
          </g>
        ))}

        {/* Stacked area layers */}
        {layers.map((layer) => (
          <path
            key={layer.projectId}
            d={layer.path}
            fill={layer.style.bar}
            fillOpacity={
              hovProj === layer.projectId || selectedId === layer.projectId ? 0.55 : 0.2
            }
            stroke={layer.style.bar}
            strokeWidth={
              hovProj === layer.projectId || selectedId === layer.projectId ? 0.8 : 0.3
            }
          />
        ))}

        {/* Supply line */}
        <line
          x1="0"
          y1={100 - (SUPPLY / chartMax) * 100}
          x2={timelineWidth}
          y2={100 - (SUPPLY / chartMax) * 100}
          stroke="#00E5FF"
          strokeWidth="0.6"
          strokeDasharray="2,1"
        />

        {/* Today marker */}
        <line
          x1={todayPx}
          y1="0"
          x2={todayPx}
          y2="100"
          stroke="var(--primary)"
          strokeWidth="0.5"
          strokeDasharray="1.5,1"
        />
      </svg>

      {/* Hover dot + gap badge */}
      {hoverX !== null && hoverData && (() => {
        const val = hoverData.raw;
        const pctY = (val / chartMax) * 100;
        const supY = (SUPPLY / chartMax) * 100;
        const gap = Math.round((val - SUPPLY) * 10) / 10;
        return (
          <>
            {/* Dot on demand curve */}
            <div
              className="pointer-events-none absolute z-[21]"
              style={{
                left: hoverX,
                bottom: `${pctY}%`,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#fff",
                border: "2px solid var(--primary)",
                transform: "translate(-50%, 50%)",
              }}
            />
            {/* Gap badge at supply line */}
            <div
              className="pointer-events-none absolute z-[22] whitespace-nowrap rounded-[10px] px-[7px] py-0.5 text-[11px] font-bold text-white"
              style={{
                left: hoverX,
                bottom: `${supY}%`,
                transform: "translate(-50%, 50%)",
                background: gap > 0 ? "#FF5252" : "#00E676",
              }}
            >
              {gap > 0 ? `\u2212${gap}` : `+${Math.abs(gap)}`}
            </div>
          </>
        );
      })()}

      {/* Supply label */}
      <div
        className="pointer-events-none absolute text-[10px] font-bold"
        style={{
          left: 8,
          bottom: `${(SUPPLY / chartMax) * 100}%`,
          transform: "translateY(50%)",
          color: "#00E5FF",
        }}
      >
        SUPPLY ({SUPPLY})
      </div>

      {/* Legend — overlaid at bottom-left so it doesn't eat chart height */}
      <div
        className="pointer-events-none absolute bottom-1 left-8 z-10 flex gap-2.5 rounded px-1.5 py-0.5"
        style={{ background: "rgba(28,33,39,0.8)" }}
      >
        <div className="flex items-center gap-1">
          <div className="h-0.5 w-3.5" style={{ background: "#00E5FF" }} />
          <span className="text-[10px] text-muted-foreground">Supply ({SUPPLY})</span>
        </div>
        {LEGEND_ITEMS.map(([label, color]) => (
          <div key={label} className="flex items-center gap-[3px]">
            <div className="h-[9px] w-[9px] rounded-sm opacity-80" style={{ background: color }} />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Label column Y-axis labels (exported for use in gantt-timeline) ───

export function DemandAxisLabels({ chartMax }: { chartMax: number }) {
  const gridLines = Array.from({ length: Math.floor(chartMax / 5) + 1 }, (_, i) => i * 5);
  return (
    <>
      {gridLines.map((v) => (
        <div
          key={v}
          className="absolute text-[11px] font-semibold text-muted-foreground"
          style={{
            right: 10,
            bottom: `${(v / chartMax) * 100}%`,
            transform: "translateY(50%)",
          }}
        >
          {v}
        </div>
      ))}
    </>
  );
}
