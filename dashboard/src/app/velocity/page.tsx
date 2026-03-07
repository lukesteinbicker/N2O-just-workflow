// Velocity: Estimation accuracy, blow-up factors, phase timing, and token efficiency tables.
"use client";

import { useQuery } from "@apollo/client/react";
import { VELOCITY_QUERY } from "@/lib/graphql/queries";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export default function VelocityPage() {
  const { data, loading, error } = useQuery<any>(VELOCITY_QUERY);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Velocity Trends</h1>
        {/* Learning rate card */}
        <div className="rounded-md border border-border bg-card p-3 space-y-3">
          <Skeleton className="h-3 w-56" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
        </div>
        {/* 2-col grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-card p-3 space-y-2">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
          <div className="rounded-md border border-border bg-card p-3 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
        {/* Blow-up table */}
        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          <Skeleton className="h-3 w-52" />
          <div className="space-y-1.5">
            <div className="flex gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-3 flex-1" />
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                {Array.from({ length: 7 }).map((_, j) => (
                  <Skeleton key={j} className="h-3.5 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[#CD4246]">
        Error: {error.message}
      </div>
    );
  }

  const learningRate = data?.developerLearningRate ?? [];
  const blowUpFactors = data?.blowUpFactors ?? [];
  const byType = data?.estimationAccuracyByType ?? [];
  const byComplexity = data?.estimationAccuracyByComplexity ?? [];
  const tokenTrend = data?.tokenEfficiencyTrend ?? [];

  // Group learning rate by developer
  const devRates = new Map<string, Array<{ sprint: string; ratio: number }>>();
  for (const r of learningRate) {
    const list = devRates.get(r.owner?.name) ?? [];
    list.push({ sprint: r.sprint?.name, ratio: r.avgBlowUpRatio });
    devRates.set(r.owner?.name, list);
  }

  // Aggregate phase distribution by sprint
  const phaseData = data?.phaseTimingDistribution ?? [];
  const sprintPhases = new Map<string, Map<string, number>>();
  for (const p of phaseData) {
    const sp = sprintPhases.get(p.sprint?.name) ?? new Map();
    sp.set(p.phase, (sp.get(p.phase) ?? 0) + p.seconds);
    sprintPhases.set(p.sprint?.name, sp);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Velocity Trends</h1>

      {/* Developer Learning Rate */}
      <Card className="p-3 bg-card border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Developer Learning Rate (blow-up ratio by sprint)
        </h3>
        {devRates.size === 0 ? (
          <p className="text-xs text-muted-foreground">No data</p>
        ) : (
          <div className="space-y-3">
            {Array.from(devRates.entries()).map(([dev, rates]) => (
              <div key={dev}>
                <span className="text-xs font-semibold text-foreground">
                  {dev}
                </span>
                <div className="flex items-center gap-3 mt-1">
                  {rates.map((r, i) => (
                    <div key={r.sprint} className="flex items-center gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        {r.sprint}:
                      </span>
                      <span
                        className="text-xs font-mono font-bold"
                        style={{
                          color: r.ratio > 2 ? "#CD4246" : r.ratio > 1.5 ? "#EC9A3C" : "#238551",
                        }}
                        data-mono
                      >
                        {r.ratio?.toFixed(1) ?? "—"}x
                      </span>
                      {i < rates.length - 1 && (
                        <span className="text-muted-foreground mx-1">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {/* Phase Timing by Sprint */}
        <Card className="p-3 bg-card border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Phase Timing by Sprint
          </h3>
          {sprintPhases.size === 0 ? (
            <p className="text-xs text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-2">
              {Array.from(sprintPhases.entries()).map(([sprint, phases]) => {
                const total = Array.from(phases.values()).reduce((a, b) => a + b, 0);
                return (
                  <div key={sprint}>
                    <span className="text-[11px] text-accent-foreground font-mono" data-mono>
                      {sprint}
                    </span>
                    <div className="flex h-3 mt-0.5 rounded-sm overflow-hidden">
                      {["RED", "GREEN", "REFACTOR", "AUDIT"].map((phase) => {
                        const secs = phases.get(phase) ?? 0;
                        const pct = total > 0 ? (secs / total) * 100 : 0;
                        const colors: Record<string, string> = {
                          RED: "#CD4246",
                          GREEN: "#238551",
                          REFACTOR: "#2D72D2",
                          AUDIT: "#EC9A3C",
                        };
                        if (pct === 0) return null;
                        return (
                          <div
                            key={phase}
                            className="h-full"
                            style={{ width: `${pct}%`, backgroundColor: colors[phase], opacity: 0.7 }}
                            title={`${phase}: ${Math.round(pct)}%`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Token Efficiency */}
        <Card className="p-3 bg-card border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Token Efficiency
          </h3>
          {tokenTrend.length === 0 ? (
            <p className="text-xs text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-1">
              {tokenTrend.map((t: any) => (
                <div
                  key={`${t.sprint?.name}-${t.complexity}`}
                  className="flex items-center justify-between"
                >
                  <span className="text-xs font-mono text-accent-foreground" data-mono>
                    {t.sprint?.name} ({t.complexity ?? "—"})
                  </span>
                  <span className="text-xs font-mono" data-mono>
                    {t.avgTokensPerTask
                      ? `${(t.avgTokensPerTask / 1000).toFixed(0)}K tokens/task`
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Blow-up Factors Table */}
      <Card className="p-3 bg-card border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Blow-up Factors (tasks exceeding 2x estimate)
        </h3>
        {blowUpFactors.length === 0 ? (
          <p className="text-xs text-muted-foreground">No blow-ups detected</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[11px] h-7">Sprint</TableHead>
                <TableHead className="text-[11px] h-7">Task</TableHead>
                <TableHead className="text-[11px] h-7">Type</TableHead>
                <TableHead className="text-[11px] h-7">Est.</TableHead>
                <TableHead className="text-[11px] h-7">Actual</TableHead>
                <TableHead className="text-[11px] h-7">Blow-up</TableHead>
                <TableHead className="text-[11px] h-7">Grade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blowUpFactors.map((b: any) => (
                <TableRow
                  key={`${b.sprint?.name}-${b.taskNum}`}
                  className="border-border hover:bg-secondary/50"
                >
                  <TableCell className="py-1.5 text-xs font-mono" data-mono>
                    {b.sprint?.name}
                  </TableCell>
                  <TableCell className="py-1.5 text-xs">
                    #{b.taskNum} {b.title}
                  </TableCell>
                  <TableCell className="py-1.5 text-xs text-muted-foreground">
                    {b.type}
                  </TableCell>
                  <TableCell className="py-1.5 text-xs font-mono" data-mono>
                    {b.estimatedMinutes ? `${b.estimatedMinutes}m` : "—"}
                  </TableCell>
                  <TableCell className="py-1.5 text-xs font-mono" data-mono>
                    {b.actualMinutes ? `${b.actualMinutes}m` : "—"}
                  </TableCell>
                  <TableCell className="py-1.5 text-xs font-mono font-bold text-[#CD4246]" data-mono>
                    {b.blowUpRatio?.toFixed(1)}x
                  </TableCell>
                  <TableCell className="py-1.5">
                    {b.testingPosture && <StatusBadge status={b.testingPosture} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Estimation Accuracy */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 bg-card border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Estimation Accuracy by Type
          </h3>
          <div className="space-y-1">
            {byType.map((t: any) => (
              <div key={t.type} className="flex items-center justify-between">
                <span className="text-xs text-accent-foreground">{t.type}</span>
                <span
                  className="text-xs font-mono font-bold"
                  style={{ color: t.blowUpRatio > 2 ? "#CD4246" : t.blowUpRatio > 1.5 ? "#EC9A3C" : "#238551" }}
                  data-mono
                >
                  {t.blowUpRatio?.toFixed(1)}x
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-3 bg-card border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Estimation Accuracy by Complexity
          </h3>
          <div className="space-y-1">
            {byComplexity.map((c: any) => (
              <div key={c.complexity} className="flex items-center justify-between">
                <span className="text-xs text-accent-foreground">{c.complexity}</span>
                <span
                  className="text-xs font-mono font-bold"
                  style={{ color: c.blowUpRatio > 2 ? "#CD4246" : c.blowUpRatio > 1.5 ? "#EC9A3C" : "#238551" }}
                  data-mono
                >
                  {c.blowUpRatio?.toFixed(1)}x
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
