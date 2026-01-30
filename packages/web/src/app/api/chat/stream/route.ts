import { NextRequest } from "next/server";
import { config } from "dotenv";
import path from "path";

// Load env from repo root
config({ path: path.resolve(process.cwd(), "../../.env") });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query, agent, history = [], responseFormat, financialContext } = body;

  if (!query || !agent) {
    return new Response(JSON.stringify({ error: "query and agent are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Look up persona override from Supabase (non-fatal)
    let systemPromptOverride: string | undefined;
    try {
      const { getSupabaseClient } = await import("@/lib/supabase");
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from("agent_personas")
        .select("system_prompt_override")
        .eq("agent_name", agent)
        .single();
      if (data?.system_prompt_override) {
        systemPromptOverride = data.system_prompt_override;
      }
    } catch {
      // Non-fatal: proceed without persona override
    }

    const { chatStream } = await import("@ilre/pipeline/chat");

    const { stream: textStream, sources } = await chatStream(query, history, {
      agent,
      responseFormat,
      financialContext,
      systemPromptOverride,
    });

    // Build SSE stream: first event is sources metadata, then text chunks
    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        // Send sources as the first event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "sources",
              sources: sources.map((s) => ({
                title: s.chunk.metadata.title,
                score: s.score,
                contentType: s.chunk.metadata.contentType,
                agent: s.chunk.metadata.agent,
              })),
            })}\n\n`
          )
        );

        // Stream text chunks
        const reader = textStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "text", text: value })}\n\n`
            )
          );
        }

        // Signal completion
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      },
    });

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Stream error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Stream failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
