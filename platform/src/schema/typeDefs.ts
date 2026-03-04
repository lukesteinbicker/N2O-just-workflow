export const typeDefs = `#graphql
  type Query {
    # Tasks
    task(sprint: String!, taskNum: Int!): Task
    tasks(sprint: String, status: String, owner: String, horizon: String): [Task!]!
    availableTasks: [Task!]!

    # Sprints
    sprint(name: String!): Sprint
    sprints(status: String, projectId: String): [Sprint!]!

    # Projects
    project(id: ID!): Project
    projects: [Project!]!

    # Developers
    developer(name: String!): Developer
    developers: [Developer!]!

    # Activity
    activityLog(limit: Int, developer: String): [Activity!]!
    conversationFeed(limit: Int, developer: String): [SessionConversation!]!

    # Events
    events(sessionId: String, sprint: String, taskNum: Int, eventType: String, limit: Int): [Event!]!

    # Transcripts
    transcripts(sprint: String, taskNum: Int, sessionId: String): [Transcript!]!

    # ── Analytics ──────────────────────────────────────────────

    # Skill analytics
    skillUsage: [SkillUsage!]!
    skillTokenUsage(sprint: String): [SkillTokenUsage!]!
    skillVersionTokenUsage(skillName: String): [SkillVersionTokenUsage!]!
    skillDuration(sprint: String): [SkillDuration!]!
    skillVersionDuration(skillName: String): [SkillVersionDuration!]!
    skillPrecision(sprint: String): [SkillPrecision!]!
    skillVersionPrecision(skillName: String): [SkillVersionPrecision!]!

    # Velocity analytics
    developerLearningRate(owner: String): [LearningRate!]!
    phaseTimingDistribution(sprint: String): [PhaseTimingDistribution!]!
    tokenEfficiencyTrend: [TokenEfficiency!]!
    blowUpFactors(sprint: String): [BlowUpFactor!]!

    # Estimation analytics
    estimationAccuracy(owner: String): [EstimationAccuracy!]!
    estimationAccuracyByType: [EstimationAccuracyByType!]!
    estimationAccuracyByComplexity: [EstimationAccuracyByComplexity!]!

    # Quality analytics
    developerQuality(owner: String): [DeveloperQuality!]!
    commonAuditFindings(owner: String): [AuditFindings!]!
    reversionHotspots: [ReversionHotspot!]!

    # Sprint analytics
    sprintVelocity(sprint: String): [SprintVelocity!]!

    # Session timeline (for Gantt chart)
    sessionTimeline(developer: String, dateFrom: String, dateTo: String): [SessionTimelineEntry!]!

    # Data health monitoring
    dataHealth: [DataHealthStream!]!
  }

  type Mutation {
    # Contributor availability (manual entry)
    setAvailability(
      developer: String!
      date: String!
      expectedMinutes: Float!
      effectiveness: Float
      status: String
      notes: String
    ): Availability!

    # Developer skills
    setSkill(
      developer: String!
      category: String!
      skill: String!
      rating: Float!
      source: String
    ): DeveloperSkill!

    # Developer context snapshot
    recordContext(
      developer: String!
      concurrentSessions: Int
      hourOfDay: Int
      alertness: Float
      environment: String
    ): DeveloperContext!

    # Activity log
    logActivity(
      developer: String
      action: String!
      sprint: String
      taskNum: Int
      summary: String
      metadata: String
    ): Activity!
  }

  # ── Core Entities ──────────────────────────────────────────

  type Task {
    sprint: String!
    taskNum: Int!
    spec: String
    title: String!
    description: String
    doneWhen: String
    status: String!
    blockedReason: String
    type: String
    complexity: Float
    estimatedMinutes: Float
    priority: Float
    horizon: String
    startedAt: String
    completedAt: String
    reversions: Int
    testingPosture: String
    verified: Boolean
    commitHash: String

    # Relationships
    owner: Developer
    dependencies: [Task!]!
    dependents: [Task!]!
    events(eventType: String, limit: Int): [Event!]!
    transcripts: [Transcript!]!

    # Computed
    actualMinutes: Float
    blowUpRatio: Float
  }

  type Sprint {
    name: String!
    projectId: String
    startAt: String
    endAt: String
    deadline: String
    goal: String
    status: String!

    # Relationships
    project: Project
    tasks(status: String): [Task!]!

    # Computed
    progress: SprintProgress!
  }

  type SprintProgress {
    totalTasks: Int!
    pending: Int!
    red: Int!
    green: Int!
    blocked: Int!
    percentComplete: Float!
    remainingMinutes: Float
  }

  type Project {
    id: ID!
    name: String!
    description: String
    repoUrl: String
    startAt: String
    endAt: String
    status: String!
    metadata: String

    # Relationships
    sprints(status: String): [Sprint!]!
  }

  type Developer {
    name: String!
    fullName: String!
    role: String
    baselineCompetency: Float
    strengths: String
    growthAreas: String

    # Relationships
    skills: [DeveloperSkill!]!
    tasks(status: String, sprint: String): [Task!]!
    availability(date: String): Availability
    context(latest: Boolean): [DeveloperContext!]!

    # Computed
    velocity: VelocityProfile
  }

  # ── Supporting Types ───────────────────────────────────────

  type DeveloperSkill {
    developer: String!
    category: String!
    skill: String!
    rating: Float!
    source: String
    evidence: String
    assessedAt: String
  }

  type DeveloperContext {
    id: Int!
    developer: String!
    recordedAt: String!
    concurrentSessions: Int!
    hourOfDay: Int
    alertness: Float
    environment: String
    notes: String
  }

  type Availability {
    developer: String!
    date: String!
    expectedMinutes: Float!
    effectiveness: Float!
    status: String!
    notes: String
  }

  type VelocityProfile {
    avgMinutes: Float
    blowUpRatio: Float
    totalTasksCompleted: Int!
  }

  type Event {
    id: Int!
    timestamp: String!
    sessionId: String
    sprint: String
    taskNum: Int
    eventType: String!
    toolName: String
    skillName: String
    skillVersion: String
    phase: String
    agentId: String
    agentType: String
    inputTokens: Int
    outputTokens: Int
  }

  type Transcript {
    id: Int!
    sessionId: String!
    parentSessionId: String
    filePath: String!
    fileSize: Int
    messageCount: Int
    userMessageCount: Int
    assistantMessageCount: Int
    toolCallCount: Int
    totalInputTokens: Int
    totalOutputTokens: Int
    model: String
    startedAt: String
    endedAt: String
    sprint: String
    taskNum: Int
  }

  type Activity {
    id: Int!
    timestamp: String!
    developer: String
    action: String!
    sprint: String
    taskNum: Int
    summary: String
    metadata: String
    sessionId: String
    taskTitle: String
  }

  # ── Conversation Types ────────────────────────────────────────

  type ToolCallInfo {
    name: String!
    summary: String
  }

  type ConversationMessage {
    role: String!
    content: String
    timestamp: String
    toolCalls: [ToolCallInfo!]
  }

  type SessionConversation {
    sessionId: String!
    developer: String
    sprint: String
    taskNum: Int
    taskTitle: String
    startedAt: String
    endedAt: String
    model: String
    messages: [ConversationMessage!]!
  }

  # ── Analytics Types ─────────────────────────────────────────

  type SkillUsage {
    toolName: String!
    invocations: Int!
    sessions: Int!
    firstUsed: String
    lastUsed: String
  }

  type SkillTokenUsage {
    skillName: String
    sprint: String
    invocations: Int!
    totalInputTokens: Int!
    totalOutputTokens: Int!
    avgTokensPerCall: Float
  }

  type SkillVersionTokenUsage {
    skillName: String
    skillVersion: String
    invocations: Int!
    totalInputTokens: Int!
    totalOutputTokens: Int!
    avgTokensPerCall: Float
  }

  type SkillDuration {
    skillName: String
    sprint: String
    taskNum: Int
    seconds: Float
  }

  type SkillVersionDuration {
    skillName: String
    skillVersion: String
    invocations: Int!
    avgSeconds: Float
    minSeconds: Float
    maxSeconds: Float
  }

  type SkillPrecision {
    sprint: String
    taskNum: Int
    filesRead: Int!
    filesModified: Int!
    explorationRatio: Float
  }

  type SkillVersionPrecision {
    skillName: String
    skillVersion: String
    tasks: Int!
    avgExplorationRatio: Float
  }

  type LearningRate {
    owner: String!
    sprint: String!
    tasks: Int!
    avgBlowUpRatio: Float
  }

  type PhaseTimingDistribution {
    sprint: String
    taskNum: Int
    phase: String!
    seconds: Float!
    pctOfTotal: Float
  }

  type TokenEfficiency {
    sprint: String
    complexity: String
    tasks: Int!
    avgTokensPerTask: Float
  }

  type BlowUpFactor {
    sprint: String!
    taskNum: Int!
    title: String
    type: String
    complexity: String
    estimatedHours: Float
    actualHours: Float
    blowUpRatio: Float
    reversions: Int
    testingPosture: String
  }

  type EstimationAccuracy {
    owner: String!
    tasksWithEstimates: Int!
    avgEstimated: Float
    avgActual: Float
    blowUpRatio: Float
    avgErrorHours: Float
  }

  type EstimationAccuracyByType {
    type: String!
    tasks: Int!
    avgEstimated: Float
    avgActual: Float
    blowUpRatio: Float
  }

  type EstimationAccuracyByComplexity {
    complexity: String!
    tasks: Int!
    avgEstimated: Float
    avgActual: Float
    blowUpRatio: Float
  }

  type DeveloperQuality {
    owner: String!
    totalTasks: Int!
    totalReversions: Int!
    reversionsPerTask: Float
    aGrades: Int!
    aGradePct: Float
  }

  type AuditFindings {
    owner: String!
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
  }

  type SprintVelocity {
    sprint: String!
    completedTasks: Int!
    avgHoursPerTask: Float
    totalHours: Float
  }

  type SessionTimelineEntry {
    sessionId: String!
    parentSessionId: String
    developer: String
    sprint: String
    taskNum: Int
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

  type DataHealthStream {
    stream: String!
    count: Int!
    lastUpdated: String
    recentCount: Int!
  }
`;
