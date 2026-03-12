// Ask API: Streaming endpoint that uses Claude to answer natural-language questions about project data.
import Anthropic from "@anthropic-ai/sdk";
import { getSchemaContext } from "@/lib/ask/schema-context";
import { executeQuery } from "@/lib/ask/execute-query";
import {
  buildContextPrompt,
  type AskContext,
} from "@/lib/ask/context-builder";

const anthropic = new Anthropic();

const QUERY_TOOL: Anthropic.Tool = {
  name: "query_ontology",
  description:
    "Execute a GraphQL query against the NOS data platform API to retrieve developer activity, sprint progress, velocity, quality metrics, and more.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "The GraphQL query to execute",
      },
      variables: {
        type: "object",
        description: "Optional GraphQL variables",
      },
    },
    required: ["query"],
  },
};

const CHART_TOOL: Anthropic.Tool = {
  name: "generate_chart",
  description:
    "Generate a data visualization chart. Use after querying data with query_ontology to present results visually. Choose the chart type based on the data: line for trends over time, bar for comparisons, pie for proportions.",
  input_schema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        enum: ["bar", "line", "pie"],
        description:
          "Chart type: bar for comparisons, line for trends, pie for proportions",
      },
      title: {
        type: "string",
        description: "Chart title displayed above the visualization",
      },
      data: {
        type: "array",
        items: { type: "object" },
        description: "Array of data objects to plot",
      },
      xKey: {
        type: "string",
        description: "Key in data objects for x-axis labels",
      },
      yKey: {
        description:
          "Key(s) in data objects for y-axis values. String for single series, array for multiple.",
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
      },
      colors: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional hex color array for series. Defaults to Palantir theme colors.",
      },
    },
    required: ["type", "title", "data", "xKey", "yKey"],
  },
};

const PAST_CHATS_TOOL: Anthropic.Tool = {
  name: "past_chats",
  description:
    "List recent past conversations from the Ask panel chat history. Use this to find and reference prior discussions. Optionally load a specific chat by ID to get its full messages.",
  input_schema: {
    type: "object" as const,
    properties: {
      chatId: {
        type: "string",
        description:
          "Optional: ID of a specific past chat to load. If omitted, returns a list of recent chat titles/summaries.",
      },
    },
    required: [],
  },
};

const RECOMMEND_VIEW_TOOL: Anthropic.Tool = {
  name: "recommend_view",
  description:
    "Recommend a specific dashboard view to the user. Returns a structured suggestion with a page route and optional filter parameters that the UI renders as a clickable link. Use this when the user would benefit from viewing a specific page with specific filters applied.",
  input_schema: {
    type: "object" as const,
    properties: {
      route: {
        type: "string",
        description:
          "The dashboard route to navigate to (e.g., '/tasks', '/sprints', '/activity')",
      },
      filters: {
        type: "object",
        properties: {
          person: {
            type: "string",
            description: "Filter by developer name",
          },
          project: {
            type: "string",
            description: "Filter by project name",
          },
          groupBy: {
            type: "string",
            enum: ["project", "developer", "status"],
            description: "Group tasks by this dimension",
          },
        },
        description: "Optional filter parameters to apply on the target page",
      },
      label: {
        type: "string",
        description:
          "Human-readable label for the link (e.g., 'View blocked tasks in coordination')",
      },
    },
    required: ["route", "label"],
  },
};

type MessageParam = Anthropic.MessageParam;

