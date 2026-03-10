"use client";

import { useEffect } from "react";
import { formatTimeShort, formatDuration } from "./utils";
import type { LayoutEntry } from "./utils";
import type { TogglProject, TogglTag } from "../use-time-tracking-data";

interface EntryDetailPanelProps {
  entry: LayoutEntry;
  onClose: () => void;
  projects: TogglProject[];
  tags: TogglTag[];
}

export function EntryDetailPanel({ entry, onClose, projects, tags }: EntryDetailPanelProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const startTime = new Date(entry.start);
  const project = projects.find((p) => p.id === entry.projectId);

  return (
    <div className="w-80 shrink-0 bg-[#1a1d24] border-l-2 border-[#3a3f4a] pt-[70px]">
      <div className="sticky top-[70px] max-h-[calc(100vh-70px)] overflow-y-auto p-5">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div
              className="w-1 self-stretch rounded-sm shrink-0"
              style={{ background: entry.color }}
            />
            <div className="min-w-0">
              <div className="text-base font-semibold text-[#e0e0e0] break-words leading-snug">
                {entry.description || "No description"}
              </div>
              <div className="text-[13px] text-[#8a8f9a] mt-1">
                {entry.member?.togglName || "Unknown"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#5a5f6a] hover:text-[#e0e0e0] text-lg leading-none ml-2"
          >
            ✕
          </button>
        </div>

        {/* Details */}
        <div className="flex flex-col">
          <div className="flex items-center py-2.5 border-b border-[#2a2f3a]">
            <span className="text-xs text-[#5a5f6a] w-[90px] shrink-0">Time</span>
            <span className="text-[13px] text-[#e0e0e0]">
              {formatTimeShort(entry.start)}
              {entry.isRunning
                ? " → ongoing"
                : entry.stop
                  ? ` → ${formatTimeShort(entry.stop)}`
                  : ""}
              <span
                className="ml-2"
                style={{ color: entry.isRunning ? "#4caf50" : "#5a5f6a" }}
              >
                {entry.isRunning
                  ? `${formatDuration(entry.seconds)} (running)`
                  : formatDuration(entry.seconds)}
              </span>
            </span>
          </div>

          <div className="flex items-center py-2.5 border-b border-[#2a2f3a]">
            <span className="text-xs text-[#5a5f6a] w-[90px] shrink-0">Date</span>
            <span className="text-[13px] text-[#e0e0e0]">
              {startTime.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>

          {project && (
            <div className="flex items-center py-2.5 border-b border-[#2a2f3a]">
              <span className="text-xs text-[#5a5f6a] w-[90px] shrink-0">Project</span>
              <span className="text-[13px] text-[#e0e0e0]">{project.name}</span>
            </div>
          )}

          {entry.tagIds && entry.tagIds.length > 0 && (
            <div className="flex items-center py-2.5">
              <span className="text-xs text-[#5a5f6a] w-[90px] shrink-0">Tags</span>
              <span className="text-[13px] text-[#e0e0e0]">
                {entry.tagIds
                  .map((tid) => tags.find((t) => t.id === tid)?.name || String(tid))
                  .join(", ")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
