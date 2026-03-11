"use client";

import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { EntryDetailPanel } from "./entry-detail-panel";
import {
  formatDateKey,
  formatTimeShort,
  formatHours,
  layoutOverlappingEntries,
  type LayoutEntry,
} from "./utils";
import type {
  TimeEntry,
  TimeTrackingMember,
  TimeTrackingProject,
  TimeTrackingTag,
} from "../use-time-tracking-data";

// ---------- CalendarDayColumn ----------

function CalendarDayColumn({
  dateKey,
  dayEntries,
  members,
  memberColors,
  isToday,
  nowTopPx,
  selectedEntry,
  onEntryClick,
}: {
  dateKey: string;
  dayEntries: Record<number, TimeEntry[]>;
  members: TimeTrackingMember[];
  memberColors: Record<number, string>;
  isToday: boolean;
  nowTopPx: number;
  selectedEntry: LayoutEntry | null;
  onEntryClick: (entry: LayoutEntry) => void;
}) {
  const laidOut = layoutOverlappingEntries(dayEntries, members, memberColors);
  const hours: number[] = [];
  for (let h = 0; h <= 23; h++) hours.push(h);

  return (
    <div
      className="relative flex-1 border-l border-[#2a2f3a]"
      style={{
        minHeight: 1152,
        ...(isToday ? { background: "rgba(92, 107, 192, 0.05)" } : {}),
      }}
    >
      {/* Hour grid lines */}
      {hours.map((h) => (
        <div
          key={h}
          className="border-b border-[#1e2330]"
          style={{ height: 48 }}
        />
      ))}

      {/* Entries */}
      {laidOut.map((entry, idx) => {
        const topPx = (entry.startMin / 60) * 48;
        const heightPx = Math.max((entry.seconds / 3600) * 48, 20);
        const leftPct = (entry.column / entry.totalColumns) * 100;
        const widthPct = (1 / entry.totalColumns) * 100;
        const isSelected =
          selectedEntry &&
          selectedEntry.start === entry.start &&
          selectedEntry.uid === entry.uid;
        return (
          <div
            key={`${entry.uid}-${idx}`}
            onClick={() => onEntryClick(entry)}
            className="absolute cursor-pointer rounded border-l-[3px] px-1 py-0.5 overflow-hidden text-ellipsis"
            style={{
              top: topPx,
              height: heightPx,
              left: `calc(${leftPct}% + 1px)`,
              width: `calc(${widthPct}% - 2px)`,
              minWidth: 28,
              borderLeftColor: entry.color,
              background: isSelected
                ? entry.color + "40"
                : entry.color + "15",
              boxShadow: isSelected
                ? `0 0 0 1px ${entry.color}80`
                : "none",
              ...(entry.isRunning
                ? {
                    borderBottom: "2px solid #4caf50",
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    zIndex: 11,
                    boxShadow:
                      "0 0 0 1.5px rgba(76,175,80,0.6), 0 0 6px rgba(76,175,80,0.2)",
                  }
                : {}),
            }}
            title={`${entry.member?.name}: ${entry.description}\n${formatTimeShort(entry.start)}${entry.isRunning ? " - running" : ` - ${formatHours(entry.seconds)}h`}`}
          >
            <div className="text-[9px] font-medium text-[#e0e0e0] truncate">
              {entry.member?.name?.split(" ")[0]}
            </div>
            <div className="text-[8px] text-[#8a8f9a] truncate">
              {entry.description || "No description"}
            </div>
            {heightPx > 28 && (
              <div className="text-[8px] text-[#5a5f6a] tabular-nums">
                {formatTimeShort(entry.start)}
              </div>
            )}
          </div>
        );
      })}

      {/* Current time indicator */}
      {isToday && (
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{ top: nowTopPx, zIndex: 10 }}
        >
          <div className="absolute -left-[3px] -top-1 w-2 h-2 rounded-full bg-[#ef5350]" />
          <div className="h-0.5 bg-[#ef5350] w-full" />
        </div>
      )}
    </div>
  );
}

// ---------- WeekCalendarView ----------

interface WeekCalendarViewProps {
  entries: TimeEntry[];
  members: TimeTrackingMember[];
  memberColors: Record<number, string>;
  dateRange: { start: Date; end: Date };
  projects: TimeTrackingProject[];
  tags: TimeTrackingTag[];
}

