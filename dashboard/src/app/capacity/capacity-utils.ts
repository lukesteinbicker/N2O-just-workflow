// Capacity planner utility functions
// Extracted from platform/reference/nos-capacity-planner.jsx

import type { Project, Company, DailyPoint, Tick, ProbStyle, TierMeta } from "./capacity-data";
import { DATA } from "./capacity-data";

// ─── Colors (Palantir theme adapted) ───

const C = {
  green: "#00E676",
  greenDim: "rgba(0,230,118,0.18)",
  yellow: "#FFD740",
  yellowDim: "rgba(255,215,64,0.15)",
  orange: "#FF9100",
  orangeDim: "rgba(255,145,0,0.15)",
  red: "#FF5252",
  redDim: "rgba(255,82,82,0.12)",
  purple: "#CE93D8",
  purpleDim: "rgba(206,147,216,0.12)",
  accent: "#2D72D2",
  textSecondary: "#8899AA",
  supplyLine: "#00E5FF",
};

// ─── Probability style mapping ───

const PS: Record<number, ProbStyle> = {
  100: { bar: C.green, bg: C.greenDim },
  90: { bar: "#69F0AE", bg: "rgba(105,240,174,0.15)" },
  80: { bar: C.yellow, bg: C.yellowDim },
  70: { bar: C.orange, bg: C.orangeDim },
  40: { bar: C.red, bg: C.redDim },
  20: { bar: "#EF5350", bg: "rgba(239,83,80,0.12)" },
  10: { bar: C.purple, bg: C.purpleDim },
};

const PS_THRESHOLDS = [100, 90, 80, 70, 40, 20, 10] as const;

export function getPS(prob: number): ProbStyle {
  for (const k of PS_THRESHOLDS) {
    if (prob >= k) return PS[k];
  }
  return PS[10];
}

// ─── Tier metadata ───

export const TIER_META: Record<string, TierMeta> = {
  active: { label: "Active", color: C.green, order: 0 },
  pipeline: { label: "Pipeline", color: C.accent, order: 1 },
  speculative: { label: "Speculative", color: C.red, order: 2 },
  internal: { label: "Internal", color: C.textSecondary, order: 3 },
};

// ─── Granularity options ───

export const GRANS: { key: string; label: string; ppd: number }[] = [
  { key: "all", label: "All Time", ppd: 2.5 },
  { key: "year", label: "Year", ppd: 3.5 },
  { key: "quarter", label: "Quarter", ppd: 7 },
  { key: "week", label: "Week", ppd: 18 },
];

// ─── Sort options ───

export type SortField = "start" | "end" | "name" | "seats" | "prob";

export const SORT_OPTIONS: { key: SortField; label: string }[] = [
  { key: "start", label: "Start Date" },
  { key: "end", label: "End Date" },
  { key: "name", label: "Name" },
  { key: "seats", label: "Seats" },
  { key: "prob", label: "Probability" },
];

export function compareProjects(a: Project, b: Project, field: SortField, dir: "asc" | "desc"): number {
  const m = dir === "asc" ? 1 : -1;
  switch (field) {
    case "name": return m * a.name.localeCompare(b.name);
    case "start": return m * (new Date(a.start).getTime() - new Date(b.start).getTime());
    case "end": return m * (new Date(a.end).getTime() - new Date(b.end).getTime());
    case "seats": return m * (a.seats - b.seats);
    case "prob": return m * (a.prob - b.prob);
    default: return 0;
  }
}

// ─── Layout constants ───

export const ROW_H = 28;
export const ROW_GAP = 2;
export const LABEL_W_DEFAULT = 220;

// Row heights for unified layout
export const STAGE_HEADER_H = 28;
export const COMPANY_HEADER_H = 30;
export const STAGE_DIVIDER_H = 20;
export const PROJECT_ROW_H = ROW_H + ROW_GAP; // 30

// ─── Timeline config ───

const cfg = DATA.config;
export const SUPPLY = cfg.student_count;
export const LEAD_CEIL = cfg.professional_count * cfg.lead_ceiling_per_professional;
export const T_START = new Date(cfg.timeline_start);
export const T_END = new Date(cfg.timeline_end);
export const T_MS = T_END.getTime() - T_START.getTime();

