/**
 * Serper.dev Google Search - fast address-to-listing-URL resolution.
 *
 * Uses `site:domain.com.au` or `site:realestate.com.au` Google search
 * to find the exact listing page URL for a given address.
 * Typically resolves in 1-2 seconds at $0.001 per query.
 */

import type { ParsedAddress } from '../extractors/listing-types';
import { formatAddressForSearch } from '../extractors/listing-types';

const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const TIMEOUT_MS = 10000;

export interface SerperLookupResult {
  url: string;
  source: 'domain' | 'rea';
  title: string;
  snippet: string;
}

/** Serper.dev API response types */
interface SerperOrganicResult {
  title: string;
  link: string;
  snippet?: string;
  position?: number;
}

interface SerperResponse {
  organic?: SerperOrganicResult[];
  searchParameters?: { q: string };
}

/**
 * Search Google via Serper.dev for a property listing URL.
 *
 * Tries Domain first, then REA. Returns the first matching listing URL.
 * Returns null if no listing found or if SERPER_API_KEY is not configured.
 */
export async function findListingUrlViaSerper(address: ParsedAddress): Promise<SerperLookupResult | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.log('[serper] SERPER_API_KEY not configured, skipping');
    return null;
  }

  const addressStr = formatAddressForSearch(address);

  // Try Domain first
  const domainResult = await searchSite('domain.com.au', addressStr, apiKey);
  if (domainResult) return domainResult;

  // Fall back to REA
  const reaResult = await searchSite('realestate.com.au', addressStr, apiKey);
  if (reaResult) return reaResult;

  console.log('[serper] No listing found on Domain or REA');
  return null;
}

async function searchSite(
  site: string,
  addressStr: string,
  apiKey: string,
): Promise<SerperLookupResult | null> {
  const query = `site:${site} "${addressStr}"`;
  console.log(`[serper] Searching: ${query}`);

  try {
    const response = await fetch(SERPER_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        gl: 'au',
        num: 3,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[serper] API returned ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as SerperResponse;
    const results = data.organic || [];

    // Find the first result that's an actual listing page (not a search/suburb page)
    for (const result of results) {
      const url = result.link;
      if (!url) continue;

      if (site === 'domain.com.au' && isDomainListingUrl(url)) {
        console.log(`[serper] Found Domain listing: ${url}`);
        return { url, source: 'domain', title: result.title, snippet: result.snippet || '' };
      }

      if (site === 'realestate.com.au' && isReaListingUrl(url)) {
        console.log(`[serper] Found REA listing: ${url}`);
        return { url, source: 'rea', title: result.title, snippet: result.snippet || '' };
      }
    }

    console.log(`[serper] No listing URL found in ${results.length} results from ${site}`);
    return null;
  } catch (err) {
    console.error(`[serper] Search failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Check if a URL is a Domain.com.au individual listing page (not search/suburb) */
function isDomainListingUrl(url: string): boolean {
  // Listing pages: domain.com.au/{address-slug}-{listing-id}
  // Exclude: /sale/, /rent/, /suburb-profile/, /news/, /advice/
  if (!/domain\.com\.au/i.test(url)) return false;
  if (/\/(sale|rent|suburb-profile|news|advice|auction-results|property-profile)\//i.test(url)) return false;
  // Listing URLs have a numeric ID at the end
  return /domain\.com\.au\/[a-z0-9-]+-\d{5,}$/i.test(url);
}

/** Check if a URL is a realestate.com.au individual listing page (not search) */
function isReaListingUrl(url: string): boolean {
  // Listing pages: realestate.com.au/property-{type}-{state}-{suburb}-{id}
  if (!/realestate\.com\.au/i.test(url)) return false;
  return /realestate\.com\.au\/property-[a-z]+-[a-z]+-[a-z+]+-\d+/i.test(url);
}
