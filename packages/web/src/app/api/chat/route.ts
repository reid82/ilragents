import { NextRequest, NextResponse } from "next/server";
import { config } from "dotenv";
import path from "path";

// Load env from repo root
config({ path: path.resolve(process.cwd(), "../../.env") });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query, agent, history = [], responseFormat, financialContext } = body;

  if (!query || !agent) {
    return NextResponse.json(
      { error: "query and agent are required" },
      { status: 400 }
    );
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

    // Dynamic import to ensure env is loaded first
    const { chat } = await import("@ilre/pipeline/chat");

    const { reply, sources } = await chat(query, history, {
      agent,
      responseFormat,
      financialContext,
      systemPromptOverride,
    });

    return NextResponse.json({
      reply,
      sources: sources.map((s) => ({
        title: s.chunk.metadata.title,
        score: s.score,
        contentType: s.chunk.metadata.contentType,
        agent: s.chunk.metadata.agent,
      })),
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 }
    );
  }
}