// ─── Date formatters ───

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function moLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "short" });
}

// ─── Tick generation ───

export function getTicks(gran: string, tw: number): Tick[] {
  const ticks: Tick[] = [];

  // Monthly ticks
  for (
    let d = new Date("2026-02-01");
    d < T_END;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  ) {
    const px = Math.max(0, ((d.getTime() - T_START.getTime()) / T_MS) * tw);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const npx = Math.min(tw, ((next.getTime() - T_START.getTime()) / T_MS) * tw);
    if (npx - px > 2) {
      ticks.push({
        px,
        width: npx - px,
        label: moLabel(d),
        major: true,
        isMonth: true,
      });
    }
  }

  // Weekly ticks (shown at quarter granularity)
  if (gran === "quarter") {
    const d = new Date(T_START);
    const dow = d.getDay();
    const startMonday = new Date(
      d.getTime() + (dow === 0 ? 1 : dow <= 1 ? 1 - dow : 8 - dow) * 864e5
    );
    let current = startMonday;
    while (current < T_END) {
      const px = Math.max(
        0,
        ((current.getTime() - T_START.getTime()) / T_MS) * tw
      );
      if (!ticks.some((t) => t.isMonth && Math.abs(t.px - px) < 30)) {
        const ww = tw / ((T_END.getTime() - T_START.getTime()) / (7 * 864e5));
        ticks.push({
          px,
          width: 0,
          label: ww > 45 ? `${current.getDate()}` : "",
          major: false,
          isMonth: false,
        });
      }
      current = new Date(current.getTime() + 7 * 864e5);
    }
  }

  // Daily ticks (Mondays only, shown at week granularity)
  if (gran === "week") {
    for (let ms = T_START.getTime(); ms < T_END.getTime(); ms += 864e5) {
      const d = new Date(ms);
      if (d.getDay() === 1 && d.getDate() !== 1) {
        const px = ((ms - T_START.getTime()) / T_MS) * tw;
        if (!ticks.some((t) => t.isMonth && Math.abs(t.px - px) < 40)) {
          ticks.push({
            px,
            width: 0,
            label: `${d.getDate()}`,
            major: false,
            isMonth: false,
          });
        }
      }
    }
  }

  return ticks;
}

// ─── Daily demand builder ───

export function buildDaily(projects: Project[]): DailyPoint[] {
  const pts: DailyPoint[] = [];
  const s = T_START.getTime();
  const e = T_END.getTime();

  for (let ms = s; ms <= e; ms += 864e5) {
    let raw = 0;
    let cnt = 0;
    for (const p of projects) {
      if (
        new Date(p.start).getTime() <= ms &&
        new Date(p.end).getTime() >= ms
      ) {
        raw += p.seats;
        cnt++;
      }
    }
    pts.push({
      date: new Date(ms),
      ms,
      frac: (ms - s) / (e - s),
      raw,
      cnt,
    });
  }

  return pts;
}

// ─── Pipeline stage categorization ───

export type PipelineStage = "active-clients" | "prospective" | "past-clients" | "internal";

export const STAGE_META: Record<PipelineStage, { label: string; shortLabel: string; color: string }> = {
  "active-clients": { label: "ACTIVE CLIENTS", shortLabel: "Active", color: C.green },
  prospective:      { label: "PROSPECTIVE",    shortLabel: "Prosp.", color: C.accent },
  "past-clients":   { label: "PAST CLIENTS",   shortLabel: "Past",   color: C.textSecondary },
  internal:         { label: "INTERNAL",        shortLabel: "Int.",   color: C.purple },
};

export const DEFAULT_STAGE_ORDER: PipelineStage[] = [
  "active-clients", "prospective", "past-clients", "internal",
];

export const DEFAULT_STAGE_VISIBLE: Record<PipelineStage, boolean> = {
  "active-clients": true,
  prospective: true,
  "past-clients": false,
  internal: true,
};

export interface StagedGroup {
  stage: PipelineStage;
  companies: { id: string; name: string; projects: Project[] }[];
}

