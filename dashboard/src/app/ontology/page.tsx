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
import { LayoutGrid, Share2, X, ZoomIn, ZoomOut, Maximize2, Pin } from "lucide-react";
import { DATA_HEALTH_QUERY } from "@/lib/graphql/queries";
import { parseSchemaToGraph, aggregateEdges, type IntrospectionType } from "./schema-parser";
import { getHealthStatus, STREAM_ENTITY_MAP } from "./health-status";
import { graphqlAdapter, INTROSPECTION_QUERY } from "./graphql-adapter";
import { createCanvasCallbacks, COLORS, type EnrichedNode, type ForceLink } from "./ontology-canvas";
import { CategorySidebar } from "./category-sidebar";
import { DetailPanel } from "./detail-panel";
import { TypeCardGrid } from "./type-card-grid";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const adapter = graphqlAdapter;
const CATEGORY_CONFIG = adapter.getCategoryConfig();

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

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: schemaData, loading: schemaLoading, error: schemaError } = useQuery<any>(INTROSPECTION_QUERY);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: healthData } = useQuery<any>(DATA_HEALTH_QUERY, { pollInterval: 30000 });

  const graphData = useMemo(() => {
    if (!schemaData?.__schema?.types) return null;
    return parseSchemaToGraph(schemaData.__schema.types as IntrospectionType[]);
  }, [schemaData]);

  const healthMap = useMemo(() => {
    return getHealthStatus(healthData?.dataHealth?.streams ?? [], healthData?.dataHealth?.lastSessionEndedAt ?? null, STREAM_ENTITY_MAP);
  }, [healthData]);

  const enrichedNodes = useMemo<EnrichedNode[]>(() => {
    if (!graphData) return [];
    return graphData.nodes.map((n) => ({ ...n, healthStatus: healthMap[n.id] ?? null, category: adapter.getCategoryForType(n.id) }));
  }, [graphData, healthMap]);

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: entityData } = useQuery<any>(entityConfig?.query ?? INTROSPECTION_QUERY, { skip: !entityConfig });
  const recentRecords = useMemo(() => {
    if (!entityConfig || !entityData) return [];
    const records = entityData[entityConfig.field];
    return Array.isArray(records) ? records.slice(0, 8) : [];
  }, [entityConfig, entityData]);

  if (schemaLoading) return <div className="flex h-full items-center justify-center"><div className="text-sm text-muted-foreground">Loading schema...</div></div>;
  if (schemaError) return <div className="flex h-full items-center justify-center"><div className="rounded-md border border-[#CD4246]/30 bg-[#CD4246]/10 p-4 text-sm text-[#CD4246]">Failed to load schema: {schemaError.message}</div></div>;
  if (!graphData || graphData.nodes.length === 0) return <div className="flex h-full items-center justify-center"><div className="text-sm text-muted-foreground">No entity types found in schema.</div></div>;

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
            {activeCategoryFilter && (
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

        <div ref={graphContainerRef} className="flex-1 relative overflow-hidden" style={{ backgroundColor: viewMode === "graph" ? COLORS.bg : undefined }}>
          {viewMode === "list" ? (
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
