import { NextRequest } from "next/server";
import { config } from "dotenv";
import path from "path";
import { AGENTS } from "@/lib/agents";

// Load env from repo root
config({ path: path.resolve(process.cwd(), "../../.env") });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query, agent, history = [], responseFormat, financialContext, mode, conversationId } = body;

  if (!query || !agent) {
    return new Response(JSON.stringify({ error: "query and agent are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let supabase: any;
      try {
        const { getSupabaseClient } = await import("@/lib/supabase");
        supabase = getSupabaseClient();
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

      // Detect listing URLs in the query - runs for any agent
      const { detectListingUrl } = await import("@ilre/pipeline/listing-types");
      const detected = detectListingUrl(query);

      // Keyword detection for FISO/feasibility intent
      const isFiso = /\b(run the numbers|feasibility|fiso|cashflow analysis)\b/i.test(query);

      // Deal analysis block: trigger on URL detection for any agent,
      // or always attempt address lookup for non-onboarding queries
      if (mode !== "onboarding") {
        const getBasePrompt = async () => {
          if (isFiso) {
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
          // URL found: scrape listing AND try HPF lookup in parallel for richer data
          const basePrompt = await getBasePrompt();
          try {
            const { scrapeListingByUrl } = await import("@ilre/pipeline/listing-lookup");
            const { extractAddressFromUrl, extractAddressFromListing, formatAddressForSearch } = await import("@ilre/pipeline/listing-types");

            // Step 1: Try to extract address directly from the URL slug
            const urlAddress = extractAddressFromUrl(detected.url, detected.source);
            const hasFullAddress = urlAddress && urlAddress.streetNumber && urlAddress.streetName;

            // Step 2: Scrape the listing page (always needed for listing details)
            // If we already have a full address from the URL, also start HPF in parallel
            const scrapePromise = scrapeListingByUrl(detected.url, detected.source, (status: string) => {
              sendEvent({ type: "status", message: status });
            });

            let hpfPromise: Promise<import("@ilre/pipeline/intelligence").HpfResult | null> | null = null;

            if (hasFullAddress && process.env.HPF_SERVICE_URL) {
              const { isHpfHealthy, lookupViaHpf } = await import("@ilre/pipeline/intelligence");
              sendEvent({ type: "status", message: "Checking Hot Property Finder..." });
              const healthy = await isHpfHealthy();
              if (healthy) {
                const addrString = formatAddressForSearch(urlAddress);
                hpfPromise = lookupViaHpf(addrString, urlAddress.suburb, urlAddress.state || '', urlAddress.postcode || '');
              }
            }

            // Wait for scrape (and HPF if running)
            const [listing, hpfResult] = await Promise.all([
              scrapePromise,
              hpfPromise,
            ]);

            // Step 3: If we didn't have a full address from the URL, extract it from the scraped listing
            // and try HPF with that
            let finalHpfResult = hpfResult;
            if (!finalHpfResult?.listing && !hasFullAddress && listing.address && process.env.HPF_SERVICE_URL) {
              const scrapedAddress = extractAddressFromListing(listing);
              if (scrapedAddress && scrapedAddress.streetNumber && scrapedAddress.streetName) {
                try {
                  const { isHpfHealthy, lookupViaHpf } = await import("@ilre/pipeline/intelligence");
                  sendEvent({ type: "status", message: "Looking up in Hot Property Finder..." });
                  const healthy = await isHpfHealthy();
                  if (healthy) {
                    const addrString = formatAddressForSearch(scrapedAddress);
                    finalHpfResult = await lookupViaHpf(addrString, scrapedAddress.suburb, scrapedAddress.state || '', scrapedAddress.postcode || '');
                  }
                } catch (hpfErr) {
                  console.log(`[stream] HPF lookup from scraped address failed (non-fatal): ${hpfErr instanceof Error ? hpfErr.message : hpfErr}`);
                }
              }
            }

            // Step 4: Merge - HPF data takes priority for valuation/neighbours/planning,
            // URL scrape fills listing-specific fields like photos, agent, description
            const mergedListing = finalHpfResult?.listing
              ? { ...listing, ...finalHpfResult.listing, url: listing.url || finalHpfResult.listing.url, description: listing.description || finalHpfResult.listing.description, images: listing.images.length > 0 ? listing.images : finalHpfResult.listing.images, agentName: listing.agentName || finalHpfResult.listing.agentName, agencyName: listing.agencyName || finalHpfResult.listing.agencyName }
              : listing;

            const { buildListingDataBlock } = await import("@/lib/deal-analyser-prompt");
            const intelligenceBlock = await enrichIntelligence(
              mergedListing.suburb || '', mergedListing.state || '', mergedListing.postcode || '', mergedListing.address || ''
            );
            systemPromptOverride = basePrompt + "\n\n" + buildListingDataBlock(mergedListing) + (intelligenceBlock ? "\n\n" + intelligenceBlock : '');
          } catch (scrapeError) {
            console.error("Listing scrape failed:", scrapeError);
            systemPromptOverride = basePrompt;
          }
        } else {
          // No URL: try address lookup with real-time progress
          try {
            const { lookupListingByAddress } = await import("@ilre/pipeline/listing-lookup");
            // Suppress the initial "Extracting address..." status - only show
            // progress once we know there's actually an address to look up
            let addressConfirmed = false;
            const lookupResult = await lookupListingByAddress(query, (status: string) => {
              if (!addressConfirmed && status.toLowerCase().includes('extract')) return;
              addressConfirmed = true;
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

      // Unified advisor uses a broader context limit since it searches all RAG sources
      const contextLimit = mode === "onboarding"
        ? 0
        : agent === "ILR Property Advisor"
          ? 25
          : AGENTS.find((a) => a.name === agent)?.contextLimit;

      sendEvent({ type: "status", message: "" }); // Clear status before LLM response

      const { stream: textStream, sources } = await chatStream(query, history, {
        agent,
        contextLimit,
        responseFormat,
        financialContext,
        systemPromptOverride,
      });

      // Send sources
      const sourcesPayload = sources.map((s) => ({
        title: s.chunk.metadata.title,
        score: s.score,
        contentType: s.chunk.metadata.contentType,
        agent: s.chunk.metadata.agent,
      }));
      sendEvent({
        type: "sources",
        sources: sourcesPayload,
      });

      // Stream text chunks
      const reader = textStream.getReader();
      const textChunks: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textChunks.push(value);
        sendEvent({ type: "text", text: value });
      }

      // Signal completion
      sendEvent({ type: "done" });

      // Persist messages if a conversationId was provided
      if (conversationId && supabase) {
        try {
          const assistantText = textChunks.join("");

          // Save user message
          await supabase.from("conversation_messages").insert({
            conversation_id: conversationId,
            role: "user",
            content: query,
          });

          // Save assistant message (with sources)
          await supabase.from("conversation_messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: assistantText,
            sources: sourcesPayload,
          });

          // Auto-title the conversation if it still has the default title
          const { data: convo } = await supabase
            .from("conversations")
            .select("title")
            .eq("id", conversationId)
            .single();

          if (convo?.title === "New conversation") {
            const autoTitle = query.length > 60 ? query.slice(0, 60) + "..." : query;
            await supabase
              .from("conversations")
              .update({ title: autoTitle })
              .eq("id", conversationId);
          }
        } catch (persistError) {
          console.error("Failed to persist conversation messages:", persistError);
        }
      }
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
