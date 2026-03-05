import type { ChatModelAdapter } from "@assistant-ui/react";
import { getChats } from "./chat-store";

// Use `any` for the accumulated parts array to avoid deep readonly type conflicts
// with assistant-ui's ThreadAssistantMessagePart. The runtime validates at render time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Part = any;

const DEVELOPER_NAME =
  process.env.NEXT_PUBLIC_N2O_DEVELOPER || "unknown";

// Marker prefix for thinking blocks so the UI can detect and render them differently
export const THINKING_MARKER = "<<THINKING>>\n";

/** Mutable context that React components update before each API call. */
export interface AskAdapterContext {
  route: string;
  filters: { person: string | null; project: string | null; groupBy: string };
  visibleDataSummary: string | null;
}

/** Current context state — set by components via setAskAdapterContext(). */
let currentContext: AskAdapterContext = {
  route: "/",
  filters: { person: null, project: null, groupBy: "project" },
  visibleDataSummary: null,
};

/** Update the adapter context. Called from React components on each render/effect. */
export function setAskAdapterContext(ctx: Partial<AskAdapterContext>) {
  currentContext = { ...currentContext, ...ctx };
}

export const askAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    // Snapshot past chats at call time so the API can serve past_chats tool
    const pastChats = getChats().map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      messages: c.messages,
    }));

    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        developer: DEVELOPER_NAME,
        route: currentContext.route,
        filters: currentContext.filters,
        visibleDataSummary: currentContext.visibleDataSummary,
        pastChats,
        messages: messages.map((m) => ({
          role: m.role,
          content:
            m.content
              ?.filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("") ?? "",
        })),
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      yield {
        content: [
          {
            type: "text" as const,
            text: `Error: API returned ${response.status}. Please try again.`,
          },
        ],
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    // Accumulate content parts across the entire stream (including tool call loops)
    const finalized: Part[] = [];
    let currentText = "";
    let currentThinking = "";
    let thinkingFinalized = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }

        if (event.type === "thinking_delta") {
          currentThinking += event.content;
          // Yield intermediate thinking state so UI shows it streaming
          yield {
            content: [
              ...finalized,
              {
                type: "text" as const,
                text: THINKING_MARKER + currentThinking,
              },
            ],
          };
        } else if (event.type === "text_delta") {
          // Finalize thinking block when first text arrives
          if (currentThinking && !thinkingFinalized) {
            finalized.push({
              type: "text" as const,
              text: THINKING_MARKER + currentThinking,
            });
            currentThinking = "";
            thinkingFinalized = true;
          }
          currentText += event.content;
          yield {
            content: [
              ...finalized,
              { type: "text" as const, text: currentText },
            ],
          };
        } else if (event.type === "tool_call") {
          // Finalize any pending thinking or text before tool call
          if (currentThinking && !thinkingFinalized) {
            finalized.push({
              type: "text" as const,
              text: THINKING_MARKER + currentThinking,
            });
            currentThinking = "";
            thinkingFinalized = true;
          }
          if (currentText) {
            finalized.push({ type: "text" as const, text: currentText });
            currentText = "";
          }
          finalized.push({
            type: "tool-call" as const,
            toolCallId: event.tool_use_id as string,
            toolName: event.name as string,
            args: event.input as Record<string, unknown>,
            argsText: JSON.stringify(event.input),
            result: event.result,
          });
          // Reset thinking state for next iteration of tool loop
          thinkingFinalized = false;
          yield { content: [...finalized] };
        }
      }
    }

    // Final yield with everything accumulated
    if (currentThinking && !thinkingFinalized) {
      finalized.push({
        type: "text" as const,
        text: THINKING_MARKER + currentThinking,
      });
    }
    if (currentText) {
      finalized.push({ type: "text" as const, text: currentText });
    }
    if (finalized.length > 0) {
      yield { content: [...finalized] };
    }
  },
};
