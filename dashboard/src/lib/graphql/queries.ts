import { gql } from "@apollo/client/core";

// ── Observatory (Home) ────────────────────────────────────

export const OBSERVATORY_QUERY = gql`
  query Observatory {
    skillUsage {
      toolName
      invocations
      sessions
    }
    phaseTimingDistribution {
      sprint
      taskNum
      phase
      seconds
      pctOfTotal
    }
    blowUpFactors {
      sprint
      taskNum
      title
      type
      blowUpRatio
      reversions
    }
    commonAuditFindings {
      owner
      fakeTestIncidents
      patternViolations
      belowAGrade
      totalTasks
    }
    transcripts {
      sessionId
      parentSessionId
      sprint
      taskNum
      totalInputTokens
      totalOutputTokens
      toolCallCount
      model
      startedAt
      endedAt
    }
    tasks(status: "blocked") {
      sprint
      taskNum
      title
      blockedReason
    }
    sprints(status: "active") {
      name
      progress {
        totalTasks
        green
        blocked
        percentComplete
      }
    }
  }
`;

// ── Velocity ──────────────────────────────────────────────

export const VELOCITY_QUERY = gql`
  query Velocity {
    developerLearningRate {
      owner
      sprint
      tasks
      avgBlowUpRatio
    }
    phaseTimingDistribution {
      sprint
      taskNum
      phase
      seconds
      pctOfTotal
    }
    tokenEfficiencyTrend {
      sprint
      complexity
      tasks
      avgTokensPerTask
    }
    blowUpFactors {
      sprint
      taskNum
      title
      type
      complexity
      estimatedHours
      actualHours
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
      toolName
      invocations
      sessions
      firstUsed
      lastUsed
    }
    skillTokenUsage {
      skillName
      sprint
      invocations
      totalInputTokens
      totalOutputTokens
      avgTokensPerCall
    }
    skillDuration {
      skillName
      sprint
      taskNum
      seconds
    }
    skillPrecision {
      sprint
      taskNum
      filesRead
      filesModified
      explorationRatio
    }
    skillVersionTokenUsage {
      skillName
      skillVersion
      invocations
      totalInputTokens
      totalOutputTokens
      avgTokensPerCall
    }
    skillVersionDuration {
      skillName
      skillVersion
      invocations
      avgSeconds
      minSeconds
      maxSeconds
    }
    skillVersionPrecision {
      skillName
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
      owner
      totalTasks
      totalReversions
      reversionsPerTask
      aGrades
      aGradePct
    }
    developerLearningRate {
      owner
      sprint
      tasks
      avgBlowUpRatio
    }
    commonAuditFindings {
      owner
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
      developer
      sprint
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
  }
`;

// ── Activity Feed ────────────────────────────────────────

export const ACTIVITY_FEED_QUERY = gql`
  query ActivityFeed {
    activityLog(limit: 200) {
      id
      timestamp
      developer
      action
      sprint
      taskNum
      summary
      metadata
    }
  }
`;

// ── Activity Insights ────────────────────────────────────

export const ACTIVITY_INSIGHTS_QUERY = gql`
  query ActivityInsights {
    sessionTimeline {
      sessionId
      developer
      sprint
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
    developerQuality {
      owner
      totalTasks
      totalReversions
      reversionsPerTask
      aGrades
      aGradePct
    }
    commonAuditFindings {
      owner
      fakeTestIncidents
      patternViolations
      belowAGrade
      totalReversions
      totalTasks
    }
    skillUsage {
      toolName
      invocations
      sessions
    }
  }
`;
