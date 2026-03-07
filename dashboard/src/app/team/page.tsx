// Team: Developer profiles with skills, active tasks, velocity, quality grades, and audit findings.
"use client";

import { useQuery } from "@apollo/client/react";
import { TEAM_QUERY } from "@/lib/graphql/queries";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFilterContext } from "@/lib/filter-dimensions";
import { teamFilterConfig } from "./filter-config";

export default function TeamPage() {
  const { data, loading, error } = useQuery<any>(TEAM_QUERY);

  if (loading) {
    return (
      <PageFilterContext.Provider value={teamFilterConfig}>
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Team</h1>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j} className="flex justify-between">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
      </PageFilterContext.Provider>
    );
  }

  if (error) {
    return (
      <PageFilterContext.Provider value={teamFilterConfig}>
        <div className="flex items-center justify-center h-full text-[#CD4246]">
          Error: {error.message}
        </div>
      </PageFilterContext.Provider>
    );
  }

  const developers = data?.developers ?? [];
  const quality = data?.developerQuality ?? [];
  const learningRate = data?.developerLearningRate ?? [];
  const auditFindings = data?.commonAuditFindings ?? [];

  return (
    <PageFilterContext.Provider value={teamFilterConfig}>
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Team</h1>

      <div className="grid grid-cols-2 gap-3">
        {developers.map((dev: any) => {
          const q = quality.find((q: any) => q.owner?.name === dev.name);
          const rates = learningRate
            .filter((r: any) => r.owner?.name === dev.name)
            .sort((a: any, b: any) => (a.sprint?.name ?? "").localeCompare(b.sprint?.name ?? ""));
          const findings = auditFindings.find(
            (f: any) => f.owner?.name === dev.name
          );

          return (
            <Card key={dev.name} className="p-3 bg-card border-border">
              {/* Header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-foreground">
                  {dev.fullName}
                </span>
                {dev.role && (
                  <span className="text-[11px] text-muted-foreground">
                    {dev.role}
                  </span>
                )}
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Velocity:</span>
                  <span className="font-mono" data-mono>
                    {dev.velocity?.avgMinutes
                      ? `${Math.round(dev.velocity.avgMinutes)}m/task`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed:</span>
                  <span className="font-mono" data-mono>
                    {dev.velocity?.totalTasksCompleted ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Blow-up:</span>
                  <span
                    className="font-mono"
                    style={{
                      color: (dev.velocity?.blowUpRatio ?? 0) > 2
                        ? "#CD4246"
                        : (dev.velocity?.blowUpRatio ?? 0) > 1.5
                          ? "#EC9A3C"
                          : "#238551",
                    }}
                    data-mono
                  >
                    {dev.velocity?.blowUpRatio
                      ? `${dev.velocity.blowUpRatio.toFixed(1)}x`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">A-grade:</span>
                  <span className="font-mono" data-mono>
                    {q?.aGradePct != null ? `${q.aGradePct}%` : "—"}
                  </span>
                </div>
                {q && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reversions:</span>
                      <span className="font-mono" data-mono>
                        {q.reversionsPerTask?.toFixed(1) ?? "—"}/task
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Learning Rate */}
              {rates.length > 0 && (
                <div className="mb-3">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Learning Rate
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {rates.map((r: any, i: number) => (
                      <span key={r.sprint?.name} className="text-[11px]">
                        <span className="text-muted-foreground">
                          {r.sprint?.name}:
                        </span>{" "}
                        <span
                          className="font-mono font-bold"
                          style={{
                            color: r.avgBlowUpRatio > 2
                              ? "#CD4246"
                              : r.avgBlowUpRatio > 1.5
                                ? "#EC9A3C"
                                : "#238551",
                          }}
                          data-mono
                        >
                          {r.avgBlowUpRatio?.toFixed(1)}x
                        </span>
                        {i < rates.length - 1 && (
                          <span className="text-muted-foreground ml-1">→</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills */}
              {dev.skills.length > 0 && (
                <div className="mb-3">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Skills
                  </span>
                  <div className="space-y-1 mt-1">
                    {dev.skills.map((s: any) => (
                      <div
                        key={`${s.category}-${s.skill}`}
                        className="flex items-center gap-2"
                      >
                        <span className="text-[11px] text-accent-foreground w-24 truncate">
                          {s.category}/{s.skill}
                        </span>
                        <div className="flex-1 h-2 bg-background rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-primary/50 rounded-sm"
                            style={{ width: `${(s.rating / 5) * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground w-6 text-right" data-mono>
                          {s.rating}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active tasks */}
              {dev.tasks.length > 0 && (
                <div className="mb-3">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Active Tasks
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dev.tasks.map((t: any) => (
                      <div
                        key={`${t.sprint}-${t.taskNum}`}
                        className="flex items-center gap-1.5"
                      >
                        <StatusBadge status="red" />
                        <span className="text-[11px] font-mono" data-mono>
                          #{t.taskNum}
                        </span>
                        <span className="text-[11px] text-foreground truncate">
                          {t.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit findings */}
              {findings && (findings.fakeTestIncidents > 0 || findings.belowAGrade > 0) && (
                <div className="border-t border-border pt-2">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Audit Findings
                  </span>
                  <div className="flex gap-3 mt-0.5 text-[11px]">
                    {findings.fakeTestIncidents > 0 && (
                      <span className="text-[#EC9A3C]">
                        fake_tests: {findings.fakeTestIncidents}
                      </span>
                    )}
                    {findings.patternViolations > 0 && (
                      <span className="text-[#EC9A3C]">
                        violations: {findings.patternViolations}
                      </span>
                    )}
                    {findings.belowAGrade > 0 && (
                      <span className="text-[#EC9A3C]">
                        below_A: {findings.belowAGrade}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
    </PageFilterContext.Provider>
  );
}
