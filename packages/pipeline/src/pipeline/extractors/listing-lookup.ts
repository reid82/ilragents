import type { ListingData, ParsedAddress } from './listing-types';
import { formatAddressForSearch, LISTING_DETAIL_DEFAULTS } from './listing-types';
import { extractAddressFromMessage } from './address-extractor';
import { enrichListingDetail } from '../intelligence/apify-listing-detail';
import type { SerperLookupResult } from '../intelligence/serper-lookup';

/** Minimum number of non-null data fields to consider a scrape "rich enough" */
const MIN_RICH_FIELDS = 3;
import type { PageExtractor } from '../intelligence/bright-data-scraper';

export interface LookupResult {
  status: 'found' | 'not-found' | 'no-address';
  listing: ListingData | null;
  source?: 'serper-domain' | 'serper-rea' | 'serper-onthehouse' | 'domain-api' | 'hpf';
  addressSearched?: string;
  parsedAddress?: ParsedAddress;
}

export type ProgressCallback = (message: string) => void;

/** Enrich a listing with detail actor data (non-fatal) */
async function tryEnrich(listing: ListingData): Promise<ListingData> {
  if (!listing.url || listing.description.length > 200) return listing;
  try {
    return await enrichListingDetail(listing);
  } catch (err) {
    console.error('[listing-lookup] Detail enrichment failed (non-fatal):', err instanceof Error ? err.message : err);
    return listing;
  }
}

/**
 * Build a ListingData from SerpAPI search result data (snippet + title).
 * Extracts beds, baths, parking, property type, price, land/building size
 * from the Google snippet text - no scraping needed.
 */
export function buildListingFromSnippet(
  serperResult: SerperLookupResult,
  address: ParsedAddress,
): ListingData {
  const text = `${serperResult.title} ${serperResult.snippet}`;
  const lower = text.toLowerCase();

  // Bedrooms: "3 bedroom" / "3 bed" / "3 Beds"
  const bedsMatch = text.match(/(\d+)\s*(?:bed(?:room)?s?)/i);
  // Bathrooms: "2 bathroom" / "2 bath" / "2 Bath"
  const bathsMatch = text.match(/(\d+)\s*(?:bath(?:room)?s?)/i);
  // Parking: "2 parking" / "2 car" / "2 Parking"
  const parkingMatch = text.match(/(\d+)\s*(?:parking|car)\s*(?:space)?s?/i);
  // Property type
  const propertyType = extractPropertyType(lower);
  // Land size: "589 m²" / "650sqm" / "land size of 589"
  const landMatch = text.match(/(?:land\s*(?:size|area)\s*(?:of\s*)?)?(\d[\d,]*)\s*(?:m²|sqm|sq\s*m)/i);
  // Building size: "internal building area of 70 square metres" / "70m² internal"
  const buildingMatch = text.match(/(?:internal|building|floor)\s*(?:building\s*)?(?:area|size)\s*(?:of\s*)?(\d[\d,]*)\s*(?:square\s*metres?|m²|sqm)/i);
  // Price: "$405,000" / "$750k" / "sold for $405000"
  const priceMatch = text.match(/\$[\d,]+(?:k)?/i);
  // Year built
  const yearBuiltMatch = text.match(/built\s*(?:in\s*)?(\d{4})/i);
  // Sold info from title: "Sold ... on DD Mon YYYY"
  const soldMatch = serperResult.title.match(/^Sold\s/i);

  const priceText = priceMatch ? priceMatch[0] : null;
  let priceGuide: number | null = null;
  if (priceText) {
    const cleaned = priceText.replace(/[$,]/g, '');
    if (cleaned.toLowerCase().endsWith('k')) {
      priceGuide = parseInt(cleaned.slice(0, -1), 10) * 1000 || null;
    } else {
      priceGuide = parseInt(cleaned, 10) || null;
    }
  }

  const listingType: ListingData['listingType'] = soldMatch ? 'unknown'
    : lower.includes('auction') ? 'auction'
    : lower.includes('expression') ? 'eoi'
    : priceText ? 'sale'
    : 'unknown';

  const description = serperResult.snippet;
  const images = serperResult.thumbnail ? [serperResult.thumbnail] : [];

  console.log(`[listing-lookup] Parsed snippet: ${bedsMatch?.[1] || '?'}bed/${bathsMatch?.[1] || '?'}bath/${parkingMatch?.[1] || '?'}car, ${propertyType}, ${priceText || 'no price'}`);

  return {
    source: serperResult.source,
    url: serperResult.url,
    address: formatAddressForSearch(address),
    suburb: address.suburb,
    state: address.state || '',
    postcode: address.postcode || '',
    propertyType,
    bedrooms: bedsMatch ? parseInt(bedsMatch[1], 10) : null,
    bathrooms: bathsMatch ? parseInt(bathsMatch[1], 10) : null,
    parking: parkingMatch ? parseInt(parkingMatch[1], 10) : null,
    landSize: landMatch ? parseInt(landMatch[1].replace(/,/g, ''), 10) : null,
    buildingSize: buildingMatch ? parseInt(buildingMatch[1].replace(/,/g, ''), 10) : null,
    price: priceText,
    priceGuide,
    listingType,
    auctionDate: null,
    daysOnMarket: null,
    description,
    features: yearBuiltMatch ? [`Year built: ${yearBuiltMatch[1]}`] : [],
    images,
    agentName: null,
    agencyName: null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    ...LISTING_DETAIL_DEFAULTS,
    enrichmentSource: 'serp-snippet',
    rawData: { serpapi: { title: serperResult.title, snippet: serperResult.snippet, thumbnail: serperResult.thumbnail } },
  };
}

