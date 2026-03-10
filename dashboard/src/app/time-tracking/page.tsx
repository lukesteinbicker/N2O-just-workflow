"use client";

import { useState, useMemo, useCallback } from "react";
import { useTimeTrackingData } from "./use-time-tracking-data";
import { PeopleView } from "./components/people-view";
import { WeekCalendarView } from "./components/week-calendar-view";
import { TrendsView } from "./components/trends-view";
import {
  FilterBar,
  type Filters,
  type DatePreset,
  getDateRangeForPreset,
} from "./components/filter-bar";
import { formatDateKey, getMemberColor } from "./components/utils";

type View = "people" | "calendar" | "trends";

export default function TimeTrackingPage() {
  const [view, setView] = useState<View>("people");
  const [datePreset, setDatePreset] = useState<DatePreset>("last28");
  const [filters, setFilters] = useState<Filters>({
    description: "",
    memberIds: [],
    projectIds: [],
    clientIds: [],
    tagIds: [],
  });

  const dateRange = useMemo(() => getDateRangeForPreset(datePreset), [datePreset]);

  const startDate = useMemo(() => formatDateKey(dateRange.start), [dateRange]);
  const endDate = useMemo(() => formatDateKey(dateRange.end), [dateRange]);

  const {
    members,
    entries,
    currentEntries,
    projects,
    clients,
    tags,
    projectMap,
    clientMap,
    loading,
    updateMember,
  } = useTimeTrackingData(startDate, endDate);

  // Member color map
  const memberColors = useMemo(() => {
    const map: Record<number, string> = {};
    members.forEach((m, i) => {
      map[m.id] = getMemberColor(i);
    });
    return map;
  }, [members]);

  // Apply filters to entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filters.description && !e.description?.toLowerCase().includes(filters.description.toLowerCase()))
        return false;
      if (filters.projectIds.length && !filters.projectIds.includes(e.projectId!))
        return false;
      if (filters.tagIds.length && !e.tagIds.some((t) => filters.tagIds.includes(t)))
        return false;
      return true;
    });
  }, [entries, filters]);

  const handleRoleChange = useCallback(
    (memberId: number, role: string) => {
      updateMember(memberId, role);
    },
    [updateMember]
  );

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 rounded bg-card animate-pulse" />
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded bg-card animate-pulse" />
          ))}
        </div>
        <div className="h-96 rounded bg-card animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-2">
      {/* Header with view tabs */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Time Tracking</h1>
        <div className="flex gap-1">
          {(["people", "calendar", "trends"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                view === v
                  ? "bg-[rgba(92,107,192,0.2)] text-[#b0b8ff] border border-[rgba(92,107,192,0.4)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar
        members={members}
        memberColors={memberColors}
        filters={filters}
        onFiltersChange={setFilters}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        projects={projects}
        clients={clients}
        tags={tags}
      />

      {/* View content */}
      {view === "people" && (
        <PeopleView
          entries={filteredEntries}
          members={members}
          currentEntries={currentEntries}
          dateRange={dateRange}
          projects={projects}
          projectMap={projectMap}
          onRoleChange={handleRoleChange}
        />
      )}
      {view === "calendar" && (
        <WeekCalendarView
          entries={filteredEntries}
          members={members}
          memberColors={memberColors}
          dateRange={dateRange}
          projects={projects}
          tags={tags}
        />
      )}
      {view === "trends" && (
        <TrendsView
          entries={filteredEntries}
          members={members.filter((m) => m.active)}
          memberColors={memberColors}
          dateRange={dateRange}
        />
      )}
    </div>
  );
}
