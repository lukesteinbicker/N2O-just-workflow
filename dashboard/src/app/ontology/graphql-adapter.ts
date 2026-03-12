/**
 * GraphQL schema adapter for the Ontology explorer.
 *
 * Wraps the existing NOS GraphQL introspection logic behind the SchemaAdapter
 * interface. All NOS-specific type-to-category mappings and entity queries
 * live here.
 */

import { gql } from "@apollo/client/core";
import type { DocumentNode } from "@apollo/client/core";
import {
  Box, Activity as ActivityIcon, Zap, Users, Shield,
  TrendingUp, MessageSquare, Database, BarChart3, Circle,
} from "lucide-react";
import { DATA_HEALTH_QUERY, TASKS_BOARD_QUERY, TEAM_QUERY } from "@/lib/graphql/queries";
import type { SchemaAdapter, CategoryConfigEntry, EntityColumnsConfig } from "./schema-adapter";

// ── Category configuration ──────────────────────────────

const CATEGORY_CONFIG: Record<string, CategoryConfigEntry> = {
  core:          { label: "Core",          color: "#2D72D2", icon: Box },
  activity:      { label: "Activity",      color: "#29A634", icon: ActivityIcon },
  skills:        { label: "Skills",        color: "#D13913", icon: Zap },
  team:          { label: "Team",          color: "#9F2B68", icon: Users },
  quality:       { label: "Quality",       color: "#EC9A3C", icon: Shield },
  velocity:      { label: "Velocity",      color: "#00A396", icon: TrendingUp },
  conversations: { label: "Conversations", color: "#7157D9", icon: MessageSquare },
  data:          { label: "Data Health",   color: "#634DBF", icon: Database },
  estimation:    { label: "Estimation",    color: "#147EB3", icon: BarChart3 },
  other:         { label: "Other",         color: "#738694", icon: Circle },
};

// ── Type → category mapping ─────────────────────────────

const TYPE_CATEGORY_MAP: Record<string, string> = {
  // Core
  Task: "core", Sprint: "core", Project: "core", SprintProgress: "core",
  // Activity
  Event: "activity", Activity: "activity", Transcript: "activity",
  // Skills
  Skill: "skills", SkillUsage: "skills", SkillTokenUsage: "skills",
  SkillVersionTokenUsage: "skills", SkillDuration: "skills",
  SkillVersionDuration: "skills", SkillPrecision: "skills", SkillVersionPrecision: "skills",
  // Team
  Developer: "team", DeveloperSkill: "team", DeveloperContext: "team",
  Availability: "team", VelocityProfile: "team",
  // Quality
  DeveloperQuality: "quality", AuditFindings: "quality", ReversionHotspot: "quality",
  // Velocity
  LearningRate: "velocity", PhaseTimingDistribution: "velocity",
  TokenEfficiency: "velocity", BlowUpFactor: "velocity",
  SprintVelocity: "velocity", SessionTimelineEntry: "velocity",
  // Conversations
  SessionConversation: "conversations", ConversationMessage: "conversations", ToolCallInfo: "conversations",
  // Data
  DataHealth: "data", DataHealthStream: "data",
  // Estimation
  EstimationAccuracy: "estimation", EstimationAccuracyByType: "estimation",
  EstimationAccuracyByComplexity: "estimation",
};

// ── Entity sample queries ───────────────────────────────

const EVENTS_QUERY = gql`
  query RecentEvents {
    events(limit: 8) {
      eventType
      sprint { name }
      taskNum
      timestamp
    }
  }
`;

const TRANSCRIPTS_QUERY = gql`
  query RecentTranscripts {
    transcripts {
      sessionId
      sprint { name }
      taskNum
      startedAt
    }
  }
`;

const ACTIVITY_QUERY = gql`
  query RecentActivity {
    activityLog(limit: 8) {
      action
      developer { name }
      sprint { name }
      taskNum
      timestamp
    }
  }
`;

const ENTITY_QUERIES: Record<string, EntityColumnsConfig> = {
  Task:       { query: TASKS_BOARD_QUERY, field: "tasks",       columns: ["title", "status", "owner"] },
  Sprint:     { query: TASKS_BOARD_QUERY, field: "sprints",     columns: ["name", "projectId"] },
  Developer:  { query: TEAM_QUERY,        field: "developers",  columns: ["name", "role"] },
  Event:      { query: EVENTS_QUERY,      field: "events",      columns: ["eventType", "sprint", "taskNum"] },
  Transcript: { query: TRANSCRIPTS_QUERY, field: "transcripts", columns: ["sessionId", "sprint", "taskNum"] },
  Activity:   { query: ACTIVITY_QUERY,    field: "activityLog", columns: ["action", "developer", "timestamp"] },
};

// ── Introspection query ─────────────────────────────────

export const INTROSPECTION_QUERY = gql`
  query OntologyIntrospection {
    __schema {
      types {
        name
        kind
        description
        fields {
          name
          type {
            name
            kind
            ofType {
              name
              kind
              ofType {
                name
                kind
                ofType {
                  name
                  kind
                }
              }
            }
          }
        }
      }
    }
  }
`;

// ── Adapter implementation ──────────────────────────────

export const graphqlAdapter: SchemaAdapter = {
  name: "GraphQL",

  getCategoryConfig() {
    return CATEGORY_CONFIG;
  },

  getCategoryForType(typeName: string): string {
    return TYPE_CATEGORY_MAP[typeName] ?? "other";
  },

  getEntityColumns(typeName: string): EntityColumnsConfig | undefined {
    return ENTITY_QUERIES[typeName];
  },
};
