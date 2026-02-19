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

      // Helper to fire intelligence enrichment (non-blocking, non-fatal)
      const enrichIntelligence = async (suburb: string, state: string, postcode: string, address?: string): Promise<string> => {
        try {
          const { enrichPropertyIntelligence } = await import("@ilre/pipeline/intelligence");
          const { buildPropertyIntelligenceBlock } = await import("@/lib/deal-analyser-prompt");
          if (!suburb) return '';
          const intel = await enrichPropertyIntelligence({ address, suburb, state, postcode });
          return buildPropertyIntelligenceBlock(intel);
        } catch (err) {
          console.error("Intelligence enrichment failed:", err);
          return '';
        }
      };

      // Helper to extract suburb/state/postcode from a formatted address string
      // Format from formatAddressForSearch: "[unit/]streetNumber streetName [streetType] suburb [state] [postcode]"
      const parseAddressSearched = (addressSearched: string): { suburb: string; state: string; postcode: string } | null => {
        const statePostcodeMatch = addressSearched.match(/\b([A-Z]{2,3})\s+(\d{4})\s*$/);
        if (statePostcodeMatch) {
          const state = statePostcodeMatch[1];
          const postcode = statePostcodeMatch[2];
          // Suburb is the word(s) before state - take the token just before
          const beforeState = addressSearched.slice(0, statePostcodeMatch.index).trim();
          const parts = beforeState.split(/\s+/);
          // The suburb is typically the last token before state (may be multi-word, take last one)
          const suburb = parts.length > 0 ? parts[parts.length - 1] : '';
          if (suburb) return { suburb, state, postcode };
        }
        return null;
      };

      if (detected) {
        // URL found: always scrape and use agent's custom prompt (overrides Supabase persona)
        const basePrompt = await getBasePrompt();
        try {
          const { scrapeListing } = await import("@ilre/pipeline/listing");
          const listing = await scrapeListing(detected.url);
          const { buildListingDataBlock } = await import("@/lib/deal-analyser-prompt");
          const intelligenceBlock = await enrichIntelligence(
            listing.suburb || '', listing.state || '', listing.postcode || '', listing.address || ''
          );
          systemPromptOverride = basePrompt + "\n\n" + buildListingDataBlock(listing) + (intelligenceBlock ? "\n\n" + intelligenceBlock : '');
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
            const intelligenceBlock = await enrichIntelligence(
              lookupResult.listing.suburb || '', lookupResult.listing.state || '', lookupResult.listing.postcode || '', lookupResult.listing.address || ''
            );
            systemPromptOverride = basePrompt + "\n\n" + buildListingDataBlock(lookupResult.listing) + (intelligenceBlock ? "\n\n" + intelligenceBlock : '');
          } else if (lookupResult.status === 'not-found') {
            const basePrompt = await getBasePrompt();
            const { buildLookupFailedBlock } = await import("@/lib/deal-analyser-prompt");
            // Try to enrich with suburb intelligence even without a listing
            let intelligenceBlock = '';
            const parsed = parseAddressSearched(lookupResult.addressSearched || '');
            if (parsed) {
              intelligenceBlock = await enrichIntelligence(parsed.suburb, parsed.state, parsed.postcode);
            }
            systemPromptOverride = basePrompt + "\n\n" + buildLookupFailedBlock(lookupResult.addressSearched || '') + (intelligenceBlock ? "\n\n" + intelligenceBlock : '');
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
