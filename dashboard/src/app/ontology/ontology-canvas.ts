/**
 * Canvas rendering logic for the ontology force-directed graph.
 * Pure module — no React components or hooks.
 */

import type { CategoryConfigEntry } from "./schema-adapter";
import type { GraphNode, AggregatedEdge } from "./schema-parser";

// ── Types ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ForceNode = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ForceLink = Record<string, any>;

export interface EnrichedNode extends GraphNode {
  healthStatus: "green" | "yellow" | "red" | null;
  category: string;
}

// ── Color palette ──────────────────────────────────────

export const COLORS = {
  bg: "#1C2127",
  nodeFill: "#2D72D2",
  nodeHighlight: "#4B94E6",
  nodeMatched: "#FFFFFF",
  nodeDimmed: "#394048",
  edge: "#394048",
  edgeHighlight: "#5F6B7C",
  text: "#F5F8FA",
  textMuted: "#738694",
  card: "#252A31",
  border: "#394048",
  healthGreen: "#238551",
  healthYellow: "#EC9A3C",
  healthRed: "#CD4246",
};

// ── Canvas geometry helpers ────────────────────────────

export function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawLeftRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Canvas callback factory ────────────────────────────

export interface CanvasCallbackInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graphRef: React.RefObject<any>;
  selectedNode: EnrichedNode | null;
  enrichedNodes: EnrichedNode[];
  forceGraphData: { nodes: ForceNode[]; links: ForceLink[] };
  aggregatedEdges: AggregatedEdge[];
  hoveredNode: string | null;
  hoveredLink: ForceLink | null;
  categoryConfig: Record<string, CategoryConfigEntry>;
  setSelectedNode: (node: EnrichedNode | null) => void;
  setHoveredNode: (id: string | null) => void;
  setHoveredLink: (link: ForceLink | null) => void;
}

