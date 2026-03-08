"use client";

import { useState, useMemo, useCallback } from "react";
import type { DailyPoint } from "./capacity-data";
import { DATA } from "./capacity-data";
import { SUPPLY, buildDaily, flattenProjects } from "./capacity-utils";
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
  const [gran, setGran] = useState("month");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCoId, setSelectedCoId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"company" | "status">("company");

  // ─── Derived ───
  const active = useMemo(() => allProjects.filter((p) => enabled[p.id]), [allProjects, enabled]);
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
          allProjects={allProjects}
          enabled={enabled}
          expanded={expanded}
          hovProj={hovProj}
          selectedId={selectedId}
          selectedCoId={selectedCoId}
          groupBy={groupBy}
          onToggleEn={toggleEn}
          onToggleGroup={toggleGroup}
          onToggleExpand={toggleExpand}
          onSelectProject={selectProject}
          onSelectCompany={selectCompany}
          onSetGroupBy={setGroupBy}
          onSetHovProj={setHovProj}
        />

        <GanttTimeline
          active={active}
          daily={daily}
          gran={gran}
          hovProj={hovProj}
          selectedId={selectedId}
          hoverData={hoverData}
          onHoverChange={(data, _x) => setHoverData(data)}
          onSetHovProj={setHovProj}
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
