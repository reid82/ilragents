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
    return { status: 'no-address', listing: null };
  }

  const addressString = formatAddressForSearch(address);

  // Step 2: Try Domain API
  try {
    const domainClient = new DomainApiClient();
    const results = await domainClient.searchResidentialListings(
      address.suburb,
      address.state || '',
    );

    // Find best match by street address
    const match = results.find(r => matchesAddress(r, address));
    if (match) {
      const listing = mapDomainSearchResultToListing(match);
      return { status: 'found', listing, source: 'domain-api', addressSearched: addressString };
    }
  } catch {
    // Domain API failed - fall through to REA
  }

  // Step 3: Fall back to REA
  try {
    const reaListing = await searchReaByAddress(address);
    if (reaListing) {
      return { status: 'found', listing: reaListing, source: 'rea-scrape', addressSearched: addressString };
    }
  } catch {
    // REA also failed
  }

  // Step 4: Not found anywhere
  return { status: 'not-found', listing: null, addressSearched: addressString };
}
