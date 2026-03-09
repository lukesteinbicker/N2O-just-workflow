"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { Project, Company, DailyPoint } from "./capacity-data";
import {
  getPS, TIER_META, STAGE_META, categorizeCompanies,
  DEFAULT_GROUP_ORDER, DEFAULT_GROUP_ENABLED, DEFAULT_GROUP_SORT,
  GROUP_DIM_META, DIM_SORT_OPTIONS,
  sortProjectsByKey, sortCompaniesByKey, sortStagedGroups,
  VIEW_PRESETS, detectActiveView,
  type PipelineStage, type StagedGroup, type GroupDim, type DimSortKey,
  type ViewPreset,
} from "./capacity-utils";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── SVG primitives ───

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="block">
      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DashIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="block">
      <path d="M3 6H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open, color }: { open: boolean; color: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className="shrink-0 transition-transform duration-150"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
    >
      <path d="M3 1.5L7 5L3 8.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Checkbox ───

function Chk({
  on,
  indeterminate,
  color,
  size = 12,
  onClick,
}: {
  on: boolean;
  indeterminate: boolean;
  color: string;
  size?: number;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex shrink-0 cursor-pointer items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: 3,
        background: on ? color : "transparent",
        border: `2px solid ${on ? color : indeterminate ? color : "var(--muted-foreground)"}`,
      }}
    >
      {on ? (
        <span style={{ color: "var(--background)" }}>
          <CheckIcon size={size - 4} />
        </span>
      ) : indeterminate ? (
        <span style={{ color }}>
          <DashIcon size={size - 4} />
        </span>
      ) : null}
    </div>
  );
}

// ─── Types ───

export type FlatProject = Project & { client: string; companyId: string };

interface ProjectSidebarProps {
  companies: Company[];
  filteredCompanies: Company[];
  stagedCompanies: StagedGroup[];
  allProjects: FlatProject[];
  enabled: Record<string, boolean>;
  expanded: Record<string, boolean>;
  hovProj: string | null;
  hovCompany: string | null;
  selectedId: string | null;
  selectedCoId: string | null;
  hoverData: DailyPoint | null;
  viewFilter: string;
  stageOrder: PipelineStage[];
  stageVisible: Record<PipelineStage, boolean>;
  groupOrder: GroupDim[];
  groupEnabled: Record<GroupDim, boolean>;
  groupSort: Record<GroupDim, DimSortKey>;
  onToggleEn: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
  onToggleExpand: (key: string) => void;
  onSelectProject: (pid: string) => void;
  onSelectCompany: (cid: string) => void;
  onSetHovProj: (id: string | null) => void;
  onSetHovCompany: (id: string | null) => void;
  onSetViewFilter: (f: string) => void;
  onSetStageOrder: (order: PipelineStage[]) => void;
  onSetStageVisible: (vis: Record<PipelineStage, boolean>) => void;
  onSetGroupOrder: (order: GroupDim[]) => void;
  onSetGroupEnabled: (enabled: Record<GroupDim, boolean>) => void;
  onSetGroupSort: (sort: Record<GroupDim, DimSortKey>) => void;
  onApplyView: (view: ViewPreset) => void;
}

// ─── Project row ───

function ProjectRow({
  p,
  indent,
  on,
  hov,
  sel,
  atCross,
  showClient,
  onHover,
  onLeave,
  onToggle,
  onSelect,
}: {
  p: FlatProject;
  indent: number;
  on: boolean;
  hov: boolean;
  sel: boolean;
  atCross: boolean;
  showClient?: boolean;
  onHover: () => void;
  onLeave: () => void;
  onToggle: (e: React.MouseEvent) => void;
  onSelect: () => void;
}) {
  const ps = getPS(p.prob);
  const tm = TIER_META[p.tier];
  const lit = hov || atCross;

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`flex cursor-pointer items-center gap-[5px] transition-colors duration-100 ${
        sel ? "border-l-2 border-l-primary bg-primary/[0.08]" : lit ? "border-l-2 border-l-transparent bg-white/[0.03]" : "border-l-2 border-l-transparent"
      }`}
      style={{ padding: `3px 10px 3px ${indent}px` }}
    >
      <Chk on={on} indeterminate={false} color={ps.bar} size={11} onClick={onToggle} />
      <div
        className="shrink-0 rounded-full"
        style={{
          width: 6,
          height: 6,
          background: tm?.color || "var(--muted-foreground)",
          opacity: on ? 0.8 : 0.3,
        }}
      />
      <span
        onClick={onSelect}
        className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium transition-colors duration-100"
        style={{
          color: lit ? "#fff" : on ? "var(--foreground)" : "var(--muted-foreground)",
          textDecoration: on ? "none" : "line-through",
        }}
      >
        {showClient && (
          <span className="text-muted-foreground mr-1">{p.client} /</span>
        )}
        {p.name}
      </span>
      <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
        {p.seats}s&middot;{p.prob}%
      </span>
    </div>
  );
}

