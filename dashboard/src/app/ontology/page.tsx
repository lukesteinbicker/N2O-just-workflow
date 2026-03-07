/**
 * Ontology Explorer — thin composition shell.
 *
 * Rendering logic lives in:
 *   ontology-canvas.ts   – canvas drawing + interaction callbacks
 *   category-sidebar.tsx – left sidebar with category groups
 *   detail-panel.tsx     – right detail panel with properties + linked types
 *   type-card-grid.tsx   – card grid (list view)
 */
"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@apollo/client/react";
import { LayoutGrid, Share2, X, ZoomIn, ZoomOut, Maximize2, Pin, Settings } from "lucide-react";
import { DATA_HEALTH_QUERY } from "@/lib/graphql/queries";
import { parseSchemaToGraph, aggregateEdges, type IntrospectionType } from "./schema-parser";
import { getHealthStatus, STREAM_ENTITY_MAP } from "./health-status";
import { graphqlAdapter, INTROSPECTION_QUERY } from "./graphql-adapter";
import { postgresqlAdapter } from "./postgresql-adapter";
import { parseSqlSchema } from "./sql-parser";
import { createCanvasCallbacks, COLORS, type EnrichedNode, type ForceLink } from "./ontology-canvas";
import { CategorySidebar } from "./category-sidebar";
import { DetailPanel } from "./detail-panel";
import { TypeCardGrid } from "./type-card-grid";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export default function OntologyPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedNode, setSelectedNode] = useState<EnrichedNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<ForceLink | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "graph">("graph");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const [activeAdapter, setActiveAdapter] = useState<"graphql" | "sql">("graphql");
  const [sqlContent, setSqlContent] = useState("");
  const [showSqlInput, setShowSqlInput] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const adapter = activeAdapter === "graphql" ? graphqlAdapter : postgresqlAdapter;
  const CATEGORY_CONFIG = adapter.getCategoryConfig();

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [settingsOpen]);

  const isSqlMode = activeAdapter === "sql";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: schemaData, loading: schemaLoading, error: schemaError } = useQuery<any>(INTROSPECTION_QUERY, { skip: isSqlMode });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: healthData } = useQuery<any>(DATA_HEALTH_QUERY, { skip: isSqlMode, pollInterval: 30000 });

  const sqlParseResult = useMemo(() => {
    if (!isSqlMode || !sqlContent.trim()) return null;
    return parseSqlSchema(sqlContent);
  }, [isSqlMode, sqlContent]);

  const graphData = useMemo(() => {
    if (isSqlMode) {
      if (!sqlParseResult) return null;
      return parseSchemaToGraph(sqlParseResult.types);
    }
    if (!schemaData?.__schema?.types) return null;
    return parseSchemaToGraph(schemaData.__schema.types as IntrospectionType[]);
  }, [isSqlMode, sqlParseResult, schemaData]);

  const healthMap = useMemo(() => {
    return getHealthStatus(healthData?.dataHealth?.streams ?? [], healthData?.dataHealth?.lastSessionEndedAt ?? null, STREAM_ENTITY_MAP);
  }, [healthData]);

  const enrichedNodes = useMemo<EnrichedNode[]>(() => {
    if (!graphData) return [];
    return graphData.nodes.map((n) => ({
      ...n,
      healthStatus: isSqlMode ? null : (healthMap[n.id] ?? null),
      category: adapter.getCategoryForType(n.id),
      pgMetadata: isSqlMode ? sqlParseResult?.metadata.get(n.id) : undefined,
    }));
  }, [graphData, healthMap, isSqlMode, adapter, sqlParseResult]);

  const categoryGroups = useMemo(() => {
    const groups: Record<string, EnrichedNode[]> = {};
    for (const node of enrichedNodes) {
      if (!groups[node.category]) groups[node.category] = [];
      groups[node.category].push(node);
    }
    return groups;
  }, [enrichedNodes]);

  const filteredNodes = useMemo(() => {
    let nodes = enrichedNodes;
    if (activeCategoryFilter) nodes = nodes.filter((n) => n.category === activeCategoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      nodes = nodes.filter((n) => n.id.toLowerCase().includes(q));
    }
    return nodes;
  }, [enrichedNodes, activeCategoryFilter, searchQuery]);

  const aggregatedEdges = useMemo(() => {
    if (!graphData) return [];
    const visibleIds = new Set(filteredNodes.map((n) => n.id));
    return aggregateEdges(graphData.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)));
  }, [graphData, filteredNodes]);

  const forceGraphData = useMemo(() => ({
    nodes: filteredNodes,
    links: aggregatedEdges.map((e) => ({ source: e.source, target: e.target, labels: e.labels, count: e.count })),
  }), [filteredNodes, aggregatedEdges]);

  const canvas = useMemo(() => createCanvasCallbacks({
    graphRef, selectedNode, enrichedNodes, forceGraphData, aggregatedEdges,
    hoveredNode, hoveredLink, categoryConfig: CATEGORY_CONFIG,
    setSelectedNode, setHoveredNode, setHoveredLink,
  }), [selectedNode, enrichedNodes, forceGraphData, aggregatedEdges, hoveredNode, hoveredLink]);

  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.d3Force("center", null);
    graphRef.current.d3Force("charge")?.strength(-300);
    graphRef.current.d3Force("link")?.distance(120);
  }, [forceGraphData]);

  // Re-fit graph when detail panel opens/closes (container width changes)
  const panelOpen = selectedNode !== null;
  useEffect(() => {
    if (graphRef.current && viewMode === "graph") {
      const timer = setTimeout(() => graphRef.current?.zoomToFit(300, 80), 150);
      return () => clearTimeout(timer);
    }
  }, [panelOpen, viewMode]);

  const entityConfig = selectedNode ? adapter.getEntityColumns(selectedNode.id) : undefined;
  const entityQuery = entityConfig?.query;
  const hasDocumentNodeQuery = entityQuery != null && typeof entityQuery !== "string";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: entityData } = useQuery<any>(hasDocumentNodeQuery ? entityQuery : INTROSPECTION_QUERY, { skip: !hasDocumentNodeQuery });
  const recentRecords = useMemo(() => {
    if (!entityConfig || !entityData) return [];
    const records = entityData[entityConfig.field];
    return Array.isArray(records) ? records.slice(0, 8) : [];
  }, [entityConfig, entityData]);

  if (!isSqlMode && schemaLoading) return <div className="flex h-full items-center justify-center"><div className="text-sm text-muted-foreground">Loading schema...</div></div>;
  if (!isSqlMode && schemaError) return <div className="flex h-full items-center justify-center"><div className="rounded-md border border-[#CD4246]/30 bg-[#CD4246]/10 p-4 text-sm text-[#CD4246]">Failed to load schema: {schemaError.message}</div></div>;

  return (
    <div className="relative h-full w-full">
    <div className="absolute -inset-4 flex overflow-hidden">
      <CategorySidebar
        categoryConfig={CATEGORY_CONFIG}
        categoryGroups={categoryGroups}
        activeCategoryFilter={activeCategoryFilter}
        onCategoryFilterChange={setActiveCategoryFilter}
        selectedNode={selectedNode}
        onSelectNode={setSelectedNode}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <div className="h-[44px] border-b border-border px-4 flex items-center justify-between flex-shrink-0 bg-card">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-foreground">Ontology Explorer</h1>
            <span className="text-xs text-muted-foreground">{filteredNodes.length} types</span>
            {activeCategoryFilter && CATEGORY_CONFIG[activeCategoryFilter] && (
              <button
                onClick={() => setActiveCategoryFilter(null)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                style={{ backgroundColor: CATEGORY_CONFIG[activeCategoryFilter].color + "25", color: CATEGORY_CONFIG[activeCategoryFilter].color }}
              >
                {CATEGORY_CONFIG[activeCategoryFilter].label}
                <X size={10} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Settings gear popover */}
            <div ref={settingsRef} className="relative">
              <button
                onClick={() => setSettingsOpen((v) => !v)}
                className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                  settingsOpen ? "bg-[#2D72D2] text-white" : "text-muted-foreground hover:text-foreground hover:bg-[#394B59]"
                }`}
                title="Settings"
              >
                <Settings size={14} />
              </button>
              {settingsOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-md border border-border bg-card p-3 shadow-lg">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Schema Source</span>
                  <div className="mt-2 flex flex-col gap-1">
                    {([["graphql", "GraphQL"], ["sql", "SQL"]] as const).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => {
                          if (value !== activeAdapter) {
                            setActiveAdapter(value);
                            setSelectedNode(null);
                            setActiveCategoryFilter(null);
                            if (value === "sql") setShowSqlInput(true);
                          }
                          setSettingsOpen(false);
                        }}
                        className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                          activeAdapter === value
                            ? "bg-[#2D72D2]/20 text-[#4C90F0]"
                            : "text-foreground hover:bg-[#394B59]"
                        }`}
                      >
                        <span className={`h-3 w-3 rounded-full border-2 flex items-center justify-center ${
                          activeAdapter === value ? "border-[#2D72D2]" : "border-muted-foreground"
                        }`}>
                          {activeAdapter === value && <span className="h-1.5 w-1.5 rounded-full bg-[#2D72D2]" />}
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mx-0.5 h-4 w-px bg-border" />

            {([["list", LayoutGrid], ["graph", Share2]] as const).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                  viewMode === mode ? "bg-[#2D72D2] text-white" : "text-muted-foreground hover:text-foreground hover:bg-[#394B59]"
                }`}
                title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} view`}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>

        {/* SQL paste input */}
        {isSqlMode && showSqlInput && (
          <div className="border-b border-border bg-card px-4 py-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Paste SQL Schema
              </span>
              <div className="flex items-center gap-2">
                {sqlContent.trim() && (
                  <button
                    onClick={() => setShowSqlInput(false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Collapse
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={sqlContent}
              onChange={(e) => setSqlContent(e.target.value)}
              placeholder="Paste CREATE TABLE, CREATE INDEX, ALTER TABLE, CREATE POLICY statements..."
              className="w-full h-32 rounded border border-border bg-background p-2 text-xs font-mono text-foreground resize-y placeholder:text-muted-foreground/50"
            />
          </div>
        )}

        {/* Collapsed SQL input toggle */}
        {isSqlMode && !showSqlInput && sqlContent.trim() && (
          <div className="border-b border-border bg-card px-4 py-1.5 flex-shrink-0">
            <button
              onClick={() => setShowSqlInput(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Edit SQL input ({sqlParseResult?.types.length ?? 0} tables parsed)
            </button>
          </div>
        )}

        {/* Empty state for SQL mode */}
        {isSqlMode && !sqlContent.trim() && !showSqlInput && (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={() => setShowSqlInput(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Paste SQL to get started
            </button>
          </div>
        )}

        <div ref={graphContainerRef} className="flex-1 relative overflow-hidden" style={{ backgroundColor: viewMode === "graph" ? COLORS.bg : undefined }}>
          {(!graphData || graphData.nodes.length === 0) ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-sm text-muted-foreground">
                {isSqlMode ? "Paste SQL above to visualize your schema." : "No entity types found in schema."}
              </div>
            </div>
          ) : viewMode === "list" ? (
            <TypeCardGrid
              nodes={filteredNodes}
              enrichedNodes={enrichedNodes}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
              categoryConfig={CATEGORY_CONFIG}
            />
          ) : (
            <>
              <ForceGraph2D
                ref={graphRef}
                graphData={forceGraphData}
                width={dimensions.width}
                height={dimensions.height}
                backgroundColor={COLORS.bg}
                nodeId="id"
                nodeCanvasObject={canvas.nodeCanvasObject}
                nodeCanvasObjectMode={() => "replace"}
                nodePointerAreaPaint={canvas.nodePointerAreaPaint}
                linkColor={canvas.linkColor}
                linkWidth={canvas.linkWidth}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                linkDirectionalArrowColor={canvas.linkColor}
                linkCurvature={0}
                linkCanvasObject={canvas.linkCanvasObject}
                linkCanvasObjectMode={() => "after"}
                linkHoverPrecision={6}
                onNodeClick={canvas.handleNodeClick}
                onNodeHover={canvas.handleNodeHover}
                onLinkHover={canvas.handleLinkHover}
                onNodeDragEnd={canvas.handleNodeDragEnd}
                onBackgroundClick={canvas.handleBackgroundClick}
                enableZoomInteraction={true}
                enablePanInteraction={true}
                enableNodeDrag={true}
                cooldownTime={3000}
                d3AlphaDecay={0.05}
                d3VelocityDecay={0.6}
              />
              <div className="absolute left-4 bottom-4 z-10 flex flex-col gap-1">
                {[
                  { icon: ZoomIn, handler: canvas.handleZoomIn, title: "Zoom in" },
                  { icon: ZoomOut, handler: canvas.handleZoomOut, title: "Zoom out" },
                  { icon: Maximize2, handler: canvas.handleZoomFit, title: "Fit to view" },
                  { icon: Pin, handler: canvas.handleUnpinAll, title: "Unpin all nodes" },
                ].map(({ icon: Icon, handler, title }) => (
                  <button key={title} onClick={handler} className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-[#394B59] hover:border-[#5F6B7C] hover:text-foreground active:bg-[#2D72D2]/30 transition-colors" title={title}>
                    <Icon size={16} />
                  </button>
                ))}
              </div>
              {!isSqlMode && (
                <div className="absolute right-4 bottom-4 z-10 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                  <div className="mb-1.5 font-medium text-foreground">Health</div>
                  <div className="flex flex-col gap-1">
                    {[{ color: COLORS.healthGreen, label: "Fresh" }, { color: COLORS.healthYellow, label: "Stale" }, { color: COLORS.healthRed, label: "Very stale" }].map(({ color, label }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedNode && (
        <DetailPanel
          selectedNode={selectedNode}
          onClose={() => setSelectedNode(null)}
          onSelectNode={setSelectedNode}
          enrichedNodes={enrichedNodes}
          categoryConfig={CATEGORY_CONFIG}
          getCategoryForType={(name) => adapter.getCategoryForType(name)}
          entityConfig={entityConfig}
          recentRecords={recentRecords}
        />
      )}
    </div>
    </div>
  );
}
