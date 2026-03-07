// Streams: Session cards and zoomable concurrency timeline.
"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@apollo/client/react";
import { STREAMS_QUERY } from "@/lib/graphql/queries";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { useGlobalFilters } from "@/hooks/use-global-filters";
import { PageFilterContext } from "@/lib/filter-dimensions";
import { streamsFilterConfig } from "./filter-config";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { Session } from "./types";
import {
  computeStreamKpis,
  computeSessionStatus,
  filterSessionsByTimestamp,
  groupSessionsByDeveloper,
  computeChartData,
  formatCost,
  formatTokensCompact,
} from "./streams-helpers";
import { formatDuration, formatTokens } from "./helpers";

// Developer colors for stacked area chart
const DEV_COLORS_HEX = ["#2D72D2", "#238551", "#EC9A3C", "#CD4246", "#00A396"];

function getDevColorHex(index: number): string {
  return DEV_COLORS_HEX[index % DEV_COLORS_HEX.length];
}

// Y-axis label area (px) — used for mouse-to-time conversion
const CHART_LEFT_PAD = 40;
const CHART_RIGHT_PAD = 10;
const MIN_VIEW_RANGE_MS = 30 * 60 * 1000; // 30 minutes minimum zoom

export default function StreamsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, loading, error, refetch } = useQuery<any>(STREAMS_QUERY);
  useRealtimeTable("agents", refetch);
  const { filters } = useGlobalFilters();
  const person = filters.person?.[0] ?? null;
  const project = filters.project?.[0] ?? null;

  const [now] = useState(() => Date.now());
  const [scrubberTime, setScrubberTime] = useState<number | null>(null);
  const [collapsedDevs, setCollapsedDevs] = useState<Set<string>>(new Set());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // View domain: the visible time window (null = default 7d)
  const [viewDomain, setViewDomain] = useState<{ min: number; max: number } | null>(null);
  const [activePreset, setActivePreset] = useState<"24h" | "7d" | "30d" | "all">("7d");

  // ── Data processing ─────────────────────────────────────

  // Apply global filters only (no date filtering — chart zoom controls visibility)
  const modelFilter = filters.model ?? [];
  const allSessions: Session[] = useMemo(() => {
    const raw: Session[] = data?.sessionTimeline ?? [];
    return raw.filter((s) => {
      if (person && s.developer?.name !== person) return false;
      if (project && s.sprint?.name !== project) return false;
      if (modelFilter.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sessionModel = (s as any).model as string | undefined;
        if (sessionModel) {
          const short = sessionModel.includes("opus")
            ? "opus"
            : sessionModel.includes("sonnet")
              ? "sonnet"
              : sessionModel.includes("haiku")
                ? "haiku"
                : sessionModel;
          if (!modelFilter.includes(short)) return false;
        }
      }
      return true;
    });
  }, [data, person, project, modelFilter]);

  // Chart data
  const chartData = useMemo(() => computeChartData(allSessions), [allSessions]);
  const developers = useMemo(() => {
    const devs = new Set<string>();
    for (const s of allSessions) devs.add(s.developer?.name ?? "unassigned");
    return Array.from(devs).sort();
  }, [allSessions]);

  // Full time range of all data
  const fullTimeRange = useMemo(() => {
    if (chartData.length === 0) return { min: now - 3600000, max: now };
    const times = chartData.map((d) => d.time);
    return { min: Math.min(...times), max: Math.max(...times) };
  }, [chartData, now]);

  // Effective view domain (uses state or defaults to last 7d)
  const effectiveDomain = useMemo(() => {
    if (viewDomain) return viewDomain;
    const weekAgo = now - 7 * 24 * 3600000;
    return {
      min: Math.max(fullTimeRange.min, weekAgo),
      max: fullTimeRange.max,
    };
  }, [viewDomain, fullTimeRange, now]);

  // Scrubber position
  const effectiveTime = scrubberTime ?? now;
  const isLive = scrubberTime === null;

  // Sessions within the current view domain (for cards below chart)
  const visibleSessions = useMemo(() => {
    if (!isLive) {
      return filterSessionsByTimestamp(allSessions, effectiveTime);
    }
    // In live mode, show sessions that overlap with the view domain
    return allSessions.filter((s) => {
      const startMs = new Date(s.startedAt).getTime();
      const endMs = s.endedAt ? new Date(s.endedAt).getTime() : now;
      return startMs <= effectiveDomain.max && endMs >= effectiveDomain.min;
    });
  }, [allSessions, effectiveTime, isLive, effectiveDomain, now]);

  // KPIs (always based on full session list)
  const kpis = useMemo(() => computeStreamKpis(allSessions, now), [allSessions, now]);

  // Groups
  const devGroups = useMemo(
    () => groupSessionsByDeveloper(visibleSessions),
    [visibleSessions]
  );

  // Toggle collapse
  const toggleDev = useCallback((dev: string) => {
    setCollapsedDevs((prev) => {
      const next = new Set(prev);
      if (next.has(dev)) next.delete(dev);
      else next.add(dev);
      return next;
    });
  }, []);

  // ── Chart interaction: zoom & pan ───────────────────────

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ x: number; domain: { min: number; max: number } } | null>(null);
  const didDragRef = useRef(false);

  // Store effectiveDomain in a ref so the wheel handler always has the latest
  const domainRef = useRef(effectiveDomain);
  domainRef.current = effectiveDomain;
  const fullRangeRef = useRef(fullTimeRange);
  fullRangeRef.current = fullTimeRange;

  // rAF-throttled domain updates — accumulate in ref, flush once per frame
  const pendingDomainRef = useRef<{ min: number; max: number } | null>(null);
  const rafIdRef = useRef<number>(0);

  const flushDomain = useCallback(() => {
    const d = pendingDomainRef.current;
    if (!d) return;
    pendingDomainRef.current = null;
    domainRef.current = d;
    setViewDomain(d);
    setActivePreset(detectPreset(d.min, d.max, fullRangeRef.current));
  }, []);

  const scheduleDomainUpdate = useCallback((d: { min: number; max: number }) => {
    // Update the ref immediately so subsequent events within the same frame
    // compound correctly (e.g. rapid wheel ticks)
    pendingDomainRef.current = d;
    domainRef.current = d;
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = 0;
        flushDomain();
      });
    }
  }, [flushDomain]);

  // Clean up rAF on unmount
  useEffect(() => () => { if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current); }, []);

  // Helper: mouse X → percentage of chart area
  const mouseToChartPct = useCallback((clientX: number): number => {
    if (!chartContainerRef.current) return 0.5;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const chartWidth = rect.width - CHART_LEFT_PAD - CHART_RIGHT_PAD;
    const x = clientX - rect.left - CHART_LEFT_PAD;
    return Math.max(0, Math.min(1, x / chartWidth));
  }, []);

  // Wheel: pinch-to-zoom + scroll to pan (rAF-throttled)
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      if (!el) return;
      const domain = domainRef.current;
      const full = fullRangeRef.current;
      const range = domain.max - domain.min;

      if (e.ctrlKey) {
        // Pinch gesture → zoom
        e.preventDefault();

        const intensity = Math.min(Math.abs(e.deltaY) * 0.004, 0.08);
        const zoomFactor = e.deltaY > 0 ? 1 + intensity : 1 / (1 + intensity);
        let newRange = range * zoomFactor;

        const fullRange = full.max - full.min;
        newRange = Math.max(MIN_VIEW_RANGE_MS, Math.min(newRange, fullRange));

        const rect = el.getBoundingClientRect();
        const chartWidth = rect.width - CHART_LEFT_PAD - CHART_RIGHT_PAD;
        const x = e.clientX - rect.left - CHART_LEFT_PAD;
        const pct = Math.max(0, Math.min(1, x / chartWidth));
        const cursorTime = domain.min + pct * range;

        let newMin = cursorTime - pct * newRange;
        let newMax = cursorTime + (1 - pct) * newRange;

        if (newMin < full.min) { newMin = full.min; newMax = newMin + newRange; }
        if (newMax > full.max) { newMax = full.max; newMin = newMax - newRange; }

        scheduleDomainUpdate({ min: newMin, max: newMax });
      } else {
        // Any scroll → pan (vertical scroll maps to horizontal pan)
        e.preventDefault();
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(delta) < 1) return;

        const rect = el.getBoundingClientRect();
        const chartWidth = rect.width - CHART_LEFT_PAD - CHART_RIGHT_PAD;
        const timeDelta = (delta / chartWidth) * range;

        let newMin = domain.min + timeDelta;
        let newMax = domain.max + timeDelta;

        if (newMin < full.min) { newMin = full.min; newMax = newMin + range; }
        if (newMax > full.max) { newMax = full.max; newMin = newMax - range; }

        scheduleDomainUpdate({ min: newMin, max: newMax });
      }
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Touch: single-finger drag to pan, pinch to zoom
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    let touchStartDomain: { min: number; max: number } | null = null;
    let lastTouchX: number | null = null;
    let initialPinchDist: number | null = null;
    let initialPinchRange: number | null = null;
    let initialPinchCenter: number | null = null;

    function touchDist(t1: Touch, t2: Touch) {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function handleTouchStart(e: TouchEvent) {
      const domain = domainRef.current;
      touchStartDomain = { ...domain };

      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        initialPinchDist = null;
      } else if (e.touches.length === 2) {
        initialPinchDist = touchDist(e.touches[0], e.touches[1]);
        initialPinchRange = domain.max - domain.min;
        initialPinchCenter = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        lastTouchX = null;
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (!el || !touchStartDomain) return;
      const full = fullRangeRef.current;
      const domain = domainRef.current;
      const range = domain.max - domain.min;

      if (e.touches.length === 1 && lastTouchX !== null) {
        // Single-finger drag → pan
        e.preventDefault();
        const dx = e.touches[0].clientX - lastTouchX;
        lastTouchX = e.touches[0].clientX;

        const rect = el.getBoundingClientRect();
        const chartWidth = rect.width - CHART_LEFT_PAD - CHART_RIGHT_PAD;
        const timeDelta = -(dx / chartWidth) * range;

        let newMin = domain.min + timeDelta;
        let newMax = domain.max + timeDelta;

        if (newMin < full.min) { newMin = full.min; newMax = newMin + range; }
        if (newMax > full.max) { newMax = full.max; newMin = newMax - range; }

        scheduleDomainUpdate({ min: newMin, max: newMax });
      } else if (
        e.touches.length === 2 &&
        initialPinchDist !== null &&
        initialPinchRange !== null &&
        initialPinchCenter !== null
      ) {
        // Pinch → zoom
        e.preventDefault();
        const dist = touchDist(e.touches[0], e.touches[1]);
        const scale = initialPinchDist / dist; // pinch out = smaller scale = zoom in
        let newRange = initialPinchRange * scale;

        const fullRange = full.max - full.min;
        newRange = Math.max(MIN_VIEW_RANGE_MS, Math.min(newRange, fullRange));

        // Anchor zoom around the pinch center
        const rect = el.getBoundingClientRect();
        const chartWidth = rect.width - CHART_LEFT_PAD - CHART_RIGHT_PAD;
        const x = initialPinchCenter - rect.left - CHART_LEFT_PAD;
        const pct = Math.max(0, Math.min(1, x / chartWidth));
        const cursorTime = touchStartDomain.min + pct * initialPinchRange;

        let newMin = cursorTime - pct * newRange;
        let newMax = cursorTime + (1 - pct) * newRange;

        if (newMin < full.min) { newMin = full.min; newMax = newMin + newRange; }
        if (newMax > full.max) { newMax = full.max; newMin = newMax - newRange; }

        scheduleDomainUpdate({ min: newMin, max: newMax });
      }
    }

    function handleTouchEnd() {
      lastTouchX = null;
      initialPinchDist = null;
      initialPinchRange = null;
      initialPinchCenter = null;
      touchStartDomain = null;
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  // Pan via drag
  const handleChartMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      panStartRef.current = {
        x: e.clientX,
        domain: { ...effectiveDomain },
      };
      didDragRef.current = false;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    [effectiveDomain]
  );

  const handleChartMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!panStartRef.current || !chartContainerRef.current) return;
      const rect = chartContainerRef.current.getBoundingClientRect();
      const chartWidth = rect.width - CHART_LEFT_PAD - CHART_RIGHT_PAD;
      const dx = e.clientX - panStartRef.current.x;

      if (Math.abs(dx) > 3) didDragRef.current = true;

      const range = panStartRef.current.domain.max - panStartRef.current.domain.min;
      const timeDelta = -(dx / chartWidth) * range;

      let newMin = panStartRef.current.domain.min + timeDelta;
      let newMax = panStartRef.current.domain.max + timeDelta;

      // Clamp to data bounds
      if (newMin < fullTimeRange.min) {
        newMin = fullTimeRange.min;
        newMax = newMin + range;
      }
      if (newMax > fullTimeRange.max) {
        newMax = fullTimeRange.max;
        newMin = newMax - range;
      }

      scheduleDomainUpdate({ min: newMin, max: newMax });
    },
    [fullTimeRange, scheduleDomainUpdate]
  );

  const handleChartMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      // If we didn't drag, treat as click → set scrubber
      if (!didDragRef.current && chartContainerRef.current) {
        const pct = mouseToChartPct(e.clientX);
        const t = effectiveDomain.min + pct * (effectiveDomain.max - effectiveDomain.min);
        setScrubberTime(t);
      }

      panStartRef.current = null;
    },
    [effectiveDomain, mouseToChartPct]
  );

  const handleChartMouseLeave = useCallback(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    panStartRef.current = null;
  }, []);

  const resetToLive = useCallback(() => {
    setScrubberTime(null);
  }, []);

  // ── Preset buttons ──────────────────────────────────────

  const setPresetRange = useCallback(
    (range: "24h" | "7d" | "30d" | "all") => {
      setActivePreset(range);
      if (range === "all") {
        setViewDomain(null);
        return;
      }
      const ms = { "24h": 24 * 3600000, "7d": 7 * 24 * 3600000, "30d": 30 * 24 * 3600000 };
      setViewDomain({
        min: Math.max(fullTimeRange.min, now - ms[range]),
        max: fullTimeRange.max,
      });
    },
    [now, fullTimeRange]
  );

  // ── Format chart time labels ────────────────────────────

  const viewSpansDays = useMemo(() => {
    const first = new Date(effectiveDomain.min);
    const last = new Date(effectiveDomain.max);
    return first.toDateString() !== last.toDateString();
  }, [effectiveDomain]);

  const formatChartTime = useCallback(
    (ts: number) => {
      const d = new Date(ts);
      if (viewSpansDays) {
        return d.toLocaleDateString([], { month: "short", day: "numeric" });
      }
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    },
    [viewSpansDays]
  );

  // ── Loading state ──────────────────────────────────────
  if (loading) {
    return (
      <PageFilterContext.Provider value={streamsFilterConfig}>
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Streams</h1>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-3 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
        <div className="rounded-md border border-border bg-card p-3 space-y-3">
          <Skeleton className="h-[200px] w-full" />
        </div>
      </div>
      </PageFilterContext.Provider>
    );
  }

  // ── Error state ────────────────────────────────────────
  if (error) {
    return (
      <PageFilterContext.Provider value={streamsFilterConfig}>
        <div className="flex items-center justify-center h-full text-destructive">
          {error.message}
        </div>
      </PageFilterContext.Provider>
    );
  }

  return (
    <PageFilterContext.Provider value={streamsFilterConfig}>
    <div className="space-y-4" data-testid="streams-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Streams</h1>
          {/* Date range presets */}
          <div className="flex items-center rounded-md border border-border bg-card overflow-hidden">
            {(["24h", "7d", "30d", "all"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setPresetRange(range)}
                className={`px-2 py-1 text-[11px] font-medium transition-colors ${
                  activePreset === range
                    ? "bg-[#2D72D2] text-white"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {range === "all" ? "All" : range.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {!isLive && (
          <button
            onClick={resetToLive}
            className="text-xs px-2 py-1 rounded bg-[#2D72D2] text-white hover:bg-[#2D72D2]/80 transition-colors"
          >
            Back to Live
          </button>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="Active Sessions"
          value={kpis.activeSessions}
          deltaType={kpis.activeSessions > 0 ? "positive" : "neutral"}
        />
        <KpiCard
          label="Online Developers"
          value={kpis.onlineDevs}
          deltaType={kpis.onlineDevs > 0 ? "positive" : "neutral"}
        />
        <KpiCard
          label="Total Tokens"
          value={formatTokensCompact(kpis.totalTokens)}
        />
        <KpiCard
          label="Total Cost"
          value={formatCost(kpis.totalCost)}
        />
      </div>

      {/* Stacked Area Chart — scroll to zoom, drag to pan, click to set scrubber */}
      <Card className="p-3 bg-card border-border overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sessions by Developer
            <span className="ml-2 font-normal normal-case">
              {(() => {
                const dMin = new Date(effectiveDomain.min);
                const dMax = new Date(effectiveDomain.max);
                const sameDay = dMin.toDateString() === dMax.toDateString();
                if (sameDay) {
                  // Same day: "Mar 4, 9:00 PM – 11:05 PM"
                  const datePart = dMin.toLocaleDateString([], { month: "short", day: "numeric" });
                  const timeMin = dMin.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                  const timeMax = dMax.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                  return `${datePart}, ${timeMin} \u2013 ${timeMax}`;
                }
                // Different days: "Feb 28 – Mar 4"
                return `${dMin.toLocaleDateString([], { month: "short", day: "numeric" })} \u2013 ${dMax.toLocaleDateString([], { month: "short", day: "numeric" })}`;
              })()}
            </span>
          </h3>
          <div className="flex items-center gap-2">
            {!isLive && (
              <span className="text-xs text-muted-foreground font-mono" data-mono>
                {new Date(effectiveTime).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            {isLive && (
              <span className="text-xs text-[#238551] font-semibold">LIVE</span>
            )}
          </div>
        </div>

        {allSessions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            No session data
          </p>
        ) : (
          <div className="relative">
            {/* Transparent overlay captures all gestures above the SVG */}
            <div
              ref={chartContainerRef}
              className="absolute inset-0 z-10 select-none cursor-grab active:cursor-grabbing"
              style={{ touchAction: "none" }}
              onMouseDown={handleChartMouseDown}
              onMouseUp={handleChartMouseUp}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            />
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={[effectiveDomain.min, effectiveDomain.max]}
                  tickFormatter={formatChartTime}
                  stroke="#738694"
                  tick={{ fontSize: 10 }}
                  axisLine={{ stroke: "#394048" }}
                  tickLine={{ stroke: "#394048" }}
                  allowDataOverflow
                />
                <YAxis
                  allowDecimals={false}
                  stroke="#738694"
                  tick={{ fontSize: 10 }}
                  axisLine={{ stroke: "#394048" }}
                  tickLine={{ stroke: "#394048" }}
                  width={30}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "#1C2127",
                    border: "1px solid #394048",
                    borderRadius: "2px",
                    fontSize: "11px",
                  }}
                  labelFormatter={(label) =>
                    new Date(Number(label)).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                />
                {developers.map((dev, i) => (
                  <Area
                    key={dev}
                    type="stepAfter"
                    dataKey={dev}
                    stackId="1"
                    stroke={getDevColorHex(i)}
                    fill={getDevColorHex(i)}
                    fillOpacity={0.6}
                  />
                ))}
                {/* Scrubber line */}
                <ReferenceLine
                  x={effectiveTime}
                  stroke={isLive ? "#238551" : "#EC9A3C"}
                  strokeWidth={2}
                  strokeDasharray={isLive ? undefined : "4 2"}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Developer legend + zoom hint */}
        <div className="flex items-center justify-between mt-2 px-1">
          {developers.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {developers.map((dev, i) => (
                <div key={dev} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: getDevColorHex(i) }}
                  />
                  <span className="text-[11px] text-muted-foreground">{dev}</span>
                </div>
              ))}
            </div>
          )}
          <span className="text-[10px] text-muted-foreground/50">
            Swipe to pan · Pinch to zoom
          </span>
        </div>
      </Card>

      {/* Session Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {isLive ? "Sessions in View" : "Sessions at Selected Time"}
          <span className="ml-2 text-foreground font-mono" data-mono>
            {visibleSessions.length}
          </span>
        </h3>

        {devGroups.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No sessions at this time.
          </p>
        )}

        {devGroups.map((group) => {
          const devIndex = developers.indexOf(group.developer);
          const isCollapsed = collapsedDevs.has(group.developer);

          return (
            <div key={group.developer}>
              {/* Developer header */}
              <button
                onClick={() => toggleDev(group.developer)}
                className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded hover:bg-[#2F343C] transition-colors"
              >
                <span
                  className="text-[10px]"
                  style={{ color: getDevColorHex(devIndex >= 0 ? devIndex : 0) }}
                >
                  {isCollapsed ? "\u25B6" : "\u25BC"}
                </span>
                <span className="text-xs font-semibold text-accent-foreground">
                  {group.developer}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono" data-mono>
                  {group.sessionCount} session{group.sessionCount !== 1 ? "s" : ""}
                </span>
              </button>

              {/* Session cards */}
              {!isCollapsed && (
                <div className="grid gap-2 pl-5 mt-1">
                  {group.sessions.map((session) => (
                    <SessionCard
                      key={session.sessionId}
                      session={session}
                      now={now}
                      isSelected={selectedSessionId === session.sessionId}
                      onClick={() => setSelectedSessionId(
                        selectedSessionId === session.sessionId ? null : session.sessionId
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .streams-pulse {
          animation: streamsPulse 2s ease-in-out infinite;
        }
        @keyframes streamsPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `,
        }}
      />
    </div>
    </PageFilterContext.Provider>
  );
}