export async function POST(request: Request) {
  const body = await request.json();
  const {
    messages: clientMessages,
    developer,
    route: clientRoute,
    filters: clientFilters,
    visibleDataSummary,
    pastChats,
  } = body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    developer?: string;
    route?: string;
    filters?: { filters: Record<string, string[]>; groupBy: string[]; sortBy: Array<{ key: string; direction: "asc" | "desc" }> };
    visibleDataSummary?: string | null;
    pastChats?: Array<{ id: string; title: string; createdAt: string; messages?: Array<{ role: string; content: string }> }>;
  };

  if (
    !clientMessages ||
    !Array.isArray(clientMessages) ||
    clientMessages.length === 0
  ) {
    return Response.json(
      { error: "messages array is required" },
      { status: 400 }
    );
  }

  // Try to get schema context; fall back to a minimal prompt if platform is down
  let schemaContext: string;
  try {
    schemaContext = await getSchemaContext();
  } catch (err) {
    schemaContext =
      "Schema introspection failed — the data platform may be offline. " +
      "Let the user know you cannot query data right now.";
  }

  const now = new Date().toISOString();
  const developerLine = developer
    ? `The developer asking is: ${developer}.`
    : "";

  // Build user context section from client-provided state
  const askContext: AskContext = {
    date: now,
    route: clientRoute || "/",
    filters: clientFilters || { filters: {}, groupBy: [], sortBy: [] },
    visibleDataSummary: visibleDataSummary || null,
  };
  const contextSection = buildContextPrompt(askContext);

  const systemPrompt = `You are an analytics assistant for the NOS developer workflow platform. NOS tracks software development work: tasks, sprints, developers, code quality, estimation accuracy, and velocity.

The current date and time is: ${now}. Use this to anchor any time-relative queries (e.g. "last 2 hours", "today", "this week").
${developerLine}

${contextSection}

## Your capabilities
- Query live project data via GraphQL (query_ontology tool)
- Visualize data with charts (generate_chart tool — bar, line, pie)
- Browse past Ask conversations (past_chats tool)
- Recommend dashboard views with filters (recommend_view tool)

## Schema reference

${schemaContext}

## Rules
1. **Use ONLY the exact field names listed in the Types section above.** Do not guess or invent field names. If you're unsure whether a field exists, check the type definition.
2. When a query fails, read the error message carefully — it tells you exactly which field doesn't exist. Fix the query and retry.
3. Select only the fields you need. For large result sets, use the \`limit\` argument.
4. When results would benefit from a chart (trends over time, comparisons, proportions), use generate_chart after getting the data.
5. Keep your answers concise. Summarize key insights, highlight what's notable or surprising, and call out specific names/numbers. Don't just restate the table.
6. When suggesting follow-up questions, make them specific and actionable based on the data you've seen.
7. **Do not use emojis in your responses.** Use plain text headings and bullet points instead.
8. When a user's question relates to what they're currently viewing, use the User context section above for awareness of their current page, filters, and visible data.
9. Use recommend_view to suggest specific dashboard pages with filters when appropriate — for example, "You might want to check the blocked tasks view" becomes a clickable link.

## Query selection guide — pick the RIGHT query for the question

| User asks about... | Use this query | NOT this |
|---------------------|----------------|----------|
| "What's been done?" / "What happened?" / recent work | \`sessionTimeline\` — shows sessions with task context, duration, tokens | \`activityLog\` (raw tool_call events, mostly noise) |
| "What are we working on?" / current work | \`tasks(status: "red")\` or \`sprints(status: "active")\` with nested tasks | \`activityLog\` |
| Specific conversations / what was discussed | \`conversationFeed\` — actual messages with task context | \`activityLog\` |
| Sprint status / progress | \`sprint(name: "...")\` with \`progress\` subfields | \`tasks\` without filtering |
| Developer performance / quality | \`developerQuality\` and \`commonAuditFindings\` | raw task queries |
| Time estimates vs actuals | \`estimationAccuracy\` or \`blowUpFactors\` | manual calculation |
| Velocity trends | \`sprintVelocity\` | counting tasks manually |
| "Who has capacity?" | \`developers\` with \`availability\` and \`tasks(status: "red")\` | \`activityLog\` |
| "Who uses the platform?" / usage / logins / page visits | \`auditLogs\` — platform usage: logins, page visits, query frequency per user. Rows = individual GraphQL operations, NOT page visits. For visit counts, deduplicate by grouping on performedBy + page + date. | \`activityLog\` |
| Time tracking / hours / who worked how much | \`timeTrackingSummary(startDate, endDate)\` — pre-aggregated hours per member with daily breakdown and top entries. Returns compact data. | \`timeTrackingEntries\` (raw entries, very large response that will be truncated) |

**IMPORTANT**: For time tracking questions, ALWAYS use \`timeTrackingSummary\` instead of \`timeTrackingEntries\`. The raw entries query returns thousands of rows that get truncated. The summary query returns pre-aggregated hours per member, daily breakdowns, and top entries — everything you need in a compact response.

**IMPORTANT**: \`activityLog\` contains raw, low-level events (tool_call, Read, Edit, Bash, etc.) that are NOT useful for understanding what work was done. These are internal system events. Prefer \`sessionTimeline\` for work summaries, \`conversationFeed\` for conversation details, and \`tasks\` for task-level information. Only use \`activityLog\` if the user specifically asks for raw system events.

## What NOS tracks
- **Tasks**: Work items within sprints, with TDD status (pending → red → green), estimates, actuals, testing grades (A-F), reversions
- **Sprints**: Collections of tasks with start/end dates, goals, progress tracking
- **Developers**: Team members with skills, availability, velocity profiles, quality metrics
- **Session Timeline** (\`sessionTimeline\`): Development sessions showing what was worked on, for how long, with token usage — this is the best query for "what happened recently?"
- **Conversation Feed** (\`conversationFeed\`): Actual conversation messages between developer and AI, with task/sprint context
- **Analytics**: Skill usage, estimation accuracy, developer quality, sprint velocity, blow-up factors (actual/estimated ratio)
- **Events**: Granular workflow events with token usage, phases, agent info (low-level, rarely needed directly)
- **Activity Log** (\`activityLog\`): Raw system-level events — tool_call, turn_complete, etc. Very granular, mainly for debugging.
- **Audit Logs** (\`auditLogs\`): Platform usage tracking — every login, page visit, and GraphQL query with who/what/when. Admin-only. Each row is one GraphQL operation, not one page visit (a single page load triggers multiple queries). For visit counts, deduplicate by grouping on performedBy + page + date.`;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      try {
        // Build conversation messages — filter out any with empty content
        const allMessages = clientMessages
          .filter((m) => m.content && m.content.trim().length > 0)
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

        if (allMessages.length === 0) {
          send({ type: "error", error: "No valid messages provided" });
          controller.close();
          return;
        }

        // Truncate to last 20 messages (10 exchanges) to prevent token overflow.
        // Always keep at least the latest user message.
        const MAX_HISTORY = 20;
        const messages: MessageParam[] =
          allMessages.length > MAX_HISTORY
            ? allMessages.slice(-MAX_HISTORY)
            : allMessages;

        // Tool call loop: Claude may call tools multiple times
        let continueLoop = true;
        const MAX_ITERATIONS = 5;
        let iteration = 0;

        while (continueLoop && iteration < MAX_ITERATIONS) {
          iteration++;

          const stream = anthropic.messages.stream({
            model: "claude-opus-4-6",
            max_tokens: 32768,
            thinking: { type: "enabled", budget_tokens: 10000 },
            system: systemPrompt,
            messages,
            tools: [QUERY_TOOL, CHART_TOOL, PAST_CHATS_TOOL, RECOMMEND_VIEW_TOOL],
          });

          for await (const event of stream) {
            if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                send({ type: "text_delta", content: event.delta.text });
              } else if (
                event.delta.type === "thinking_delta" &&
                "thinking" in event.delta
              ) {
                send({
                  type: "thinking_delta",
                  content: (event.delta as { thinking: string }).thinking,
                });
              }
            }
          }

          const finalMessage = await stream.finalMessage();

          if (finalMessage.stop_reason === "tool_use") {
            const toolUseBlocks = finalMessage.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
            );

            // Add assistant response to conversation
            messages.push({
              role: "assistant",
              content: finalMessage.content,
            });

            // Execute each tool call and add results
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const toolUse of toolUseBlocks) {
              if (toolUse.name === "query_ontology") {
                const input = toolUse.input as {
                  query: string;
                  variables?: Record<string, unknown>;
                };

                const result = await executeQuery(
                  input.query,
                  input.variables
                );

                send({
                  type: "tool_call",
                  name: toolUse.name,
                  tool_use_id: toolUse.id,
                  input: input,
                  result: result,
                });

                // Cap tool result size to prevent token overflow
                const resultJson = JSON.stringify(result);
                const cappedResult =
                  resultJson.length > 15000
                    ? resultJson.slice(0, 15000) +
                      "\n... [truncated — result too large, showing first 15000 chars. Use timeTrackingSummary instead of timeTrackingEntries for aggregate data.]"
                    : resultJson;

                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: cappedResult,
                });
              } else if (toolUse.name === "generate_chart") {
                send({
                  type: "tool_call",
                  name: toolUse.name,
                  tool_use_id: toolUse.id,
                  input: toolUse.input,
                  result: { rendered: true },
                });

                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: "Chart rendered successfully.",
                });
              } else if (toolUse.name === "past_chats") {
                const input = toolUse.input as { chatId?: string };

                let result: unknown;
                if (input.chatId && pastChats) {
                  // Load a specific chat
                  const chat = pastChats.find((c) => c.id === input.chatId);
                  result = chat
                    ? { found: true, chat }
                    : { found: false, error: `Chat ${input.chatId} not found` };
                } else {
                  // List recent chats (titles + IDs only)
                  const summary = (pastChats || []).map((c) => ({
                    id: c.id,
                    title: c.title,
                    createdAt: c.createdAt,
                  }));
                  result =
                    summary.length > 0
                      ? { chats: summary }
                      : { chats: [], message: "No past conversations found." };
                }

                send({
                  type: "tool_call",
                  name: toolUse.name,
                  tool_use_id: toolUse.id,
                  input,
                  result,
                });

                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: JSON.stringify(result),
                });
              } else if (toolUse.name === "recommend_view") {
                const input = toolUse.input as {
                  route: string;
                  filters?: Record<string, string>;
                  label: string;
                };

                const result = {
                  type: "view_recommendation",
                  route: input.route,
                  filters: input.filters || {},
                  label: input.label,
                };

                send({
                  type: "tool_call",
                  name: toolUse.name,
                  tool_use_id: toolUse.id,
                  input,
                  result,
                });

                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: `View recommendation created: "${input.label}" → ${input.route}`,
                });
              }
            }

            // Add tool results to conversation
            messages.push({ role: "user", content: toolResults });
          } else {
            // No more tool calls — done
            if (finalMessage.stop_reason === "max_tokens") {
              send({
                type: "text_delta",
                content: "\n\n(Response was cut short due to length limits. Try asking a more focused question.)",
              });
            }
            continueLoop = false;
            send({ type: "done", stop_reason: finalMessage.stop_reason });
          }
        }

        if (iteration >= MAX_ITERATIONS) {
          send({
            type: "text_delta",
            content:
              "\n\n(Stopped after too many tool calls. Please try a simpler question.)",
          });
          send({ type: "done", stop_reason: "max_iterations" });
        }

        controller.close();
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        send({ type: "error", error: msg });
        // Also send as text so the user sees it in the chat
        send({
          type: "text_delta",
          content: `Sorry, something went wrong: ${msg}`,
        });
        send({ type: "done", stop_reason: "error" });
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
