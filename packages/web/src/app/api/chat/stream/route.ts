import { NextRequest } from "next/server";
import { config } from "dotenv";
import path from "path";
import { AGENTS } from "@/lib/agents";

// Load env from repo root
config({ path: path.resolve(process.cwd(), "../../.env") });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query, agent, history = [], responseFormat, financialContext, mode } = body;

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

    // In onboarding mode, use the dedicated interview prompt and skip RAG
    if (mode === "onboarding") {
      const { ONBOARDING_SYSTEM_PROMPT } = await import("@/lib/onboarding-prompt");
      systemPromptOverride = ONBOARDING_SYSTEM_PROMPT;
    }

    // Deal analysis agents: detect listing URLs and scrape, use custom prompts
    if (agent === "Deal Analyser Dan" || agent === "FISO Phil") {
      const { detectListingUrl } = await import("@ilre/pipeline/listing-types");
      const detected = detectListingUrl(query);

      const isPhil = agent === "FISO Phil";
      const getBasePrompt = async () => {
        if (isPhil) {
          const { FISO_PHIL_SYSTEM_PROMPT } = await import("@/lib/fiso-phil-prompt");
          return FISO_PHIL_SYSTEM_PROMPT;
        }
        const { DEAL_ANALYSER_SYSTEM_PROMPT } = await import("@/lib/deal-analyser-prompt");
        return DEAL_ANALYSER_SYSTEM_PROMPT;
      };

      if (detected) {
        // URL found: always scrape and use agent's custom prompt (overrides Supabase persona)
        const basePrompt = await getBasePrompt();
        try {
          const { scrapeListing } = await import("@ilre/pipeline/listing");
          const listing = await scrapeListing(detected.url);
          const { buildListingDataBlock } = await import("@/lib/deal-analyser-prompt");
          systemPromptOverride = basePrompt + "\n\n" + buildListingDataBlock(listing);
        } catch (scrapeError) {
          console.error("Listing scrape failed:", scrapeError);
          systemPromptOverride = basePrompt;
        }
      } else {
        // No URL: try address lookup
        try {
          const { lookupListingByAddress } = await import("@ilre/pipeline/listing-lookup");
          const lookupResult = await lookupListingByAddress(query);

          if (lookupResult.status === 'found' && lookupResult.listing) {
            const basePrompt = await getBasePrompt();
            const { buildListingDataBlock } = await import("@/lib/deal-analyser-prompt");
            systemPromptOverride = basePrompt + "\n\n" + buildListingDataBlock(lookupResult.listing);
          } else if (lookupResult.status === 'not-found') {
            const basePrompt = await getBasePrompt();
            const { buildLookupFailedBlock } = await import("@/lib/deal-analyser-prompt");
            systemPromptOverride = basePrompt + "\n\n" + buildLookupFailedBlock(lookupResult.addressSearched || '');
          } else if (!systemPromptOverride) {
            // No address detected and no Supabase persona
            systemPromptOverride = await getBasePrompt();
          }
        } catch (lookupError) {
          console.error("Address lookup failed:", lookupError);
          if (!systemPromptOverride) {
            systemPromptOverride = await getBasePrompt();
          }
        }
      }
    }

    const { chatStream } = await import("@ilre/pipeline/chat");

    // Look up agent-specific context limit (0 in onboarding to skip RAG)
    const agentDef = AGENTS.find((a) => a.name === agent);
    const contextLimit = mode === "onboarding" ? 0 : agentDef?.contextLimit;

    const { stream: textStream, sources } = await chatStream(query, history, {
      agent,
      contextLimit,
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
