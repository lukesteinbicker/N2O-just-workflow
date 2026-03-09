"use client";

import { useState } from "react";
import type { DailyPoint } from "./capacity-data";
import { fmtDate, GRANS, SUPPLY, LEAD_CEIL } from "./capacity-utils";
import { DATA } from "./capacity-data";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const cfg = DATA.config;

interface CapacityHeaderProps {
  gran: string;
  onGranChange: (g: string) => void;
  hoverData: DailyPoint | null;
  peakRaw: number;
  maxGap: number;
  peakProjects: number;
}

export function CapacityHeader({
  gran,
  onGranChange,
  hoverData,
  peakRaw,
  maxGap,
  peakProjects,
}: CapacityHeaderProps) {
  const isH = hoverData !== null;
  const dVal = isH ? hoverData.raw : peakRaw;
  const dGap = isH
    ? Math.round((hoverData.raw - SUPPLY) * 10) / 10
    : maxGap;
  const dProj = isH ? hoverData.cnt : peakProjects;

  return (
    <div className="shrink-0 border-b border-border px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[17px] font-bold text-white">
          Capacity Planner
        </span>
        <GranularityDropdown gran={gran} onGranChange={onGranChange} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-5">
        {/* Hover date */}
        <div
          className={`min-w-[115px] transition-opacity duration-100 ${isH ? "opacity-100" : "opacity-25"}`}
        >
          <div className="text-[9px] font-semibold uppercase tracking-[0.06em] leading-none text-muted-foreground">
            {isH ? "Hovering" : "Hover to explore"}
          </div>
          <div className="mt-[3px] text-[15px] font-bold text-white">
            {isH ? fmtDate(hoverData.date) : "—"}
          </div>
        </div>

        <div className="h-7 w-px shrink-0 bg-border" />

        {/* Students */}
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.06em] leading-none text-muted-foreground">
            Students
          </div>
          <div className="mt-[3px] text-lg font-bold text-[#00E5FF]">
            {cfg.student_count}
          </div>
        </div>

        {/* Professionals */}
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.06em] leading-none text-muted-foreground">
            Professionals
          </div>
          <div className="mt-[3px] text-lg font-bold text-muted-foreground">
            {cfg.professional_count}
          </div>
        </div>

        <div className="h-7 w-px shrink-0 bg-border" />

        {/* Demand */}
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.06em] leading-none text-muted-foreground">
            {isH ? "Demand" : "Peak Demand"}
          </div>
          <div className="mt-[3px] text-lg font-bold text-[#FF9100]">
            {dVal}{" "}
            <span className="text-[11px] font-medium text-muted-foreground">
              seats
            </span>
          </div>
        </div>

        {/* Gap */}
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.06em] leading-none text-muted-foreground">
            {isH ? "Gap" : "Max Gap"}
          </div>
          <div
            className="mt-[3px] text-lg font-bold"
            style={{ color: dGap > 0 ? "#FF5252" : "#00E676" }}
          >
            {dGap > 0 ? `−${dGap}` : `+${Math.abs(dGap)}`}{" "}
            <span className="text-[11px] font-medium text-muted-foreground">
              {dGap > 0 ? "short" : "surplus"}
            </span>
          </div>
        </div>

        {/* Projects */}
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.06em] leading-none text-muted-foreground">
            {isH ? "Projects" : "Peak Projects"}
          </div>
          <div className="mt-[3px] flex items-baseline gap-1 text-lg font-bold leading-none">
            <span style={{ color: dProj >= LEAD_CEIL ? "#FF5252" : undefined }}>
              {dProj}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              / {LEAD_CEIL}
            </span>
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
              <TooltipContent side="top" sideOffset={6} className="bg-[#1C2127] border border-border text-foreground p-2 max-w-[220px]" style={{ "--tooltip-bg": "#1C2127" } as React.CSSProperties}>
                <p className="text-xs leading-snug">We expect the average Cannoneer to be able to take on 8 projects at once in a supervisory role</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}

function GranularityDropdown({
  gran,
  onGranChange,
}: {
  gran: string;
  onGranChange: (g: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 min-w-[110px] items-center justify-between gap-2 rounded border border-border bg-transparent px-3 text-xs font-semibold text-foreground"
      >
        {GRANS.find((g) => g.key === gran)?.label}
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path
            d="M1 1L5 5L9 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          />
        </svg>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-[calc(100%+4px)] z-[9999] min-w-[130px] overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            {GRANS.map((g) => (
              <div
                key={g.key}
                onClick={() => {
                  onGranChange(g.key);
                  setOpen(false);
                }}
                className={`cursor-pointer px-3.5 py-2 text-[13px] ${
                  gran === g.key ? "font-bold text-white bg-primary/15" : "font-medium"
                }`}
              >
                {g.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

