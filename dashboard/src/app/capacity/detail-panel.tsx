"use client";

import { useState, useEffect } from "react";
import type { Project, Company } from "./capacity-data";
import { getPS, TIER_META, fmtShort, T_START } from "./capacity-utils";
import type { FlatProject } from "./project-sidebar";

// ─── Field component ───

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number" | "date" | "textarea";
}) {
  const inputClasses =
    "w-full rounded border border-border bg-background px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-primary";

  return (
    <div className="mb-3">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </div>
      {type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClasses} min-h-[60px] resize-y`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClasses} h-8`}
        />
      )}
    </div>
  );
}

// ─── Types ───

interface DetailPanelProps {
  companies: Company[];
  allProjects: FlatProject[];
  selectedId: string | null;
  selectedCoId: string | null;
  enabled: Record<string, boolean>;
  onSelectProject: (pid: string) => void;
  onSelectCompany: (cid: string) => void;
  onClose: () => void;
  onToggleEn: (id: string) => void;
  onUpdateProject: (id: string, field: string, value: string | number) => void;
}

// ─── Checkbox (small inline copy) ───

function Chk({
  on,
  color,
  size = 14,
  onClick,
}: {
  on: boolean;
  color: string;
  size?: number;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex shrink-0 cursor-pointer items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: 3,
        background: on ? color : "transparent",
        border: `2px solid ${color}`,
      }}
    >
      {on && (
        <svg width={size - 4} height={size - 4} viewBox="0 0 12 12" fill="none" className="block">
          <path
            d="M2.5 6L5 8.5L9.5 3.5"
            stroke="var(--background)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

// ─── Main panel ───

export function DetailPanel({
  companies,
  allProjects,
  selectedId,
  selectedCoId,
  enabled,
  onSelectProject,
  onSelectCompany,
  onClose,
  onToggleEn,
  onUpdateProject,
}: DetailPanelProps) {
  // Defer Date.now() to avoid SSR/client hydration mismatch
  const [now, setNow] = useState(T_START.getTime());
  useEffect(() => setNow(Date.now()), []);

  const selectedProject = allProjects.find((p) => p.id === selectedId) || null;
  const selectedCompany =
    companies.find((c) => c.id === selectedCoId) ||
    (selectedProject ? companies.find((c) => c.id === selectedProject.companyId) : null);

  if (!selectedCompany) return null;

  const coProjs = selectedCompany.projects;
  const totalSeats = coProjs.reduce((s, p) => s + p.seats, 0);
  const selPS = selectedProject ? getPS(selectedProject.prob) : null;

  return (
    <div className="flex w-[320px] min-w-[320px] shrink-0 flex-col overflow-y-auto border-l border-border bg-card scrollbar-thin">
      {/* Company header */}
      <div className="shrink-0 border-b border-border px-4 pb-2.5 pt-3.5">
        <div className="flex items-start justify-between">
          <div className="cursor-pointer" onClick={() => onSelectCompany(selectedCompany.id)}>
            <div className="text-base font-bold text-white">{selectedCompany.name}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {coProjs.length} project{coProjs.length !== 1 ? "s" : ""} &middot; {totalSeats} total seats
            </div>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer border-none bg-transparent px-1 py-0.5 text-lg leading-none text-muted-foreground hover:text-foreground"
          >
            &times;
          </button>
        </div>

        {/* Project tabs when multiple */}
        {coProjs.length > 1 && (
          <div className="mt-2.5 flex gap-1 overflow-x-auto pb-0.5">
            {coProjs.map((p) => {
              const ps = getPS(p.prob);
              const isSel = selectedId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelectProject(p.id)}
                  className="shrink-0 cursor-pointer whitespace-nowrap rounded px-2.5 py-[5px] text-[11px] transition-all"
                  style={{
                    fontWeight: isSel ? 700 : 500,
                    background: isSel ? `${ps.bar}22` : "transparent",
                    color: isSel ? ps.bar : "var(--muted-foreground)",
                    border: `1px solid ${isSel ? ps.bar : "var(--border)"}`,
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Single project CTA */}
        {coProjs.length === 1 && !selectedId && (
          <button
            onClick={() => onSelectProject(coProjs[0].id)}
            className="mt-2 w-full cursor-pointer rounded border border-primary/25 bg-primary/[0.09] py-1.5 text-xs font-semibold text-primary"
          >
            View project details
          </button>
        )}
      </div>

      {/* Content */}
      {!selectedProject ? (
        /* ─── Company overview ─── */
        <div className="flex-1 py-3">
          {coProjs.map((p) => {
            const ps = getPS(p.prob);
            const on = enabled[p.id];
            const pStart = new Date(p.start);
            const pEnd = new Date(p.end);
            const progress = Math.min(100, Math.max(5, ((now - pStart.getTime()) / (pEnd.getTime() - pStart.getTime())) * 100));

            return (
              <div
                key={p.id}
                onClick={() => onSelectProject(p.id)}
                className="cursor-pointer border-b border-border px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
              >
                <div className="mb-1 flex items-center gap-2">
                  <div className="shrink-0 rounded-sm" style={{ width: 8, height: 8, background: ps.bar }} />
                  <span
                    className="flex-1 text-[13px] font-semibold"
                    style={{ color: on ? "var(--foreground)" : "var(--muted-foreground)" }}
                  >
                    {p.name}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {p.seats}s &middot; {p.prob}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5 pl-4">
                  <span className="text-[11px] text-muted-foreground">{fmtShort(pStart)}</span>
                  <div className="relative h-0.5 max-w-[120px] flex-1 rounded-sm bg-border">
                    <div
                      className="absolute inset-y-0 left-0 rounded-sm"
                      style={{ background: ps.bar, opacity: 0.5, width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{fmtShort(pEnd)}</span>
                </div>
                <div className="mt-1 pl-4 text-[10px] leading-snug text-muted-foreground">
                  {TIER_META[p.tier]?.label}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── Project detail ─── */
        <>
          {/* Seats / Probability */}
          <div className="flex border-b border-border">
            {[
              { l: "Seats", v: selectedProject.seats },
              { l: "Probability", v: `${selectedProject.prob}%` },
            ].map((s, i) => (
              <div
                key={s.l}
                className="flex-1 px-4 py-2.5"
                style={{ borderRight: i === 0 ? "1px solid var(--border)" : "none" }}
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{s.l}</div>
                <div className="mt-0.5 text-lg font-bold" style={{ color: selPS!.bar }}>
                  {s.v}
                </div>
              </div>
            ))}
          </div>

          {/* Timeline bar */}
          <div className="border-b border-border px-4 py-3">
            <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Timeline
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground">
                {fmtShort(new Date(selectedProject.start))}
              </span>
              <div className="relative h-[3px] flex-1 rounded-sm bg-border">
                <div
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{
                    background: selPS!.bar,
                    width: `${Math.min(
                      100,
                      Math.max(
                        5,
                        ((now - new Date(selectedProject.start).getTime()) /
                          (new Date(selectedProject.end).getTime() - new Date(selectedProject.start).getTime())) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
              <span className="text-[13px] font-semibold text-foreground">
                {fmtShort(new Date(selectedProject.end))}
              </span>
            </div>
          </div>

          {/* Edit Details */}
          <div className="flex-1 px-4 pt-4">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Edit Details
            </div>
            <Field label="Project Name" value={selectedProject.name} onChange={(v) => onUpdateProject(selectedId!, "name", v)} />

            {/* Status buttons */}
            <div className="mb-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Status
              </div>
              <div className="flex gap-1">
                {(["active", "pipeline", "speculative", "internal"] as const).map((tk) => (
                  <button
                    key={tk}
                    onClick={() => onUpdateProject(selectedId!, "tier", tk)}
                    className="flex-1 cursor-pointer rounded-[3px] px-1 py-[5px] text-[10px] font-semibold capitalize"
                    style={{
                      background: selectedProject.tier === tk ? `${TIER_META[tk].color}22` : "transparent",
                      color: selectedProject.tier === tk ? TIER_META[tk].color : "var(--muted-foreground)",
                      border: `1px solid ${selectedProject.tier === tk ? TIER_META[tk].color : "var(--border)"}`,
                    }}
                  >
                    {tk}
                  </button>
                ))}
              </div>
            </div>

            {/* Seats + Probability */}
            <div className="flex gap-2.5">
              <div className="flex-1">
                <Field
                  label="Seats"
                  value={selectedProject.seats}
                  onChange={(v) => onUpdateProject(selectedId!, "seats", v)}
                  type="number"
                />
              </div>
              <div className="flex-1">
                <Field
                  label="Probability %"
                  value={selectedProject.prob}
                  onChange={(v) => onUpdateProject(selectedId!, "prob", v)}
                  type="number"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="flex gap-2.5">
              <div className="flex-1">
                <Field
                  label="Start Date"
                  value={selectedProject.start}
                  onChange={(v) => onUpdateProject(selectedId!, "start", v)}
                  type="date"
                />
              </div>
              <div className="flex-1">
                <Field
                  label="End Date"
                  value={selectedProject.end}
                  onChange={(v) => onUpdateProject(selectedId!, "end", v)}
                  type="date"
                />
              </div>
            </div>

            <Field
              label="Notes"
              value={selectedProject.notes}
              onChange={(v) => onUpdateProject(selectedId!, "notes", v)}
              type="textarea"
            />

            {/* Visibility toggle */}
            <div
              className="mt-2 flex cursor-pointer items-center gap-2 py-2"
              onClick={() => onToggleEn(selectedId!)}
            >
              <Chk
                on={enabled[selectedId!]}
                color={selPS!.bar}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleEn(selectedId!);
                }}
              />
              <span
                className="text-[13px] font-semibold"
                style={{
                  color: enabled[selectedId!] ? "var(--foreground)" : "var(--muted-foreground)",
                }}
              >
                {enabled[selectedId!] ? "Visible on chart" : "Hidden from chart"}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
