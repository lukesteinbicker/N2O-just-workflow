/**
 * Category sidebar for the Ontology Explorer.
 * Shows category groups with type lists, search, and filter.
 */

import { useState, useCallback } from "react";
import { Search, X, ChevronDown, ChevronRight } from "lucide-react";
import type { CategoryConfigEntry } from "./schema-adapter";
import type { EnrichedNode } from "./ontology-canvas";

export interface CategorySidebarProps {
  categoryConfig: Record<string, CategoryConfigEntry>;
  categoryGroups: Record<string, EnrichedNode[]>;
  activeCategoryFilter: string | null;
  onCategoryFilterChange: (filter: string | null) => void;
  selectedNode: EnrichedNode | null;
  onSelectNode: (node: EnrichedNode) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

export function CategorySidebar({
  categoryConfig, categoryGroups, activeCategoryFilter, onCategoryFilterChange,
  selectedNode, onSelectNode, searchQuery, onSearchQueryChange,
}: CategorySidebarProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleCollapse = useCallback((key: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className="w-[220px] border-r border-border bg-card flex-shrink-0 flex flex-col overflow-hidden">
      {/* Search */}
      <div className="h-[44px] px-3 flex items-center border-b border-border">
        <div className="flex items-center rounded-md border border-border bg-background px-2 py-1 text-xs">
          <Search size={12} className="mr-1.5 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search types..."
            className="bg-transparent text-foreground placeholder:text-muted-foreground outline-none w-full text-xs"
          />
          {searchQuery && (
            <button onClick={() => onSearchQueryChange("")} className="ml-1 text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Category groups */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 scrollbar-thin">
        {Object.entries(categoryConfig).map(([key, config]) => {
          const nodes = categoryGroups[key];
          if (!nodes || nodes.length === 0) return null;

          const CatIcon = config.icon;
          const isActive = activeCategoryFilter === key;
          const isCollapsed = collapsedCategories.has(key);

          const visibleInCat = searchQuery.trim()
            ? nodes.filter((n) => n.id.toLowerCase().includes(searchQuery.toLowerCase()))
            : nodes;
          if (visibleInCat.length === 0 && searchQuery.trim()) return null;

          return (
            <div key={key}>
              {/* Category header */}
              <div
                className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                  isActive ? "bg-[#394B59]" : "hover:bg-[#394B59]/50"
                }`}
                onClick={() => onCategoryFilterChange(activeCategoryFilter === key ? null : key)}
              >
                <CatIcon size={14} style={{ color: config.color }} className="flex-shrink-0" />
                <span className="text-foreground font-medium flex-1 text-left">{config.label}</span>
                <span className="text-muted-foreground text-[10px]">{nodes.length}</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapse(key);
                  }}
                  className="text-muted-foreground hover:text-foreground cursor-pointer flex-shrink-0"
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </span>
              </div>

              {/* Type list */}
              {!isCollapsed && (
                <div className="ml-5 mt-0.5 space-y-0.5">
                  {visibleInCat.map((node) => (
                    <div
                      key={node.id}
                      className={`w-full text-left rounded px-2 py-1 text-xs cursor-pointer transition-colors ${
                        selectedNode?.id === node.id
                          ? "bg-[#394B59] text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-[#394B59]/30"
                      }`}
                      onClick={() => onSelectNode(node)}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: config.color }}
                        />
                        <span className="truncate">{node.id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
