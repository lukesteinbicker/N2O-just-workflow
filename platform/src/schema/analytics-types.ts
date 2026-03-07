export const analyticsTypeDefs = `#graphql
  extend type Query {
    # ── Skill Analytics ──────────────────────────────────────────────

    """Skill/tool usage frequency: invocation counts and session counts per tool"""
    skillUsage(dateFrom: String, dateTo: String): [SkillUsage!]!

    """Token consumption per skill per sprint: input/output tokens and cost proxy"""
    skillTokenUsage(sprint: String): [SkillTokenUsage!]!

    """Token usage broken down by skill version for version-over-version comparison"""
    skillVersionTokenUsage(skillName: String): [SkillVersionTokenUsage!]!

    """Time spent per skill per sprint in seconds"""
    skillDuration(sprint: String): [SkillDuration!]!

    """Duration stats per skill version: avg, min, max seconds"""
    skillVersionDuration(skillName: String): [SkillVersionDuration!]!

    """Exploration ratio per skill: files read vs files modified (lower is more precise)"""
    skillPrecision(sprint: String): [SkillPrecision!]!

    """Precision stats per skill version: average exploration ratio across tasks"""
    skillVersionPrecision(skillName: String): [SkillVersionPrecision!]!

    # ── Velocity Analytics ───────────────────────────────────────────

    """Developer learning rate: avg blow-up ratio per sprint showing improvement over time"""
    developerLearningRate(owner: String): [LearningRate!]!

    """Time distribution across TDD phases (RED, GREEN, REFACTOR, AUDIT) per task"""
    phaseTimingDistribution(sprint: String): [PhaseTimingDistribution!]!

    """Token efficiency trend: average tokens consumed per task by sprint and complexity"""
    tokenEfficiencyTrend: [TokenEfficiency!]!

    """Tasks that exceeded estimates: blow-up ratio, reversions, and testing posture"""
    blowUpFactors(sprint: String): [BlowUpFactor!]!

    """Estimation accuracy per developer: avg estimated vs actual hours and error"""
    estimationAccuracy(owner: String, dateFrom: String, dateTo: String): [EstimationAccuracy!]!

    """Estimation accuracy grouped by task type (database, frontend, infra, etc.)"""
    estimationAccuracyByType: [EstimationAccuracyByType!]!

    """Estimation accuracy grouped by complexity level (low, medium, high)"""
    estimationAccuracyByComplexity: [EstimationAccuracyByComplexity!]!

    # ── Quality Analytics ────────────────────────────────────────────

    """Developer quality metrics: reversions per task, A-grade testing percentage"""
    developerQuality(owner: String, dateFrom: String, dateTo: String): [DeveloperQuality!]!

    """Common audit findings per developer: fake tests, pattern violations, below-A grades"""
    commonAuditFindings(owner: String, dateFrom: String, dateTo: String): [AuditFindings!]!

    """Reversion hotspots by task type and complexity: where quality issues cluster"""
    reversionHotspots: [ReversionHotspot!]!

    # ── Sprint & Session Analytics ───────────────────────────────────

    """Sprint velocity: completed tasks, avg hours per task, total hours per sprint"""
    sprintVelocity(sprint: String, dateFrom: String, dateTo: String): [SprintVelocity!]!

    """Session timeline for Gantt chart: session start/end, tokens, tool calls, subagents"""
    sessionTimeline(developer: String, dateFrom: String, dateTo: String): [SessionTimelineEntry!]!
  }

  # ── Skill Entity ────────────────────────────────────────────────────

  type Skill {
    name: String!
  }

  # ── Skill Types ────────────────────────────────────────────────────

  type SkillUsage {
    skill: Skill!
    invocations: Int!
    sessions: Int!
    firstUsed: String
    lastUsed: String
  }

  type SkillTokenUsage {
    skill: Skill
    sprint: Sprint
    invocations: Int!
    totalInputTokens: Int!
    totalOutputTokens: Int!
    avgTokensPerCall: Float
  }

  type SkillVersionTokenUsage {
    skill: Skill
    skillVersion: String
    invocations: Int!
    totalInputTokens: Int!
    totalOutputTokens: Int!
    avgTokensPerCall: Float
  }

  type SkillDuration {
    skill: Skill
    sprint: Sprint
    taskNum: Int
    task: Task
    seconds: Float
  }

  type SkillVersionDuration {
    skill: Skill
    skillVersion: String
    invocations: Int!
    avgSeconds: Float
    minSeconds: Float
    maxSeconds: Float
  }

  type SkillPrecision {
    sprint: Sprint
    taskNum: Int
    task: Task
    filesRead: Int!
    filesModified: Int!
    explorationRatio: Float
  }

  type SkillVersionPrecision {
    skill: Skill
    skillVersion: String
    tasks: Int!
    avgExplorationRatio: Float
  }

  # ── Velocity Types ────────────────────────────────────────────────

  type LearningRate {
    owner: Developer!
    sprint: Sprint!
    tasks: Int!
    avgBlowUpRatio: Float
  }

  type PhaseTimingDistribution {
    sprint: Sprint
    taskNum: Int
    task: Task
    phase: String!
    seconds: Float!
    pctOfTotal: Float
  }

  type TokenEfficiency {
    sprint: Sprint
    complexity: String
    tasks: Int!
    avgTokensPerTask: Float
  }

  type BlowUpFactor {
    sprint: Sprint!
    taskNum: Int!
    task: Task!
    title: String
    type: String
    complexity: String
    estimatedMinutes: Float
    actualMinutes: Float
    blowUpRatio: Float
    reversions: Int
    testingPosture: String
  }

  # ── Estimation Types ──────────────────────────────────────────────

  type EstimationAccuracy {
    owner: Developer!
    tasksWithEstimates: Int!
    avgEstimated: Float
    avgActual: Float
    blowUpRatio: Float
    avgErrorMinutes: Float
  }

  type EstimationAccuracyByType {
    type: String!
    tasks: Int!
    avgEstimated: Float
    avgActual: Float
    blowUpRatio: Float
    sampleTasks: [Task!]!
  }

  type EstimationAccuracyByComplexity {
    complexity: String!
    tasks: Int!
    avgEstimated: Float
    avgActual: Float
    blowUpRatio: Float
    sampleTasks: [Task!]!
  }

  # ── Quality Types ─────────────────────────────────────────────────

  type DeveloperQuality {
    owner: Developer!
    totalTasks: Int!
    totalReversions: Int!
    reversionsPerTask: Float
    aGrades: Int!
    aGradePct: Float
  }

  type AuditFindings {
    owner: Developer!
    fakeTestIncidents: Int!
    patternViolations: Int!
    belowAGrade: Int!
    totalReversions: Int!
    totalTasks: Int!
  }

  type ReversionHotspot {
    type: String
    complexity: String
    tasks: Int!
    totalReversions: Int!
    avgReversions: Float
    aGradeRate: Float
    sampleTasks: [Task!]!
  }

  # ── Sprint & Session Types ────────────────────────────────────────

  type SprintVelocity {
    sprint: Sprint!
    completedTasks: Int!
    avgMinutesPerTask: Float
    totalMinutes: Float
  }

  type SessionTimelineEntry {
    sessionId: String!
    parentSessionId: String
    developer: Developer
    sprint: Sprint
    taskNum: Int
    task: Task
    taskTitle: String
    skillName: String
    startedAt: String!
    endedAt: String
    durationMinutes: Float
    totalInputTokens: Int
    totalOutputTokens: Int
    toolCallCount: Int
    messageCount: Int
    model: String
    subagents: [SessionTimelineEntry!]!
  }
`;
