/**
 * SerpAPI Google Search - fast address-to-listing-URL resolution.
 *
 * Uses `site:domain.com.au`, `site:realestate.com.au`, or
 * `site:onthehouse.com.au` Google search to find the exact listing
 * page URL for a given address.
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
  source: 'domain' | 'rea' | 'onthehouse';
  title: string;
  snippet: string;
  thumbnail?: string;
}

/** SerpAPI organic result */
interface SerpApiOrganicResult {
  title: string;
  link: string;
  snippet?: string;
  thumbnail?: string;
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
 * Searches all three sites (Domain, REA, OnTheHouse) and returns all
 * matching results sorted by richness: REA > Domain > OnTheHouse.
 * Returns empty array if no listings found or SERPER_API_KEY not configured.
 */
export async function findAllListingUrls(address: ParsedAddress): Promise<SerperLookupResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.log('[serpapi] SERPER_API_KEY not configured, skipping');
    return [];
  }

  const addressStr = formatAddressForSearch(address);

  // Search all three sites in parallel
  const [domainResult, reaResult, othResult] = await Promise.all([
    searchSite('domain.com.au', addressStr, apiKey),
    searchSite('realestate.com.au', addressStr, apiKey),
    searchSite('onthehouse.com.au', addressStr, apiKey),
  ]);

  // Collect results, ordered by richness: REA > Domain > OTH
  const results: SerperLookupResult[] = [];
  if (reaResult) results.push(reaResult);
  if (domainResult) results.push(domainResult);
  if (othResult) results.push(othResult);

  if (results.length === 0) {
    console.log('[serpapi] No listing found on Domain, REA, or OnTheHouse');
  } else {
    console.log(`[serpapi] Found ${results.length} source(s): ${results.map(r => r.source).join(', ')}`);
  }

  return results;
}

/**
 * Search Google via SerpAPI for a property listing URL.
 *
 * Legacy single-result API. Returns the best (first) result from findAllListingUrls.
 * Returns null if no listing found or if SERPER_API_KEY is not configured.
 */
export async function findListingUrlViaSerper(address: ParsedAddress): Promise<SerperLookupResult | null> {
  const results = await findAllListingUrls(address);
  return results[0] || null;
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
        return { url, source: 'domain', title: result.title, snippet: result.snippet || '', thumbnail: result.thumbnail };
      }

      if (site === 'realestate.com.au' && isReaListingUrl(url)) {
        console.log(`[serpapi] Found REA listing: ${url}`);
        return { url, source: 'rea', title: result.title, snippet: result.snippet || '', thumbnail: result.thumbnail };
      }

      if (site === 'onthehouse.com.au' && isOnthehouseUrl(url)) {
        console.log(`[serpapi] Found OnTheHouse listing: ${url}`);
        return { url, source: 'onthehouse', title: result.title, snippet: result.snippet || '', thumbnail: result.thumbnail };
      }
    }

    console.log(`[serpapi] No listing URL found in ${results.length} results from ${site}`);
    return null;
  } catch (err) {
    console.error(`[serpapi] Search failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Check if a URL is a Domain.com.au individual listing or property page */
function isDomainListingUrl(url: string): boolean {
  if (!/domain\.com\.au/i.test(url)) return false;
  // Skip search/suburb/editorial pages
  if (/\/(sale|rent|suburb-profile|news|advice|auction-results|street-profile)\//i.test(url)) return false;
  // Match listing pages (slug-12345678) or property profile pages
  return /domain\.com\.au\/[a-z0-9-]+-\d{5,}$/i.test(url)
    || /domain\.com\.au\/property-profile\//i.test(url);
}

/** Check if a URL is a realestate.com.au individual listing or property page */
function isReaListingUrl(url: string): boolean {
  if (!/realestate\.com\.au/i.test(url)) return false;
  // Match listing pages or property profile pages
  return /realestate\.com\.au\/property-[a-z]+-[a-z]+-[a-z+]+-\d+/i.test(url)
    || /realestate\.com\.au\/property\/[a-z0-9-]+/i.test(url)
    || /realestate\.com\.au\/sold\/property-/i.test(url);
}

/** Check if a URL is an onthehouse.com.au property page */
function isOnthehouseUrl(url: string): boolean {
  if (!/onthehouse\.com\.au/i.test(url)) return false;
  // Match property pages: /property/{state}/{suburb}-{postcode}/{slug}
  return /onthehouse\.com\.au\/property\//i.test(url);
}
