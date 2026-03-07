"use client";

import { createContext, useContext } from "react";

// ── Types ────────────────────────────────────────────────

export interface SortClause {
  key: string;
  direction: "asc" | "desc";
}

export interface GlobalFilters {
  filters: Record<string, string[]>; // multi-select per dimension
  groupBy: string[];                 // ordered chain
  sortBy: SortClause[];              // ordered chain with direction
}

export type StaticOptions = { type: "static"; values: string[] };
export type QueryOptions = { type: "query"; field: string };

export interface FilterDimension {
  id: string;           // URL key: "person", "status", "sprint"
  label: string;        // Display: "Developer", "Status"
  kinds: ("filter" | "groupBy" | "sortBy")[];
  options: StaticOptions | QueryOptions;
}

export interface PageFilterConfig {
  dimensions: FilterDimension[];
  defaultGroupBy?: string[];
  defaultSortBy?: SortClause[];
}

// ── Context ──────────────────────────────────────────────

export const PageFilterContext = createContext<PageFilterConfig | null>(null);

export function usePageFilterConfig(): PageFilterConfig | null {
  return useContext(PageFilterContext);
}