// ─── Stage chip (sortable + toggleable) ───

function SortableChip({
  stage,
  visible,
  onToggle,
}: {
  stage: PipelineStage;
  visible: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage });
  const meta = STAGE_META[stage];
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onToggle}
      className={`flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[9px] font-semibold whitespace-nowrap cursor-grab active:cursor-grabbing transition-colors ${
        visible
          ? "border-white/15 bg-white/[0.06] text-foreground"
          : "border-transparent bg-transparent text-muted-foreground/50 line-through"
      }`}
    >
      <span
        className="shrink-0 rounded-full"
        style={{ width: 5, height: 5, background: meta.color, opacity: visible ? 0.9 : 0.3 }}
      />
      {meta.shortLabel}
    </button>
  );
}

function StageChips({
  stageOrder,
  stageVisible,
  onSetStageOrder,
  onSetStageVisible,
}: {
  stageOrder: PipelineStage[];
  stageVisible: Record<PipelineStage, boolean>;
  onSetStageOrder: (order: PipelineStage[]) => void;
  onSetStageVisible: (vis: Record<PipelineStage, boolean>) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = stageOrder.indexOf(active.id as PipelineStage);
      const newIdx = stageOrder.indexOf(over.id as PipelineStage);
      onSetStageOrder(arrayMove(stageOrder, oldIdx, newIdx));
    }
  }

  return (
    <div className="flex items-center gap-1 px-2.5 pb-1.5 overflow-x-auto scrollbar-none">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stageOrder} strategy={horizontalListSortingStrategy}>
          {stageOrder.map((s) => (
            <SortableChip
              key={s}
              stage={s}
              visible={stageVisible[s]}
              onToggle={() => onSetStageVisible({ ...stageVisible, [s]: !stageVisible[s] })}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ─── Company group (extracted for reuse in staged/flat modes) ───

function CompanyGroup({
  co,
  allProjects,
  enabled,
  expanded,
  hovProj,
  hovCompany,
  selectedId,
  hoverData,
  viewFilter,
  projectSort = "default",
  onToggleEn,
  onToggleGroup,
  onToggleExpand,
  onSelectProject,
  onSelectCompany,
  onSetHovProj,
  onSetHovCompany,
}: {
  co: Company;
  allProjects: FlatProject[];
  enabled: Record<string, boolean>;
  expanded: Record<string, boolean>;
  hovProj: string | null;
  hovCompany: string | null;
  selectedId: string | null;
  hoverData: DailyPoint | null;
  viewFilter: string;
  projectSort?: DimSortKey;
  onToggleEn: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
  onToggleExpand: (key: string) => void;
  onSelectProject: (pid: string) => void;
  onSelectCompany: (cid: string) => void;
  onSetHovProj: (id: string | null) => void;
  onSetHovCompany: (id: string | null) => void;
}) {
  const coProjs = sortProjectsByKey(
    co.projects
      .map((p) => allProjects.find((ap) => ap.id === p.id))
      .filter((p): p is FlatProject => p != null),
    projectSort,
  );
  if (coProjs.length === 0) return null;
  const coIds = coProjs.map((p) => p.id);
  const allOn = coIds.every((id) => enabled[id]);
  const someOn = coIds.some((id) => enabled[id]);
  const topProb = Math.max(...coProjs.map((p) => p.prob));
  const color = getPS(topProb).bar;
  const expKey = `co-${co.id}`;
  const isExp = expanded[expKey] !== false;
  const isClientFilter = viewFilter === co.id;
  const coHov = hovCompany === co.id;

  return (
    <div className="mb-0.5">
      <div
        onMouseEnter={() => onSetHovCompany(co.id)}
        onMouseLeave={() => onSetHovCompany(null)}
        className={`flex cursor-pointer select-none items-center gap-1.5 px-2.5 pb-[3px] pt-[5px] transition-colors duration-100 ${
          isClientFilter ? "bg-primary/[0.06]" : coHov ? "bg-white/[0.03]" : ""
        }`}
      >
        <div className="flex items-center" onClick={() => onToggleExpand(expKey)}>
          <ChevronIcon open={isExp} color="var(--muted-foreground)" />
        </div>
        <Chk
          on={allOn}
          indeterminate={!allOn && someOn}
          color={color}
          size={12}
          onClick={(e) => {
            e.stopPropagation();
            onToggleGroup(coIds);
          }}
        />
        <span
          onClick={() => onSelectCompany(co.id)}
          className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold transition-colors duration-100"
          style={{
            color: coHov || isClientFilter ? "#fff" : allOn ? "var(--foreground)" : someOn ? "var(--muted-foreground)" : "var(--muted-foreground)",
          }}
        >
          {co.name}
        </span>
        {coProjs.length > 1 && (
          <span className="text-[10px] text-muted-foreground">{coProjs.length}</span>
        )}
      </div>
      {isExp &&
        coProjs.map((p) => (
          <ProjectRow
            key={p.id}
            p={p}
            indent={34}
            on={enabled[p.id]}
            hov={hovProj === p.id || hovCompany === co.id}
            sel={selectedId === p.id}
            atCross={isAtCross(p, hoverData)}
            onHover={() => onSetHovProj(p.id)}
            onLeave={() => onSetHovProj(null)}
            onToggle={(e) => {
              e.stopPropagation();
              onToggleEn(p.id);
            }}
            onSelect={() => onSelectProject(p.id)}
          />
        ))}
    </div>
  );
}

// ─── Stage section header ───

function StageHeader({ stage }: { stage: PipelineStage }) {
  const meta = STAGE_META[stage];
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 px-2.5 pt-2 pb-1 bg-[#1C2127]">
      <div className="flex-1 h-px" style={{ background: `${meta.color}30` }} />
      <span
        className="text-[9px] font-bold tracking-[0.08em] whitespace-nowrap"
        style={{ color: `${meta.color}99` }}
      >
        {meta.label}
      </span>
      <div className="flex-1 h-px" style={{ background: `${meta.color}30` }} />
    </div>
  );
}

// ─── Stage divider (thin, for use inside company groups) ───

function StageDivider({ stage }: { stage: PipelineStage }) {
  const meta = STAGE_META[stage];
  return (
    <div className="flex items-center gap-1.5 px-4 pt-1.5 pb-0.5">
      <span
        className="text-[8px] font-bold tracking-[0.06em] whitespace-nowrap"
        style={{ color: `${meta.color}80` }}
      >
        {meta.shortLabel}
      </span>
      <div className="flex-1 h-px" style={{ background: `${meta.color}20` }} />
    </div>
  );
}

// ─── Views dropdown ───

function ViewsDropdown({
  groupOrder,
  groupEnabled,
  groupSort,
  stageVisible,
  onApplyView,
}: {
  groupOrder: GroupDim[];
  groupEnabled: Record<GroupDim, boolean>;
  groupSort: Record<GroupDim, DimSortKey>;
  stageVisible: Record<PipelineStage, boolean>;
  onApplyView: (view: ViewPreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const activeViewId = detectActiveView(groupOrder, groupEnabled, groupSort, stageVisible);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.right + 8 });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        title="Switch view"
        className={`flex h-7 items-center gap-1 rounded px-1.5 text-[10px] font-semibold transition-colors ${
          activeViewId
            ? "text-muted-foreground border border-transparent hover:text-foreground"
            : "bg-primary/15 text-primary border border-primary/25"
        }`}
      >
        {/* Stacked layers icon (moved from GroupByDropdown) */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M2 6l6-3 6 3-6 3-6-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M2 8.5l6 3 6-3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M2 11l6 3 6-3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        {!activeViewId && <span>Custom</span>}
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[9999] w-[220px] overflow-hidden rounded-md border border-border bg-popover shadow-lg"
              style={{ top: pos.top, left: pos.left }}
            >
              {VIEW_PRESETS.map((v) => (
                <div
                  key={v.id}
                  onClick={() => {
                    onApplyView(v);
                    setOpen(false);
                  }}
                  className={`cursor-pointer px-3 py-1.5 transition-colors hover:bg-white/[0.04] ${
                    activeViewId === v.id ? "bg-primary/10" : ""
                  }`}
                >
                  <div
                    className={`text-[11px] ${activeViewId === v.id ? "font-bold text-white" : "font-medium text-foreground"}`}
                  >
                    {v.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight">{v.description}</div>
                </div>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

// ─── Group By dropdown ───

function SortableGroupChip({
  dim,
  enabled,
  pinned,
  sortKey,
  sortMenuOpen,
  onToggle,
  onToggleSortMenu,
  onSelectSort,
}: {
  dim: GroupDim;
  enabled: boolean;
  pinned: boolean;
  sortKey: DimSortKey;
  sortMenuOpen: boolean;
  onToggle: () => void;
  onToggleSortMenu: () => void;
  onSelectSort: (key: DimSortKey) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dim });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const sortLabel = DIM_SORT_OPTIONS[dim].find((o) => o.key === sortKey)?.label ?? sortKey;
  const opts = DIM_SORT_OPTIONS[dim];

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium ${
          enabled ? "bg-white/[0.06]" : "bg-transparent text-muted-foreground/50"
        }`}
      >
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground/70 active:cursor-grabbing"
        >
          <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor">
            <circle cx="2" cy="2" r="1" /><circle cx="6" cy="2" r="1" />
            <circle cx="2" cy="5" r="1" /><circle cx="6" cy="5" r="1" />
            <circle cx="2" cy="8" r="1" /><circle cx="6" cy="8" r="1" />
          </svg>
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            disabled={pinned}
            onChange={onToggle}
            className="accent-[#2D72D2] w-3 h-3"
          />
          <span className={enabled ? "text-foreground" : "text-muted-foreground/50 line-through"}>
            {GROUP_DIM_META[dim].label}
          </span>
        </label>
        <span className="flex-1" />
        {enabled ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSortMenu(); }}
            className="text-[9px] text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap flex items-center gap-0.5"
          >
            {sortLabel}
            <svg width="6" height="6" viewBox="0 0 6 6" fill="none" className="shrink-0"
              style={{ transform: sortMenuOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}
            >
              <path d="M1 2L3 4L5 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : pinned ? (
          <span className="text-[9px] text-muted-foreground/40">always on</span>
        ) : null}
      </div>
      {sortMenuOpen && (
        <div className="ml-[22px] mr-1 mb-0.5 rounded border border-border/50 bg-[#1C2127]">
          {opts.map((o) => (
            <div
              key={o.key}
              onClick={(e) => { e.stopPropagation(); onSelectSort(o.key); }}
              className={`flex items-center gap-1.5 cursor-pointer px-2 py-[3px] text-[10px] transition-colors hover:bg-white/[0.04] ${
                sortKey === o.key ? "text-primary font-semibold" : "text-muted-foreground"
              }`}
            >
              {sortKey === o.key ? (
                <svg width="8" height="8" viewBox="0 0 12 12" fill="none" className="shrink-0">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span className="w-2" />
              )}
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupByDropdown({
  groupOrder,
  groupEnabled,
  groupSort,
  onSetGroupOrder,
  onSetGroupEnabled,
  onSetGroupSort,
}: {
  groupOrder: GroupDim[];
  groupEnabled: Record<GroupDim, boolean>;
  groupSort: Record<GroupDim, DimSortKey>;
  onSetGroupOrder: (order: GroupDim[]) => void;
  onSetGroupEnabled: (enabled: Record<GroupDim, boolean>) => void;
  onSetGroupSort: (sort: Record<GroupDim, DimSortKey>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sortMenuDim, setSortMenuDim] = useState<GroupDim | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const isCustom =
    groupOrder.some((d, i) => d !== DEFAULT_GROUP_ORDER[i]) ||
    Object.entries(groupEnabled).some(([k, v]) => v !== DEFAULT_GROUP_ENABLED[k as GroupDim]) ||
    Object.entries(groupSort).some(([k, v]) => v !== DEFAULT_GROUP_SORT[k as GroupDim]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = groupOrder.indexOf(active.id as GroupDim);
      const newIdx = groupOrder.indexOf(over.id as GroupDim);
      onSetGroupOrder(arrayMove(groupOrder, oldIdx, newIdx));
    }
  }

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.right + 8 });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        title="Group & sort"
        className={`flex h-7 items-center gap-1 rounded px-1.5 text-[10px] font-semibold transition-colors ${
          isCustom
            ? "bg-primary/15 text-primary border border-primary/25"
            : "text-muted-foreground border border-transparent hover:text-foreground"
        }`}
      >
        {/* Grid 2x2 icon (group & sort) */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[9999] w-[220px] rounded-md border border-border bg-popover shadow-lg p-1.5"
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="px-1.5 pb-1 text-[9px] font-bold tracking-[0.06em] text-muted-foreground">GROUP & SORT</div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={groupOrder} strategy={verticalListSortingStrategy}>
                  {groupOrder.map((dim) => (
                    <SortableGroupChip
                      key={dim}
                      dim={dim}
                      enabled={groupEnabled[dim]}
                      pinned={dim === "project"}
                      sortKey={groupSort[dim]}
                      sortMenuOpen={sortMenuDim === dim}
                      onToggle={() => {
                        if (dim === "project") return;
                        onSetGroupEnabled({ ...groupEnabled, [dim]: !groupEnabled[dim] });
                      }}
                      onToggleSortMenu={() => setSortMenuDim(sortMenuDim === dim ? null : dim)}
                      onSelectSort={(key) => {
                        onSetGroupSort({ ...groupSort, [dim]: key });
                        setSortMenuDim(null);
                      }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {isCustom && (
                <>
                  <div className="my-1 border-t border-border" />
                  <div
                    onClick={() => {
                      onSetGroupOrder([...DEFAULT_GROUP_ORDER]);
                      onSetGroupEnabled({ ...DEFAULT_GROUP_ENABLED });
                      onSetGroupSort({ ...DEFAULT_GROUP_SORT });
                      setOpen(false);
                    }}
                    className="cursor-pointer rounded px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-white/[0.04] transition-colors"
                  >
                    Reset to Default
                  </div>
                </>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

// ─── Main sidebar ───

function isAtCross(p: { start: string; end: string }, hoverData: DailyPoint | null): boolean {
  if (!hoverData) return false;
  return new Date(p.start) <= hoverData.date && new Date(p.end) >= hoverData.date;
}

export function ProjectSidebar({
  companies,
  filteredCompanies,
  stagedCompanies,
  allProjects,
  enabled,
  expanded,
  hovProj,
  hovCompany,
  selectedId,
  selectedCoId,
  hoverData,
  viewFilter,
  stageOrder,
  stageVisible,
  groupOrder,
  groupEnabled,
  groupSort,
  onToggleEn,
  onToggleGroup,
  onToggleExpand,
  onSelectProject,
  onSelectCompany,
  onSetHovProj,
  onSetHovCompany,
  onSetViewFilter,
  onSetStageOrder,
  onSetStageVisible,
  onSetGroupOrder,
  onSetGroupEnabled,
  onSetGroupSort,
  onApplyView,
}: ProjectSidebarProps) {
  const showStages = viewFilter === "all";

  // Compute active grouping dims (excluding "project", which is always leaf)
  const enabledDims = groupOrder.filter((d) => groupEnabled[d] && d !== "project");

  // Shared props for rendering project rows
  const rowProps = (p: FlatProject, showClient: boolean) => ({
    key: p.id,
    p,
    indent: showClient ? 14 : 34,
    on: enabled[p.id],
    hov: hovProj === p.id,
    sel: selectedId === p.id,
    atCross: isAtCross(p, hoverData),
    showClient,
    onHover: () => onSetHovProj(p.id),
    onLeave: () => onSetHovProj(null),
    onToggle: (e: React.MouseEvent) => { e.stopPropagation(); onToggleEn(p.id); },
    onSelect: () => onSelectProject(p.id),
  });

  // Shared company group props — projectSort comes from the project dimension
  const coGroupProps = (co: Company) => ({
    key: co.id,
    co,
    allProjects,
    enabled,
    expanded,
    hovProj,
    hovCompany,
    selectedId,
    hoverData,
    viewFilter,
    projectSort: groupSort.project,
    onToggleEn,
    onToggleGroup,
    onToggleExpand,
    onSelectProject,
    onSelectCompany,
    onSetHovProj,
    onSetHovCompany,
  });

  // Build the categorized lookup once for stage-related grouping
  const categorized = categorizeCompanies(companies);
  const coStageMap = new Map<string, PipelineStage>();
  for (const [stage, cos] of Object.entries(categorized) as [PipelineStage, Company[]][]) {
    for (const co of cos) coStageMap.set(co.id, stage);
  }

  // Sort helpers — each dimension sorts its own items
  const nowMs = Date.now();

  /** Sort stage sections by groupSort.stage */
  function sortStages(groups: StagedGroup[]): StagedGroup[] {
    return sortStagedGroups(groups, groupSort.stage, nowMs);
  }

  /** Sort companies by groupSort.client */
  function sortCos(cos: Company[]): Company[] {
    return sortCompaniesByKey([...cos], groupSort.client, nowMs);
  }

  /** Sort projects by groupSort.project */
  function sortProjs(projs: FlatProject[]): FlatProject[] {
    return sortProjectsByKey([...projs], groupSort.project, nowMs);
  }

  function renderList() {
    // When filter is not "all", always use flat company groups (no stage headers)
    if (!showStages) {
      return filteredCompanies.map((co) => <CompanyGroup {...coGroupProps(co)} />);
    }

    const dimKey = enabledDims.join(",");

    // Case 1: [stage, client] — Stage sections → Company groups → Project rows
    // stage sort → orders the stage sections
    // client sort → orders companies within each stage
    // project sort → orders projects within each company (via CompanyGroup prop)
    if (dimKey === "stage,client") {
      return sortStages(stagedCompanies).map((group) => (
        <div key={group.stage}>
          <StageHeader stage={group.stage} />
          {sortCos(group.companies).map((co) => <CompanyGroup {...coGroupProps(co)} />)}
        </div>
      ));
    }

    // Case 2: [client, stage] — Company groups → Stage sub-dividers → Project rows
    // client sort → orders companies
    // project sort → orders projects within each company
    if (dimKey === "client,stage") {
      const visibleCos = sortCos(stagedCompanies.flatMap((g) => g.companies));
      return visibleCos.map((co) => {
        const coProjs = sortProjs(
          co.projects
            .map((p) => allProjects.find((ap) => ap.id === p.id))
            .filter((p): p is FlatProject => p != null),
        );
        if (coProjs.length === 0) return null;

        // Group this company's projects by stage
        const projsByStage = new Map<PipelineStage, FlatProject[]>();
        const coStage = coStageMap.get(co.id);
        if (coStage) {
          projsByStage.set(coStage, coProjs);
        } else {
          projsByStage.set("prospective", coProjs);
        }

        const coIds = coProjs.map((p) => p.id);
        const allOn = coIds.every((id) => enabled[id]);
        const someOn = coIds.some((id) => enabled[id]);
        const topProb = Math.max(...coProjs.map((p) => p.prob));
        const color = getPS(topProb).bar;
        const expKey = `co-${co.id}`;
        const isExp = expanded[expKey] !== false;
        const coHov = hovCompany === co.id;
        const isClientFilter = viewFilter === co.id;

        return (
          <div key={co.id} className="mb-0.5">
            <div
              onMouseEnter={() => onSetHovCompany(co.id)}
              onMouseLeave={() => onSetHovCompany(null)}
              className={`flex cursor-pointer select-none items-center gap-1.5 px-2.5 pb-[3px] pt-[5px] transition-colors duration-100 ${
                isClientFilter ? "bg-primary/[0.06]" : coHov ? "bg-white/[0.03]" : ""
              }`}
            >
              <div className="flex items-center" onClick={() => onToggleExpand(expKey)}>
                <ChevronIcon open={isExp} color="var(--muted-foreground)" />
              </div>
              <Chk
                on={allOn}
                indeterminate={!allOn && someOn}
                color={color}
                size={12}
                onClick={(e) => { e.stopPropagation(); onToggleGroup(coIds); }}
              />
              <span
                onClick={() => onSelectCompany(co.id)}
                className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold transition-colors duration-100"
                style={{ color: coHov || isClientFilter ? "#fff" : allOn ? "var(--foreground)" : "var(--muted-foreground)" }}
              >
                {co.name}
              </span>
              {coProjs.length > 1 && (
                <span className="text-[10px] text-muted-foreground">{coProjs.length}</span>
              )}
            </div>
            {isExp && Array.from(projsByStage.entries()).map(([stage, projs]) => (
              <div key={stage}>
                <StageDivider stage={stage} />
                {projs.map((p) => <ProjectRow {...rowProps(p, false)} indent={34} />)}
              </div>
            ))}
          </div>
        );
      });
    }

    // Case 3: [stage] — Stage sections → flat Project rows (no company grouping)
    // stage sort → orders stage sections
    // project sort → orders projects within each stage
    if (dimKey === "stage") {
      return sortStages(stagedCompanies).map((group) => {
        const projs = group.companies.flatMap((co) =>
          co.projects
            .map((p) => allProjects.find((ap) => ap.id === p.id))
            .filter((p): p is FlatProject => p != null)
        );
        if (projs.length === 0) return null;
        return (
          <div key={group.stage}>
            <StageHeader stage={group.stage} />
            {sortProjs(projs).map((p) => <ProjectRow {...rowProps(p, true)} />)}
          </div>
        );
      });
    }

    // Case 4: [client] — Company groups → Project rows (no stage headers)
    // client sort → orders companies
    // project sort → orders projects within each company (via CompanyGroup prop)
    if (dimKey === "client") {
      const visibleCos = sortCos(stagedCompanies.flatMap((g) => g.companies));
      return visibleCos.map((co) => <CompanyGroup {...coGroupProps(co)} />);
    }

    // Case 5: [] — Flat project list
    // project sort → orders all projects
    const allVisible = stagedCompanies.flatMap((g) =>
      g.companies.flatMap((co) =>
        co.projects
          .map((p) => allProjects.find((ap) => ap.id === p.id))
          .filter((p): p is FlatProject => p != null)
      )
    );
    return sortProjs(allVisible).map((p) => <ProjectRow {...rowProps(p, true)} />);
  }

  return (
    <div className="flex w-[250px] min-w-[250px] shrink-0 flex-col border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pb-1.5 pt-1 relative z-[200]">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground">PROJECTS</span>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help items-center">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-muted-foreground">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M8 7.5v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="5.5" r="0.9" fill="currentColor" />
                </svg>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6} className="bg-[#1C2127] border border-border text-foreground p-2 max-w-[220px]" style={{ "--tooltip-bg": "#1C2127" } as React.CSSProperties}>
              <p className="text-xs leading-snug">Sorted by active clients first, then pipeline, speculative, and internal projects at the bottom.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-0.5">
          <ViewsDropdown
            groupOrder={groupOrder}
            groupEnabled={groupEnabled}
            groupSort={groupSort}
            stageVisible={stageVisible}
            onApplyView={onApplyView}
          />
          <GroupByDropdown
            groupOrder={groupOrder}
            groupEnabled={groupEnabled}
            groupSort={groupSort}
            onSetGroupOrder={onSetGroupOrder}
            onSetGroupEnabled={onSetGroupEnabled}
            onSetGroupSort={onSetGroupSort}
          />
          <FilterDropdown
            companies={companies}
            viewFilter={viewFilter}
            onSetViewFilter={onSetViewFilter}
          />
        </div>
      </div>

      {/* Stage chips */}
      <StageChips
        stageOrder={stageOrder}
        stageVisible={stageVisible}
        onSetStageOrder={onSetStageOrder}
        onSetStageVisible={onSetStageVisible}
      />

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 py-1">
        {renderList()}
      </div>
    </div>
  );
}


// ─── Filter dropdown ───

const PROJECT_FILTERS: { key: string; label: string; desc: string }[] = [
  { key: "all", label: "All Projects", desc: "Show every project in the pipeline" },
  { key: "active", label: "Active", desc: "Committed, in-progress projects" },
  { key: "pipeline", label: "Pipeline", desc: "Probable but not yet started" },
  { key: "speculative", label: "Speculative", desc: "Low-probability opportunities" },
  { key: "internal", label: "Internal", desc: "N2O internal projects" },
];

function FilterDropdown({
  companies,
  viewFilter,
  onSetViewFilter,
}: {
  companies: Company[];
  viewFilter: string;
  onSetViewFilter: (f: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const isFiltered = viewFilter !== "all";
  const activeLabel =
    PROJECT_FILTERS.find((f) => f.key === viewFilter)?.label ||
    (viewFilter === "clients-active" ? "Active Clients" : null) ||
    companies.find((c) => c.id === viewFilter)?.name ||
    "All";

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.right + 8 });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        title="Filter projects"
        className={`flex h-7 items-center gap-1 rounded px-1.5 text-[10px] font-semibold transition-colors ${
          isFiltered
            ? "bg-primary/15 text-primary border border-primary/25"
            : "text-muted-foreground border border-transparent hover:text-foreground"
        }`}
      >
        {/* Funnel icon */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M2 3h12L9.5 8.5V12L6.5 13.5V8.5L2 3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        {isFiltered && <span>{activeLabel}</span>}
        {isFiltered && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onSetViewFilter("all");
            }}
            className="ml-0.5 inline-flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            style={{ width: 14, height: 14 }}
            title="Clear filter"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[9999] w-[220px] overflow-hidden rounded-md border border-border bg-popover shadow-lg"
              style={{ top: pos.top, left: pos.left }}
            >
              {PROJECT_FILTERS.map((f) => (
                <div
                  key={f.key}
                  onClick={() => {
                    onSetViewFilter(f.key);
                    setOpen(false);
                  }}
                  className={`cursor-pointer px-3 py-1.5 transition-colors hover:bg-white/[0.04] ${
                    viewFilter === f.key ? "bg-primary/10" : ""
                  }`}
                >
                  <div
                    className={`text-[11px] ${viewFilter === f.key ? "font-bold text-white" : "font-medium text-foreground"}`}
                  >
                    {f.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight">{f.desc}</div>
                </div>
              ))}
              <div className="my-1 border-t border-border" />
              <div
                onClick={() => {
                  onSetViewFilter("clients-active");
                  setOpen(false);
                }}
                className={`cursor-pointer px-3 py-1.5 transition-colors hover:bg-white/[0.04] ${
                  viewFilter === "clients-active" ? "bg-primary/10" : ""
                }`}
              >
                <div
                  className={`text-[11px] ${viewFilter === "clients-active" ? "font-bold text-white" : "font-medium text-foreground"}`}
                >
                  Active Clients
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  Clients with active projects — all their projects shown
                </div>
              </div>
              {isFiltered && (
                <>
                  <div className="my-1 border-t border-border" />
                  <div
                    onClick={() => {
                      onSetViewFilter("all");
                      setOpen(false);
                    }}
                    className="cursor-pointer px-3 py-1.5 transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="text-[11px] font-medium text-muted-foreground">Reset to Default</div>
                  </div>
                </>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