// ── Helpers ────────────────────────────────────────────────

/** Detect which preset matches the current view domain (if any). */
function detectPreset(
  min: number,
  max: number,
  full: { min: number; max: number }
): "24h" | "7d" | "30d" | "all" {
  const range = max - min;
  const fullRange = full.max - full.min;
  const dayMs = 24 * 3600000;

  if (Math.abs(range - fullRange) < 3600000) return "all";
  if (Math.abs(range - dayMs) < 3600000) return "24h";
  if (Math.abs(range - 7 * dayMs) < dayMs) return "7d";
  if (Math.abs(range - 30 * dayMs) < 2 * dayMs) return "30d";
  // No preset matches — keep the last one but it won't highlight
  return "all";
}

// ── Session Card Component ───────────────────────────────

interface SessionCardProps {
  session: Session;
  now: number;
  isSelected: boolean;
  onClick: () => void;
}

function SessionCard({ session, now, isSelected, onClick }: SessionCardProps) {
  const status = computeSessionStatus(session, now);
  const inputTokens = session.totalInputTokens ?? 0;
  const outputTokens = session.totalOutputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const cost = inputTokens * 0.003 / 1000 + outputTokens * 0.015 / 1000;

  const statusColor =
    status === "ACTIVE"
      ? "#238551"
      : status === "IDLE"
        ? "#EC9A3C"
        : "#738694";

  const statusBg =
    status === "ACTIVE"
      ? "rgba(35, 133, 81, 0.15)"
      : status === "IDLE"
        ? "rgba(236, 154, 60, 0.15)"
        : "rgba(115, 134, 148, 0.1)";

  // Recent tool badges (show skill name and model)
  const badges: { label: string; color: string }[] = [];
  if (session.skillName) {
    badges.push({ label: session.skillName, color: "#2D72D2" });
  }
  if (session.model) {
    const short = session.model.includes("opus")
      ? "opus"
      : session.model.includes("sonnet")
        ? "sonnet"
        : session.model.includes("haiku")
          ? "haiku"
          : session.model.split("-").slice(-1)[0];
    badges.push({ label: short, color: "#738694" });
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded border p-3 transition-colors ${
        isSelected
          ? "border-[#2D72D2] bg-[#2D72D2]/10"
          : "border-border bg-card hover:bg-[#2F343C]"
      } ${status === "ACTIVE" ? "streams-pulse" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Sprint / Task # */}
          {session.sprint?.name && session.taskNum != null && (
            <span className="text-[10px] font-mono text-muted-foreground" data-mono>
              {session.sprint?.name} #{session.taskNum}
            </span>
          )}
          {/* Task title */}
          <div className="text-xs font-semibold text-foreground truncate mt-0.5">
            {session.taskTitle ?? session.sessionId.slice(0, 12)}
          </div>
        </div>

        {/* Status badge */}
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
          style={{ color: statusColor, backgroundColor: statusBg }}
        >
          {status}
        </span>
      </div>

      {/* Duration + Tokens + Cost row */}
      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
        <span className="font-mono" data-mono>
          {formatDuration(session.durationMinutes)}
        </span>
        <span className="font-mono" data-mono>
          {formatTokens(totalTokens)} tok
        </span>
        <span className="font-mono" data-mono>
          {formatCost(cost)}
        </span>
        {(session.toolCallCount ?? 0) > 0 && (
          <span className="font-mono" data-mono>
            {session.toolCallCount} tools
          </span>
        )}
      </div>

      {/* Tool badges */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {badges.map((b) => (
            <span
              key={b.label}
              className="text-[9px] px-1.5 py-0.5 rounded font-mono"
              style={{
                backgroundColor: `${b.color}20`,
                color: b.color,
              }}
              data-mono
            >
              {b.label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