export function WeekCalendarView({
  entries,
  members,
  memberColors,
  dateRange,
  projects,
  tags,
}: WeekCalendarViewProps) {
  const [dayCount, setDayCount] = useState(7);
  const [weekStart, setWeekStart] = useState(() => {
    const s = new Date();
    const dow = s.getDay();
    s.setDate(s.getDate() - (dow === 0 ? 6 : dow - 1));
    s.setHours(0, 0, 0, 0);
    return s;
  });
  const [selectedEntry, setSelectedEntry] = useState<LayoutEntry | null>(null);

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

  // Generate visible days
  const visibleDays = useMemo(() => {
    const days: Date[] = [];
    const d = new Date(weekStart);
    for (let i = 0; i < dayCount; i++) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [weekStart, dayCount]);

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hours: number[] = [];
  for (let h = 0; h <= 23; h++) hours.push(h);

  const today = new Date();
  const isToday = (d: Date) => d.toDateString() === today.toDateString();
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const nowTopPx = (nowMinutes / 60) * 48;
  const nowLabel = today.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const handlePrev = useCallback(() => {
    setWeekStart((s) => {
      const n = new Date(s);
      n.setDate(n.getDate() - dayCount);
      return n;
    });
    setSelectedEntry(null);
  }, [dayCount]);

  const handleNext = useCallback(() => {
    setWeekStart((s) => {
      const n = new Date(s);
      n.setDate(n.getDate() + dayCount);
      return n;
    });
    setSelectedEntry(null);
  }, [dayCount]);

  const handleToday = useCallback(() => {
    const s = new Date();
    const dow = s.getDay();
    s.setDate(s.getDate() - (dow === 0 ? 6 : dow - 1));
    s.setHours(0, 0, 0, 0);
    setWeekStart(s);
    setSelectedEntry(null);
  }, []);

  const handleEntryClick = useCallback((entry: LayoutEntry) => {
    setSelectedEntry((prev) =>
      prev && prev.start === entry.start && prev.uid === entry.uid
        ? null
        : entry,
    );
  }, []);

  return (
    <div className="flex">
      <div className="flex-1 min-w-0">
        {/* Navigation bar */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            {[1, 3, 7, 14].map((dc) => (
              <button
                key={dc}
                onClick={() => setDayCount(dc)}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${
                  dayCount === dc
                    ? "bg-[rgba(92,107,192,0.2)] text-[#b0b8ff] border border-[rgba(92,107,192,0.4)]"
                    : "text-[#8a8f9a] hover:text-[#b0b0b0]"
                }`}
              >
                {dc}d
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              className="px-2 py-1 text-xs text-[#8a8f9a] hover:text-[#e0e0e0] transition-colors"
            >
              ←
            </button>
            <button
              onClick={handleToday}
              className="px-2 py-1 text-xs text-[#5c6bc0] hover:text-[#b0b8ff] transition-colors"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="px-2 py-1 text-xs text-[#8a8f9a] hover:text-[#e0e0e0] transition-colors"
            >
              →
            </button>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="border border-[#2a2f3a] rounded overflow-hidden">
          {/* Day headers */}
          <div className="flex bg-[#12151c] border-b border-[#2a2f3a]">
            <div className="w-[60px] shrink-0" />
            {visibleDays.map((day) => (
              <div
                key={formatDateKey(day)}
                className="flex-1 py-1.5 text-center border-l border-[#2a2f3a]"
              >
                <span
                  className="text-xs"
                  style={{
                    color: isToday(day) ? "#5c6bc0" : "#8a8f9a",
                    fontWeight: isToday(day) ? 600 : 400,
                  }}
                >
                  {dayNames[day.getDay()]} {day.getDate()}
                </span>
              </div>
            ))}
          </div>

          {/* Time grid + day columns */}
          <div className="flex overflow-y-auto" style={{ maxHeight: "70vh" }}>
            {/* Hour labels */}
            <div className="w-[60px] shrink-0 relative" style={{ minHeight: 1152 }}>
              {hours
                .filter((h) => h > 0)
                .map((h) => (
                  <div
                    key={h}
                    className="absolute right-1 text-[10px] text-[#5a5f6a] leading-[14px] text-right whitespace-nowrap"
                    style={{ top: h * 48 - 7 }}
                  >
                    {h === 12
                      ? "12 PM"
                      : h > 12
                        ? `${h - 12} PM`
                        : `${h} AM`}
                  </div>
                ))}
              {/* Current time label */}
              {visibleDays.some((d) => isToday(d)) && (
                <div
                  className="absolute right-1 left-0 text-right text-[10px] font-bold text-[#ef5350] leading-[14px] pointer-events-none"
                  style={{ top: nowTopPx - 7, zIndex: 10 }}
                >
                  {nowLabel}
                </div>
              )}
            </div>

            {/* Day columns */}
            {visibleDays.map((day) => {
              const dateKey = formatDateKey(day);
              const dayEntries = calendarData[dateKey] || {};
              return (
                <CalendarDayColumn
                  key={dateKey}
                  dateKey={dateKey}
                  dayEntries={dayEntries}
                  members={members}
                  memberColors={memberColors}
                  isToday={isToday(day)}
                  nowTopPx={nowTopPx}
                  selectedEntry={selectedEntry}
                  onEntryClick={handleEntryClick}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Entry detail sidebar */}
      {selectedEntry && (
        <EntryDetailPanel
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          projects={projects}
          tags={tags}
        />
      )}
    </div>
  );
}
