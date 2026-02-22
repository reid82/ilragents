import type { ListingData, ParsedAddress } from './listing-types';
import { formatAddressForSearch } from './listing-types';
import { extractAddressFromMessage } from './address-extractor';
import { searchListingViaApify } from '../intelligence/apify-listing-lookup';
import { enrichListingDetail } from '../intelligence/apify-listing-detail';

export interface LookupResult {
  status: 'found' | 'not-found' | 'no-address';
  listing: ListingData | null;
  source?: 'apify-domain' | 'apify-rea';
  addressSearched?: string;
  parsedAddress?: ParsedAddress;
}

/**
 * Look up a property listing from a user message containing an address.
 *
 * Flow:
 * 1. Extract address from message via LLM
 * 2. Search Domain via Apify actor (falls back to REA)
 * 3. Enrich with full page detail via Apify detail actor (non-fatal)
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

  // Step 2: Search via Apify (Domain then REA fallback)
  try {
    let listing = await searchListingViaApify(address);
    if (listing) {
      const source = listing.source === 'domain' ? 'apify-domain' : 'apify-rea';
      console.log(`[listing-lookup] Found listing via ${source}:`, listing.address);

      // Step 3: Enrich with full page detail (non-fatal)
      // Skip if search already returned rich data (description > 200 chars)
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
