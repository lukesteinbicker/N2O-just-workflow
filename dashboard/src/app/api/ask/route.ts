import Anthropic from "@anthropic-ai/sdk";
import { getSchemaContext } from "@/lib/ask/schema-context";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  const body = await request.json();
  const { messages } = body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "messages array is required" },
      { status: 400 }
    );
  }

  const schemaContext = await getSchemaContext();

  const systemPrompt = `You are an analytics assistant for the N2O workflow platform. You have access to a GraphQL API that tracks developer activity, sprint progress, velocity, and quality metrics.

Here is the schema:

${schemaContext}

Answer questions about developer activity, sprint progress, velocity, and quality. Be concise and direct. When relevant, suggest specific queries the user could ask to drill deeper.`;

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const chunk = JSON.stringify({
              type: "text",
              text: event.delta.text,
            });
            controller.enqueue(encoder.encode(chunk + "\n"));
          }
        }

        const finalMessage = await stream.finalMessage();
        const done = JSON.stringify({
          type: "done",
          stop_reason: finalMessage.stop_reason,
        });
        controller.enqueue(encoder.encode(done + "\n"));
        controller.close();
      } catch (error) {
        const errMsg = JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
        controller.enqueue(encoder.encode(errMsg + "\n"));
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
