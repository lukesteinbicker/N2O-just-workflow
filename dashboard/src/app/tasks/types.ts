export interface Dependency {
  sprint: string;
  taskNum: number;
}

export interface Task {
  sprint: string;
  taskNum: number;
  title: string;
  spec: string | null;
  status: string;
  blockedReason: string | null;
  type: string;
  owner: { name: string } | null;
  complexity: string | null;
  startedAt: string | null;
  completedAt: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  blowUpRatio: number | null;
  dependencies: Dependency[];
  dependents: Dependency[];
}

/** Generic group for Gantt display — works for sprint, developer, status, or project grouping. */
export interface GanttGroup {
  label: string;
  groupKey: string;
  tasks: Task[];
}

/** A sprint's tasks grouped together (used in both status and project views). */
export interface SprintTaskGroup {
  sprint: string;
  tasks: Task[];
}

/** Tasks grouped by project, with sprints nested inside each project. */
export interface ProjectGroup {
  projectId: string | null;
  sprints: SprintTaskGroup[];
}

/** Tasks grouped by developer/owner across all sprints. */
export interface DeveloperGroup {
  developer: string;
  tasks: Task[];
}
