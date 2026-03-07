"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { SortClause, GlobalFilters } from "@/lib/filter-dimensions";

export type { SortClause, GlobalFilters };

// ── URL keys ─────────────────────────────────────────────

const FILTER_PREFIX = "f.";
const GROUP_KEY = "g";
const SORT_KEY = "s";

// Old-format keys for backwards-compat migration
const LEGACY_KEYS = ["person", "project", "groupBy"] as const;

// ── Parsing ──────────────────────────────────────────────

/** Parse filter state from URL search params (new f.X / g / s scheme). */
export function parseFilterParams(params: URLSearchParams): GlobalFilters {
  const filters: Record<string, string[]> = {};
  const groupBy: string[] = [];
  const sortBy: SortClause[] = [];

  // Check for legacy params and migrate
  const legacyPerson = params.get("person");
  const legacyProject = params.get("project");
  const legacyGroupBy = params.get("groupBy");
  const hasLegacy = legacyPerson || legacyProject || legacyGroupBy;

  if (hasLegacy) {
    if (legacyPerson) filters.person = [legacyPerson];
    if (legacyProject) filters.project = [legacyProject];
    if (legacyGroupBy) groupBy.push(legacyGroupBy);
    return { filters, groupBy, sortBy };
  }

  // Parse new-format params
  params.forEach((value, key) => {
    if (key.startsWith(FILTER_PREFIX)) {
      const dim = key.slice(FILTER_PREFIX.length);
      if (dim && value) {
        filters[dim] = value.split(",").filter(Boolean);
      }
    }
  });

  const gVal = params.get(GROUP_KEY);
  if (gVal) {
    groupBy.push(...gVal.split(",").filter(Boolean));
  }

  const sVal = params.get(SORT_KEY);
  if (sVal) {
    for (const part of sVal.split(",").filter(Boolean)) {
      const [key, dir] = part.split(":");
      if (key) {
        sortBy.push({ key, direction: dir === "desc" ? "desc" : "asc" });
      }
    }
  }

  return { filters, groupBy, sortBy };
}

/** Build URL search params string from filter state. Preserves non-filter params. */
export function buildFilterParams(
  state: GlobalFilters,
  existing?: URLSearchParams
): string {
  const params = new URLSearchParams();

  // Carry over non-filter params
  if (existing) {
    existing.forEach((value, key) => {
      if (
        key.startsWith(FILTER_PREFIX) ||
        key === GROUP_KEY ||
        key === SORT_KEY ||
        (LEGACY_KEYS as readonly string[]).includes(key)
      ) {
        return; // skip filter-related keys
      }
      params.set(key, value);
    });
  }

  // Set filter params
  for (const [dim, values] of Object.entries(state.filters)) {
    if (values.length > 0) {
      params.set(`${FILTER_PREFIX}${dim}`, values.join(","));
    }
  }

  // Set groupBy
  if (state.groupBy.length > 0) {
    params.set(GROUP_KEY, state.groupBy.join(","));
  }

  // Set sortBy
  if (state.sortBy.length > 0) {
    params.set(
      SORT_KEY,
      state.sortBy.map((s) => `${s.key}:${s.direction}`).join(",")
    );
  }

  return params.toString();
}

// ── Hook ─────────────────────────────────────────────────

/** React hook: read/write global filters via URL search params. */
export function useGlobalFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state = useMemo(
    () => parseFilterParams(searchParams),
    [searchParams]
  );

  const navigate = useCallback(
    (next: GlobalFilters) => {
      const paramString = buildFilterParams(next, searchParams);
      const url = paramString ? `${pathname}?${paramString}` : pathname;
      router.replace(url, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  // ── Setters ──────────────────────────────────────────

  /** Replace all values for a single filter dimension. */
  const setFilter = useCallback(
    (dimension: string, values: string[]) => {
      const next = { ...state, filters: { ...state.filters } };
      if (values.length === 0) {
        delete next.filters[dimension];
      } else {
        next.filters[dimension] = values;
      }
      navigate(next);
    },
    [state, navigate]
  );

  /** Toggle a single value within a filter dimension (add if absent, remove if present). */
  const toggleFilterValue = useCallback(
    (dimension: string, value: string) => {
      const current = state.filters[dimension] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      setFilter(dimension, next);
    },
    [state.filters, setFilter]
  );

  /** Add a dimension to the end of the groupBy chain. */
  const addGroupBy = useCallback(
    (dimension: string) => {
      if (state.groupBy.includes(dimension)) return;
      navigate({ ...state, groupBy: [...state.groupBy, dimension] });
    },
    [state, navigate]
  );

  /** Remove a dimension from the groupBy chain. */
  const removeGroupBy = useCallback(
    (dimension: string) => {
      navigate({
        ...state,
        groupBy: state.groupBy.filter((g) => g !== dimension),
      });
    },
    [state, navigate]
  );

  /** Add a sort clause to the end of the sortBy chain. */
  const addSortBy = useCallback(
    (key: string, direction: "asc" | "desc" = "asc") => {
      if (state.sortBy.some((s) => s.key === key)) return;
      navigate({ ...state, sortBy: [...state.sortBy, { key, direction }] });
    },
    [state, navigate]
  );

  /** Remove a sort clause from the sortBy chain. */
  const removeSortBy = useCallback(
    (key: string) => {
      navigate({
        ...state,
        sortBy: state.sortBy.filter((s) => s.key !== key),
      });
    },
    [state, navigate]
  );

  /** Toggle the direction of an existing sort clause. */
  const toggleSortDirection = useCallback(
    (key: string) => {
      navigate({
        ...state,
        sortBy: state.sortBy.map((s) =>
          s.key === key
            ? { ...s, direction: s.direction === "asc" ? "desc" : "asc" }
            : s
        ),
      });
    },
    [state, navigate]
  );

  /** Clear all filters, groupBy, and sortBy. */
  const clearAll = useCallback(
    () => navigate({ filters: {}, groupBy: [], sortBy: [] }),
    [navigate]
  );

  /** Count of active filter/group/sort clauses. */
  const activeCount =
    Object.values(state.filters).reduce((n, v) => n + v.length, 0) +
    state.groupBy.length +
    state.sortBy.length;

  return {
    ...state,
    setFilter,
    toggleFilterValue,
    addGroupBy,
    removeGroupBy,
    addSortBy,
    removeSortBy,
    toggleSortDirection,
    clearAll,
    activeCount,
  };
}