/** Extract property type from text */
function extractPropertyType(lower: string): string {
  if (lower.includes('house')) return 'house';
  if (lower.includes('apartment')) return 'apartment';
  if (lower.includes('unit')) return 'unit';
  if (lower.includes('townhouse')) return 'townhouse';
  if (lower.includes('villa')) return 'villa';
  if (lower.includes('land') && !lower.includes('land size')) return 'land';
  if (lower.includes('studio')) return 'studio';
  if (lower.includes('duplex')) return 'duplex';
  if (lower.includes('terrace')) return 'terrace';
  return 'unknown';
}

/** Map SerpAPI source to LookupResult source label */
function serperSourceToLookupSource(source: 'domain' | 'rea' | 'onthehouse' | null): LookupResult['source'] {
  if (source === 'domain') return 'serper-domain';
  if (source === 'onthehouse') return 'serper-onthehouse';
  return 'serper-rea';
}

/** Get the appropriate Playwright page extractor for a source */
async function getExtractorForSource(source: 'domain' | 'rea' | 'onthehouse'): Promise<PageExtractor> {
  if (source === 'onthehouse') {
    const { extractOnthehousePage } = await import('../intelligence/onthehouse-extractor');
    return extractOnthehousePage;
  }
  const { extractGenericPage } = await import('../intelligence/bright-data-scraper');
  return extractGenericPage;
}

/** Get the appropriate merge function for a source */
async function getMergerForSource(source: 'domain' | 'rea' | 'onthehouse'): Promise<(listing: ListingData, raw: Record<string, unknown>) => ListingData> {
  if (source === 'onthehouse') {
    const { mergeOnthehouseDetail } = await import('../intelligence/onthehouse-extractor');
    return mergeOnthehouseDetail;
  }
  if (source === 'domain') {
    const { mergeDomainDetail } = await import('../intelligence/apify-listing-detail');
    return mergeDomainDetail;
  }
  const { mergeReaDetail } = await import('../intelligence/apify-listing-detail');
  return mergeReaDetail;
}

/** Count how many key data fields a listing has populated */
function countRichFields(listing: ListingData): number {
  let count = 0;
  if (listing.bedrooms !== null) count++;
  if (listing.bathrooms !== null) count++;
  if (listing.parking !== null) count++;
  if (listing.landSize !== null) count++;
  if (listing.priceGuide !== null) count++;
  if (listing.description.length > 100) count++;
  if (listing.images.length > 0) count++;
  if (listing.agentName) count++;
  if (listing.propertyHistory && listing.propertyHistory.length > 0) count++;
  return count;
}

