/**
 * Builds a curated LLM-friendly schema context string from GraphQL introspection fields.
 * Used as system prompt context so Claude can generate valid GraphQL queries.
 */

interface IntrospectionArg {
  name: string;
  type: {
    name: string | null;
    kind: string;
    ofType?: { name: string | null; kind: string } | null;
  };
}

interface TypeRef {
  name: string | null;
  kind: string;
  ofType?: TypeRef | null;
}

interface IntrospectionField {
  name: string;
  description: string | null;
  args: IntrospectionArg[];
  type: TypeRef;
}

function formatArgType(arg: IntrospectionArg): string {
  const t = arg.type;
  if (t.kind === "NON_NULL") {
    const inner = t.ofType;
    return `${inner?.name ?? "Unknown"}!`;
  }
  return t.name ?? "Unknown";
}

function resolveTypeName(t: TypeRef | null | undefined): string {
  if (!t) return "Unknown";
  if (t.kind === "NON_NULL" || t.kind === "LIST") return resolveTypeName(t.ofType);
  return t.name ?? "Unknown";
}

function formatReturnType(field: IntrospectionField): string {
  const t = field.type;
  if (t.kind === "NON_NULL") {
    const inner = t.ofType;
    if (inner?.kind === "LIST") {
      return `[${resolveTypeName(inner.ofType)}]!`;
    }
    return `${inner?.name ?? "Unknown"}!`;
  }
  if (t.kind === "LIST") {
    return `[${resolveTypeName(t.ofType)}]`;
  }
  return t.name ?? "Unknown";
}

function formatField(field: IntrospectionField): string {
  const args = field.args.length > 0
    ? `(${field.args.map((a) => `${a.name}: ${formatArgType(a)}`).join(", ")})`
    : "";
  const desc = field.description ? ` — ${field.description}` : "";
  return `  ${field.name}${args}: ${formatReturnType(field)}${desc}`;
}

// Group queries by category based on return type and name patterns
function categorize(field: IntrospectionField): string {
  const name = field.name;
  if (["task", "tasks", "availableTasks"].includes(name)) return "Tasks";
  if (["sprint", "sprints"].includes(name)) return "Sprints";
  if (["project", "projects"].includes(name)) return "Projects";
  if (["developer", "developers"].includes(name)) return "Developers";
  if (["activityLog", "conversationFeed"].includes(name)) return "Activity";
  if (["events"].includes(name)) return "Events";
  if (["transcripts"].includes(name)) return "Transcripts";
  if (name.startsWith("skill")) return "Analytics — Skill";
  if (["developerLearningRate", "phaseTimingDistribution", "tokenEfficiencyTrend", "blowUpFactors"].includes(name))
    return "Analytics — Velocity";
  if (name.startsWith("estimation")) return "Analytics — Estimation";
  if (["developerQuality", "commonAuditFindings", "reversionHotspots"].includes(name))
    return "Analytics — Quality";
  if (["sprintVelocity"].includes(name)) return "Analytics — Sprint";
  if (["sessionTimeline"].includes(name)) return "Analytics — Timeline";
  if (["auditLogs"].includes(name)) return "Usage";
  if (["dataHealth"].includes(name)) return "System";
  return "Other";
}

export function buildSchemaContext(fields: IntrospectionField[]): string {
  // Group fields by category
  const groups = new Map<string, IntrospectionField[]>();
  for (const field of fields) {
    const cat = categorize(field);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(field);
  }

  const sections: string[] = [];
  sections.push("# NOS GraphQL API — Available Queries\n");

  // Ordered category list
  const categoryOrder = [
    "Tasks", "Sprints", "Projects", "Developers", "Activity",
    "Events", "Transcripts",
    "Analytics — Skill", "Analytics — Velocity",
    "Analytics — Estimation", "Analytics — Quality",
    "Analytics — Sprint", "Analytics — Timeline",
    "Usage", "System", "Other",
  ];

  for (const cat of categoryOrder) {
    const catFields = groups.get(cat);
    if (!catFields || catFields.length === 0) continue;
    sections.push(`## ${cat}`);
    for (const field of catFields) {
      sections.push(formatField(field));
    }
    sections.push("");
  }

  // Add example queries
  sections.push("## Example Queries\n");
  sections.push(`\`\`\`graphql
# Get all tasks in a sprint with developer info
{
  tasks(sprint: "my-sprint") {
    taskNum title status type
    owner { name role }
    actualMinutes blowUpRatio
  }
}

# Developer quality with audit findings
{
  developerQuality { owner totalTasks totalReversions aGradePct }
  commonAuditFindings { owner fakeTestIncidents patternViolations }
}

# Sprint velocity trend
{
  sprintVelocity { sprint completedTasks avgMinutesPerTask totalMinutes }
}

# Platform usage: who visits which pages (admin-only)
{
  auditLogs(performer: "luke", since: "2026-03-01T00:00:00Z", limit: 100) {
    action recordId page performedBy performedAt
  }
}
\`\`\``);

  return sections.join("\n");
}
