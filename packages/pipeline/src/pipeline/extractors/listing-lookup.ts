import type { ListingData, ParsedAddress } from './listing-types';
import { formatAddressForSearch } from './listing-types';
import { extractAddressFromMessage } from './address-extractor';
import { DomainApiClient } from './domain-api';
import type { DomainSearchResult } from './domain-api';
import { mapDomainSearchResultToListing } from './domain-mapper';
import { searchReaByAddress } from './listing-scraper';

export interface LookupResult {
  status: 'found' | 'not-found' | 'no-address';
  listing: ListingData | null;
  source?: 'domain-api' | 'rea-scrape';
  addressSearched?: string;
  parsedAddress?: ParsedAddress;
}

/**
 * Check whether a Domain search result matches the target street address.
 */
function matchesAddress(result: DomainSearchResult, address: ParsedAddress): boolean {
  const prop = result.listing?.propertyDetails;
  if (!prop) return false;

  const resultStreet = (prop.streetNumber || '').toLowerCase();
  const targetStreet = address.streetNumber.toLowerCase();

  if (resultStreet !== targetStreet) return false;

  // Check street name (fuzzy - just first word match)
  const resultName = (prop.street || prop.displayableAddress || '').toLowerCase();
  const targetName = address.streetName.toLowerCase();

  return resultName.includes(targetName);
}

/**
 * Look up a property listing from a user message containing an address.
 *
 * Flow:
 * 1. Extract address from message via LLM
 * 2. Search Domain API for matching listing
 * 3. Fall back to REA scrape if Domain fails
 * 4. Return result with status
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

  // Step 2: Try Domain API
  try {
    const domainClient = new DomainApiClient();
    const results = await domainClient.searchResidentialListings(
      address.suburb,
      address.state || '',
    );
    console.log(`[listing-lookup] Domain API returned ${results.length} results for ${address.suburb}`);

    // Find best match by street address
    const match = results.find(r => matchesAddress(r, address));
    if (match) {
      const listing = mapDomainSearchResultToListing(match);
      console.log('[listing-lookup] Matched listing from Domain API:', listing.address);
      return { status: 'found', listing, source: 'domain-api', addressSearched: addressString, parsedAddress: address };
    }
    console.log('[listing-lookup] No street-level match in Domain results');
  } catch (err) {
    console.error('[listing-lookup] Domain API failed:', err instanceof Error ? err.message : err);
  }

  // Step 3: Fall back to REA
  try {
    console.log('[listing-lookup] Trying REA fallback...');
    const reaListing = await searchReaByAddress(address);
    if (reaListing) {
      console.log('[listing-lookup] Found listing via REA scrape:', reaListing.address);
      return { status: 'found', listing: reaListing, source: 'rea-scrape', addressSearched: addressString, parsedAddress: address };
    }
    console.log('[listing-lookup] REA returned no matching listing');
  } catch (err) {
    console.error('[listing-lookup] REA scrape failed:', err instanceof Error ? err.message : err);
  }

  // Step 4: Not found anywhere
  return { status: 'not-found', listing: null, addressSearched: addressString, parsedAddress: address };
}
