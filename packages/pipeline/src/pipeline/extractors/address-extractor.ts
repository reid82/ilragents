import OpenAI from 'openai';
import type { ParsedAddress } from './listing-types';

const ADDRESS_MODEL = 'anthropic/claude-haiku-4.5';

const EXTRACTION_PROMPT = `You are an Australian address extraction tool. Given a user message, extract any Australian property address mentioned.

Return ONLY a JSON object with these fields (omit fields you can't determine):
- streetNumber (required): e.g. "42"
- streetName (required): e.g. "Smith"
- streetType (optional): e.g. "St", "Street", "Rd", "Road", "Ave", "Cres", "Pl", "Dr", "Ct"
- unitNumber (optional): e.g. "3" from "Unit 3/15" or "3/15"
- suburb (required): e.g. "Richmond"
- state (optional): e.g. "VIC", "NSW", "QLD", "SA", "WA", "TAS", "NT", "ACT"
- postcode (optional): e.g. "3121"

If no Australian property address is present, return the literal text: null

Examples:
- "what do you think of 42 Smith St, Richmond VIC 3121" -> {"streetNumber":"42","streetName":"Smith","streetType":"St","suburb":"Richmond","state":"VIC","postcode":"3121"}
- "that place at 15 Main in Heidelberg" -> {"streetNumber":"15","streetName":"Main","suburb":"Heidelberg"}
- "how do I calculate yield?" -> null

Return ONLY the JSON object or null. No explanation.`;

function getClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://ilragents.app',
      'X-Title': 'ILRE Address Extraction',
    },
  });
}

/**
 * Extract a structured Australian address from a user message using LLM.
 * Returns null if no address is found or on any error.
 */
export async function extractAddressFromMessage(message: string): Promise<ParsedAddress | null> {
  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: ADDRESS_MODEL,
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: message },
      ],
      temperature: 0,
      max_tokens: 200,
    });

    let content = response.choices[0]?.message?.content?.trim();
    if (!content || content === 'null') return null;

    // Strip markdown code fences if the LLM wraps the JSON
    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    if (!content || content === 'null') return null;

    const parsed = JSON.parse(content);
    if (!parsed || !parsed.streetNumber || !parsed.streetName || !parsed.suburb) return null;

    return parsed as ParsedAddress;
  } catch (err) {
    console.error('[address-extractor] Failed to extract address:', err instanceof Error ? err.message : err);
    return null;
  }
}
