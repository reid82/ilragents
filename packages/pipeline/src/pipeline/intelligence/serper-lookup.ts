/**
 * SerpAPI Google Search - fast address-to-listing-URL resolution.
 *
 * Uses `site:domain.com.au` or `site:realestate.com.au` Google search
 * to find the exact listing page URL for a given address.
 * Typically resolves in 1-2 seconds.
 *
 * Uses SerpAPI (serpapi.com), not Serper.dev - different service.
 * Env var is SERPER_API_KEY for backwards compat but it's a SerpAPI key.
 */

import type { ParsedAddress } from '../extractors/listing-types';
import { formatAddressForSearch } from '../extractors/listing-types';

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';
const TIMEOUT_MS = 10000;

export interface SerperLookupResult {
  url: string;
  source: 'domain' | 'rea';
  title: string;
  snippet: string;
}

/** SerpAPI organic result */
interface SerpApiOrganicResult {
  title: string;
  link: string;
  snippet?: string;
  position?: number;
}

/** SerpAPI response (subset) */
interface SerpApiResponse {
  organic_results?: SerpApiOrganicResult[];
  search_metadata?: { status: string };
}

/**
 * Search Google via SerpAPI for a property listing URL.
 *
 * Tries Domain first, then REA. Returns the first matching listing URL.
 * Returns null if no listing found or if SERPER_API_KEY is not configured.
 */
export async function findListingUrlViaSerper(address: ParsedAddress): Promise<SerperLookupResult | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.log('[serpapi] SERPER_API_KEY not configured, skipping');
    return null;
  }

  const addressStr = formatAddressForSearch(address);

  // Try Domain first
  const domainResult = await searchSite('domain.com.au', addressStr, apiKey);
  if (domainResult) return domainResult;

  // Fall back to REA
  const reaResult = await searchSite('realestate.com.au', addressStr, apiKey);
  if (reaResult) return reaResult;

  console.log('[serpapi] No listing found on Domain or REA');
  return null;
}

async function searchSite(
  site: string,
  addressStr: string,
  apiKey: string,
): Promise<SerperLookupResult | null> {
  const query = `site:${site} "${addressStr}"`;
  console.log(`[serpapi] Searching: ${query}`);

  try {
    const params = new URLSearchParams({
      q: query,
      api_key: apiKey,
      gl: 'au',
      num: '3',
      engine: 'google',
    });

    const response = await fetch(`${SERPAPI_ENDPOINT}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[serpapi] API returned ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as SerpApiResponse;
    const results = data.organic_results || [];

    // Find the first result that's an actual listing page (not a search/suburb page)
    for (const result of results) {
      const url = result.link;
      if (!url) continue;

      if (site === 'domain.com.au' && isDomainListingUrl(url)) {
        console.log(`[serpapi] Found Domain listing: ${url}`);
        return { url, source: 'domain', title: result.title, snippet: result.snippet || '' };
      }

      if (site === 'realestate.com.au' && isReaListingUrl(url)) {
        console.log(`[serpapi] Found REA listing: ${url}`);
        return { url, source: 'rea', title: result.title, snippet: result.snippet || '' };
      }
    }

    console.log(`[serpapi] No listing URL found in ${results.length} results from ${site}`);
    return null;
  } catch (err) {
    console.error(`[serpapi] Search failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Check if a URL is a Domain.com.au individual listing page (not search/suburb) */
function isDomainListingUrl(url: string): boolean {
  if (!/domain\.com\.au/i.test(url)) return false;
  if (/\/(sale|rent|suburb-profile|news|advice|auction-results|property-profile)\//i.test(url)) return false;
  return /domain\.com\.au\/[a-z0-9-]+-\d{5,}$/i.test(url);
}

/** Check if a URL is a realestate.com.au individual listing page (not search) */
function isReaListingUrl(url: string): boolean {
  if (!/realestate\.com\.au/i.test(url)) return false;
  return /realestate\.com\.au\/property-[a-z]+-[a-z]+-[a-z+]+-\d+/i.test(url);
}
