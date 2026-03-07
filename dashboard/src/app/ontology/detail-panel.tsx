/**
 * Right detail panel for the Ontology Explorer.
 * Shows properties, linked types, and recent records for a selected entity.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import type { CategoryConfigEntry, EntityColumnsConfig } from "./schema-adapter";
import { COLORS, type EnrichedNode } from "./ontology-canvas";
import type { PgConstraint, PgIndex, PgRlsPolicy } from "./pg-types";

export interface DetailPanelProps {
  selectedNode: EnrichedNode;
  onClose: () => void;
  onSelectNode: (node: EnrichedNode) => void;
  enrichedNodes: EnrichedNode[];
  categoryConfig: Record<string, CategoryConfigEntry>;
  getCategoryForType: (name: string) => string;
  entityConfig: EntityColumnsConfig | undefined;
  recentRecords: Record<string, unknown>[];
}

export function DetailPanel({
  selectedNode, onClose, onSelectNode, enrichedNodes,
  categoryConfig, getCategoryForType, entityConfig, recentRecords,
}: DetailPanelProps) {
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const isDraggingSidebar = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleSidebarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDraggingSidebar.current = true;
      dragStartX.current = e.clientX;
      dragStartWidth.current = sidebarWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    },
    [sidebarWidth],
  );

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!isDraggingSidebar.current) return;
      const delta = dragStartX.current - e.clientX;
      setSidebarWidth(Math.max(280, Math.min(600, dragStartWidth.current + delta)));
    }
    function handleMouseUp() {
      if (!isDraggingSidebar.current) return;
      isDraggingSidebar.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const catConfig = categoryConfig[selectedNode.category] || categoryConfig.other;
  const CatIcon = catConfig.icon;

  const outgoingTypes = [
    ...new Set(
      selectedNode.fields
        .filter((f) => enrichedNodes.some((n) => n.id === f.typeName))
        .map((f) => f.typeName),
    ),
  ];

  return (
    <div className="flex flex-shrink-0" style={{ width: `${sidebarWidth}px` }}>
      {/* Drag handle */}
      <div
        onMouseDown={handleSidebarMouseDown}
        className="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors flex-shrink-0"
      />
      <div className="flex-1 min-w-0 border-l border-border bg-card overflow-y-auto scrollbar-thin">
        <div className="p-4 space-y-4">
          {/* Header with category icon */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded"
                style={{ backgroundColor: catConfig.color + "20" }}
              >
                <CatIcon size={16} style={{ color: catConfig.color }} />
              </div>
              <h2 className="text-base font-semibold text-foreground">{selectedNode.id}</h2>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Description */}
          {selectedNode.description && (
            <p className="text-xs text-muted-foreground">{selectedNode.description}</p>
          )}

          {/* Tags row */}
          <div className="flex flex-wrap gap-1.5">
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: catConfig.color + "20", color: catConfig.color }}
            >
              {catConfig.label}
            </span>
            {selectedNode.healthStatus && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  selectedNode.healthStatus === "green"
                    ? "bg-[#238551]/20 text-[#238551]"
                    : selectedNode.healthStatus === "yellow"
                      ? "bg-[#EC9A3C]/20 text-[#EC9A3C]"
                      : "bg-[#CD4246]/20 text-[#CD4246]"
                }`}
              >
                {selectedNode.healthStatus === "green"
                  ? "Fresh"
                  : selectedNode.healthStatus === "yellow"
                    ? "Stale"
                    : "Very Stale"}
              </span>
            )}
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#394048]/50 text-muted-foreground">
              {selectedNode.fieldCount} fields
            </span>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#394048]/50 text-muted-foreground">
              {selectedNode.incomingEdges.length} refs
            </span>
          </div>

          {/* Properties with type badges */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Properties
            </h3>
            <div className="space-y-0.5">
              {selectedNode.fields.map((f) => {
                const isRelation = enrichedNodes.some((n) => n.id === f.typeName);
                return (
                  <div
                    key={f.name}
                    className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-background"
                  >
                    <span className="font-mono text-foreground">{f.name}</span>
                    <div className="flex items-center gap-1.5">
                      {isRelation ? (
                        <span className="rounded px-1 py-0.5 text-[10px] font-medium bg-[#2D72D2]/20 text-[#2D72D2]">
                          relation
                        </span>
                      ) : (
                        <span className="rounded px-1 py-0.5 text-[10px] font-medium bg-[#394048]/50 text-muted-foreground">
                          scalar
                        </span>
                      )}
                      <span
                        className={`font-mono ${
                          isRelation
                            ? "text-[#2D72D2] cursor-pointer hover:underline"
                            : "text-muted-foreground"
                        }`}
                        onClick={() => {
                          if (isRelation) {
                            const target = enrichedNodes.find((n) => n.id === f.typeName);
                            if (target) onSelectNode(target);
                          }
                        }}
                      >
                        {f.typeName}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Linked Object Types */}
          {(outgoingTypes.length > 0 || selectedNode.incomingEdges.length > 0) && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Linked Object Types
              </h3>
              <div className="space-y-2">
                {outgoingTypes.length > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase mb-1">Outgoing</div>
                    <div className="flex flex-wrap gap-1.5">
                      {outgoingTypes.map((t) => {
                        const catColor = categoryConfig[getCategoryForType(t)]?.color || COLORS.textMuted;
                        return (
                          <button
                            key={t}
                            onClick={() => {
                              const node = enrichedNodes.find((n) => n.id === t);
                              if (node) onSelectNode(node);
                            }}
                            className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-0.5 text-xs font-mono text-foreground hover:bg-secondary transition-colors"
                          >
                            <span
                              className="h-2 w-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: catColor }}
                            />
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {selectedNode.incomingEdges.length > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase mb-1">Incoming</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedNode.incomingEdges.map((src) => {
                        const catColor = categoryConfig[getCategoryForType(src)]?.color || COLORS.textMuted;
                        return (
                          <button
                            key={src}
                            onClick={() => {
                              const node = enrichedNodes.find((n) => n.id === src);
                              if (node) onSelectNode(node);
                            }}
                            className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-0.5 text-xs font-mono text-foreground hover:bg-secondary transition-colors"
                          >
                            <span
                              className="h-2 w-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: catColor }}
                            />
                            {src}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PostgreSQL metadata sections */}
          {selectedNode.pgMetadata && (
            <PgMetadataSections pgMetadata={selectedNode.pgMetadata} />
          )}

          {/* Recent records */}
          {entityConfig && recentRecords.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Recent Records
              </h3>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border" style={{ backgroundColor: COLORS.card }}>
                      {entityConfig.columns.map((col) => (
                        <th
                          key={col}
                          className="px-2 py-1.5 text-left font-medium text-muted-foreground"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentRecords.map((row: Record<string, unknown>, i: number) => (
                      <tr
                        key={i}
                        className="border-b border-border last:border-b-0 hover:bg-background"
                        style={{ backgroundColor: COLORS.card }}
                      >
                        {entityConfig.columns.map((col) => {
                          let val = row[col];
                          if (val && typeof val === "object" && !Array.isArray(val)) {
                            val = (val as Record<string, unknown>).name ?? JSON.stringify(val);
                          }
                          return (
                            <td
                              key={col}
                              className="px-2 py-1.5 text-foreground font-mono truncate max-w-[140px]"
                            >
                              {val != null ? String(val) : "--"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PostgreSQL metadata sections ────────────────────────

function CollapsibleSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  if (count === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left"
      >
        {open ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </h3>
        <span className="text-[10px] text-muted-foreground">({count})</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function ConstraintBadge({ type }: { type: PgConstraint["type"] }) {
  const colors: Record<string, string> = {
    "PRIMARY KEY": "#2D72D2",
    "FOREIGN KEY": "#29A634",
    "UNIQUE": "#EC9A3C",
    "CHECK": "#9F2B68",
    "NOT NULL": "#738694",
  };
  const color = colors[type] ?? "#738694";
  return (
    <span
      className="rounded px-1 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: color + "20", color }}
    >
      {type}
    </span>
  );
}

function PgMetadataSections({ pgMetadata }: { pgMetadata: NonNullable<EnrichedNode["pgMetadata"]> }) {
  const visibleConstraints = pgMetadata.constraints.filter((c) => c.type !== "NOT NULL");

  return (
    <>
      {/* Constraints */}
      <CollapsibleSection title="Constraints" count={visibleConstraints.length}>
        <div className="space-y-1">
          {visibleConstraints.map((c, i) => (
            <div key={i} className="flex items-start gap-2 rounded px-2 py-1 text-xs hover:bg-background">
              <ConstraintBadge type={c.type} />
              <div className="flex-1 min-w-0">
                <span className="font-mono text-foreground">
                  {c.columns.join(", ")}
                </span>
                {c.references && (
                  <span className="text-muted-foreground">
                    {" → "}{c.references.table}({c.references.columns.join(", ")})
                  </span>
                )}
                {c.expression && (
                  <span className="text-muted-foreground block font-mono text-[10px] mt-0.5">
                    {c.expression}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Indexes */}
      <CollapsibleSection title="Indexes" count={pgMetadata.indexes.length}>
        <div className="space-y-1">
          {pgMetadata.indexes.map((idx, i) => (
            <div key={i} className="flex items-start gap-2 rounded px-2 py-1 text-xs hover:bg-background">
              <div className="flex gap-1">
                {idx.unique && (
                  <span className="rounded px-1 py-0.5 text-[10px] font-medium bg-[#EC9A3C]/20 text-[#EC9A3C]">
                    UNIQUE
                  </span>
                )}
                {idx.type && (
                  <span className="rounded px-1 py-0.5 text-[10px] font-medium bg-[#394048]/50 text-muted-foreground">
                    {idx.type}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-mono text-foreground">{idx.columns.join(", ")}</span>
                <span className="text-muted-foreground ml-1.5 text-[10px]">{idx.name}</span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* RLS Policies */}
      <CollapsibleSection title="RLS Policies" count={pgMetadata.rlsPolicies.length}>
        {pgMetadata.rlsEnabled && (
          <div className="mb-2">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#238551]/20 text-[#238551]">
              RLS ENABLED
            </span>
          </div>
        )}
        <div className="space-y-2">
          {pgMetadata.rlsPolicies.map((policy, i) => (
            <div key={i} className="rounded border border-border px-2 py-1.5 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-foreground">{policy.name}</span>
                <span className="rounded px-1 py-0.5 text-[10px] font-medium bg-[#394048]/50 text-muted-foreground">
                  {policy.command}
                </span>
              </div>
              {policy.using && (
                <div className="text-[10px] text-muted-foreground font-mono mt-1">
                  <span className="text-foreground/60">USING</span> {policy.using}
                </div>
              )}
              {policy.withCheck && (
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  <span className="text-foreground/60">WITH CHECK</span> {policy.withCheck}
                </div>
              )}
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </>
  );
}
