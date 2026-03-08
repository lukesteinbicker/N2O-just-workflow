"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import type { DailyPoint, Tick } from "./capacity-data";
import {
  getPS,
  getTicks,
  GRANS,
  ROW_H,
  ROW_GAP,
  LABEL_W_DEFAULT,
  SUPPLY,
  LEAD_CEIL,
  T_START,
  T_END,
  T_MS,
} from "./capacity-utils";
import { DemandChart, DemandAxisLabels } from "./demand-chart";
import type { FlatProject } from "./project-sidebar";

// ─── Tick labels row ───

function TickLabels({ ticks, bottom }: { ticks: Tick[]; bottom: boolean }) {
  return (
    <div className="relative h-6">
      {ticks
        .filter((t) => t.label)
        .map((t, i) => (
          <div
            key={`${bottom ? "b" : "t"}-${i}`}
            className="absolute whitespace-nowrap"
            style={{
              left: t.px,
              fontSize: t.isMonth ? 12 : 11,
              fontWeight: t.isMonth ? 700 : 500,
              color: t.isMonth ? "var(--muted-foreground)" : "var(--muted-foreground)",
              borderLeft: t.isMonth
                ? "1px solid var(--border)"
                : "1px solid rgba(74,91,108,0.3)",
              paddingLeft: 5,
              ...(bottom
                ? { top: 0, paddingTop: 4 }
                : { bottom: 0, paddingBottom: 4 }),
            }}
          >
            {t.label}
          </div>
        ))}
    </div>
  );
}

// ─── Types ───

interface GanttTimelineProps {
  active: FlatProject[];
  daily: DailyPoint[];
  gran: string;
  hovProj: string | null;
  selectedId: string | null;
  hoverData: DailyPoint | null;
  onHoverChange: (data: DailyPoint | null, x: number | null) => void;
  onSetHovProj: (id: string | null) => void;
}

// ─── Component ───

