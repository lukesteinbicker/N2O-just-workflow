"use client";

import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from "react";

// SSR-safe useLayoutEffect (avoids warning during server render)
const useBrowserLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import type { DailyPoint, Tick } from "./capacity-data";
import { DATA } from "./capacity-data";
import {
  getPS,
  getTicks,
  GRANS,
  ROW_H,
  ROW_GAP,
  LABEL_W_DEFAULT,
  SUPPLY,
  T_START,
  T_END,
  T_MS,
} from "./capacity-utils";
import { DemandChart, DemandAxisLabels, type OverlayBand } from "./demand-chart";
import type { FlatProject } from "./project-sidebar";

// Fixed height for the demand section (chart + legend + bottom ticks)
const DEMAND_H = 250;
// Separator height (thin border only — no gap between gantt and demand)
const SEP_H = 0;

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
  hovCompany: string | null;
  selectedId: string | null;
  hoverData: DailyPoint | null;
  onHoverChange: (data: DailyPoint | null, x: number | null) => void;
  onSetHovProj: (id: string | null) => void;
  onSelectProject: (pid: string) => void;
}

// ─── Component ───

export function GanttTimeline({
  active,
  daily,
  gran,
  hovProj,
  hovCompany,
  selectedId,
  hoverData,
  onHoverChange,
  onSetHovProj,
  onSelectProject,
}: GanttTimelineProps) {
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const demandScrollRef = useRef<HTMLDivElement>(null);
  const labelScrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const [labelW, setLabelW] = useState(LABEL_W_DEFAULT);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [scrollX, setScrollX] = useState(0);
  const [scrollViewW, setScrollViewW] = useState(0);
  // Defer Date.now() to avoid SSR/client hydration mismatch
  const [now, setNow] = useState(T_START.getTime());

  // Measure gantt scroll container before first paint (prevents flash)
  useBrowserLayoutEffect(() => {
    const el = ganttScrollRef.current;
    if (!el) return;
    setScrollViewW(el.clientWidth);
    setNow(Date.now());
  }, []);

  // Track gantt scroll container size changes (window resize, detail panel open/close)
  useEffect(() => {
    const el = ganttScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScrollViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track horizontal scroll position for label centering
  useEffect(() => {
    const el = ganttScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setScrollX(el.scrollLeft);
      setScrollViewW(el.clientWidth);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // ─── Scroll sync: gantt vertical ↔ label column vertical ───
  useEffect(() => {
    const gantt = ganttScrollRef.current;
    const label = labelScrollRef.current;
    if (!gantt || !label) return;
    let source: "gantt" | "label" | null = null;
    const syncFromGantt = () => {
      if (source === "label") return;
      source = "gantt";
      label.scrollTop = gantt.scrollTop;
      requestAnimationFrame(() => { source = null; });
    };
    const syncFromLabel = () => {
      if (source === "gantt") return;
      source = "label";
      gantt.scrollTop = label.scrollTop;
      requestAnimationFrame(() => { source = null; });
    };
    gantt.addEventListener("scroll", syncFromGantt, { passive: true });
    label.addEventListener("scroll", syncFromLabel, { passive: true });
    return () => {
      gantt.removeEventListener("scroll", syncFromGantt);
      label.removeEventListener("scroll", syncFromLabel);
    };
  }, []);

  // ─── Scroll sync: gantt horizontal ↔ demand horizontal ───
  useEffect(() => {
    const gantt = ganttScrollRef.current;
    const demand = demandScrollRef.current;
    if (!gantt || !demand) return;
    let source: "gantt" | "demand" | null = null;
    const syncFromGantt = () => {
      if (source === "demand") return;
      source = "gantt";
      demand.scrollLeft = gantt.scrollLeft;
      requestAnimationFrame(() => { source = null; });
    };
    const syncFromDemand = () => {
      if (source === "gantt") return;
      source = "demand";
      gantt.scrollLeft = demand.scrollLeft;
      requestAnimationFrame(() => { source = null; });
    };
    gantt.addEventListener("scroll", syncFromGantt, { passive: true });
    demand.addEventListener("scroll", syncFromDemand, { passive: true });
    return () => {
      gantt.removeEventListener("scroll", syncFromGantt);
      demand.removeEventListener("scroll", syncFromDemand);
    };
  }, []);


  // Timeline width
  const totalDays = (T_END.getTime() - T_START.getTime()) / 864e5;
  const ppd = GRANS.find((g) => g.key === gran)!.ppd;
  const timelineWidth = useMemo(
    () => Math.max(scrollViewW || 800, totalDays * ppd),
    [scrollViewW, totalDays, ppd]
  );

  // Ticks
  const ticks = useMemo(() => getTicks(gran, timelineWidth), [gran, timelineWidth]);
  const majorTicks = useMemo(() => ticks.filter((t) => t.isMonth), [ticks]);

  // Chart scaling
  const maxD = Math.max(...daily.map((d) => d.raw), SUPPLY + 2);
  const chartMax = Math.ceil(maxD / 5) * 5;

  // Today marker (uses deferred `now` to avoid hydration mismatch)
  const todayPx = ((now - T_START.getTime()) / T_MS) * timelineWidth;

  // Timeline overlay bands (finals, summer break, etc.)
  const overlayBands = useMemo<OverlayBand[]>(() => {
    return (DATA.overlays || []).map((o) => {
      const l = Math.max(0, ((new Date(o.start).getTime() - T_START.getTime()) / T_MS) * timelineWidth);
      const r = Math.min(timelineWidth, ((new Date(o.end).getTime() - T_START.getTime()) / T_MS) * timelineWidth);
      return {
        id: o.id,
        label: o.label,
        leftPx: l,
        widthPx: r - l,
        color: o.color || "rgba(255,255,255,0.05)",
      };
    });
  }, [timelineWidth]);

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

  // Hover handler — uses e.currentTarget bounding rect (works for both sections)
  const onHover = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
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

  // Scroll to today on mount / gran change (skip until measured)
  useEffect(() => {
    if (!ganttScrollRef.current || scrollViewW === 0) return;
    const tp = ((Date.now() - T_START.getTime()) / T_MS) * timelineWidth;
    ganttScrollRef.current.scrollLeft = Math.max(0, tp - ganttScrollRef.current.clientWidth * 0.25);
    if (demandScrollRef.current) {
      demandScrollRef.current.scrollLeft = ganttScrollRef.current.scrollLeft;
    }
  }, [gran, timelineWidth, scrollViewW]);

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
    <div className="flex flex-1 overflow-hidden min-w-0">
      {/* ─── Label column ─── */}
      <div
        className="relative shrink-0 flex flex-col"
        style={{ width: labelW, minWidth: labelW }}
      >
        {/* Gantt labels — synced with gantt scroll vertical */}
        <div
          ref={labelScrollRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-none"
          style={{ overscrollBehavior: "none" }}
        >
          {/* Spacer to align with tick labels row — sticky to match gantt header */}
          <div className="sticky top-0 z-10 h-7 bg-[#1C2127]" />
          {/* Project labels */}
          {active.map((p) => {
            const hov = hovProj === p.id;
            const companyHov = hovCompany === p.companyId;
            const atCross = hoverData
              ? new Date(p.start) <= hoverData.date && new Date(p.end) >= hoverData.date
              : false;
            return (
              <div
                key={p.id}
                className="flex cursor-pointer items-center pl-3 pr-2.5"
                style={{ height: ROW_H, marginBottom: ROW_GAP }}
                onMouseEnter={() => onSetHovProj(p.id)}
                onMouseLeave={() => onSetHovProj(null)}
                onClick={() => onSelectProject(p.id)}
              >
                <span
                  className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold transition-colors duration-100"
                  style={{
                    color: hov || companyHov
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
        <div className="shrink-0 border-t border-border" style={{ height: SEP_H }} />

        {/* Demand axis — flex layout matches chart column (chart area + tick labels) */}
        <div className="flex flex-col shrink-0" style={{ height: DEMAND_H }}>
          <div className="relative flex-1">
            <DemandAxisLabels chartMax={chartMax} />
          </div>
          {/* Spacer matching bottom tick labels */}
          <div className="relative h-6 shrink-0" />
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={startLabelDrag}
          className="absolute inset-y-0 -right-[3px] z-10 flex w-1.5 cursor-col-resize items-center justify-center"
        >
          <div className="h-full w-px bg-border transition-colors hover:bg-primary" />
        </div>
      </div>

      {/* ─── Content column (relative container for absolute-positioned scroll areas) ─── */}
      <div className="relative flex-1">

        {/* Gantt scroll — absolutely positioned, fills from top to separator */}
        <div
          ref={ganttScrollRef}
          className="absolute inset-x-0 top-0 overflow-auto scrollbar-thin"
          style={{ bottom: DEMAND_H + SEP_H, overscrollBehavior: "none" }}
        >
          <div
            onMouseMove={onHover}
            onMouseLeave={clearHover}
            className="relative cursor-crosshair"
            style={{ width: timelineWidth }}
          >
            {/* Crosshair */}
            {hoverX !== null && (
              <div
                className="pointer-events-none absolute inset-y-0 z-20"
                style={{ left: hoverX, width: 1, background: "rgba(255,255,255,0.4)" }}
              />
            )}

            {/* Timeline overlay bands */}
            {overlayBands.map((o) => (
              <div
                key={`ov-${o.id}`}
                className="absolute top-0 bottom-0 pointer-events-none z-[1]"
                style={{
                  left: o.leftPx,
                  width: o.widthPx,
                  background: o.color,
                  borderLeft: "1px dashed rgba(255,255,255,0.1)",
                  borderRight: "1px dashed rgba(255,255,255,0.1)",
                }}
              >
                <div className="sticky top-8 px-1.5 py-0.5" style={{ width: "fit-content" }}>
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wider"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    {o.label}
                  </span>
                </div>
              </div>
            ))}

            {/* Top tick labels — sticky so they stay visible while scrolling */}
            <div className="sticky top-0 z-10 flex h-7 items-end" style={{ background: '#1C2127' }}>
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
              const companyHov = hovCompany === p.companyId;
              const atCross = hoverData
                ? new Date(p.start) <= hoverData.date && new Date(p.end) >= hoverData.date
                : false;
              const lit = hov || companyHov || atCross || selectedId === p.id;

              return (
                <div
                  key={p.id}
                  className="relative"
                  style={{ height: ROW_H, marginBottom: ROW_GAP }}
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
                  {(() => {
                    const visL = Math.max(lPx, scrollX);
                    const visR = Math.min(lPx + wPx, scrollX + scrollViewW);
                    const visCenter = (visL + visR) / 2;
                    const labelOff = Math.max(35, Math.min(wPx - 35, visCenter - lPx));

                    return (
                      <div
                        className="absolute overflow-hidden rounded cursor-pointer transition-colors duration-100"
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
                        onMouseEnter={() => onSetHovProj(p.id)}
                        onMouseLeave={() => onSetHovProj(null)}
                        onClick={() => onSelectProject(p.id)}
                      >
                        {wPx > 60 && (
                          <span
                            className="absolute top-1/2 whitespace-nowrap text-[11px] font-bold"
                            style={{
                              color: lit ? "#000" : ps.bar,
                              left: labelOff,
                              transform: "translate(-50%, -50%)",
                            }}
                          >
                            {p.seats}s &middot; {p.prob}%
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

          </div>
        </div>

        {/* Separator — absolutely positioned between gantt and demand */}
        <div
          className="absolute inset-x-0 border-t border-border"
          style={{ bottom: DEMAND_H, height: SEP_H }}
        />

        {/* Demand scroll — absolutely positioned at bottom */}
        <div
          ref={demandScrollRef}
          className="absolute inset-x-0 bottom-0 overflow-x-auto overflow-y-hidden scrollbar-thin"
          style={{ height: DEMAND_H }}
        >
          <div
            onMouseMove={onHover}
            onMouseLeave={clearHover}
            className="relative flex h-full cursor-crosshair flex-col"
            style={{ width: timelineWidth }}
          >
            {/* Crosshair */}
            {hoverX !== null && (
              <div
                className="pointer-events-none absolute inset-y-0 z-20"
                style={{ left: hoverX, width: 1, background: "rgba(255,255,255,0.4)" }}
              />
            )}

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
              overlayBands={overlayBands}
            />

            {/* Bottom tick labels */}
            <TickLabels ticks={ticks} bottom={true} />
          </div>
        </div>
      </div>
    </div>
  );
}