export function categorizeCompanies(
  companies: { id: string; name: string; projects: Project[] }[],
  today: Date = new Date(),
): Record<PipelineStage, { id: string; name: string; projects: Project[] }[]> {
  const todayMs = today.getTime();
  const result: Record<PipelineStage, { id: string; name: string; projects: Project[] }[]> = {
    "active-clients": [],
    prospective: [],
    "past-clients": [],
    internal: [],
  };

  for (const co of companies) {
    const allEnded = co.projects.every((p) => new Date(p.end).getTime() < todayMs);
    const hasActive = co.projects.some((p) => p.tier === "active");
    const allInternal = co.projects.every((p) => p.tier === "internal");

    // Precedence: Past → Active → Internal → Prospective
    if (allEnded) {
      result["past-clients"].push(co);
    } else if (hasActive) {
      result["active-clients"].push(co);
    } else if (allInternal) {
      result.internal.push(co);
    } else {
      result.prospective.push(co);
    }
  }

  return result;
}

// ─── Group By dimensions ───

export type GroupDim = "stage" | "client" | "project";

export const DEFAULT_GROUP_ORDER: GroupDim[] = ["stage", "client", "project"];
export const DEFAULT_GROUP_ENABLED: Record<GroupDim, boolean> = {
  stage: true, client: true, project: true,
};

// ─── View presets ───

export interface ViewPreset {
  id: string;
  label: string;
  description: string;
  groupOrder: GroupDim[];
  groupEnabled: Record<GroupDim, boolean>;
  groupSort: Record<GroupDim, DimSortKey>;
  stageVisible: Record<PipelineStage, boolean>;
}

export const VIEW_PRESETS: ViewPreset[] = [
  {
    id: "pipeline",
    label: "Pipeline",
    description: "Stage → Client → Project hierarchy",
    groupOrder: ["stage", "client", "project"],
    groupEnabled: { stage: true, client: true, project: true },
    groupSort: { stage: "default", client: "timeline", project: "timeline" },
    stageVisible: { "active-clients": true, prospective: true, "past-clients": false, internal: true },
  },
  {
    id: "timeline",
    label: "Timeline",
    description: "All projects sorted by delivery urgency",
    groupOrder: ["stage", "client", "project"],
    groupEnabled: { stage: false, client: false, project: true },
    groupSort: { stage: "default", client: "timeline", project: "timeline" },
    stageVisible: { "active-clients": true, prospective: true, "past-clients": false, internal: true },
  },
];

export function detectActiveView(
  groupOrder: GroupDim[],
  groupEnabled: Record<GroupDim, boolean>,
  groupSort: Record<GroupDim, DimSortKey>,
  stageVisible: Record<PipelineStage, boolean>,
): string | null {
  for (const v of VIEW_PRESETS) {
    const orderMatch = v.groupOrder.every((d, i) => d === groupOrder[i]);
    const enabledMatch = (Object.entries(v.groupEnabled) as [GroupDim, boolean][]).every(
      ([k, val]) => groupEnabled[k] === val
    );
    const sortMatch = (Object.entries(v.groupSort) as [GroupDim, DimSortKey][]).every(
      ([k, val]) => groupSort[k] === val
    );
    const stageMatch = (Object.entries(v.stageVisible) as [PipelineStage, boolean][]).every(
      ([k, val]) => stageVisible[k] === val
    );
    if (orderMatch && enabledMatch && sortMatch && stageMatch) return v.id;
  }
  return null;
}

export const GROUP_DIM_META: Record<GroupDim, { label: string }> = {
  stage: { label: "Stage" },
  client: { label: "Client" },
  project: { label: "Project" },
};

// ─── Per-dimension sort ───

export type DimSortKey = "default" | "timeline" | "name" | "prob" | "seats";

export const DEFAULT_GROUP_SORT: Record<GroupDim, DimSortKey> = {
  stage: "default",
  client: "timeline",
  project: "timeline",
};

