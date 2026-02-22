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

  // For deal analysis agents, start streaming immediately so we can send
  // real-time status updates during property lookup
  const isDealAgent = agent === "Deal Analyser Dan" || agent === "FISO Phil";

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const sendEvent = (data: Record<string, unknown>) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  // Run the pipeline in the background while streaming
  (async () => {
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
      if (isDealAgent) {
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
            sendEvent({ type: "status", message: "Gathering suburb intelligence..." });
            const intel = await enrichPropertyIntelligence({ address, suburb, state, postcode });
            return buildPropertyIntelligenceBlock(intel);
          } catch (err) {
            console.error("Intelligence enrichment failed:", err);
            return '';
          }
        };


        if (detected) {
          // URL found: always scrape and use agent's custom prompt (overrides Supabase persona)
          const basePrompt = await getBasePrompt();
          try {
            sendEvent({ type: "status", message: "Scraping listing page..." });
            const { scrapeListing } = await import("@ilre/pipeline/listing");
            let listing = await scrapeListing(detected.url);

            // Enrich with full page detail via Apify (non-fatal)
            try {
              sendEvent({ type: "status", message: "Enriching listing details..." });
              const { enrichListingDetail } = await import("@ilre/pipeline/intelligence");
              listing = await enrichListingDetail(listing);
            } catch (enrichErr) {
              console.error("Listing detail enrichment failed (non-fatal):", enrichErr);
            }

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
          // No URL: try address lookup with real-time progress
          try {
            const { lookupListingByAddress } = await import("@ilre/pipeline/listing-lookup");
            const lookupResult = await lookupListingByAddress(query, (status: string) => {
              sendEvent({ type: "status", message: status });
            });

            if (lookupResult.status === 'found' && lookupResult.listing) {
              const basePrompt = await getBasePrompt();
              const { buildListingDataBlock } = await import("@/lib/deal-analyser-prompt");
              sendEvent({ type: "status", message: "Building analysis..." });
              const intelligenceBlock = await enrichIntelligence(
                lookupResult.listing.suburb || '', lookupResult.listing.state || '', lookupResult.listing.postcode || '', lookupResult.listing.address || ''
              );
              systemPromptOverride = basePrompt + "\n\n" + buildListingDataBlock(lookupResult.listing) + (intelligenceBlock ? "\n\n" + intelligenceBlock : '');
            } else if (lookupResult.status === 'not-found') {
              const basePrompt = await getBasePrompt();
              const { buildLookupFailedBlock } = await import("@/lib/deal-analyser-prompt");
              // Enrich with suburb intelligence even without a listing
              let intelligenceBlock = '';
              const addr = lookupResult.parsedAddress;
              if (addr?.suburb) {
                intelligenceBlock = await enrichIntelligence(addr.suburb, addr.state || '', addr.postcode || '', lookupResult.addressSearched);
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

      sendEvent({ type: "status", message: "" }); // Clear status before LLM response

      const { stream: textStream, sources } = await chatStream(query, history, {
        agent,
        contextLimit,
        responseFormat,
        financialContext,
        systemPromptOverride,
      });

      // Send sources
      sendEvent({
        type: "sources",
        sources: sources.map((s) => ({
          title: s.chunk.metadata.title,
          score: s.score,
          contentType: s.chunk.metadata.contentType,
          agent: s.chunk.metadata.agent,
        })),
      });

      // Stream text chunks
      const reader = textStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sendEvent({ type: "text", text: value });
      }

      // Signal completion
      sendEvent({ type: "done" });
    } catch (error) {
      console.error("Stream error:", error);
      sendEvent({ type: "error", error: error instanceof Error ? error.message : "Stream failed" });
    } finally {
      writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
