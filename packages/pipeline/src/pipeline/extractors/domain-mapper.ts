import type { ListingData } from './listing-types';
import { LISTING_DETAIL_DEFAULTS } from './listing-types';
import type { DomainSearchResult } from './domain-api';

/** Parse a numeric price from display text like "$750,000 - $800,000" */
function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\$[\d,]+/);
  if (!match) return null;
  return parseInt(match[0].replace(/[$,]/g, ''), 10) || null;
}

function mapListingType(type: string): ListingData['listingType'] {
  const lower = type.toLowerCase();
  if (lower === 'auction') return 'auction';
  if (lower === 'sale') return 'sale';
  if (lower.includes('expression')) return 'eoi';
  return 'unknown';
}

/** Map a Domain API search result to our standard ListingData interface */
export function mapDomainSearchResultToListing(result: DomainSearchResult): ListingData {
  const listing = result.listing;
  const prop = listing?.propertyDetails;
  const price = listing?.priceDetails;
  const advertiser = listing?.advertiser;
  const contacts = advertiser?.contacts || [];

  const displayPrice = price?.displayPrice || null;

  return {
    source: 'domain',
    url: listing?.id ? `https://www.domain.com.au/listing/${listing.id}` : '',
    address: prop?.displayableAddress || '',
    suburb: prop?.suburb || '',
    state: prop?.state || '',
    postcode: prop?.postcode || '',
    propertyType: prop?.propertyType || 'unknown',
    bedrooms: prop?.bedrooms ?? null,
    bathrooms: prop?.bathrooms ?? null,
    parking: prop?.carspaces ?? null,
    landSize: prop?.landArea ?? null,
    buildingSize: prop?.buildingArea ?? null,
    price: displayPrice,
    priceGuide: price?.price ?? parsePrice(displayPrice),
    listingType: mapListingType(listing?.listingType || ''),
    auctionDate: listing?.auctionSchedule?.time || null,
    daysOnMarket: null,
    description: listing?.summaryDescription || listing?.headline || '',
    features: prop?.features || [],
    images: (listing?.media || []).map(m => m.url).filter(Boolean) as string[],
    agentName: contacts[0]?.name || null,
    agencyName: advertiser?.name || null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    ...LISTING_DETAIL_DEFAULTS,
    rawData: result as unknown as Record<string, unknown>,
  };
}
