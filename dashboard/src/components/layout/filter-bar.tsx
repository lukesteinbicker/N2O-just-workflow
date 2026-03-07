"use client";

import { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client/core";
import { X } from "lucide-react";
import { useGlobalFilters } from "@/hooks/use-global-filters";
import { usePageFilterConfig } from "@/lib/filter-dimensions";
import { MultiSelectFilter } from "./filter-bar/multi-select-filter";
import { GroupByPills } from "./filter-bar/group-by-pills";
import { SortByPills } from "./filter-bar/sort-by-pills";

const FILTER_OPTIONS_QUERY = gql`
  query FilterOptions {
    developers {
      name
      fullName
    }
    sprints {
      name
      projectId
    }
  }
`;

/** Resolve options for a dimension: static values or query-derived values. */
function useResolvedOptions(
  dimensions: { id: string; options: { type: string; values?: string[]; field?: string } }[],
  queryData: Record<string, unknown> | undefined
): Map<string, string[]> {
  return useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dim of dimensions) {
      if (dim.options.type === "static" && dim.options.values) {
        map.set(dim.id, dim.options.values);
      } else if (dim.options.type === "query" && dim.options.field && queryData) {
        const field = dim.options.field;
        if (field === "developers") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const devs = (queryData as any)?.developers ?? [];
          map.set(dim.id, devs.map((d: { name: string }) => d.name));
        } else if (field === "projects") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sprints = (queryData as any)?.sprints ?? [];
          const projects = Array.from(
            new Set(
              sprints
                .map((s: { projectId: string | null }) => s.projectId)
                .filter(Boolean)
            )
          ).sort() as string[];
          map.set(dim.id, projects);
        } else if (field === "sprints") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sprints = (queryData as any)?.sprints ?? [];
          map.set(dim.id, sprints.map((s: { name: string }) => s.name));
        } else if (field === "models") {
          // Models come from session data — use static fallback for now
          map.set(dim.id, []);
        } else {
          map.set(dim.id, []);
        }
      } else {
        map.set(dim.id, []);
      }
    }
    return map;
  }, [dimensions, queryData]);
}

export function FilterBar() {
  const config = usePageFilterConfig();
  const {
    filters,
    groupBy,
    sortBy,
    toggleFilterValue,
    addGroupBy,
    removeGroupBy,
    addSortBy,
    removeSortBy,
    toggleSortDirection,
    clearAll,
    activeCount,
  } = useGlobalFilters();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = useQuery<any>(FILTER_OPTIONS_QUERY);

  const resolvedOptions = useResolvedOptions(
    config?.dimensions ?? [],
    data
  );

  // No config = page doesn't use filters (Health, Ontology, Skills)
  if (!config) return null;

  const filterDims = config.dimensions.filter((d) =>
    d.kinds.includes("filter")
  );
  const groupDims = config.dimensions.filter((d) =>
    d.kinds.includes("groupBy")
  );
  const sortDims = config.dimensions.filter((d) =>
    d.kinds.includes("sortBy")
  );

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-1.5 border-b border-border">
      {/* Multi-select filters */}
      {filterDims.map((dim) => (
        <MultiSelectFilter
          key={dim.id}
          label={dim.label}
          options={resolvedOptions.get(dim.id) ?? []}
          selected={filters[dim.id] ?? []}
          onToggle={(val) => toggleFilterValue(dim.id, val)}
        />
      ))}

      {/* Separator */}
      {filterDims.length > 0 && (groupDims.length > 0 || sortDims.length > 0) && (
        <div className="w-px h-5 bg-border/40 mx-0.5" />
      )}

      {/* Group-by pills */}
      {groupDims.length > 0 && (
        <GroupByPills
          active={groupBy}
          available={groupDims.map((d) => ({ id: d.id, label: d.label }))}
          onAdd={addGroupBy}
          onRemove={removeGroupBy}
        />
      )}

      {/* Separator */}
      {groupDims.length > 0 && sortDims.length > 0 && (
        <div className="w-px h-5 bg-border/40 mx-0.5" />
      )}

      {/* Sort-by pills */}
      {sortDims.length > 0 && (
        <SortByPills
          active={sortBy}
          available={sortDims.map((d) => ({ id: d.id, label: d.label }))}
          onAdd={addSortBy}
          onRemove={removeSortBy}
          onToggleDirection={toggleSortDirection}
        />
      )}

      {/* Clear all */}
      {activeCount > 0 && (
        <button
          onClick={clearAll}
          className="flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X size={12} />
          Clear ({activeCount})
        </button>
      )}
    </div>
  );
}
