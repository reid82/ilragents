import type { ListingData, ParsedAddress } from './listing-types';
import { formatAddressForSearch, LISTING_DETAIL_DEFAULTS } from './listing-types';
import { extractAddressFromMessage } from './address-extractor';
import { enrichListingDetail } from '../intelligence/apify-listing-detail';
import type { SerperLookupResult } from '../intelligence/serper-lookup';

export interface LookupResult {
  status: 'found' | 'not-found' | 'no-address';
  listing: ListingData | null;
  source?: 'serper-domain' | 'serper-rea' | 'serper-onthehouse' | 'domain-api';
  addressSearched?: string;
  parsedAddress?: ParsedAddress;
}

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
 * Look up a property listing from a user message containing an address.
 *
 * Flow:
 * 1. Extract address from message via LLM
 * 2. Primary: SerpAPI Google search -> find listing URL + snippet data (~1-2s)
 * 3. Try Cheerio scrape of the URL (~1s), if blocked -> use snippet data (instant)
 * 4. Fallback: Domain API search (if configured)
 */
export async function lookupListingByAddress(message: string): Promise<LookupResult> {
  // Step 1: Extract address
  const address = await extractAddressFromMessage(message);
  if (!address) {
    console.log('[listing-lookup] No address detected in message');
    return { status: 'no-address', listing: null };
  }

  const addressString = formatAddressForSearch(address);
  console.log('[listing-lookup] Address extracted:', addressString);

  // Step 2: SerpAPI Google search (fast path)
  let foundUrl: string | null = null;
  let foundSource: 'domain' | 'rea' | 'onthehouse' | null = null;

  try {
    const { findListingUrlViaSerper } = await import('../intelligence/serper-lookup');
    const serperResult = await findListingUrlViaSerper(address);

    if (serperResult) {
      foundUrl = serperResult.url;
      foundSource = serperResult.source;

      // Step 3a: Try Cheerio scrape first (fast, ~1s, but may be blocked)
      try {
        const { scrapeListing } = await import('./listing-scraper');
        console.log(`[listing-lookup] Scraping listing: ${foundUrl}`);
        let listing = await scrapeListing(foundUrl);
        listing = await tryEnrich(listing);
        const source = serperSourceToLookupSource(foundSource);
        return { status: 'found', listing, source, addressSearched: addressString, parsedAddress: address };
      } catch (scrapeErr) {
        // Step 3b: Cheerio blocked -> extract what we can from the SerpAPI snippet (instant, free)
        console.log(`[listing-lookup] Cheerio scrape failed (${scrapeErr instanceof Error ? scrapeErr.message : 'unknown'}), using SerpAPI snippet data`);
        const listing = buildListingFromSnippet(serperResult, address);
        const source = serperSourceToLookupSource(foundSource);
        return { status: 'found', listing, source, addressSearched: addressString, parsedAddress: address };
      }
    }
  } catch (err) {
    console.error('[listing-lookup] Serper lookup failed:', err instanceof Error ? err.message : err);
  }

  // Step 4: Domain API fallback (if configured)
  const hasDomainApi = !!(process.env.DOMAIN_API_CLIENT_ID && process.env.DOMAIN_API_CLIENT_SECRET);
  if (hasDomainApi && address.suburb) {
    try {
      const { DomainApiClient } = await import('./domain-api');
      const { mapDomainSearchResultToListing } = await import('./domain-mapper');
      const domain = new DomainApiClient();

      console.log(`[listing-lookup] Searching Domain API: ${address.suburb} ${address.state || ''}`);
      const results = await domain.searchResidentialListings(address.suburb, address.state || '');

      if (results.length > 0) {
        const match = results.find(r => domainApiAddressMatches(r, address));
        if (match) {
          console.log('[listing-lookup] Found match via Domain API:', match.listing?.propertyDetails?.displayableAddress);
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
