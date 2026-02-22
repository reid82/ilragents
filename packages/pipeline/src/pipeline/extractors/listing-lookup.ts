import type { ListingData, ParsedAddress } from './listing-types';
import { formatAddressForSearch } from './listing-types';
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
 * 2. Primary: Serper.dev Google search -> find listing URL -> Cheerio scrape (~2-4s)
 * 3. Fallback A: Domain API search (if configured, ~1-2s)
 * 4. Fallback B: Apify suburb scrape (slow, ~30-120s)
 * 5. Enrich with full page detail via Apify detail actor (non-fatal)
 * 6. Return result with status
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

  // Step 2: Serper.dev Google search (fast path, ~2-4s)
  try {
    const { findListingUrlViaSerper } = await import('../intelligence/serper-lookup');
    const serperResult = await findListingUrlViaSerper(address);

    if (serperResult) {
      const { scrapeListing } = await import('./listing-scraper');
      console.log(`[listing-lookup] Scraping listing from Serper result: ${serperResult.url}`);
      let listing = await scrapeListing(serperResult.url);
      listing = await tryEnrich(listing);
      const source = serperResult.source === 'domain' ? 'serper-domain' as const : 'serper-rea' as const;
      return { status: 'found', listing, source, addressSearched: addressString, parsedAddress: address };
    }
  } catch (err) {
    console.error('[listing-lookup] Serper lookup failed:', err instanceof Error ? err.message : err);
  }

  // Step 3: Domain API fallback (if configured)
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

  // Step 4: Apify suburb scrape fallback (slow path, ~30-120s)
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

  // Step 5: Not found
  return { status: 'not-found', listing: null, addressSearched: addressString, parsedAddress: address };
}
