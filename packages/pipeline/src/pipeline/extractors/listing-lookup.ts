import type { ListingData, ParsedAddress } from './listing-types';
import { formatAddressForSearch, LISTING_DETAIL_DEFAULTS } from './listing-types';
import { extractAddressFromMessage } from './address-extractor';
import { enrichListingDetail } from '../intelligence/apify-listing-detail';

export interface LookupResult {
  status: 'found' | 'not-found' | 'no-address';
  listing: ListingData | null;
  source?: 'serper-domain' | 'serper-rea' | 'domain-api' | 'apify-domain' | 'apify-rea';
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

/** Build a minimal ListingData shell from a URL (for when Cheerio scrape fails but we have the URL) */
function buildListingShell(url: string, source: 'domain' | 'rea', address: ParsedAddress): ListingData {
  return {
    source,
    url,
    address: formatAddressForSearch(address),
    suburb: address.suburb,
    state: address.state || '',
    postcode: address.postcode || '',
    propertyType: 'unknown',
    bedrooms: null,
    bathrooms: null,
    parking: null,
    landSize: null,
    buildingSize: null,
    price: null,
    priceGuide: null,
    listingType: 'unknown',
    auctionDate: null,
    daysOnMarket: null,
    description: '',
    features: [],
    images: [],
    agentName: null,
    agencyName: null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    ...LISTING_DETAIL_DEFAULTS,
    rawData: {},
  };
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
 * 2. Primary: SerpAPI Google search -> find listing URL (~1-2s)
 * 3. Try Cheerio scrape of the URL (~1s), if blocked -> Apify detail actor (~10-15s)
 * 4. Fallback A: Domain API search (if configured)
 * 5. Fallback B: Apify suburb scrape (slow, last resort)
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
  let foundSource: 'domain' | 'rea' | null = null;

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
        const source = foundSource === 'domain' ? 'serper-domain' as const : 'serper-rea' as const;
        return { status: 'found', listing, source, addressSearched: addressString, parsedAddress: address };
      } catch (scrapeErr) {
        // Step 3b: Cheerio blocked -> use Apify detail actor directly with the URL we found
        console.log(`[listing-lookup] Cheerio scrape failed (${scrapeErr instanceof Error ? scrapeErr.message : 'unknown'}), trying Apify detail actor`);
        try {
          const shell = buildListingShell(foundUrl, foundSource, address);
          const listing = await enrichListingDetail(shell);
          // Only return if enrichment actually added data
          if (listing.description.length > 0 || listing.enrichmentSource === 'apify-detail') {
            const source = foundSource === 'domain' ? 'serper-domain' as const : 'serper-rea' as const;
            return { status: 'found', listing, source, addressSearched: addressString, parsedAddress: address };
          }
        } catch (detailErr) {
          console.error('[listing-lookup] Apify detail actor also failed:', detailErr instanceof Error ? detailErr.message : detailErr);
        }
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

  // Step 5: Apify suburb scrape fallback (slow path, last resort)
  try {
    const { searchListingViaApify } = await import('../intelligence/apify-listing-lookup');
    console.log('[listing-lookup] Falling back to Apify suburb scrape');
    let listing = await searchListingViaApify(address);
    if (listing) {
      const source = listing.source === 'domain' ? 'apify-domain' as const : 'apify-rea' as const;
      console.log(`[listing-lookup] Found listing via ${source}:`, listing.address);
      listing = await tryEnrich(listing);
      return { status: 'found', listing, source, addressSearched: addressString, parsedAddress: address };
    }
    console.log('[listing-lookup] No listing found via Apify');
  } catch (err) {
    console.error('[listing-lookup] Apify search failed:', err instanceof Error ? err.message : err);
  }

  return { status: 'not-found', listing: null, addressSearched: addressString, parsedAddress: address };
}
