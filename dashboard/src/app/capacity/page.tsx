"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { DailyPoint } from "./capacity-data";
import { DATA } from "./capacity-data";
import {
  SUPPLY, TIER_META, buildDaily, flattenProjects,
  categorizeCompanies, DEFAULT_STAGE_ORDER, DEFAULT_STAGE_VISIBLE,
  DEFAULT_GROUP_ORDER, DEFAULT_GROUP_ENABLED, DEFAULT_GROUP_SORT,
  type PipelineStage, type StagedGroup, type GroupDim, type DimSortKey,
  type ViewPreset,
} from "./capacity-utils";
import { CapacityHeader } from "./capacity-header";
import { ProjectSidebar, type FlatProject } from "./project-sidebar";
import { GanttTimeline } from "./gantt-timeline";
import { DetailPanel } from "./detail-panel";

export default function CapacityPage() {
  // ─── State ───
  const [companies, setCompanies] = useState(DATA.companies);
  const allProjects = useMemo<FlatProject[]>(() => flattenProjects(companies), [companies]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(allProjects.map((p) => [p.id, true]))
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hovProj, setHovProj] = useState<string | null>(null);
  const [hoverData, setHoverData] = useState<DailyPoint | null>(null);
  const [gran, setGran] = useState("quarter");

  // Keyboard shortcuts: a=all, y=year, q=quarter, w=week
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const map: Record<string, string> = { a: "all", y: "year", q: "quarter", w: "week" };
      const g = map[e.key.toLowerCase()];
      if (g) setGran(g);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCoId, setSelectedCoId] = useState<string | null>(null);
  const [hovCompany, setHovCompany] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState("all");
  const [stageOrder, setStageOrder] = useState<PipelineStage[]>(DEFAULT_STAGE_ORDER);
  const [stageVisible, setStageVisible] = useState<Record<PipelineStage, boolean>>(DEFAULT_STAGE_VISIBLE);
  const [groupOrder, setGroupOrder] = useState<GroupDim[]>(DEFAULT_GROUP_ORDER);
  const [groupEnabled, setGroupEnabled] = useState<Record<GroupDim, boolean>>(DEFAULT_GROUP_ENABLED);
  const [groupSort, setGroupSort] = useState<Record<GroupDim, DimSortKey>>(DEFAULT_GROUP_SORT);

  // ─── Stage grouping ───
  const stagedCompanies = useMemo<StagedGroup[]>(() => {
    const grouped = categorizeCompanies(companies);
    return stageOrder
      .filter((s) => stageVisible[s])
      .map((s) => ({ stage: s, companies: grouped[s] }))
      .filter((g) => g.companies.length > 0);
  }, [companies, stageOrder, stageVisible]);

  // ─── Derived ───
  const active = useMemo(() => {
    let list = allProjects.filter((p) => enabled[p.id]);
    if (viewFilter === "all") {
      // Filter by visible stages — only include projects from companies in visible stage groups
      const visibleCoIds = new Set(stagedCompanies.flatMap((g) => g.companies.map((c) => c.id)));
      list = list.filter((p) => visibleCoIds.has(p.companyId));
    } else if (viewFilter === "clients-active") {
      const activeCoIds = new Set(
        allProjects.filter((p) => p.tier === "active").map((p) => p.companyId)
      );
      list = list.filter((p) => activeCoIds.has(p.companyId));
    } else if (["active", "pipeline", "speculative", "internal"].includes(viewFilter)) {
      list = list.filter((p) => p.tier === viewFilter);
    } else {
      list = list.filter((p) => p.companyId === viewFilter);
    }
    return list;
  }, [allProjects, enabled, viewFilter, stagedCompanies]);

  // Companies/projects visible in the sidebar (matches the viewFilter)
  const filteredCompanies = useMemo(() => {
    if (viewFilter === "all") {
      return stagedCompanies.flatMap((g) => g.companies);
    }
    if (viewFilter === "clients-active") {
      return companies.filter((co) => co.projects.some((p) => p.tier === "active"));
    }
    if (["active", "pipeline", "speculative", "internal"].includes(viewFilter)) {
      return companies
        .map((co) => ({ ...co, projects: co.projects.filter((p) => p.tier === viewFilter) }))
        .filter((co) => co.projects.length > 0);
    }
    return companies.filter((co) => co.id === viewFilter);
  }, [companies, viewFilter, stagedCompanies]);

  const sortedActive = useMemo(() => {
    // Build company position map from filteredCompanies (reflects stage order)
    const coPos = new Map<string, number>();
    filteredCompanies.forEach((co, i) => coPos.set(co.id, i));
    const sorted = [...active];
    sorted.sort((a, b) => {
      const posA = coPos.get(a.companyId) ?? 999;
      const posB = coPos.get(b.companyId) ?? 999;
      if (posA !== posB) return posA - posB;
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });
    return sorted;
  }, [active, filteredCompanies]);

  const daily = useMemo(() => buildDaily(active), [active]);
  const peakRaw = Math.max(...daily.map((d) => d.raw), 0);
  const maxGap = Math.max(0, ...daily.map((d) => Math.round((d.raw - SUPPLY) * 10) / 10));
  const peakProjects = Math.max(...daily.map((d) => d.cnt), 0);

  // ─── Callbacks ───
  const toggleEn = useCallback((id: string) => setEnabled((p) => ({ ...p, [id]: !p[id] })), []);
  const toggleGroup = useCallback(
    (ids: string[]) =>
      setEnabled((p) => {
        const allOn = ids.every((id) => p[id]);
        const n = { ...p };
        ids.forEach((id) => { n[id] = !allOn; });
        return n;
      }),
    []
  );
  const toggleExpand = useCallback((key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] })), []);
  const updateProject = useCallback(
    (id: string, field: string, val: string | number) =>
      setCompanies((prev) =>
        prev.map((co) => ({
          ...co,
          projects: co.projects.map((p) =>
            p.id === id
              ? { ...p, [field]: field === "seats" || field === "prob" ? Number(val) || 0 : val }
              : p
          ),
        }))
      ),
    []
  );

  const selectProject = useCallback(
    (pid: string) => {
      if (selectedId === pid) {
        setSelectedId(null);
        setSelectedCoId(null);
        return;
      }
      setSelectedId(pid);
      const p = allProjects.find((x) => x.id === pid);
      if (p) setSelectedCoId(p.companyId);
    },
    [selectedId, allProjects]
  );

  const selectCompany = useCallback(
    (cid: string) => {
      if (selectedCoId === cid && !selectedId) {
        setSelectedCoId(null);
        return;
      }
      setSelectedCoId(cid);
      setSelectedId(null);
    },
    [selectedCoId, selectedId]
  );

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setSelectedCoId(null);
  }, []);

  const applyView = useCallback(
    (view: ViewPreset) => {
      setGroupOrder([...view.groupOrder]);
      setGroupEnabled({ ...view.groupEnabled });
      setGroupSort({ ...view.groupSort });
      setStageVisible({ ...view.stageVisible });
    },
    []
  );

  const showDetail = selectedId !== null || selectedCoId !== null;

  return (
    <div className="full-bleed flex h-full flex-col overflow-hidden">
      <CapacityHeader
        gran={gran}
        onGranChange={setGran}
        hoverData={hoverData}
        peakRaw={peakRaw}
        maxGap={maxGap}
        peakProjects={peakProjects}
      />

      <div className="flex flex-1 overflow-hidden min-h-0">
        <ProjectSidebar
          companies={companies}
          filteredCompanies={filteredCompanies}
          stagedCompanies={stagedCompanies}
          allProjects={allProjects}
          enabled={enabled}
          expanded={expanded}
          hovProj={hovProj}
          hovCompany={hovCompany}
          selectedId={selectedId}
          selectedCoId={selectedCoId}
          hoverData={hoverData}
          viewFilter={viewFilter}
          stageOrder={stageOrder}
          stageVisible={stageVisible}
          onToggleEn={toggleEn}
          onToggleGroup={toggleGroup}
          onToggleExpand={toggleExpand}
          onSelectProject={selectProject}
          onSelectCompany={selectCompany}
          onSetHovProj={setHovProj}
          onSetHovCompany={setHovCompany}
          onSetViewFilter={setViewFilter}
          onSetStageOrder={setStageOrder}
          onSetStageVisible={setStageVisible}
          groupOrder={groupOrder}
          groupEnabled={groupEnabled}
          groupSort={groupSort}
          onSetGroupOrder={setGroupOrder}
          onSetGroupEnabled={setGroupEnabled}
          onSetGroupSort={setGroupSort}
          onApplyView={applyView}
        />

        <GanttTimeline
          active={sortedActive}
          daily={daily}
          gran={gran}
          hovProj={hovProj}
          hovCompany={hovCompany}
          selectedId={selectedId}
          hoverData={hoverData}
          onHoverChange={(data, _x) => setHoverData(data)}
          onSetHovProj={setHovProj}
          onSelectProject={selectProject}
        />

        {showDetail && (
          <DetailPanel
            companies={companies}
            allProjects={allProjects}
            selectedId={selectedId}
            selectedCoId={selectedCoId}
            enabled={enabled}
            onSelectProject={selectProject}
            onSelectCompany={selectCompany}
            onClose={closeDetail}
            onToggleEn={toggleEn}
            onUpdateProject={updateProject}
          />
        )}
      </div>
    </div>
  );
}
