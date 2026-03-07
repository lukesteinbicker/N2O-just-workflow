export const coreTypeDefs = `#graphql
  type Query {
    """Fetch a single task by sprint name and task number"""
    task(sprint: String!, taskNum: Int!): Task

    """List tasks with optional filters for sprint, status, owner, or horizon"""
    tasks(sprint: String, status: String, owner: String, horizon: String): [Task!]!

    """List tasks that are pending with all dependencies satisfied"""
    availableTasks: [Task!]!

    """Fetch a single sprint by name"""
    sprint(name: String!): Sprint

    """List sprints with optional status or project filter"""
    sprints(status: String, projectId: String): [Sprint!]!

    """Fetch a single project by ID"""
    project(id: ID!): Project

    """List all projects"""
    projects: [Project!]!

    """Fetch a single developer by name"""
    developer(name: String!): Developer

    """List all developers with their roles and competency profiles"""
    developers: [Developer!]!

    """Recent activity log entries: task completions, phase transitions, and manual logs"""
    activityLog(limit: Int, developer: String): [Activity!]!

    """Developer coding session conversations with messages and tool calls"""
    conversationFeed(limit: Int, developer: String): [SessionConversation!]!

    """Workflow events: phase transitions, tool invocations, agent activity"""
    events(sessionId: String, sprint: String, taskNum: Int, eventType: String, limit: Int): [Event!]!

    """Session transcripts with token counts, message counts, and timing"""
    transcripts(sprint: String, taskNum: Int, sessionId: String): [Transcript!]!

    """Data health monitoring: row counts, last updated timestamps, recent activity per stream"""
    dataHealth: DataHealth!
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

    # Task claiming/assignment
    """Claim a pending task: sets owner, status→red, started_at→now. Fails if already claimed or has unfinished deps."""
    claimTask(sprint: String!, taskNum: Int!, developer: String!): Task!

    """Unclaim a red task: sets owner→null, status→pending, clears started_at. Only works on red tasks."""
    unclaimTask(sprint: String!, taskNum: Int!): Task!

    """Assign a task to a developer (lead operation): sets owner without status requirements."""
    assignTask(sprint: String!, taskNum: Int!, developer: String!): Task!

    """Bulk-reset stale tasks (red status, started >48h ago) back to pending with no owner. Returns the reset tasks."""
    resolveStaleTasks: [Task!]!
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
    developer: Developer!
    category: String!
    skill: String!
    rating: Float!
    source: String
    evidence: String
    assessedAt: String
  }

  type DeveloperContext {
    id: Int!
    developer: Developer!
    recordedAt: String!
    concurrentSessions: Int!
    hourOfDay: Int
    alertness: Float
    environment: String
    notes: String
  }

  type Availability {
    developer: Developer!
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
    sprint: Sprint
    taskNum: Int
    task: Task
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
    sprint: Sprint
    taskNum: Int
    task: Task
  }

  type Activity {
    id: Int!
    timestamp: String!
    developer: Developer
    action: String!
    sprint: Sprint
    taskNum: Int
    task: Task
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
    developer: Developer
    sprint: Sprint
    taskNum: Int
    task: Task
    taskTitle: String
    startedAt: String
    endedAt: String
    model: String
    messages: [ConversationMessage!]!
  }

  # ── Data Health Types ──────────────────────────────────────

  type DataHealth {
    streams: [DataHealthStream!]!
    lastSessionEndedAt: String
  }

  type DataHealthStream {
    stream: String!
    count: Int!
    lastUpdated: String
    recentCount: Int!
  }
`;
