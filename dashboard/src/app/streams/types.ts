export interface SubagentSession {
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  toolCallCount: number | null;
  model: string | null;
}

export interface Session {
  sessionId: string;
  developer: { name: string } | null;
  sprint: { name: string } | null;
  taskNum: number | null;
  taskTitle: string | null;
  skillName: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  toolCallCount: number | null;
  messageCount: number | null;
  model: string | null;
  subagents: SubagentSession[];
}

export interface SessionWithLane extends Session {
  lane: number;
}

export interface DevRow {
  name: string;
  sessions: SessionWithLane[];
  laneCount: number;
}
