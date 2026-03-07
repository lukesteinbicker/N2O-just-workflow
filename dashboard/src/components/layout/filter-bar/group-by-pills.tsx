"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";

interface GroupByPillsProps {
  active: string[];
  available: { id: string; label: string }[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}

export function GroupByPills({
  active,
  available,
  onAdd,
  onRemove,
}: GroupByPillsProps) {
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

  const remaining = available.filter((d) => !active.includes(d.id));
  const labelMap = new Map(available.map((d) => [d.id, d.label]));

  if (available.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-0.5">
        Group
      </span>
      {active.map((id) => (
        <span
          key={id}
          className="inline-flex items-center gap-1 h-6 px-1.5 rounded-sm border border-border bg-secondary text-xs text-foreground"
        >
          {labelMap.get(id) ?? id}
          <button
            onClick={() => onRemove(id)}
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
                    onAdd(d.id);
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