export const DIM_SORT_OPTIONS: Record<GroupDim, { key: DimSortKey; label: string }[]> = {
  stage: [
    { key: "default",  label: "Default" },
    { key: "name",     label: "Name" },
    { key: "seats",    label: "Seats" },
    { key: "timeline", label: "Timeline" },
  ],
  client: [
    { key: "default",  label: "Default" },
    { key: "timeline", label: "Timeline" },
    { key: "prob",     label: "Prob %" },
    { key: "seats",    label: "Seats" },
    { key: "name",     label: "Name" },
  ],
  project: [
    { key: "timeline", label: "Timeline" },
    { key: "prob",     label: "Prob %" },
    { key: "seats",    label: "Seats" },
    { key: "name",     label: "Name" },
  ],
};

/** Timeline sort rank: active=0, future=1, past=2 */
function timelineBucket(p: { start: string; end: string }, todayMs: number): number {
  const s = new Date(p.start).getTime();
  const e = new Date(p.end).getTime();
  if (s <= todayMs && e >= todayMs) return 0; // active
  if (s > todayMs) return 1; // future
  return 2; // past
}

/** Compare two projects by timeline sort (active→ending soonest, future→starting soonest, past→ended most recently) */
export function compareProjectsTimeline(
  a: { start: string; end: string },
  b: { start: string; end: string },
  todayMs: number = Date.now(),
): number {
  const ba = timelineBucket(a, todayMs);
  const bb = timelineBucket(b, todayMs);
  if (ba !== bb) return ba - bb;
  if (ba === 0) return new Date(a.end).getTime() - new Date(b.end).getTime(); // active: end ASC
  if (ba === 1) return new Date(a.start).getTime() - new Date(b.start).getTime(); // future: start ASC
  return new Date(b.end).getTime() - new Date(a.end).getTime(); // past: end DESC
}

/** Sort an array of projects in-place by a DimSortKey */
export function sortProjectsByKey<T extends { name: string; start: string; end: string; seats: number; prob: number }>(
  projs: T[],
  key: DimSortKey,
  todayMs: number = Date.now(),
): T[] {
  if (key === "default") return projs;
  return projs.sort((a, b) => {
    switch (key) {
      case "timeline": return compareProjectsTimeline(a, b, todayMs);
      case "name": return a.name.localeCompare(b.name);
      case "seats": return b.seats - a.seats;
      case "prob": return b.prob - a.prob;
      default: return 0;
    }
  });
}

/** Derive a company's sort value from its projects for a given sort key */
export function sortCompaniesByKey<
  C extends { name: string; projects: { start: string; end: string; seats: number; prob: number; name: string }[] }
>(
  cos: C[],
  key: DimSortKey,
  todayMs: number = Date.now(),
): C[] {
  if (key === "default") return cos;
  return cos.sort((a, b) => {
    switch (key) {
      case "name": return a.name.localeCompare(b.name);
      case "seats": {
        const sa = a.projects.reduce((s, p) => s + p.seats, 0);
        const sb = b.projects.reduce((s, p) => s + p.seats, 0);
        return sb - sa;
      }
      case "timeline": {
        // Sort each company's projects by timeline, then compare their best (first) project
        const aSorted = [...a.projects].sort((x, y) => compareProjectsTimeline(x, y, todayMs));
        const bSorted = [...b.projects].sort((x, y) => compareProjectsTimeline(x, y, todayMs));
        if (aSorted.length === 0) return 1;
        if (bSorted.length === 0) return -1;
        return compareProjectsTimeline(aSorted[0], bSorted[0], todayMs);
      }
      case "prob": {
        const pa = Math.max(...a.projects.map((p) => p.prob), 0);
        const pb = Math.max(...b.projects.map((p) => p.prob), 0);
        return pb - pa;
      }
      default: return 0;
    }
  });
}

