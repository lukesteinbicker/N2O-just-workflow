import { gql } from "@apollo/client/core";

// ── Velocity ──────────────────────────────────────────────

export const VELOCITY_QUERY = gql`
  query Velocity {
    developerLearningRate {
      owner { name }
      sprint { name }
      tasks
      avgBlowUpRatio
    }
    phaseTimingDistribution {
      sprint { name }
      taskNum
      phase
      seconds
      pctOfTotal
    }
    tokenEfficiencyTrend {
      sprint { name }
      complexity
      tasks
      avgTokensPerTask
    }
    blowUpFactors {
      sprint { name }
      taskNum
      title
      type
      complexity
      estimatedMinutes
      actualMinutes
      blowUpRatio
      reversions
      testingPosture
    }
    estimationAccuracyByType {
      type
      tasks
      avgEstimated
      avgActual
      blowUpRatio
    }
    estimationAccuracyByComplexity {
      complexity
      tasks
      blowUpRatio
    }
  }
`;

// ── Skills ────────────────────────────────────────────────

export const SKILLS_QUERY = gql`
  query Skills {
    skillUsage {
      skill { name }
      invocations
      sessions
      firstUsed
      lastUsed
    }
    skillTokenUsage {
      skill { name }
      sprint { name }
      invocations
      totalInputTokens
      totalOutputTokens
      avgTokensPerCall
    }
    skillDuration {
      skill { name }
      sprint { name }
      taskNum
      seconds
    }
    skillPrecision {
      sprint { name }
      taskNum
      filesRead
      filesModified
      explorationRatio
    }
    skillVersionTokenUsage {
      skill { name }
      skillVersion
      invocations
      totalInputTokens
      totalOutputTokens
      avgTokensPerCall
    }
    skillVersionDuration {
      skill { name }
      skillVersion
      invocations
      avgSeconds
      minSeconds
      maxSeconds
    }
    skillVersionPrecision {
      skill { name }
      skillVersion
      tasks
      avgExplorationRatio
    }
  }
`;

// ── Team ──────────────────────────────────────────────────

export const TEAM_QUERY = gql`
  query Team {
    developers {
      name
      fullName
      role
      skills {
        category
        skill
        rating
      }
      tasks(status: "red") {
        sprint
        taskNum
        title
      }
      velocity {
        avgMinutes
        blowUpRatio
        totalTasksCompleted
      }
    }
    developerQuality {
      owner { name }
      totalTasks
      totalReversions
      reversionsPerTask
      aGrades
      aGradePct
    }
    developerLearningRate {
      owner { name }
      sprint { name }
      tasks
      avgBlowUpRatio
    }
    commonAuditFindings {
      owner { name }
      fakeTestIncidents
      patternViolations
      belowAGrade
      totalTasks
    }
  }
`;

// ── Streams (Session Timeline Gantt) ─────────────────────

export const STREAMS_QUERY = gql`
  query Streams {
    sessionTimeline {
      sessionId
      developer { name }
      sprint { name }
      taskNum
      taskTitle
      skillName
      startedAt
      endedAt
      durationMinutes
      totalInputTokens
      totalOutputTokens
      toolCallCount
      messageCount
      model
      subagents {
        sessionId
        startedAt
        endedAt
        durationMinutes
        totalInputTokens
        totalOutputTokens
        toolCallCount
        model
      }
    }
  }
`;

// ── Tasks Board (Task Gantt) ─────────────────────────────

export const TASKS_BOARD_QUERY = gql`
  query TasksBoard {
    tasks {
      sprint
      taskNum
      title
      spec
      status
      blockedReason
      type
      owner {
        name
      }
      complexity
      startedAt
      completedAt
      estimatedMinutes
      actualMinutes
      blowUpRatio
      dependencies {
        sprint
        taskNum
      }
      dependents {
        sprint
        taskNum
      }
    }
    sprints {
      name
      projectId
    }
  }
`;

// ── Task Mutations ──────────────────────────────────────────

