"use client";

import { STATUS_COLORS, STATUS_LABELS } from "./helpers";

interface TaskFiltersProps {
  statusFilter: Set<string>;
  sprintFilter: string | null;
  ownerFilter: string | null;
  allSprints: string[];
  allOwners: string[];
  onToggleStatus: (status: string) => void;
  onSprintChange: (sprint: string | null) => void;
  onOwnerChange: (owner: string | null) => void;
}

export function TaskFilters({
  statusFilter,
  sprintFilter,
  ownerFilter,
  allSprints,
  allOwners,
  onToggleStatus,
  onSprintChange,
  onOwnerChange,
}: TaskFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["green", "red", "blocked", "pending"] as const).map((status) => (
        <button
          key={status}
          onClick={() => onToggleStatus(status)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs border transition-colors"
          style={{
            borderColor: statusFilter.has(status) ? STATUS_COLORS[status] : "#394048",
            backgroundColor: statusFilter.has(status)
              ? `${STATUS_COLORS[status]}20`
              : "transparent",
            color: statusFilter.has(status) ? STATUS_COLORS[status] : "#738694",
            opacity: statusFilter.has(status) ? 1 : 0.5,
          }}
          data-testid={`filter-${status}`}
        >
          <div
            className="rounded-sm"
            style={{
              width: 8,
              height: 8,
              backgroundColor: STATUS_COLORS[status],
              opacity: statusFilter.has(status) ? 1 : 0.3,
            }}
          />
          {STATUS_LABELS[status] ?? status}
        </button>
      ))}

      <select
        className="text-xs bg-[#252A31] border border-border rounded-sm px-2 py-1 text-foreground"
        value={sprintFilter ?? ""}
        onChange={(e) => onSprintChange(e.target.value || null)}
        data-testid="filter-sprint"
      >
        <option value="">All sprints</option>
        {allSprints.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        className="text-xs bg-[#252A31] border border-border rounded-sm px-2 py-1 text-foreground"
        value={ownerFilter ?? ""}
        onChange={(e) => onOwnerChange(e.target.value || null)}
        data-testid="filter-owner"
      >
        <option value="">All owners</option>
        {allOwners.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
