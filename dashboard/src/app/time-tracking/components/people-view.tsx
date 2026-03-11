"use client";

import { useState, useMemo, useCallback } from "react";
import { Sparkline } from "./sparkline";
import { LiveCard } from "./live-card";
import {
  formatHours,
  timeAgo,
  getWeeksInRange,
  formatDateKey,
  getMemberColor,
  ROLE_TARGETS,
} from "./utils";
import type { TimeTrackingMember, TimeEntry, DashboardActivity, TimeTrackingProject } from "../use-time-tracking-data";

interface PeopleViewProps {
  entries: TimeEntry[];
  members: TimeTrackingMember[];
  currentEntries: Record<number, DashboardActivity>;
  dateRange: { start: Date; end: Date };
  projects: TimeTrackingProject[];
  projectMap: Map<number, TimeTrackingProject>;
  onRoleChange: (memberId: number, role: string) => void;
}

interface MemberRow {
  member: TimeTrackingMember;
  color: string;
  todayHours: number;
  currentWeekHours: number;
  lastWeekHours: number;
  trailing3Avg: number;
  target: number;
  paceDelta: number;
  onTargetRate: number;
  weeklyTrend: number[];
  lastActivity: string | null;
}

function getRoleBadgeColor(role: string): string {
  switch (role) {
    case "leadership": return "#ffa726";
    case "developer": return "#5c6bc0";
    case "non-developer": return "#26a69a";
    default: return "#78909c";
  }
}

function getPaceColor(delta: number): string {
  if (delta >= 0) return "#4caf50";
  if (delta >= -2) return "#ffa726";
  return "#ef5350";
}

