/**
 * Dynamic schema introspection for LLM context.
 * Fetches the GraphQL schema via introspection and produces a curated
 * context string for Claude's system prompt.
 *
 * Includes both query entry points AND type field definitions so the LLM
 * knows which fields exist on each type.
 *
 * Caches the result with a 5-minute TTL so we don't introspect on every request.
 */

const GRAPHQL_URL = process.env.GRAPHQL_URL || "http://localhost:4000/graphql";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedContext: string | null = null;
let cachedAt = 0;

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType {
        fields {
          name
          description
          args {
            name
            type {
              name
              kind
              ofType { name kind ofType { name kind } }
            }
          }
          type {
            name
            kind
            ofType {
              name
              kind
              ofType {
                name
                kind
                ofType { name kind }
              }
            }
          }
        }
      }
      types {
        name
        kind
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
                ofType { name kind }
              }
            }
          }
        }
      }
    }
  }
`;

interface IntrospectionArg {
  name: string;
  type: {
    name: string | null;
    kind: string;
    ofType?: { name: string | null; kind: string; ofType?: { name: string | null; kind: string } | null } | null;
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

interface IntrospectionType {
  name: string;
  kind: string;
  fields: Array<{ name: string; type: TypeRef }> | null;
}

function formatArgType(arg: IntrospectionArg): string {
  const t = arg.type;
  if (t.kind === "NON_NULL") {
    const inner = t.ofType;
    if (inner?.kind === "LIST") {
      return `[${inner.ofType?.name ?? "Unknown"}]!`;
    }
    return `${inner?.name ?? "Unknown"}!`;
  }
  if (t.kind === "LIST") {
    return `[${t.ofType?.name ?? "Unknown"}]`;
  }
  return t.name ?? "Unknown";
}

function resolveTypeName(t: TypeRef | null | undefined): string {
  if (!t) return "Unknown";
  if (t.kind === "NON_NULL" || t.kind === "LIST") return resolveTypeName(t.ofType);
  return t.name ?? "Unknown";
}

function formatReturnType(type: TypeRef): string {
  if (type.kind === "NON_NULL") {
    const inner = type.ofType;
    if (inner?.kind === "LIST") {
      return `[${resolveTypeName(inner.ofType)}]!`;
    }
    return `${inner?.name ?? "Unknown"}!`;
  }
  if (type.kind === "LIST") {
    return `[${resolveTypeName(type.ofType)}]`;
  }
  return type.name ?? "Unknown";
}

function formatQueryField(field: IntrospectionField): string {
  const args = field.args.length > 0
    ? `(${field.args.map((a) => `${a.name}: ${formatArgType(a)}`).join(", ")})`
    : "";
  const desc = field.description ? `  # ${field.description}` : "";
  return `  ${field.name}${args}: ${formatReturnType(field.type)}${desc}`;
}

function formatTypeField(f: { name: string; type: TypeRef }): string {
  return `  ${f.name}: ${formatReturnType(f.type)}`;
}

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
  if (["dataHealth"].includes(name)) return "System";
  return "Other";
}

// Types worth documenting (skip internal/scalar/introspection types)
const SKIP_TYPE_PREFIXES = ["__", "Query", "Mutation", "Subscription"];
const SCALAR_TYPES = new Set(["String", "Int", "Float", "Boolean", "ID"]);

function shouldDocumentType(t: IntrospectionType): boolean {
  if (t.kind !== "OBJECT") return false;
  if (!t.fields || t.fields.length === 0) return false;
  if (SKIP_TYPE_PREFIXES.some((p) => t.name.startsWith(p))) return false;
  if (SCALAR_TYPES.has(t.name)) return false;
  return true;
}

function buildSchemaContext(
  fields: IntrospectionField[],
  types: IntrospectionType[]
): string {
  const groups = new Map<string, IntrospectionField[]>();
  for (const field of fields) {
    const cat = categorize(field);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(field);
  }

  const sections: string[] = [];
  sections.push("# NOS GraphQL API\n");

  // ── Query entry points ──
  sections.push("## Queries\n");

  const categoryOrder = [
    "Tasks", "Sprints", "Projects", "Developers", "Activity",
    "Events", "Transcripts",
    "Analytics — Skill", "Analytics — Velocity",
    "Analytics — Estimation", "Analytics — Quality",
    "Analytics — Sprint", "Analytics — Timeline",
    "System", "Other",
  ];

  for (const cat of categoryOrder) {
    const catFields = groups.get(cat);
    if (!catFields || catFields.length === 0) continue;
    sections.push(`### ${cat}`);
    for (const field of catFields) {
      sections.push(formatQueryField(field));
    }
    sections.push("");
  }

  // ── Type definitions ──
  sections.push("## Types\n");
  sections.push("Each type's fields are listed below. Use these exact field names in your queries.\n");

  const documentableTypes = types
    .filter(shouldDocumentType)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const t of documentableTypes) {
    sections.push(`### ${t.name}`);
    for (const f of t.fields!) {
      sections.push(formatTypeField(f));
    }
    sections.push("");
  }

  // ── Example queries ──
  sections.push("## Example Queries\n");
  sections.push(`\`\`\`graphql
# What work was done recently? (USE THIS for "what happened" questions)
{ sessionTimeline(dateFrom: "2026-03-04") { sessionId developer sprint taskNum taskTitle skillName startedAt endedAt durationMinutes totalInputTokens totalOutputTokens model } }

# What conversations happened? (for "what was discussed" questions)
{ conversationFeed(limit: 10) { sessionId developer sprint taskNum taskTitle startedAt endedAt model messages { role content timestamp } } }

# Sprint status with progress
{ sprint(name: "my-sprint") { name status goal progress { totalTasks pending green blocked percentComplete } } }

# All active sprints
{ sprints(status: "active") { name status goal progress { totalTasks green percentComplete } } }

# Tasks in a sprint
{ tasks(sprint: "my-sprint") { taskNum title status type owner { name } estimatedMinutes actualMinutes } }

# Developer quality metrics
{ developerQuality { owner totalTasks totalReversions aGradePct } }

# Sprint velocity comparison
{ sprintVelocity { sprint completedTasks avgMinutesPerTask totalMinutes } }

# Estimation accuracy — are we good at estimating?
{ estimationAccuracy { owner tasksWithEstimates avgEstimated avgActual blowUpRatio } }

# What's blocked?
{ tasks(status: "blocked") { sprint taskNum title blockedReason owner { name } } }
\`\`\``);

  return sections.join("\n");
}

export async function getSchemaContext(): Promise<string> {
  const now = Date.now();
  if (cachedContext && now - cachedAt < CACHE_TTL_MS) {
    return cachedContext;
  }

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
  });

  if (!res.ok) {
    throw new Error(`Introspection failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const fields: IntrospectionField[] = json.data.__schema.queryType.fields;
  const types: IntrospectionType[] = json.data.__schema.types;

  cachedContext = buildSchemaContext(fields, types);
  cachedAt = now;

  return cachedContext;
}
