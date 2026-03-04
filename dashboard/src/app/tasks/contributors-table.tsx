"use client";

import { Card } from "@/components/ui/card";
import { blowUpColor } from "./helpers";
import type { Contributor } from "./use-tasks-data";

interface ContributorsTableProps {
  contributors: Contributor[];
}

export function ContributorsTable({ contributors }: ContributorsTableProps) {
  if (contributors.length === 0) return null;

  return (
    <Card className="p-3 bg-card border-border">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Contributors
      </h3>
      <table className="w-full text-xs" data-testid="contributors-table">
        <thead>
          <tr className="text-muted-foreground border-b border-border/30">
            <th className="text-left py-1.5 font-medium">Person</th>
            <th className="text-right py-1.5 font-medium">Done</th>
            <th className="text-right py-1.5 font-medium">In Progress</th>
            <th className="text-right py-1.5 font-medium">Remaining</th>
            <th className="text-right py-1.5 font-medium">Avg Blow-up</th>
            <th className="text-right py-1.5 font-medium">Last Active</th>
          </tr>
        </thead>
        <tbody>
          {contributors.map((c) => (
            <tr key={c.name} className="border-b border-border/10 hover:bg-[#2F343C] transition-colors">
              <td className="py-1.5 text-foreground font-medium">{c.name}</td>
              <td className="py-1.5 text-right font-mono" data-mono>
                <span style={{ color: "#238551" }}>{c.done}</span>
              </td>
              <td className="py-1.5 text-right font-mono" data-mono>
                <span style={{ color: "#EC9A3C" }}>{c.inProgress}</span>
              </td>
              <td className="py-1.5 text-right font-mono" data-mono>{c.remaining}</td>
              <td className="py-1.5 text-right font-mono" data-mono>
                {c.avgBlowUp !== "—" ? (
                  <span style={{ color: blowUpColor(parseFloat(c.avgBlowUp)) }}>
                    {c.avgBlowUp}x
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-1.5 text-right text-muted-foreground">{c.lastActive}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
