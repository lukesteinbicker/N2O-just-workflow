"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";

export type GroupBy = "project" | "developer" | "status";

const VALID_GROUP_BY: GroupBy[] = ["project", "developer", "status"];
const DEFAULT_GROUP_BY: GroupBy = "project";

const FILTER_KEYS = ["person", "project", "groupBy"] as const;

export interface GlobalFilters {
  person: string | null;
  project: string | null;
  groupBy: GroupBy;
}

/** Parse filter state from URL search params */
export function parseFilterParams(params: URLSearchParams): GlobalFilters {
  const person = params.get("person") || null;
  const project = params.get("project") || null;
  const rawGroupBy = params.get("groupBy");
  const groupBy =
    rawGroupBy && VALID_GROUP_BY.includes(rawGroupBy as GroupBy)
      ? (rawGroupBy as GroupBy)
      : DEFAULT_GROUP_BY;

  return { person, project, groupBy };
}

/** Build URL search params string from filter state. Preserves non-filter params from existing. */
export function buildFilterParams(
  filters: GlobalFilters,
  existing?: URLSearchParams
): string {
  const params = new URLSearchParams();

  // Carry over non-filter params from existing
  if (existing) {
    existing.forEach((value, key) => {
      if (!FILTER_KEYS.includes(key as (typeof FILTER_KEYS)[number])) {
        params.set(key, value);
      }
    });
  }

  // Set filter params (omit nulls and defaults)
  if (filters.person) params.set("person", filters.person);
  if (filters.project) params.set("project", filters.project);
  if (filters.groupBy !== DEFAULT_GROUP_BY) params.set("groupBy", filters.groupBy);

  return params.toString();
}

/** React hook: read/write global filters via URL search params */
export function useGlobalFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo(
    () => parseFilterParams(searchParams),
    [searchParams]
  );

  const setFilters = useCallback(
    (updates: Partial<GlobalFilters>) => {
      const next: GlobalFilters = { ...filters, ...updates };
      const paramString = buildFilterParams(next, searchParams);
      const url = paramString ? `${pathname}?${paramString}` : pathname;
      router.replace(url, { scroll: false });
    },
    [filters, searchParams, pathname, router]
  );

  const setPerson = useCallback(
    (person: string | null) => setFilters({ person }),
    [setFilters]
  );

  const setProject = useCallback(
    (project: string | null) => setFilters({ project }),
    [setFilters]
  );

  const setGroupBy = useCallback(
    (groupBy: GroupBy) => setFilters({ groupBy }),
    [setFilters]
  );

  const clearAll = useCallback(
    () => setFilters({ person: null, project: null, groupBy: DEFAULT_GROUP_BY }),
    [setFilters]
  );

  return {
    ...filters,
    setFilters,
    setPerson,
    setProject,
    setGroupBy,
    clearAll,
  };
}