/** Sort staged groups (stage sections) by a DimSortKey */
export function sortStagedGroups(
  groups: StagedGroup[],
  key: DimSortKey,
  todayMs: number = Date.now(),
): StagedGroup[] {
  if (key === "default") return groups;
  return [...groups].sort((a, b) => {
    switch (key) {
      case "name":
        return STAGE_META[a.stage].label.localeCompare(STAGE_META[b.stage].label);
      case "seats": {
        const sa = a.companies.reduce((s, co) => s + co.projects.reduce((s2, p) => s2 + p.seats, 0), 0);
        const sb = b.companies.reduce((s, co) => s + co.projects.reduce((s2, p) => s2 + p.seats, 0), 0);
        return sb - sa;
      }
      case "timeline": {
        const allA = a.companies.flatMap((co) => co.projects);
        const allB = b.companies.flatMap((co) => co.projects);
        const bestA = [...allA].sort((x, y) => compareProjectsTimeline(x, y, todayMs));
        const bestB = [...allB].sort((x, y) => compareProjectsTimeline(x, y, todayMs));
        if (bestA.length === 0) return 1;
        if (bestB.length === 0) return -1;
        return compareProjectsTimeline(bestA[0], bestB[0], todayMs);
      }
      case "prob": {
        const pa = Math.max(...a.companies.flatMap((co) => co.projects.map((p) => p.prob)), 0);
        const pb = Math.max(...b.companies.flatMap((co) => co.projects.map((p) => p.prob)), 0);
        return pb - pa;
      }
      default: return 0;
    }
  });
}

/** Group flat projects by their pipeline stage (reusing categorizeCompanies logic). */
export function groupProjectsByStage<T extends { start: string; end: string; tier: string; companyId: string }>(
  projects: T[],
  companies: { id: string; name: string; projects: Project[] }[],
  today: Date = new Date(),
): Record<PipelineStage, T[]> {
  const categorized = categorizeCompanies(companies, today);
  // Build companyId → stage lookup
  const coStage = new Map<string, PipelineStage>();
  for (const [stage, cos] of Object.entries(categorized) as [PipelineStage, typeof companies][]) {
    for (const co of cos) coStage.set(co.id, stage);
  }
  const result: Record<PipelineStage, T[]> = {
    "active-clients": [], prospective: [], "past-clients": [], internal: [],
  };
  for (const p of projects) {
    const stage = coStage.get(p.companyId) ?? "prospective";
    result[stage].push(p);
  }
  return result;
}

// ─── Flatten projects helper ───

export type FlatProject = Project & { client: string; companyId: string };

export function flattenProjects(
  companies: { id: string; name: string; projects: Project[] }[]
): FlatProject[] {
  const result: FlatProject[] = [];
  for (const co of companies) {
    for (const p of co.projects) {
      result.push({ ...p, client: co.name, companyId: co.id });
    }
  }
  return result;
}

// ─── Crosshair hit-test ───

export function isAtCross(p: { start: string; end: string }, hoverData: DailyPoint | null): boolean {
  if (!hoverData) return false;
  return new Date(p.start) <= hoverData.date && new Date(p.end) >= hoverData.date;
}

// ─── Unified layout row model ───

export type LayoutRow =
  | { type: "stage-header"; stage: PipelineStage }
  | { type: "company-header"; company: Company; projIds: string[] }
  | { type: "stage-divider"; stage: PipelineStage }
  | { type: "project"; project: FlatProject; indent: number; showClient: boolean };

export function rowHeight(row: LayoutRow): number {
  switch (row.type) {
    case "stage-header": return STAGE_HEADER_H;
    case "company-header": return COMPANY_HEADER_H;
    case "stage-divider": return STAGE_DIVIDER_H;
    case "project": return PROJECT_ROW_H;
  }
}

