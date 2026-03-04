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