/** Try scraping a URL via Bright Data, then Cheerio, returning the listing or null */
async function tryScrape(
  url: string,
  serperResult: SerperLookupResult,
  address: ParsedAddress,
): Promise<ListingData | null> {
  const source = serperResult.source;

  // Step A: Try Bright Data Scraping Browser (if configured)
  try {
    const { scrapeWithBrightData } = await import('../intelligence/bright-data-scraper');
    const extractor = await getExtractorForSource(source);
    const raw = await scrapeWithBrightData(url, extractor);

    if (raw && Object.keys(raw).length > 0) {
      const listing = buildListingFromSnippet(serperResult, address);
      const merger = await getMergerForSource(source);
      return merger(listing, raw);
    }
  } catch (err) {
    console.log(`[listing-lookup] Bright Data scrape failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // Step B: Try Cheerio scrape (fast, may be blocked, doesn't work for OTH)
  if (source !== 'onthehouse') {
    try {
      const { scrapeListing } = await import('./listing-scraper');
      console.log(`[listing-lookup] Cheerio scraping: ${url}`);
      return await scrapeListing(url);
    } catch (scrapeErr) {
      console.log(`[listing-lookup] Cheerio scrape failed: ${scrapeErr instanceof Error ? scrapeErr.message : 'unknown'}`);
    }
  }

  return null;
}

/** Check if a Domain API search result's address matches the target */
function domainApiAddressMatches(
  result: { listing?: { propertyDetails?: { streetNumber?: string; street?: string; displayableAddress?: string } } },
  target: ParsedAddress,
): boolean {
  const prop = result.listing?.propertyDetails;
  if (!prop) return false;

  const targetNum = target.streetNumber.toLowerCase();
  const targetStreet = target.streetName.toLowerCase();

  if (prop.streetNumber && prop.street) {
    return prop.streetNumber.toLowerCase().includes(targetNum)
      && prop.street.toLowerCase().includes(targetStreet);
  }

  const display = (prop.displayableAddress || '').toLowerCase();
  return display.includes(targetNum) && display.includes(targetStreet);
}

/**
 * Scrape a listing directly from a known URL (no SERP search needed).
 *
 * Tries Bright Data first, then Cheerio fallback. Enriches via Apify if possible.
 * Use this when the user provides a direct listing URL instead of an address.
 */
export async function scrapeListingByUrl(
  url: string,
  source: 'domain' | 'rea' | 'onthehouse',
  onProgress?: ProgressCallback,
): Promise<ListingData> {
  const progress = onProgress || (() => {});

  // Step 1: Try Bright Data scraping (handles anti-bot, JS rendering, OnTheHouse)
  try {
    progress('Researching that property online...');
    const { scrapeWithBrightData } = await import('../intelligence/bright-data-scraper');
    const extractor = await getExtractorForSource(source);
    const raw = await scrapeWithBrightData(url, extractor);

    if (raw && Object.keys(raw).length > 0) {
      // Build a minimal listing shell, then merge scraped data
      const merger = await getMergerForSource(source);
      const shell: ListingData = {
        source, url, address: '', suburb: '', state: '', postcode: '',
        propertyType: 'unknown', bedrooms: null, bathrooms: null, parking: null,
        landSize: null, buildingSize: null, price: null, priceGuide: null,
        listingType: 'unknown', auctionDate: null, daysOnMarket: null,
        description: '', features: [], images: [],
        agentName: null, agencyName: null,
        suburbMedianPrice: null, suburbMedianRent: null,
        suburbDaysOnMarket: null, suburbAuctionClearance: null,
        ...LISTING_DETAIL_DEFAULTS, rawData: {},
      };
      const listing = merger(shell, raw);
      const richness = countRichFields(listing);
      console.log(`[listing-lookup] Bright Data URL scrape: ${richness} rich fields`);

      if (richness >= MIN_RICH_FIELDS) {
        progress('Enriching property data...');
        return await tryEnrich(listing);
      }
    }
  } catch (err) {
    console.log(`[listing-lookup] Bright Data URL scrape failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // Step 2: Cheerio fallback (Domain/REA only - OTH needs JS rendering)
  if (source !== 'onthehouse') {
    try {
      progress('Fetching listing details...');
      const { scrapeListing } = await import('./listing-scraper');
      console.log(`[listing-lookup] Cheerio scraping URL: ${url}`);
      const listing = await scrapeListing(url);
      progress('Enriching property data...');
      return await tryEnrich(listing);
    } catch (scrapeErr) {
      console.log(`[listing-lookup] Cheerio URL scrape failed: ${scrapeErr instanceof Error ? scrapeErr.message : 'unknown'}`);
    }
  }

  throw new Error(`Failed to scrape listing from ${url}`);
}

/**
 * Look up a property listing from a user message containing an address.
 *
 * Flow:
 * 0. HPF service (if configured and healthy) - single source for all data
 * 1. Extract address from message via LLM
 * 2. SerpAPI: search all three sites in parallel (REA, Domain, OTH)
 * 3. Try each source in richness order: scrape via Bright Data -> Cheerio -> snippet
 *    If the first source is thin (<3 rich fields), try the next source
 * 4. Fallback: Domain API search (if configured)
 */
export async function lookupListingByAddress(
  message: string,
  onProgress?: ProgressCallback,
): Promise<LookupResult> {
  const progress = onProgress || (() => {});

  // Step 1: Extract address
  progress('Extracting address...');
  const address = await extractAddressFromMessage(message);
  if (!address) {
    console.log('[listing-lookup] No address detected in message');
    return { status: 'no-address', listing: null };
  }

  const addressString = formatAddressForSearch(address);
  console.log('[listing-lookup] Address extracted:', addressString);

  // Step 0: HPF service (if configured)
  if (process.env.HPF_SERVICE_URL) {
    try {
      const { isHpfHealthy, lookupViaHpf } = await import('../intelligence/hpf-client');
      progress('Checking Hot Property Finder...');

      if (await isHpfHealthy()) {
        const hpfResult = await lookupViaHpf(
          addressString,
          address.suburb,
          address.state || '',
          address.postcode || '',
        );

        if (hpfResult?.listing) {
          const richness = countRichFields(hpfResult.listing);
          console.log(`[listing-lookup] HPF returned ${richness} rich fields in ${hpfResult.fetchedMs}ms`);

          if (richness >= MIN_RICH_FIELDS) {
            return {
              status: 'found',
              listing: hpfResult.listing,
              source: 'hpf',
              addressSearched: addressString,
              parsedAddress: address,
            };
          }
          console.log('[listing-lookup] HPF data too thin, falling through to other sources');
        }
      } else {
        console.log('[listing-lookup] HPF service not healthy, falling through');
      }
    } catch (err) {
      console.log(`[listing-lookup] HPF lookup failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }
  }

  // Step 2: SerpAPI Google search - all sites in parallel
  try {
    progress(`Searching for ${addressString}...`);
    const { findAllListingUrls } = await import('../intelligence/serper-lookup');
    const allResults = await findAllListingUrls(address);

    // Step 3: Try each source in order (already sorted REA > Domain > OTH)
    let bestListing: ListingData | null = null;
    let bestSource: LookupResult['source'] | undefined;
    let bestRichness = -1;

    const sourceLabels: Record<string, string> = {
      rea: 'realestate.com.au',
      domain: 'domain.com.au',
      onthehouse: 'onthehouse.com.au',
    };

    for (const serperResult of allResults) {
      const source = serperSourceToLookupSource(serperResult.source);
      const label = sourceLabels[serperResult.source] || serperResult.source;
      progress(`Checking ${label}...`);

      // Try scraping this source
      const scrapedListing = await tryScrape(serperResult.url, serperResult, address);

      if (scrapedListing) {
        const richness = countRichFields(scrapedListing);
        console.log(`[listing-lookup] ${serperResult.source} scrape: ${richness} rich fields`);

        if (richness >= MIN_RICH_FIELDS) {
          // Good enough - enrich and return
          progress('Enriching property data...');
          const listing = await tryEnrich(scrapedListing);
          return { status: 'found', listing, source, addressSearched: addressString, parsedAddress: address };
        }

        // Keep track of the best we've found so far
        if (richness > bestRichness) {
          bestListing = scrapedListing;
          bestSource = source;
          bestRichness = richness;
        }
        continue;
      }

      // Scraping failed entirely - build from snippet and score it
      const snippetListing = buildListingFromSnippet(serperResult, address);
      const snippetRichness = countRichFields(snippetListing);

      if (snippetRichness > bestRichness) {
        bestListing = snippetListing;
        bestSource = source;
        bestRichness = snippetRichness;
      }
    }

    // Return the best listing we found across all sources
    if (bestListing) {
      console.log(`[listing-lookup] Using best result (${bestSource}, ${bestRichness} rich fields)`);
      progress('Enriching property data...');
      const listing = await tryEnrich(bestListing);
      return { status: 'found', listing, source: bestSource, addressSearched: addressString, parsedAddress: address };
    }
  } catch (err) {
    console.error('[listing-lookup] Serper lookup failed:', err instanceof Error ? err.message : err);
  }

  // Step 4: Domain API fallback (if configured)
  const hasDomainApi = !!(process.env.DOMAIN_API_CLIENT_ID && process.env.DOMAIN_API_CLIENT_SECRET);
  if (hasDomainApi && address.suburb) {
    try {
      progress('Checking Domain API...');
      const { DomainApiClient } = await import('./domain-api');
      const { mapDomainSearchResultToListing } = await import('./domain-mapper');
      const domain = new DomainApiClient();

      console.log(`[listing-lookup] Searching Domain API: ${address.suburb} ${address.state || ''}`);
      const results = await domain.searchResidentialListings(address.suburb, address.state || '');

      if (results.length > 0) {
        const match = results.find(r => domainApiAddressMatches(r, address));
        if (match) {
          console.log('[listing-lookup] Found match via Domain API:', match.listing?.propertyDetails?.displayableAddress);
          progress('Enriching property data...');
          let listing = mapDomainSearchResultToListing(match);
          listing = await tryEnrich(listing);
          return { status: 'found', listing, source: 'domain-api', addressSearched: addressString, parsedAddress: address };
        }
        console.log(`[listing-lookup] Domain API returned ${results.length} listings but none matched address`);
      } else {
        console.log('[listing-lookup] Domain API returned 0 listings');
      }
    } catch (err) {
      console.error('[listing-lookup] Domain API search failed:', err instanceof Error ? err.message : err);
    }
  }

  return { status: 'not-found', listing: null, addressSearched: addressString, parsedAddress: address };
}
