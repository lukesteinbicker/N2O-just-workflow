// Shared row → GraphQL mappers.
// Extracted to avoid circular imports between resolver files.

export function mapTask(row: any) {
  if (!row) return null;
  return {
    sprint: row.sprint,
    taskNum: row.task_num,
    spec: row.spec,
    title: row.title,
    description: row.description,
    doneWhen: row.done_when,
    status: row.status,
    blockedReason: row.blocked_reason,
    type: row.type,
    complexity: row.complexity ? parseFloat(row.complexity) || null : null,
    estimatedMinutes: row.estimated_minutes ?? null,
    priority: row.priority,
    horizon: row.horizon,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    reversions: row.reversions,
    testingPosture: row.testing_posture,
    verified: row.verified === true || row.verified === 1,
    commitHash: row.commit_hash,
    _owner: row.owner,
  };
}

export function mapDeveloper(row: any) {
  if (!row) return null;
  return {
    name: row.name,
    fullName: row.full_name,
    role: row.role,
    baselineCompetency: row.baseline_competency,
    strengths: row.strengths,
    growthAreas: row.growth_areas,
  };
}

export function mapProject(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    repoUrl: row.repo_url,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    metadata: row.metadata,
  };
}

export function mapSprint(row: any) {
  if (!row) return null;
  return {
    name: row.name,
    projectId: row.project_id,
    startAt: row.start_at,
    endAt: row.end_at,
    deadline: row.deadline,
    goal: row.goal,
    status: row.status,
  };
}

export function mapEvent(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    timestamp: row.timestamp,
    sessionId: row.session_id,
    sprint: row.sprint,
    taskNum: row.task_num,
    eventType: row.event_type,
    toolName: row.tool_name,
    skillName: row.skill_name,
    skillVersion: row.skill_version,
    phase: row.phase,
    agentId: row.agent_id,
    agentType: row.agent_type,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
  };
}

export function mapTranscript(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    parentSessionId: row.parent_session_id,
    filePath: row.file_path,
    fileSize: row.file_size_bytes,
    messageCount: row.message_count,
    userMessageCount: row.user_message_count,
    assistantMessageCount: row.assistant_message_count,
    toolCallCount: row.tool_call_count,
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    model: row.model,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    sprint: row.sprint,
    taskNum: row.task_num,
  };
}
