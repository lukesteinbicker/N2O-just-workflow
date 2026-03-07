"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";
import type { SortClause } from "@/lib/filter-dimensions";

interface SortByPillsProps {
  active: SortClause[];
  available: { id: string; label: string }[];
  onAdd: (key: string, direction: "asc" | "desc") => void;
  onRemove: (key: string) => void;
  onToggleDirection: (key: string) => void;
}

export function SortByPills({
  active,
  available,
  onAdd,
  onRemove,
  onToggleDirection,
}: SortByPillsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const remaining = available.filter(
    (d) => !active.some((s) => s.key === d.id)
  );
  const labelMap = new Map(available.map((d) => [d.id, d.label]));

  if (available.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-0.5">
        Sort
      </span>
      {active.map((clause) => (
        <span
          key={clause.key}
          className="inline-flex items-center gap-0.5 h-6 px-1.5 rounded-sm border border-border bg-secondary text-xs text-foreground"
        >
          {labelMap.get(clause.key) ?? clause.key}
          <button
            onClick={() => onToggleDirection(clause.key)}
            className="text-[10px] text-muted-foreground hover:text-foreground px-0.5"
            title={clause.direction === "asc" ? "Ascending" : "Descending"}
          >
            {clause.direction === "asc" ? "\u25B2" : "\u25BC"}
          </button>
          <button
            onClick={() => onRemove(clause.key)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      {remaining.length > 0 && (
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex h-6 w-6 items-center justify-center rounded-sm border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Plus size={10} />
          </button>
          {open && (
            <div className="absolute left-0 top-full mt-1 z-50 min-w-[120px] rounded-md border border-border bg-[#1C2127] shadow-lg py-1">
              {remaining.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    onAdd(d.id, "asc");
                    setOpen(false);
                  }}
                  className="flex w-full px-3 py-1.5 text-xs text-foreground hover:bg-[#2F343C] transition-colors"
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