export const CLAIM_TASK_MUTATION = gql`
  mutation ClaimTask($sprint: String!, $taskNum: Int!, $developer: String!) {
    claimTask(sprint: $sprint, taskNum: $taskNum, developer: $developer) {
      sprint
      taskNum
      status
      owner {
        name
      }
    }
  }
`;

export const UNCLAIM_TASK_MUTATION = gql`
  mutation UnclaimTask($sprint: String!, $taskNum: Int!) {
    unclaimTask(sprint: $sprint, taskNum: $taskNum) {
      sprint
      taskNum
      status
      owner {
        name
      }
    }
  }
`;

export const ASSIGN_TASK_MUTATION = gql`
  mutation AssignTask($sprint: String!, $taskNum: Int!, $developer: String!) {
    assignTask(sprint: $sprint, taskNum: $taskNum, developer: $developer) {
      sprint
      taskNum
      status
      owner {
        name
      }
    }
  }
`;

export const RESOLVE_STALE_TASKS_MUTATION = gql`
  mutation ResolveStaleTasks {
    resolveStaleTasks {
      sprint
      taskNum
      status
      owner {
        name
      }
    }
  }
`;

// ── Conversation Feed ────────────────────────────────────

export const CONVERSATION_FEED_QUERY = gql`
  query ConversationFeed($limit: Int, $developer: String) {
    conversationFeed(limit: $limit, developer: $developer) {
      sessionId
      developer { name }
      sprint { name }
      taskNum
      taskTitle
      startedAt
      endedAt
      model
      messages {
        role
        content
        timestamp
        toolCalls {
          name
          summary
        }
      }
    }
  }
`;

// ── Time Tracking (live API) ────────────────────────────

export const TIME_TRACKING_ME_QUERY = gql`
  query TimeTrackingMe {
    timeTrackingMe { id fullname email }
  }
`;

export const TIME_TRACKING_WORKSPACE_QUERY = gql`
  query TimeTrackingWorkspace {
    timeTrackingWorkspace { id name }
  }
`;

export const TIME_TRACKING_MEMBERS_QUERY = gql`
  query TimeTrackingMembers {
    timeTrackingMembers { id name email role active }
  }
`;

export const TIME_TRACKING_ENTRIES_QUERY = gql`
  query TimeTrackingEntries($startDate: String!, $endDate: String!) {
    timeTrackingEntries(startDate: $startDate, endDate: $endDate) {
      id description start stop seconds projectId tagIds userId
    }
  }
`;

export const TIME_TRACKING_PROJECTS_QUERY = gql`
  query TimeTrackingProjects {
    timeTrackingProjects { id name clientId color active }
  }
`;

export const TIME_TRACKING_CLIENTS_QUERY = gql`
  query TimeTrackingClients {
    timeTrackingClients { id name }
  }
`;

export const TIME_TRACKING_TAGS_QUERY = gql`
  query TimeTrackingTags {
    timeTrackingTags { id name }
  }
`;

export const TIME_TRACKING_CURRENT_TIMER_QUERY = gql`
  query TimeTrackingCurrentTimer {
    timeTrackingCurrentTimer { description start duration projectId }
  }
`;

export const TIME_TRACKING_DASHBOARD_ACTIVITY_QUERY = gql`
  query TimeTrackingDashboardActivity {
    timeTrackingDashboardActivity { userId description duration projectId start stop }
  }
`;

export const UPDATE_TIME_TRACKING_MEMBER_MUTATION = gql`
  mutation UpdateTimeTrackingMember($id: Int!, $role: String, $active: Boolean) {
    updateTimeTrackingMember(id: $id, role: $role, active: $active) {
      id name email role active
    }
  }
`;

// ── Data Health ──────────────────────────────────────────

export const DATA_HEALTH_QUERY = gql`
  query DataHealth {
    dataHealth {
      lastSessionEndedAt
      streams {
        stream
        count
        lastUpdated
        recentCount
      }
    }
  }
`;
