"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}

export function MultiSelectFilter({
  label,
  options,
  selected,
  onToggle,
}: MultiSelectFilterProps) {
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

  const hasSelection = selected.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 items-center gap-1 rounded-sm border px-2 text-xs transition-colors"
        style={{
          borderColor: hasSelection ? "#2D72D2" : "#394048",
          backgroundColor: hasSelection ? "#2D72D220" : "transparent",
          color: hasSelection ? "#2D72D2" : "#ABB3BF",
        }}
      >
        {label}
        {hasSelection && (
          <span className="font-mono text-[10px] ml-0.5" data-mono>
            ({selected.length})
          </span>
        )}
        <ChevronDown size={10} className="ml-0.5 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] max-h-[240px] overflow-y-auto rounded-md border border-border bg-[#1C2127] shadow-lg py-1">
          {options.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              No options
            </p>
          )}
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-[#2F343C] transition-colors"
              >
                <div
                  className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0"
                  style={{
                    borderColor: checked ? "#2D72D2" : "#394048",
                    backgroundColor: checked ? "#2D72D2" : "transparent",
                  }}
                >
                  {checked && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 5L4 7L8 3"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="truncate">{opt}</span>
              </button>
            );
          })}
          {hasSelection && (
            <div className="border-t border-border/30 mt-1 pt-1 px-3 pb-1">
              <button
                onClick={() => {
                  for (const v of selected) onToggle(v);
                }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <X size={10} />
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
