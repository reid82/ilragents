import { ApifyClient } from './apify-client';
import type { ListingData, ParsedAddress } from '../extractors/listing-types';

const DOMAIN_SEARCH_ACTOR = process.env.APIFY_DOMAIN_SEARCH_ACTOR || 'fatihtahta/domain-com-au-scraper';
const REA_SEARCH_ACTOR = process.env.APIFY_REA_SEARCH_ACTOR || 'azzouzana/realestate-com-au-search-pages-scraper';

/** Parse a numeric price from display text like "$750,000", "$650,000 - $700,000" */
function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\$[\d,]+/);
  if (!match) return null;
  return parseInt(match[0].replace(/[$,]/g, ''), 10) || null;
}

/** Check if scraped result address matches the target address */
function addressMatches(scrapedAddress: string, target: ParsedAddress): boolean {
  const lower = scrapedAddress.toLowerCase();
  const targetNum = target.streetNumber.toLowerCase();
  const targetStreet = target.streetName.toLowerCase();

  return lower.includes(targetNum) && lower.includes(targetStreet);
}

/** Build a Domain.com.au search URL for a suburb */
function buildDomainSearchUrl(address: ParsedAddress): string {
  const suburb = address.suburb.toLowerCase().replace(/\s+/g, '-');
  const state = (address.state || '').toLowerCase();
  const postcode = address.postcode || '';
  return `https://www.domain.com.au/sale/${suburb}-${state}-${postcode}/`;
}

/** Build a realestate.com.au search URL for a suburb */
function buildReaSearchUrl(address: ParsedAddress): string {
  const suburb = address.suburb.toLowerCase().replace(/\s+/g, '-');
  const state = (address.state || '').toLowerCase();
  const postcode = address.postcode || '';
  let url = `https://www.realestate.com.au/buy/in-${suburb}`;
  if (state) url += `,+${state}`;
  if (postcode) url += `+${postcode}`;
  url += '/list-1';
  return url;
}

/** Map a Domain Apify scrape result to ListingData */
function mapDomainResult(raw: Record<string, unknown>): ListingData {
  const priceText = (raw.price as string) || null;
  return {
    source: 'domain',
    url: (raw.url as string) || '',
    address: (raw.address as string) || '',
    suburb: extractSuburb(raw.address as string),
    state: extractState(raw.address as string),
    postcode: extractPostcode(raw.address as string),
    propertyType: (raw.propertyType as string) || 'unknown',
    bedrooms: (raw.bedrooms as number) ?? null,
    bathrooms: (raw.bathrooms as number) ?? null,
    parking: (raw.parking as number) ?? (raw.carSpaces as number) ?? null,
    landSize: (raw.landSize as number) ?? null,
    buildingSize: (raw.buildingSize as number) ?? null,
    price: priceText,
    priceGuide: parsePrice(priceText),
    listingType: priceText?.toLowerCase().includes('auction') ? 'auction' : 'sale',
    auctionDate: (raw.auctionDate as string) || null,
    daysOnMarket: (raw.daysOnMarket as number) ?? null,
    description: (raw.description as string) || '',
    features: Array.isArray(raw.features) ? raw.features : [],
    images: Array.isArray(raw.images) ? raw.images : [],
    agentName: (raw.agent as string) || null,
    agencyName: (raw.agency as string) || null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    rawData: raw,
  };
}

/** Map a REA Apify scrape result to ListingData */
function mapReaResult(raw: Record<string, unknown>): ListingData {
  const priceText = (raw.price as string) || null;
  return {
    source: 'rea',
    url: (raw.url as string) || '',
    address: (raw.address as string) || '',
    suburb: extractSuburb(raw.address as string),
    state: extractState(raw.address as string),
    postcode: extractPostcode(raw.address as string),
    propertyType: (raw.propertyType as string) || 'unknown',
    bedrooms: (raw.bedrooms as number) ?? null,
    bathrooms: (raw.bathrooms as number) ?? null,
    parking: (raw.carSpaces as number) ?? (raw.parking as number) ?? null,
    landSize: (raw.landSize as number) ?? null,
    buildingSize: (raw.buildingSize as number) ?? null,
    price: priceText,
    priceGuide: parsePrice(priceText),
    listingType: priceText?.toLowerCase().includes('auction') ? 'auction' : 'sale',
    auctionDate: (raw.auctionDate as string) || null,
    daysOnMarket: null,
    description: (raw.description as string) || '',
    features: Array.isArray(raw.features) ? raw.features : [],
    images: Array.isArray(raw.images) ? raw.images : [],
    agentName: (raw.agent as string) || null,
    agencyName: (raw.agency as string) || null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    rawData: raw,
  };
}

/** Extract suburb from "71 Bridge St, Eltham VIC 3095" style address */
function extractSuburb(address: string | undefined): string {
  if (!address) return '';
  const afterComma = address.split(',').pop()?.trim() || '';
  const parts = afterComma.split(/\s+/);
  if (parts.length >= 3) return parts.slice(0, -2).join(' ');
  if (parts.length >= 2) return parts[0];
  return '';
}

/** Extract state from address string */
function extractState(address: string | undefined): string {
  if (!address) return '';
  const match = address.match(/\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b/i);
  return match ? match[1].toUpperCase() : '';
}

/** Extract postcode from address string */
function extractPostcode(address: string | undefined): string {
  if (!address) return '';
  const match = address.match(/\b(\d{4})\b/);
  return match ? match[1] : '';
}

/**
 * Search for a listing via Apify actors.
 * Tries Domain first, falls back to REA.
 * Returns ListingData or null if not found.
 */
export async function searchListingViaApify(address: ParsedAddress): Promise<ListingData | null> {
  try {
    const apify = new ApifyClient();

    // Try Domain first
    const domainUrl = buildDomainSearchUrl(address);
    console.log(`[apify-listing] Searching Domain: ${domainUrl}`);
    const domainResults = await apify.runActor(DOMAIN_SEARCH_ACTOR, {
      startUrls: [{ url: domainUrl }],
    }, { timeoutMs: 90000 });

    if (domainResults.length > 0) {
      const match = domainResults.find(r =>
        addressMatches((r as Record<string, unknown>).address as string || '', address)
      );
      if (match) {
        console.log('[apify-listing] Found match on Domain');
        return mapDomainResult(match as Record<string, unknown>);
      }
      console.log(`[apify-listing] Domain returned ${domainResults.length} results but none matched address`);
    } else {
      console.log('[apify-listing] Domain returned no results');
    }

    // Fall back to REA
    const reaUrl = buildReaSearchUrl(address);
    console.log(`[apify-listing] Searching REA: ${reaUrl}`);
    const reaResults = await apify.runActor(REA_SEARCH_ACTOR, {
      startUrls: [{ url: reaUrl }],
    }, { timeoutMs: 90000 });

    if (reaResults.length > 0) {
      const match = reaResults.find(r =>
        addressMatches((r as Record<string, unknown>).address as string || '', address)
      );
      if (match) {
        console.log('[apify-listing] Found match on REA');
        return mapReaResult(match as Record<string, unknown>);
      }
      console.log(`[apify-listing] REA returned ${reaResults.length} results but none matched address`);
    } else {
      console.log('[apify-listing] REA returned no results');
    }

    return null;
  } catch (err) {
    console.error('[apify-listing] Search failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
