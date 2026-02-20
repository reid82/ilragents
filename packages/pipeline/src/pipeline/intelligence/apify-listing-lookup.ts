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

/** Check if scraped result street/address matches the target address */
function addressMatches(raw: Record<string, unknown>, target: ParsedAddress): boolean {
  // Domain actor uses "street" field (e.g. "71 Bridge Street")
  const street = ((raw.street as string) || (raw.address as string) || '').toLowerCase();
  const targetNum = target.streetNumber.toLowerCase();
  const targetStreet = target.streetName.toLowerCase();

  return street.includes(targetNum) && street.includes(targetStreet);
}

/** Build a Domain.com.au search URL for a suburb */
function buildDomainSearchUrl(address: ParsedAddress): string {
  const suburb = address.suburb.toLowerCase().replace(/\s+/g, '-');
  const state = (address.state || '').toLowerCase();
  const postcode = address.postcode || '';
  return `https://www.domain.com.au/sale/?excludeunderoffer=1&suburb=${suburb}-${state}-${postcode}`;
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

/** Standard Apify proxy config for AU residential */
const PROXY_CONFIG = {
  useApifyProxy: true,
  apifyProxyGroups: ['RESIDENTIAL'],
  apifyProxyCountry: 'AU',
};

/**
 * Map a Domain Apify scrape result to ListingData.
 *
 * Domain actor output fields (from fatihtahta/domain-com-au-scraper):
 * url, type, priceText, street, suburb, state, postcode, beds, baths,
 * propertyType, propertyTypeFormatted, landSize, agentName, agencyName, images
 */
function mapDomainResult(raw: Record<string, unknown>): ListingData {
  const priceText = (raw.priceText as string) || (raw.price as string) || null;
  const street = (raw.street as string) || '';
  const suburb = (raw.suburb as string) || '';
  const state = (raw.state as string) || '';
  const postcode = (raw.postcode as string) || '';

  return {
    source: 'domain',
    url: (raw.url as string) || '',
    address: street ? `${street}, ${suburb} ${state} ${postcode}`.trim() : '',
    suburb,
    state,
    postcode,
    propertyType: (raw.propertyTypeFormatted as string) || (raw.propertyType as string) || 'unknown',
    bedrooms: (raw.beds as number) ?? null,
    bathrooms: (raw.baths as number) ?? null,
    parking: (raw.parking as number) ?? (raw.cars as number) ?? null,
    landSize: (raw.landSize as number) ?? null,
    buildingSize: (raw.buildingSize as number) ?? null,
    price: priceText,
    priceGuide: parsePrice(priceText),
    listingType: priceText?.toLowerCase().includes('auction') ? 'auction'
      : priceText?.toLowerCase().includes('expression') ? 'eoi'
      : 'sale',
    auctionDate: null,
    daysOnMarket: null,
    description: (raw.description as string) || '',
    features: Array.isArray(raw.keywords) ? raw.keywords : [],
    images: Array.isArray(raw.images) ? raw.images.slice(0, 10) : [],
    agentName: (raw.agentName as string) || null,
    agencyName: (raw.agencyName as string) || null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    rawData: raw,
  };
}

/** Map a REA Apify scrape result to ListingData */
function mapReaResult(raw: Record<string, unknown>): ListingData {
  const priceText = (raw.priceText as string) || (raw.price as string) || null;
  const street = (raw.street as string) || (raw.address as string) || '';
  const suburb = (raw.suburb as string) || '';
  const state = (raw.state as string) || '';
  const postcode = (raw.postcode as string) || '';

  return {
    source: 'rea',
    url: (raw.url as string) || '',
    address: street ? `${street}, ${suburb} ${state} ${postcode}`.trim() : '',
    suburb,
    state,
    postcode,
    propertyType: (raw.propertyType as string) || 'unknown',
    bedrooms: (raw.beds as number) ?? (raw.bedrooms as number) ?? null,
    bathrooms: (raw.baths as number) ?? (raw.bathrooms as number) ?? null,
    parking: (raw.cars as number) ?? (raw.carSpaces as number) ?? (raw.parking as number) ?? null,
    landSize: (raw.landSize as number) ?? null,
    buildingSize: (raw.buildingSize as number) ?? null,
    price: priceText,
    priceGuide: parsePrice(priceText),
    listingType: priceText?.toLowerCase().includes('auction') ? 'auction' : 'sale',
    auctionDate: null,
    daysOnMarket: null,
    description: (raw.description as string) || '',
    features: Array.isArray(raw.features) ? raw.features : [],
    images: Array.isArray(raw.images) ? raw.images.slice(0, 10) : [],
    agentName: (raw.agentName as string) || (raw.agent as string) || null,
    agencyName: (raw.agencyName as string) || (raw.agency as string) || null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    rawData: raw,
  };
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
      startUrls: [domainUrl],
      limit: 100,
      proxyConfiguration: PROXY_CONFIG,
    }, { timeoutMs: 120000 });

    // Filter to actual listings (skip "Project" type entries)
    const domainListings = domainResults.filter(r =>
      (r as Record<string, unknown>).type === 'Listing'
    );

    if (domainListings.length > 0) {
      const match = domainListings.find(r => addressMatches(r as Record<string, unknown>, address));
      if (match) {
        console.log('[apify-listing] Found match on Domain');
        return mapDomainResult(match as Record<string, unknown>);
      }
      console.log(`[apify-listing] Domain returned ${domainListings.length} listings but none matched address`);
    } else {
      console.log(`[apify-listing] Domain returned ${domainResults.length} results (0 listings)`);
    }

    // Fall back to REA (only if actor is accessible)
    try {
      const reaUrl = buildReaSearchUrl(address);
      console.log(`[apify-listing] Searching REA: ${reaUrl}`);
      const reaResults = await apify.runActor(REA_SEARCH_ACTOR, {
        startUrls: [reaUrl],
        limit: 100,
        proxyConfiguration: PROXY_CONFIG,
      }, { timeoutMs: 120000 });

      if (reaResults.length > 0) {
        const match = reaResults.find(r => addressMatches(r as Record<string, unknown>, address));
        if (match) {
          console.log('[apify-listing] Found match on REA');
          return mapReaResult(match as Record<string, unknown>);
        }
        console.log(`[apify-listing] REA returned ${reaResults.length} results but none matched address`);
      } else {
        console.log('[apify-listing] REA returned no results');
      }
    } catch (reaErr) {
      console.error('[apify-listing] REA search failed:', reaErr instanceof Error ? reaErr.message : reaErr);
    }

    return null;
  } catch (err) {
    console.error('[apify-listing] Search failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
