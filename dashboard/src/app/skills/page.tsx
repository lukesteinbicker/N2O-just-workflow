// Skills: Tool/skill usage, token consumption, duration, and precision tables with version comparisons.
"use client";

import { useQuery } from "@apollo/client/react";
import { SKILLS_QUERY } from "@/lib/graphql/queries";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

function formatTokens(n: number | null): string {
  if (!n) return "—";
  return n > 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.round(seconds / 60)}m`;
}

export default function SkillsPage() {
  const { data, loading, error } = useQuery<any>(SKILLS_QUERY);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Skill Analysis</h1>
        {/* Usage & Cost table skeleton */}
        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          <Skeleton className="h-3 w-24" />
          <div className="space-y-1.5">
            <div className="flex gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-3 flex-1" />
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-3.5 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </div>
        {/* 2-col grid */}
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-3 space-y-2">
              <Skeleton className="h-3 w-40" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 w-10" />
                </div>
              ))}
            </div>
          ))}
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

  const usage = data?.skillUsage ?? [];
  const tokenUsage = data?.skillTokenUsage ?? [];
  const duration = data?.skillDuration ?? [];
  const precision = data?.skillPrecision ?? [];
  const versionTokens = data?.skillVersionTokenUsage ?? [];
  const versionDuration = data?.skillVersionDuration ?? [];
  const versionPrecision = data?.skillVersionPrecision ?? [];

  // Aggregate token usage by skill
  const skillTokens = new Map<string, { invocations: number; tokens: number }>();
  for (const t of tokenUsage) {
    const key = t.skill?.name ?? "(none)";
    const existing = skillTokens.get(key) ?? { invocations: 0, tokens: 0 };
    existing.invocations += t.invocations;
    existing.tokens += t.totalInputTokens + t.totalOutputTokens;
    skillTokens.set(key, existing);
  }

  // Aggregate duration by skill
  const skillDurations = new Map<string, number[]>();
  for (const d of duration) {
    const key = d.skill?.name ?? "(none)";
    const list = skillDurations.get(key) ?? [];
    if (d.seconds) list.push(d.seconds);
    skillDurations.set(key, list);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Skill Analysis</h1>

      {/* Usage & Cost Table */}
      <Card className="p-3 bg-card border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Usage & Cost
        </h3>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-[11px] h-7">Tool</TableHead>
              <TableHead className="text-[11px] h-7">Invocations</TableHead>
              <TableHead className="text-[11px] h-7">Sessions</TableHead>
              <TableHead className="text-[11px] h-7">First Used</TableHead>
              <TableHead className="text-[11px] h-7">Last Used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usage.map((u: any) => (
              <TableRow key={u.skill?.name} className="border-border hover:bg-secondary/50">
                <TableCell className="py-1.5 text-xs font-mono text-accent-foreground" data-mono>
                  {u.skill?.name}
                </TableCell>
                <TableCell className="py-1.5 text-xs font-mono" data-mono>
                  {u.invocations}
                </TableCell>
                <TableCell className="py-1.5 text-xs font-mono" data-mono>
                  {u.sessions}
                </TableCell>
                <TableCell className="py-1.5 text-[11px] text-muted-foreground">
                  {u.firstUsed?.split("T")[0] ?? "—"}
                </TableCell>
                <TableCell className="py-1.5 text-[11px] text-muted-foreground">
                  {u.lastUsed?.split("T")[0] ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {/* Exploration Ratio */}
        <Card className="p-3 bg-card border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Exploration Ratio (lower = more focused)
          </h3>
          {precision.length === 0 ? (
            <p className="text-xs text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-1.5">
              {precision.map((p: any) => (
                <div key={`${p.sprint?.name}-${p.taskNum}`} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-accent-foreground w-32 truncate" data-mono>
                    {p.sprint?.name} #{p.taskNum}
                  </span>
                  <div className="flex-1 h-3 bg-background rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-primary/50 rounded-sm"
                      style={{ width: `${(p.explorationRatio ?? 0) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-10 text-right" data-mono>
                    {p.explorationRatio?.toFixed(2) ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Version Comparison */}
        <Card className="p-3 bg-card border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Version Comparison
          </h3>
          {versionTokens.length === 0 ? (
            <p className="text-xs text-muted-foreground">No version data</p>
          ) : (
            <div className="space-y-2">
              {versionTokens.map((v: any) => {
                const dur = versionDuration.find(
                  (d: any) =>
                    d.skill?.name === v.skill?.name &&
                    d.skillVersion === v.skillVersion
                );
                const prec = versionPrecision.find(
                  (p: any) =>
                    p.skill?.name === v.skill?.name &&
                    p.skillVersion === v.skillVersion
                );
                return (
                  <div key={`${v.skill?.name}-${v.skillVersion}`}>
                    <span className="text-xs font-semibold text-foreground">
                      {v.skill?.name}{" "}
                      <span className="text-primary">{v.skillVersion}</span>
                    </span>
                    <div className="flex gap-4 mt-0.5 text-[11px] text-muted-foreground">
                      <span className="font-mono" data-mono>
                        {formatTokens(v.totalInputTokens + v.totalOutputTokens)} tok
                      </span>
                      {dur && (
                        <span className="font-mono" data-mono>
                          {formatDuration(dur.avgSeconds)} avg
                        </span>
                      )}
                      {prec && (
                        <span className="font-mono" data-mono>
                          {prec.avgExplorationRatio?.toFixed(2)} precision
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