export function GanttTimeline({
  active,
  daily,
  gran,
  hovProj,
  selectedId,
  hoverData,
  onHoverChange,
  onSetHovProj,
}: GanttTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const [containerW, setContainerW] = useState(800);
  const [labelW, setLabelW] = useState(LABEL_W_DEFAULT);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // Resize observer
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) setContainerW(containerRef.current.clientWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Timeline width
  const totalDays = (T_END.getTime() - T_START.getTime()) / 864e5;
  const ppd = GRANS.find((g) => g.key === gran)!.ppd;
  const timelineWidth = useMemo(
    () => Math.max(containerW - 4, totalDays * ppd),
    [containerW, totalDays, ppd]
  );

  // Ticks
  const ticks = useMemo(() => getTicks(gran, timelineWidth), [gran, timelineWidth]);
  const majorTicks = useMemo(() => ticks.filter((t) => t.isMonth), [ticks]);

  // Chart scaling
  const maxD = Math.max(...daily.map((d) => d.raw), SUPPLY + 2);
  const chartMax = Math.ceil(maxD / 5) * 5 + 2;

  // Today marker
  const todayPx = ((Date.now() - T_START.getTime()) / T_MS) * timelineWidth;

  // Find nearest daily point
  const findNearest = useCallback(
    (frac: number) => {
      let best = daily[0];
      let bd = Infinity;
      for (const d of daily) {
        const dist = Math.abs(d.frac - frac);
        if (dist < bd) {
          bd = dist;
          best = d;
        }
      }
      return best;
    },
    [daily]
  );

  // Hover handler
  const onHover = useCallback(
    (e: React.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setHoverX(x);
      onHoverChange(findNearest(Math.max(0, Math.min(1, x / timelineWidth))), x);
    },
    [timelineWidth, findNearest, onHoverChange]
  );

  const clearHover = useCallback(() => {
    setHoverX(null);
    onHoverChange(null, null);
  }, [onHoverChange]);

  // Scroll to today on mount / gran change
  useEffect(() => {
    if (!scrollRef.current) return;
    const tp = ((Date.now() - T_START.getTime()) / T_MS) * timelineWidth;
    scrollRef.current.scrollLeft = Math.max(0, tp - scrollRef.current.clientWidth * 0.25);
  }, [gran, timelineWidth]);

  // Label column drag
  const startLabelDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const startX = e.clientX;
      const startW = labelW;
      const onMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const delta = ev.clientX - startX;
        setLabelW(Math.max(80, Math.min(300, startW + delta)));
      };
      const onUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [labelW]
  );

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden min-w-0">
      {/* ─── Label column ─── */}
      <div
        className="relative flex shrink-0 flex-col"
        style={{ width: labelW, minWidth: labelW }}
      >
        <div className="shrink-0">
          {/* TIMELINE header */}
          <div className="flex h-7 items-end pb-0.5 pl-3">
            <span className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground">
              TIMELINE
            </span>
          </div>
          {/* Project labels */}
          {active.map((p) => {
            const hov = hovProj === p.id;
            const atCross = hoverData
              ? new Date(p.start) <= hoverData.date && new Date(p.end) >= hoverData.date
              : false;
            return (
              <div
                key={p.id}
                className="flex items-center pl-3 pr-2.5"
                style={{ height: ROW_H, marginBottom: ROW_GAP }}
              >
                <span
                  className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold transition-colors duration-100"
                  style={{
                    color: hov
                      ? "#fff"
                      : atCross
                        ? "var(--foreground)"
                        : "var(--muted-foreground)",
                  }}
                >
                  {p.name}
                </span>
              </div>
            );
          })}
          <div className="h-5" />
        </div>

        {/* Separator */}
        <div className="h-5 border-t border-border" />

        {/* DEMAND label + axis */}
        <div className="relative flex-1 min-h-[180px]">
          <div className="pl-3 pt-1.5">
            <span className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground">
              DEMAND
            </span>
          </div>
          <DemandAxisLabels chartMax={chartMax} />
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={startLabelDrag}
          className="absolute inset-y-0 -right-[3px] z-10 flex w-1.5 cursor-col-resize items-center justify-center"
        >
          <div className="h-full w-px bg-border transition-colors hover:bg-primary" />
        </div>
      </div>

      {/* ─── Scrollable timeline ─── */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin">
        <div
          ref={timelineRef}
          onMouseMove={onHover}
          onMouseLeave={clearHover}
          className="relative flex min-h-full cursor-crosshair flex-col"
          style={{ width: timelineWidth }}
        >
          {/* Crosshair */}
          {hoverX !== null && (
            <div
              className="pointer-events-none absolute inset-y-0 z-20"
              style={{ left: hoverX, width: 1, background: "rgba(255,255,255,0.4)" }}
            />
          )}

          {/* ─── Gantt bars ─── */}
          <div className="shrink-0">
            {/* Top tick labels */}
            <div className="flex h-7 items-end">
              <TickLabels ticks={ticks} bottom={false} />
            </div>

            {/* Project bars */}
            {active.map((p) => {
              const ps = getPS(p.prob);
              const lPx = Math.max(
                0,
                ((new Date(p.start).getTime() - T_START.getTime()) / T_MS) * timelineWidth
              );
              const rPx = Math.min(
                timelineWidth,
                ((new Date(p.end).getTime() - T_START.getTime()) / T_MS) * timelineWidth
              );
              const wPx = rPx - lPx;
              const hov = hovProj === p.id;
              const atCross = hoverData
                ? new Date(p.start) <= hoverData.date && new Date(p.end) >= hoverData.date
                : false;
              const lit = hov || atCross || selectedId === p.id;

              return (
                <div
                  key={p.id}
                  className="relative"
                  style={{ height: ROW_H, marginBottom: ROW_GAP }}
                  onMouseEnter={() => onSetHovProj(p.id)}
                  onMouseLeave={() => onSetHovProj(null)}
                >
                  {/* Month grid lines */}
                  {majorTicks.map((t, i) => (
                    <div
                      key={i}
                      className="absolute inset-y-0 border-l border-border opacity-25"
                      style={{ left: t.px }}
                    />
                  ))}
                  {/* Today marker */}
                  <div
                    className="absolute inset-y-0 z-[2] border-l-2 border-dashed border-primary opacity-35"
                    style={{ left: todayPx }}
                  />
                  {/* Bar */}
                  <div
                    className="absolute flex items-center justify-center overflow-hidden rounded transition-colors duration-100"
                    style={{
                      left: lPx,
                      width: Math.max(wPx, 4),
                      top: 3,
                      bottom: 3,
                      background: lit ? ps.bar : ps.bg,
                      border: `1.5px solid ${ps.bar}`,
                      boxShadow: hov ? `0 0 14px ${ps.bar}50` : "none",
                      opacity: lit ? 1 : 0.85,
                    }}
                  >
                    {wPx > 60 && (
                      <span
                        className="whitespace-nowrap text-[11px] font-bold"
                        style={{ color: lit ? "#000" : ps.bar }}
                      >
                        {p.seats}s &middot; {p.prob}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Lead bandwidth label */}
            <div className="relative h-5">
              <div className="absolute inset-x-0 top-2.5 border-t border-dashed border-muted-foreground opacity-30" />
              <div className="absolute right-2 top-[13px] text-[10px] font-semibold text-muted-foreground">
                LEAD BANDWIDTH: {LEAD_CEIL} PROJECTS
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="h-5 border-t border-border" />

          {/* ─── Demand chart ─── */}
          <DemandChart
            active={active}
            daily={daily}
            gran={gran}
            timelineWidth={timelineWidth}
            chartMax={chartMax}
            hovProj={hovProj}
            selectedId={selectedId}
            hoverData={hoverData}
            hoverX={hoverX}
            todayPx={todayPx}
            majorTicks={majorTicks}
          />

          {/* Bottom tick labels */}
          <TickLabels ticks={ticks} bottom={true} />
        </div>
      </div>
    </div>
  );
}