export function createCanvasCallbacks(input: CanvasCallbackInput) {
  const {
    graphRef, selectedNode, enrichedNodes, forceGraphData, aggregatedEdges,
    hoveredNode, hoveredLink, categoryConfig,
    setSelectedNode, setHoveredNode, setHoveredLink,
  } = input;

  // Compute hovered neighbors for dimming
  const hoveredNeighbors = (() => {
    if (!hoveredNode) return null;
    const neighbors = new Set<string>([hoveredNode]);
    for (const edge of aggregatedEdges) {
      if (edge.source === hoveredNode) neighbors.add(edge.target);
      if (edge.target === hoveredNode) neighbors.add(edge.source);
    }
    return neighbors;
  })();

  // ── Interaction callbacks ──────────────────────────

  // Background click is debounced: if a node click fires within 100ms,
  // it cancels the background click. This prevents the shadow-canvas
  // throttle (800ms) from causing missed node clicks that register as
  // background clicks instead.
  let bgClickTimer: ReturnType<typeof setTimeout> | null = null;

  const handleNodeClick = (node: ForceNode) => {
    if (bgClickTimer) { clearTimeout(bgClickTimer); bgClickTimer = null; }
    const found = enrichedNodes.find((n) => n.id === node.id);
    setSelectedNode(found ?? null);
  };

  const handleBackgroundClick = () => {
    if (bgClickTimer) clearTimeout(bgClickTimer);
    bgClickTimer = setTimeout(() => {
      bgClickTimer = null;
      setSelectedNode(null);
    }, 100);
  };

  const handleNodeDragEnd = (node: ForceNode) => {
    node.fx = node.x;
    node.fy = node.y;
  };

  const handleNodeHover = (node: ForceNode | null) => setHoveredNode(node?.id ?? null);

  const handleLinkHover = (link: ForceLink | null) => setHoveredLink(link ?? null);

  const handleZoomIn = () => {
    if (graphRef.current) graphRef.current.zoom(graphRef.current.zoom() * 1.5, 300);
  };

  const handleZoomOut = () => {
    if (graphRef.current) graphRef.current.zoom(graphRef.current.zoom() / 1.5, 300);
  };

  const handleZoomFit = () => {
    if (graphRef.current) graphRef.current.zoomToFit(400, 80);
  };

  const handleUnpinAll = () => {
    forceGraphData.nodes.forEach((n: ForceNode) => {
      n.fx = undefined;
      n.fy = undefined;
    });
    graphRef.current?.d3ReheatSimulation();
  };

  // ── Canvas rendering callbacks ─────────────────────

  const nodeCanvasObject = (
    node: ForceNode, ctx: CanvasRenderingContext2D, globalScale: number,
  ) => {
    const label = node.id as string;
    const category = (node.category as string) || "other";
    const catConfig = categoryConfig[category] || categoryConfig.other;

    const fontSize = 11 / globalScale;
    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    const textWidth = ctx.measureText(label).width;

    const padding = 6 / globalScale;
    const iconW = 20 / globalScale;
    const height = 24 / globalScale;
    const totalWidth = iconW + textWidth + padding * 2;
    const radius = 3 / globalScale;

    const x = node.x - totalWidth / 2;
    const y = node.y - height / 2;

    const isSelected = selectedNode?.id === node.id;
    const isHovered = hoveredNode === node.id;
    const isDimmed = hoveredNeighbors != null && !hoveredNeighbors.has(node.id as string);

    ctx.globalAlpha = isDimmed ? 0.25 : 1;

    // Background rect
    ctx.beginPath();
    drawRoundRect(ctx, x, y, totalWidth, height, radius);
    ctx.fillStyle = isSelected || isHovered ? "#394B59" : COLORS.card;
    ctx.fill();

    // Border
    if (isSelected) {
      ctx.strokeStyle = catConfig.color;
      ctx.lineWidth = 1.5 / globalScale;
    } else if (isHovered) {
      ctx.strokeStyle = catConfig.color;
      ctx.lineWidth = 1 / globalScale;
    } else {
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 0.5 / globalScale;
    }
    ctx.stroke();

    // Colored icon section (left)
    ctx.beginPath();
    drawLeftRoundRect(ctx, x, y, iconW, height, radius);
    ctx.fillStyle = catConfig.color;
    ctx.fill();

    // Icon letter
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(catConfig.label[0], x + iconW / 2, node.y);

    // Label text
    ctx.fillStyle = COLORS.text;
    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + iconW + padding / 2, node.y);

    // Health dot (top-right corner)
    const health = node.healthStatus as string | null;
    if (health) {
      const dotRadius = 3 / globalScale;
      ctx.beginPath();
      ctx.arc(
        x + totalWidth - padding / 2,
        y + dotRadius + 1 / globalScale,
        dotRadius, 0, 2 * Math.PI,
      );
      ctx.fillStyle =
        health === "green" ? COLORS.healthGreen
          : health === "yellow" ? COLORS.healthYellow
            : COLORS.healthRed;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  };

  const nodePointerAreaPaint = (
    node: ForceNode, color: string, ctx: CanvasRenderingContext2D, globalScale: number,
  ) => {
    const label = node.id as string;
    const fontSize = 11 / globalScale;
    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    const textWidth = ctx.measureText(label).width;

    const padding = 6 / globalScale;
    const iconW = 20 / globalScale;
    const height = 24 / globalScale;
    const totalWidth = iconW + textWidth + padding * 2;
    // Expand hit area by 4px (scaled) on each side for easier clicking
    const expand = 4 / globalScale;

    ctx.fillStyle = color;
    ctx.fillRect(
      node.x - totalWidth / 2 - expand,
      node.y - height / 2 - expand,
      totalWidth + expand * 2,
      height + expand * 2,
    );
  };

  const linkCanvasObject = (
    link: ForceLink, ctx: CanvasRenderingContext2D, globalScale: number,
  ) => {
    const count = (link.count as number) || 1;
    const labels = (link.labels as string[]) || [];

    const src = link.source;
    const tgt = link.target;
    if (typeof src !== "object" || typeof tgt !== "object") return;

    const midX = (src.x + tgt.x) / 2;
    const midY = (src.y + tgt.y) / 2;

    const srcId = src.id as string;
    const tgtId = tgt.id as string;
    const isHovered = hoveredLink === link;
    const isNodeHovered = hoveredNode != null && (srcId === hoveredNode || tgtId === hoveredNode);
    const isHighlighted = isHovered || isNodeHovered;
    const isDimmed = hoveredNode != null && !isNodeHovered;
    const fontSize = 9 / globalScale;

    ctx.globalAlpha = isDimmed ? 0.15 : 1;

    let badgeText: string;
    if (isHighlighted && labels.length > 0) {
      badgeText = labels.length <= 3
        ? labels.join(", ")
        : `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
    } else {
      badgeText = `\u2194 ${count}`;
    }

    ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
    const tw = ctx.measureText(badgeText).width;

    const px = 5 / globalScale;
    const badgeW = tw + px * 2;
    const badgeH = 14 / globalScale;
    const badgeR = badgeH / 2;

    // Badge background
    ctx.beginPath();
    drawRoundRect(ctx, midX - badgeW / 2, midY - badgeH / 2, badgeW, badgeH, badgeR);
    ctx.fillStyle = isHighlighted ? "#394B59" : COLORS.card;
    ctx.fill();
    ctx.strokeStyle = isHighlighted ? COLORS.edgeHighlight : COLORS.border;
    ctx.lineWidth = (isHighlighted ? 1 : 0.5) / globalScale;
    ctx.stroke();

    // Badge text
    ctx.fillStyle = isHighlighted ? COLORS.text : COLORS.textMuted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, midX, midY);

    ctx.globalAlpha = 1;
  };

  const linkColor = (link: ForceLink) => {
    const srcId = typeof link.source === "object" ? (link.source as ForceNode).id : link.source;
    const tgtId = typeof link.target === "object" ? (link.target as ForceNode).id : link.target;
    if (hoveredLink === link) return COLORS.nodeHighlight;
    if (hoveredNode && (srcId === hoveredNode || tgtId === hoveredNode)) return COLORS.nodeHighlight;
    if (hoveredNode && srcId !== hoveredNode && tgtId !== hoveredNode) return "#252A31";
    if (selectedNode && (srcId === selectedNode.id || tgtId === selectedNode.id)) {
      return COLORS.edgeHighlight;
    }
    return COLORS.edge;
  };

  const linkWidth = (link: ForceLink) => {
    const srcId = typeof link.source === "object" ? (link.source as ForceNode).id : link.source;
    const tgtId = typeof link.target === "object" ? (link.target as ForceNode).id : link.target;
    if (hoveredLink === link) return 2;
    if (hoveredNode && (srcId === hoveredNode || tgtId === hoveredNode)) return 2;
    if (selectedNode && (srcId === selectedNode.id || tgtId === selectedNode.id)) return 1.5;
    return 1;
  };

  return {
    handleNodeClick,
    handleBackgroundClick,
    handleNodeDragEnd,
    handleNodeHover,
    handleLinkHover,
    handleZoomIn,
    handleZoomOut,
    handleZoomFit,
    handleUnpinAll,
    nodeCanvasObject,
    nodePointerAreaPaint,
    linkCanvasObject,
    linkColor,
    linkWidth,
  };
}