export function PeopleView({
  entries,
  members,
  currentEntries,
  dateRange,
  projects,
  projectMap,
  onRoleChange,
}: PeopleViewProps) {
  const [expandedMember, setExpandedMember] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortAsc, setSortAsc] = useState(true);

  // Build entries index by userId for fast lookup
  const entriesByUser = useMemo(() => {
    const map: Record<number, TimeEntry[]> = {};
    for (const e of entries) {
      if (!map[e.userId]) map[e.userId] = [];
      map[e.userId].push(e);
    }
    return map;
  }, [entries]);

  // Compute hours per member per week
  const weeks = useMemo(
    () => getWeeksInRange(dateRange.start, dateRange.end),
    [dateRange]
  );

  const today = useMemo(() => formatDateKey(new Date()), []);

  const peopleData: MemberRow[] = useMemo(() => {
    const now = new Date();
    const currentWeekStart = new Date(now);
    const dow = currentWeekStart.getDay();
    currentWeekStart.setDate(currentWeekStart.getDate() - (dow === 0 ? 6 : dow - 1));
    currentWeekStart.setHours(0, 0, 0, 0);

    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(currentWeekStart);
    lastWeekEnd.setTime(lastWeekEnd.getTime() - 1);

    return members
      .filter((m) => m.active)
      .map((member, idx) => {
        const color = getMemberColor(idx);
        const target = ROLE_TARGETS[member.role] ?? 35;

        // Filter entries for this member by userId
        const memberEntries = entriesByUser[member.id] || [];

        // Today's hours
        const todayEntries = memberEntries.filter(
          (e) => e.start && e.start.startsWith(today)
        );
        const todayHours = todayEntries.reduce((sum, e) => sum + (e.seconds || 0), 0) / 3600;

        // Current week hours
        const cwStart = currentWeekStart.toISOString();
        const cwEntries = memberEntries.filter(
          (e) => e.start && e.start >= cwStart
        );
        const currentWeekHours = cwEntries.reduce((sum, e) => sum + (e.seconds || 0), 0) / 3600;

        // Last week hours
        const lwStart = lastWeekStart.toISOString();
        const lwEnd = lastWeekEnd.toISOString();
        const lwEntries = memberEntries.filter(
          (e) => e.start && e.start >= lwStart && e.start <= lwEnd
        );
        const lastWeekHours = lwEntries.reduce((sum, e) => sum + (e.seconds || 0), 0) / 3600;

        // Weekly trend (last 5 weeks)
        const weeklyTrend = weeks.slice(-5).map((w) => {
          const wStart = w.start.toISOString();
          const wEnd = w.end.toISOString();
          const wEntries = memberEntries.filter(
            (e) => e.start && e.start >= wStart && e.start <= wEnd
          );
          return wEntries.reduce((sum, e) => sum + (e.seconds || 0), 0) / 3600;
        });

        // Trailing 3-week average
        const last3 = weeklyTrend.slice(-3);
        const trailing3Avg = last3.length > 0 ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;

        // Pace delta: how far ahead/behind target for current week
        const dayOfWeek = now.getDay() || 7; // Mon=1..Sun=7
        const expectedHours = (target / 5) * Math.min(dayOfWeek, 5);
        const paceDelta = currentWeekHours - expectedHours;

        // On-target rate (% of weeks at or above target)
        const completedWeeks = weeklyTrend.slice(0, -1); // exclude current
        const onTarget = completedWeeks.filter((h) => h >= target * 0.9).length;
        const onTargetRate = completedWeeks.length > 0 ? (onTarget / completedWeeks.length) * 100 : 0;

        // Last activity for this member
        const lastEntry = memberEntries
          .filter((e) => e.stop)
          .sort((a, b) => (b.stop || "").localeCompare(a.stop || ""))
          [0];
        const lastActivity = lastEntry?.stop || null;

        return {
          member,
          color,
          todayHours,
          currentWeekHours,
          lastWeekHours,
          trailing3Avg,
          target,
          paceDelta,
          onTargetRate,
          weeklyTrend,
          lastActivity,
        };
      });
  }, [members, entriesByUser, weeks, today]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...peopleData];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.member.name.localeCompare(b.member.name); break;
        case "role": cmp = a.member.role.localeCompare(b.member.role); break;
        case "today": cmp = a.todayHours - b.todayHours; break;
        case "week": cmp = a.currentWeekHours - b.currentWeekHours; break;
        case "lastWeek": cmp = a.lastWeekHours - b.lastWeekHours; break;
        case "avg": cmp = a.trailing3Avg - b.trailing3Avg; break;
        case "target": cmp = a.onTargetRate - b.onTargetRate; break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [peopleData, sortKey, sortAsc]);

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortAsc((a) => !a);
        return key;
      }
      setSortAsc(key === "name" || key === "role");
      return key;
    });
  }, []);

  const toggleExpand = useCallback((id: number) => {
    setExpandedMember((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-4">
      {/* Live cards row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {members
          .filter((m) => m.active)
          .map((m, i) => {
            const activity = currentEntries[m.id];
            return (
              <LiveCard
                key={m.id}
                member={{ name: m.name }}
                timeEntry={
                  activity
                    ? {
                        duration: activity.duration,
                        start: activity.start,
                        description: activity.description,
                        stop: activity.stop,
                      }
                    : undefined
                }
                color={getMemberColor(i)}
              />
            );
          })}
      </div>

      {/* People table */}
      <div className="overflow-auto rounded border border-[#2a2f3a]">
        <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr className="bg-[#1a1d24]">
              {[
                { key: "name", label: "Name" },
                { key: "role", label: "Role" },
                { key: "lastActive", label: "Last Active" },
                { key: "today", label: "Today" },
                { key: "week", label: "This Week" },
                { key: "lastWeek", label: "Last Week" },
                { key: "avg", label: "3-Wk Avg" },
                { key: "target", label: "On-Target" },
                { key: "trend", label: "Trend" },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.key !== "trend" && col.key !== "lastActive" && handleSort(col.key)}
                  className={`px-3 py-2 text-left font-medium text-[#8a8f9a] ${
                    col.key !== "trend" && col.key !== "lastActive" ? "cursor-pointer hover:text-[#b0b0b0]" : ""
                  }`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const paceColor = getPaceColor(row.paceDelta);
              const isExpanded = expandedMember === row.member.id;
              return (
                <tr
                  key={row.member.id}
                  onClick={() => toggleExpand(row.member.id)}
                  className="cursor-pointer hover:bg-[#1e2330] border-b border-[#1e2330]"
                  style={{ borderLeft: `3px solid ${paceColor}` }}
                >
                  <td className="px-3 py-2 font-medium" style={{ color: row.color }}>
                    {row.member.name}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{
                        backgroundColor: getRoleBadgeColor(row.member.role) + "22",
                        border: `1px solid ${getRoleBadgeColor(row.member.role)}44`,
                        color: getRoleBadgeColor(row.member.role),
                      }}
                    >
                      {row.member.role}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#5a5f6a]">
                    {row.lastActivity ? timeAgo(row.lastActivity) : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[#e0e0e0]">
                    {formatHours(row.todayHours * 3600)}h
                  </td>
                  <td className="px-3 py-2 font-mono text-[#e0e0e0]">
                    {formatHours(row.currentWeekHours * 3600)}h
                    <span className="ml-1 text-[10px]" style={{ color: paceColor }}>
                      ({row.paceDelta >= 0 ? "+" : ""}
                      {row.paceDelta.toFixed(1)})
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[#e0e0e0]">
                    {formatHours(row.lastWeekHours * 3600)}h
                  </td>
                  <td className="px-3 py-2 font-mono text-[#e0e0e0]">
                    {row.trailing3Avg.toFixed(1)}h
                  </td>
                  <td className="px-3 py-2 font-mono text-[#e0e0e0]">
                    {row.onTargetRate.toFixed(0)}%
                  </td>
                  <td className="px-3 py-2">
                    <Sparkline data={row.weeklyTrend} color={row.color} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Expanded member detail */}
      {expandedMember !== null && (() => {
        const row = sorted.find((r) => r.member.id === expandedMember);
        if (!row) return null;
        const roles = ["leadership", "developer", "non-developer"];
        return (
          <div className="rounded border border-[#2a2f3a] bg-[#1a1d24] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: row.color }}>
                {row.member.name}
              </span>
              <div className="flex gap-1">
                {roles.map((r) => (
                  <button
                    key={r}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRoleChange(row.member.id, r);
                    }}
                    className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                      row.member.role === r
                        ? "bg-[rgba(92,107,192,0.2)] border-[rgba(92,107,192,0.4)] text-[#b0b8ff]"
                        : "border-[#2a2f3a] text-[#5a5f6a] hover:text-[#8a8f9a]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-lg font-mono font-bold text-[#e0e0e0]">
                  {row.currentWeekHours.toFixed(1)}h
                </div>
                <div className="text-[10px] text-[#5a5f6a]">This Week</div>
              </div>
              <div>
                <div className="text-lg font-mono font-bold text-[#e0e0e0]">
                  {row.target}h
                </div>
                <div className="text-[10px] text-[#5a5f6a]">Target</div>
              </div>
              <div>
                <div className="text-lg font-mono font-bold" style={{ color: getPaceColor(row.paceDelta) }}>
                  {row.paceDelta >= 0 ? "+" : ""}{row.paceDelta.toFixed(1)}h
                </div>
                <div className="text-[10px] text-[#5a5f6a]">Pace</div>
              </div>
              <div>
                <div className="text-lg font-mono font-bold text-[#e0e0e0]">
                  {row.trailing3Avg.toFixed(1)}h
                </div>
                <div className="text-[10px] text-[#5a5f6a]">3-Wk Avg</div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
