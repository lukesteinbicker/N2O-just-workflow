"use client";

import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client/core";
import { useGlobalFilters, type GroupBy } from "@/hooks/use-global-filters";
import { X } from "lucide-react";

const FILTER_OPTIONS_QUERY = gql`
  query FilterOptions {
    developers {
      name
      fullName
    }
    sprints {
      name
      projectId
    }
  }
`;

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "project", label: "By Project" },
  { value: "developer", label: "By Developer" },
  { value: "status", label: "By Status" },
];

export function FilterBar() {
  const { person, project, groupBy, setPerson, setProject, setGroupBy, clearAll } =
    useGlobalFilters();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = useQuery<any>(FILTER_OPTIONS_QUERY);
  const developers: { name: string; fullName: string | null }[] = data?.developers ?? [];
  const sprints: { name: string; projectId: string | null }[] = data?.sprints ?? [];

  // Extract unique project IDs from sprints as project filter options
  const projects = Array.from(
    new Set(sprints.map((s) => s.projectId).filter(Boolean))
  ).sort() as string[];

  const hasActiveFilter = person !== null || project !== null || groupBy !== "project";

  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      {/* Person filter */}
      <select
        value={person ?? ""}
        onChange={(e) => setPerson(e.target.value || null)}
        className="h-7 rounded-sm border border-border bg-secondary px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All people</option>
        {developers.map((d) => (
          <option key={d.name} value={d.name}>
            {d.fullName || d.name}
          </option>
        ))}
      </select>

      {/* Project filter */}
      <select
        value={project ?? ""}
        onChange={(e) => setProject(e.target.value || null)}
        className="h-7 rounded-sm border border-border bg-secondary px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      {/* Group by */}
      <select
        value={groupBy}
        onChange={(e) => setGroupBy(e.target.value as GroupBy)}
        className="h-7 rounded-sm border border-border bg-secondary px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
      >
        {GROUP_BY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Clear all */}
      {hasActiveFilter && (
        <button
          onClick={clearAll}
          className="flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}
