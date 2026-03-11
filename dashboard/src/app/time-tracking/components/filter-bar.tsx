"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ── Filter Dropdown (multi-select with checkboxes) ──────────

function FilterDropdown({
  label,
  items,
  selectedIds,
  onToggle,
  colorMap,
}: {
  label: string;
  items: { id: number | string; name: string }[];
  selectedIds: (number | string)[];
  onToggle: (id: number | string) => void;
  colorMap?: Record<number | string, string>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const count = selectedIds.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`px-2.5 py-1 text-xs rounded border transition-colors ${
          count > 0
            ? "bg-[rgba(92,107,192,0.15)] border-[rgba(92,107,192,0.4)] text-[#b0b8ff]"
            : "bg-[#1e2330] border-[#2a2f3a] text-[#8a8f9a] hover:border-[#3a3f4b]"
        }`}
      >
        {label}
        {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 min-w-[180px] rounded border border-[#2a2f3a] bg-[#1a1d24] shadow-lg max-h-[300px] overflow-auto">
          {count > 0 && (
            <button
              onClick={() => selectedIds.forEach((id) => onToggle(id))}
              className="w-full text-left px-3 py-1.5 text-[10px] text-[#5c6bc0] hover:bg-[#252830]"
            >
              Clear all
            </button>
          )}
          {items.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <label
                key={item.id}
                className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-[#252830]"
                style={{ color: checked ? "#e0e0e0" : "#8a8f9a" }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(item.id)}
                  className="accent-[#5c6bc0]"
                />
                {colorMap?.[item.id] && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: colorMap[item.id] }}
                  />
                )}
                <span className="truncate">{item.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Date Presets ─────────────────────────────────────────

export type DatePreset =
  | "today"
  | "thisWeek"
  | "thisMonth"
  | "lastWeek"
  | "lastMonth"
  | "last28"
  | "allTime";

function getDateRangeForPreset(preset: DatePreset): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { start: today, end: today };
    case "thisWeek": {
      const day = today.getDay();
      const mon = new Date(today);
      mon.setDate(today.getDate() - ((day + 6) % 7));
      return { start: mon, end: today };
    }
    case "thisMonth":
      return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
    case "lastWeek": {
      const day = today.getDay();
      const thisMon = new Date(today);
      thisMon.setDate(today.getDate() - ((day + 6) % 7));
      const lastMon = new Date(thisMon);
      lastMon.setDate(thisMon.getDate() - 7);
      const lastSun = new Date(thisMon);
      lastSun.setDate(thisMon.getDate() - 1);
      return { start: lastMon, end: lastSun };
    }
    case "lastMonth": {
      const y = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
      const m = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
      return { start: new Date(y, m, 1), end: new Date(today.getFullYear(), today.getMonth(), 0) };
    }
    case "last28": {
      const s = new Date(today);
      s.setDate(today.getDate() - 27);
      return { start: s, end: today };
    }
    case "allTime":
      return {
        start: new Date(today.getFullYear(), today.getMonth() - 2, today.getDate()),
        end: today,
      };
    default:
      return { start: today, end: today };
  }
}

const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  thisWeek: "This Week",
  thisMonth: "This Month",
  lastWeek: "Last Week",
  lastMonth: "Last Month",
  last28: "Last 28 Days",
  allTime: "All Time",
};

// ── FilterBar ───────────────────────────────────────────

export interface Filters {
  description: string;
  memberIds: number[];
  projectIds: number[];
  clientIds: number[];
  tagIds: number[];
}

export function FilterBar({
  members,
  memberColors,
  filters,
  onFiltersChange,
  datePreset,
  onDatePresetChange,
  projects,
  clients,
  tags,
  navControls,
}: {
  members: { id: number; name: string }[];
  memberColors: Record<number, string>;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  datePreset: DatePreset;
  onDatePresetChange: (p: DatePreset) => void;
  projects: { id: number; name: string; color?: string }[];
  clients: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  navControls?: React.ReactNode;
}) {
  const [search, setSearch] = useState(filters.description);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = useCallback(
    (val: string) => {
      setSearch(val);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onFiltersChange({ ...filters, description: val });
      }, 300);
    },
    [filters, onFiltersChange]
  );

  const projectColorMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.color || "#5c6bc0"])),
    [projects]
  );

  const presetOptions = useMemo(
    () => (Object.keys(PRESET_LABELS) as DatePreset[]),
    []
  );

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      {/* Date preset selector */}
      <div className="flex items-center gap-1">
        {presetOptions.map((p) => (
          <button
            key={p}
            onClick={() => onDatePresetChange(p)}
            className={`px-2 py-1 text-[11px] rounded transition-colors ${
              p === datePreset
                ? "bg-[rgba(92,107,192,0.2)] text-[#b0b8ff] border border-[rgba(92,107,192,0.4)]"
                : "text-[#8a8f9a] hover:text-[#b0b0b0]"
            }`}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-[#2a2f3a]" />

      {/* Entity filters */}
      <FilterDropdown
        label="Member"
        items={members.map((m) => ({ id: m.id, name: m.name }))}
        selectedIds={filters.memberIds}
        onToggle={(id) => {
          const ids = filters.memberIds.includes(id as number)
            ? filters.memberIds.filter((i) => i !== id)
            : [...filters.memberIds, id as number];
          onFiltersChange({ ...filters, memberIds: ids });
        }}
        colorMap={memberColors}
      />
      <FilterDropdown
        label="Project"
        items={projects.map((p) => ({ id: p.id, name: p.name }))}
        selectedIds={filters.projectIds}
        onToggle={(id) => {
          const ids = filters.projectIds.includes(id as number)
            ? filters.projectIds.filter((i) => i !== id)
            : [...filters.projectIds, id as number];
          onFiltersChange({ ...filters, projectIds: ids });
        }}
        colorMap={projectColorMap}
      />
      <FilterDropdown
        label="Client"
        items={clients.map((c) => ({ id: c.id, name: c.name }))}
        selectedIds={filters.clientIds}
        onToggle={(id) => {
          const ids = filters.clientIds.includes(id as number)
            ? filters.clientIds.filter((i) => i !== id)
            : [...filters.clientIds, id as number];
          onFiltersChange({ ...filters, clientIds: ids });
        }}
      />
      <FilterDropdown
        label="Tag"
        items={tags.map((t) => ({ id: t.id, name: t.name }))}
        selectedIds={filters.tagIds}
        onToggle={(id) => {
          const ids = filters.tagIds.includes(id as number)
            ? filters.tagIds.filter((i) => i !== id)
            : [...filters.tagIds, id as number];
          onFiltersChange({ ...filters, tagIds: ids });
        }}
      />

      {/* Description search */}
      <input
        type="text"
        placeholder="Search descriptions..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="px-2.5 py-1 text-xs rounded border border-[#2a2f3a] bg-[#1e2330] text-[#e0e0e0] placeholder-[#5a5f6a] outline-none focus:border-[#5c6bc0] w-[180px]"
      />

      {navControls && <div className="ml-auto shrink-0">{navControls}</div>}
    </div>
  );
}

export { getDateRangeForPreset };
