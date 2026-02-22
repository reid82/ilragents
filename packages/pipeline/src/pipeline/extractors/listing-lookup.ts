import type { ListingData, ParsedAddress } from './listing-types';
import { formatAddressForSearch } from './listing-types';
import { extractAddressFromMessage } from './address-extractor';
import { enrichListingDetail } from '../intelligence/apify-listing-detail';

export interface LookupResult {
  status: 'found' | 'not-found' | 'no-address';
  listing: ListingData | null;
  source?: 'domain-api' | 'apify-domain' | 'apify-rea';
  addressSearched?: string;
  parsedAddress?: ParsedAddress;
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

  // Try structured fields first
  if (prop.streetNumber && prop.street) {
    return prop.streetNumber.toLowerCase().includes(targetNum)
      && prop.street.toLowerCase().includes(targetStreet);
  }

  // Fall back to displayable address
  const display = (prop.displayableAddress || '').toLowerCase();
  return display.includes(targetNum) && display.includes(targetStreet);
}

/**
 * Look up a property listing from a user message containing an address.
 *
 * Flow:
 * 1. Extract address from message via LLM
 * 2. Primary: Domain API search (fast, ~1-2s)
 * 3. Fallback: Apify suburb scrape (slow, only if Domain API unavailable)
 * 4. Enrich with full page detail via Apify detail actor (non-fatal)
 * 5. Return result with status
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

  // Step 2: Try Domain API first (fast path, ~1-2s)
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

          // Enrich with detail actor (non-fatal)
          if (listing.url && listing.description.length <= 200) {
            try {
              listing = await enrichListingDetail(listing);
            } catch (err) {
              console.error('[listing-lookup] Detail enrichment failed (non-fatal):', err instanceof Error ? err.message : err);
            }
          }

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

  // Step 3: Fallback to Apify suburb scrape (slow path, ~30-120s)
  try {
    const { searchListingViaApify } = await import('../intelligence/apify-listing-lookup');
    console.log('[listing-lookup] Falling back to Apify suburb scrape');
    let listing = await searchListingViaApify(address);
    if (listing) {
      const source = listing.source === 'domain' ? 'apify-domain' as const : 'apify-rea' as const;
      console.log(`[listing-lookup] Found listing via ${source}:`, listing.address);

      // Enrich with full page detail (non-fatal)
      if (listing.url && listing.description.length <= 200) {
        try {
          listing = await enrichListingDetail(listing);
        } catch (err) {
          console.error('[listing-lookup] Detail enrichment failed (non-fatal):', err instanceof Error ? err.message : err);
        }
      }

      return { status: 'found', listing, source, addressSearched: addressString, parsedAddress: address };
    }
    console.log('[listing-lookup] No listing found via Apify');
  } catch (err) {
    console.error('[listing-lookup] Apify search failed:', err instanceof Error ? err.message : err);
  }

  // Step 4: Not found
  return { status: 'not-found', listing: null, addressSearched: addressString, parsedAddress: address };
}