export function buildRowList(opts: {
  stagedCompanies: StagedGroup[];
  filteredCompanies: Company[];
  allProjects: FlatProject[];
  companies: Company[];
  groupOrder: GroupDim[];
  groupEnabled: Record<GroupDim, boolean>;
  groupSort: Record<GroupDim, DimSortKey>;
  viewFilter: string;
  expanded: Record<string, boolean>;
}): LayoutRow[] {
  const {
    stagedCompanies, filteredCompanies, allProjects, companies,
    groupOrder, groupEnabled, groupSort, viewFilter, expanded,
  } = opts;

  const showStages = viewFilter === "all";
  const enabledDims = groupOrder.filter((d) => groupEnabled[d] && d !== "project");
  const dimKey = enabledDims.join(",");
  const nowMs = Date.now();
  const rows: LayoutRow[] = [];

  // Build stage lookup
  const categorized = categorizeCompanies(companies);
  const coStageMap = new Map<string, PipelineStage>();
  for (const [stage, cos] of Object.entries(categorized) as [PipelineStage, Company[]][]) {
    for (const co of cos) coStageMap.set(co.id, stage);
  }

  function addCompanyGroup(co: Company, indent: number) {
    const coProjs = sortProjectsByKey(
      co.projects
        .map((p) => allProjects.find((ap) => ap.id === p.id))
        .filter((p): p is FlatProject => p != null),
      groupSort.project,
      nowMs,
    );
    if (coProjs.length === 0) return;
    const projIds = coProjs.map((p) => p.id);
    rows.push({ type: "company-header", company: co, projIds });
    const expKey = `co-${co.id}`;
    if (expanded[expKey] !== false) {
      for (const p of coProjs) {
        rows.push({ type: "project", project: p, indent, showClient: false });
      }
    }
  }

  // When filter is not "all", always flat company groups
  if (!showStages) {
    for (const co of filteredCompanies) addCompanyGroup(co, 34);
    return rows;
  }

  // Case 1: [stage, client]
  if (dimKey === "stage,client") {
    for (const group of sortStagedGroups(stagedCompanies, groupSort.stage, nowMs)) {
      rows.push({ type: "stage-header", stage: group.stage });
      for (const co of sortCompaniesByKey([...group.companies], groupSort.client, nowMs)) {
        addCompanyGroup(co, 34);
      }
    }
    return rows;
  }

  // Case 2: [client, stage]
  if (dimKey === "client,stage") {
    const visibleCos = sortCompaniesByKey(
      stagedCompanies.flatMap((g) => g.companies),
      groupSort.client,
      nowMs,
    );
    for (const co of visibleCos) {
      const coProjs = sortProjectsByKey(
        co.projects
          .map((p) => allProjects.find((ap) => ap.id === p.id))
          .filter((p): p is FlatProject => p != null),
        groupSort.project,
        nowMs,
      );
      if (coProjs.length === 0) continue;
      const projIds = coProjs.map((p) => p.id);
      rows.push({ type: "company-header", company: co, projIds });
      const expKey = `co-${co.id}`;
      if (expanded[expKey] !== false) {
        const coStage = coStageMap.get(co.id) ?? "prospective";
        rows.push({ type: "stage-divider", stage: coStage });
        for (const p of coProjs) {
          rows.push({ type: "project", project: p, indent: 34, showClient: false });
        }
      }
    }
    return rows;
  }

  // Case 3: [stage] — stage headers + flat projects
  if (dimKey === "stage") {
    for (const group of sortStagedGroups(stagedCompanies, groupSort.stage, nowMs)) {
      const projs = group.companies.flatMap((co) =>
        co.projects
          .map((p) => allProjects.find((ap) => ap.id === p.id))
          .filter((p): p is FlatProject => p != null)
      );
      if (projs.length === 0) continue;
      rows.push({ type: "stage-header", stage: group.stage });
      for (const p of sortProjectsByKey([...projs], groupSort.project, nowMs)) {
        rows.push({ type: "project", project: p, indent: 14, showClient: true });
      }
    }
    return rows;
  }

  // Case 4: [client] — company groups, no stages
  if (dimKey === "client") {
    const visibleCos = sortCompaniesByKey(
      stagedCompanies.flatMap((g) => g.companies),
      groupSort.client,
      nowMs,
    );
    for (const co of visibleCos) addCompanyGroup(co, 34);
    return rows;
  }

  // Case 5: [] — flat project list
  const allVisible = stagedCompanies.flatMap((g) =>
    g.companies.flatMap((co) =>
      co.projects
        .map((p) => allProjects.find((ap) => ap.id === p.id))
        .filter((p): p is FlatProject => p != null)
    )
  );
  for (const p of sortProjectsByKey([...allVisible], groupSort.project, nowMs)) {
    rows.push({ type: "project", project: p, indent: 14, showClient: true });
  }
  return rows;
}
