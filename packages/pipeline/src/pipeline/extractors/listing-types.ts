export interface ListingData {
  source: 'domain' | 'rea' | 'onthehouse' | 'hpf';
  url: string;
  // Property
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  landSize: number | null;
  buildingSize: number | null;
  // Listing
  price: string | null;
  priceGuide: number | null;
  listingType: 'sale' | 'auction' | 'eoi' | 'unknown';
  auctionDate: string | null;
  daysOnMarket: number | null;
  // Content
  description: string;
  features: string[];
  images: string[];
  // Agent
  agentName: string | null;
  agencyName: string | null;
  // Embedded suburb data (domain provides some of this)
  suburbMedianPrice: number | null;
  suburbMedianRent: number | null;
  suburbDaysOnMarket: number | null;
  suburbAuctionClearance: number | null;
  // Extended detail fields (populated by individual page scraping)
  floorPlanUrl: string | null;
  inspectionTimes: string[];
  statementOfInformationUrl: string | null;
  propertyHistory: PropertyHistoryEntry[];
  nearbySoldComparables: ComparableProperty[];
  energyRating: number | null;
  councilRates: number | null;
  bodyCorpFees: number | null;
  virtualTourUrl: string | null;
  fullFeatures: Record<string, string[]>;
  // Enrichment metadata
  enrichedAt: string | null;
  enrichmentSource: 'apify-detail' | 'cheerio' | 'serp-snippet' | 'bright-data' | 'hpf' | null;
  // Raw
  rawData: Record<string, unknown>;
}

/** A historical sale/listing event for a property */
export interface PropertyHistoryEntry {
  date: string;
  event: 'sold' | 'listed' | 'withdrawn' | 'rental' | 'other';
  price: number | null;
  source: string;
}

/** A recently sold comparable property nearby */
export interface ComparableProperty {
  address: string;
  soldDate: string | null;
  soldPrice: number | null;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  landSize: number | null;
  distanceKm: number | null;
}

export interface SuburbContext {
  suburb: string;
  state: string;
  postcode: string;
  medianHouseholdIncome: number | null;
  populationGrowth5yr: number | null;
  ownerOccupierPct: number | null;
  medianAge: number | null;
  familyHouseholdPct: number | null;
  medianHousePrice: number | null;
  medianUnitPrice: number | null;
  medianWeeklyRent: number | null;
  grossRentalYield: number | null;
  vacancyRate: number | null;
  averageDaysOnMarket: number | null;
  predominantZoning: string | null;
  dataAsOf: string;
  dataSources: string[];
}

export interface ScrapeResult {
  listing: ListingData;
  suburb: SuburbContext | null;
  scrapedAt: string;
  errors: string[];
}

/** Structured Australian address extracted from user message */
export interface ParsedAddress {
  streetNumber: string;
  streetName: string;
  streetType?: string;
  unitNumber?: string;
  suburb: string;
  state?: string;
  postcode?: string;
}

/** Format a parsed address into a single-line search string */
export function formatAddressForSearch(addr: ParsedAddress): string {
  const parts: string[] = [];
  if (addr.unitNumber) parts.push(`${addr.unitNumber}/`);
  parts.push(addr.streetNumber);
  parts.push(addr.streetName);
  if (addr.streetType) parts.push(addr.streetType);
  parts.push(addr.suburb);
  if (addr.state) parts.push(addr.state);
  if (addr.postcode) parts.push(addr.postcode);
  return parts.join(' ').replace('/ ', '/');
}

/** Default values for extended listing detail fields */
export const LISTING_DETAIL_DEFAULTS: Pick<ListingData,
  'floorPlanUrl' | 'inspectionTimes' | 'statementOfInformationUrl' |
  'propertyHistory' | 'nearbySoldComparables' | 'energyRating' |
  'councilRates' | 'bodyCorpFees' | 'virtualTourUrl' | 'fullFeatures' |
  'enrichedAt' | 'enrichmentSource'
> = {
  floorPlanUrl: null,
  inspectionTimes: [],
  statementOfInformationUrl: null,
  propertyHistory: [],
  nearbySoldComparables: [],
  energyRating: null,
  councilRates: null,
  bodyCorpFees: null,
  virtualTourUrl: null,
  fullFeatures: {},
  enrichedAt: null,
  enrichmentSource: null,
};

/** Detect whether a string is a supported listing URL */
export function detectListingUrl(text: string): { url: string; source: 'domain' | 'rea' | 'onthehouse' } | null {
  const domainMatch = text.match(/(https?:\/\/(?:www\.)?domain\.com\.au\/[^\s]+)/i);
  if (domainMatch) return { url: domainMatch[1], source: 'domain' };

  const reaMatch = text.match(/(https?:\/\/(?:www\.)?realestate\.com\.au\/[^\s]+)/i);
  if (reaMatch) return { url: reaMatch[1], source: 'rea' };

  const othMatch = text.match(/(https?:\/\/(?:www\.)?onthehouse\.com\.au\/[^\s]+)/i);
  if (othMatch) return { url: othMatch[1], source: 'onthehouse' };

  return null;
}

/** Australian state abbreviations for URL parsing */
const AU_STATES = ['nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'nt', 'act'];

/** Common street type abbreviations and their full forms */
const STREET_TYPES = [
  'street', 'st', 'road', 'rd', 'avenue', 'ave', 'drive', 'dr', 'crescent', 'cres', 'cr',
  'court', 'ct', 'place', 'pl', 'lane', 'ln', 'way', 'circuit', 'cct', 'boulevard', 'blvd',
  'parade', 'pde', 'terrace', 'tce', 'close', 'cl', 'grove', 'gr', 'highway', 'hwy',
  'rise', 'track', 'trail', 'mews', 'walk', 'promenade', 'esplanade', 'esp',
];

/**
 * Extract a ParsedAddress from a Domain or REA listing URL slug.
 *
 * Domain URLs encode the full address: domain.com.au/123-smith-street-richmond-vic-3121-abc123
 * REA URLs only have suburb+state: realestate.com.au/property-house-vic-richmond-123456
 *
 * Returns a full ParsedAddress for Domain, partial (suburb+state only) for REA, or null on failure.
 */
export function extractAddressFromUrl(
  url: string,
  source: 'domain' | 'rea' | 'onthehouse',
): ParsedAddress | null {
  try {
    if (source === 'domain') {
      return extractAddressFromDomainUrl(url);
    }
    if (source === 'rea') {
      return extractAddressFromReaUrl(url);
    }
    // OnTheHouse URLs: /property/{state}/{suburb}-{postcode}/{slug}
    // Complex slug structure - not reliable enough to parse
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse a Domain.com.au URL slug into a full address.
 * Domain slugs follow: {street-number}-{street-name}-{street-type}-{suburb}-{state}-{postcode}-{id}
 * Also handles unit format: {unit}-{street-number}-{street-name}-...
 */
function extractAddressFromDomainUrl(url: string): ParsedAddress | null {
  // Extract the path slug: everything after domain.com.au/ and before query params
  const pathMatch = url.match(/domain\.com\.au\/([^?#]+)/i);
  if (!pathMatch) return null;

  // Skip non-listing paths
  const slug = pathMatch[1];
  if (/^(sale|rent|suburb-profile|news|advice|auction-results|street-profile|property-profile)\//i.test(slug)) {
    return null;
  }

  const parts = slug.split('-');
  if (parts.length < 5) return null;

  // Find the state abbreviation - it anchors our parsing
  let stateIndex = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (AU_STATES.includes(parts[i].toLowerCase())) {
      stateIndex = i;
      break;
    }
  }
  if (stateIndex < 0) return null;

  const state = parts[stateIndex].toUpperCase();

  // Postcode is immediately after state (4 digits)
  let postcode: string | undefined;
  if (stateIndex + 1 < parts.length && /^\d{4}$/.test(parts[stateIndex + 1])) {
    postcode = parts[stateIndex + 1];
  }

  // Work backwards from state to find suburb vs street parts.
  // Find the street type to separate street name from suburb.
  let streetTypeIndex = -1;
  for (let i = stateIndex - 1; i >= 0; i--) {
    if (STREET_TYPES.includes(parts[i].toLowerCase())) {
      streetTypeIndex = i;
      break;
    }
  }

  if (streetTypeIndex < 0) return null; // Can't distinguish street from suburb without street type

  // Suburb is everything between street type and state
  const suburbParts = parts.slice(streetTypeIndex + 1, stateIndex);
  if (suburbParts.length === 0) return null;
  const suburb = suburbParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');

  const streetType = parts[streetTypeIndex].charAt(0).toUpperCase() + parts[streetTypeIndex].slice(1).toLowerCase();

  // Everything before the street type: first part(s) = street number (possibly unit), rest = street name
  const beforeStreetType = parts.slice(0, streetTypeIndex);
  if (beforeStreetType.length < 2) return null; // Need at least number + street name

  // Check for unit number: first part is a number, second part is also a number
  let unitNumber: string | undefined;
  let streetNumberStart = 0;

  // Detect unit patterns: "unit-3-15-..." or "3-15-..." where both are numeric
  if (beforeStreetType.length >= 3 && beforeStreetType[0].toLowerCase() === 'unit') {
    unitNumber = beforeStreetType[1];
    streetNumberStart = 2;
  } else if (
    beforeStreetType.length >= 3 &&
    /^\d+[a-z]?$/i.test(beforeStreetType[0]) &&
    /^\d+[a-z]?$/i.test(beforeStreetType[1]) &&
    !/^\d+[a-z]?$/i.test(beforeStreetType[2])
  ) {
    // Pattern like "3-15-smith" = unit 3, number 15
    unitNumber = beforeStreetType[0];
    streetNumberStart = 1;
  }

  const streetNumber = beforeStreetType[streetNumberStart];
  if (!streetNumber || !/^\d+[a-z]?$/i.test(streetNumber)) return null;

  const streetNameParts = beforeStreetType.slice(streetNumberStart + 1);
  if (streetNameParts.length === 0) return null;
  const streetName = streetNameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');

  return {
    streetNumber,
    streetName,
    streetType,
    unitNumber,
    suburb,
    state,
    postcode,
  };
}

/**
 * Parse an REA URL - can only extract suburb + state (no street address in slug).
 * REA format: realestate.com.au/property-{type}-{state}-{suburb}-{id}
 * Also: realestate.com.au/sold/property-{type}-{state}-{suburb}-{id}
 */
function extractAddressFromReaUrl(url: string): ParsedAddress | null {
  // Match the property slug pattern
  const match = url.match(/realestate\.com\.au\/(?:sold\/)?property-[a-z]+-([a-z]+)-([a-z][a-z0-9+]+)-\d+/i);
  if (!match) return null;

  const stateRaw = match[1].toLowerCase();
  if (!AU_STATES.includes(stateRaw)) return null;

  const suburbRaw = match[2].replace(/\+/g, ' ');
  const suburb = suburbRaw
    .split(/[\s-]+/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');

  // REA URLs don't contain street address - return partial result
  // with empty streetNumber/streetName to indicate this is suburb-only
  return {
    streetNumber: '',
    streetName: '',
    suburb,
    state: stateRaw.toUpperCase(),
  };
}

/**
 * Extract a ParsedAddress from a scraped ListingData object.
 * Useful for bridging URL scrapes to HPF lookups.
 */
export function extractAddressFromListing(listing: ListingData): ParsedAddress | null {
  if (!listing.address || !listing.suburb) return null;

  // Try to parse the address string into structured parts
  // Typical format: "3/15 Smith St Richmond" or "15 Smith Street Richmond VIC 3121"
  const addr = listing.address.trim();

  let unitNumber: string | undefined;
  let rest = addr;

  // Check for unit format: "3/15 ..." or "Unit 3, 15 ..."
  const unitSlashMatch = rest.match(/^(\d+[a-z]?)\/(.+)/i);
  const unitPrefixMatch = rest.match(/^(?:unit|apt|flat)\s+(\d+[a-z]?)\s*[,/]\s*(.+)/i);

  if (unitSlashMatch) {
    unitNumber = unitSlashMatch[1];
    rest = unitSlashMatch[2];
  } else if (unitPrefixMatch) {
    unitNumber = unitPrefixMatch[1];
    rest = unitPrefixMatch[2];
  }

  // Extract street number from the start
  const numMatch = rest.match(/^(\d+[a-z]?)\s+(.+)/i);
  if (!numMatch) return null;

  const streetNumber = numMatch[1];
  const streetRest = numMatch[2];

  // Remove suburb/state/postcode from the end (they come from listing fields)
  // Just take the street part - everything before the suburb name
  const suburbLower = listing.suburb.toLowerCase();
  const streetRestLower = streetRest.toLowerCase();
  const suburbPos = streetRestLower.lastIndexOf(suburbLower);

  let streetPart = suburbPos > 0 ? streetRest.slice(0, suburbPos).trim() : streetRest;

  // Remove trailing comma if present
  streetPart = streetPart.replace(/,\s*$/, '').trim();

  // Split into name + type
  const streetWords = streetPart.split(/\s+/);
  let streetType: string | undefined;
  let streetName: string;

  if (streetWords.length >= 2) {
    const lastWord = streetWords[streetWords.length - 1].toLowerCase();
    if (STREET_TYPES.includes(lastWord)) {
      streetType = streetWords[streetWords.length - 1];
      streetName = streetWords.slice(0, -1).join(' ');
    } else {
      streetName = streetWords.join(' ');
    }
  } else {
    streetName = streetPart;
  }

  if (!streetName) return null;

  return {
    streetNumber,
    streetName,
    streetType,
    unitNumber,
    suburb: listing.suburb,
    state: listing.state || undefined,
    postcode: listing.postcode || undefined,
  };
}

/** Property zoning data from state planning APIs */
export interface ZoningData {
  zoneCode: string;
  zoneDescription: string;
  overlays: string[];
  overlayDescriptions: string[];
  maxBuildingHeight: string | null;
  minLotSize: string | null;
  state: string;
  source: string;
  fetchedAt: string;
}

/** School data from myschool.edu.au */
export interface SchoolData {
  name: string;
  type: 'primary' | 'secondary' | 'combined';
  sector: 'government' | 'catholic' | 'independent';
  icsea: number | null;
  enrolments: number | null;
  distanceKm: number | null;
}

/** Neighbourhood sentiment from Homely */
export interface NeighbourhoodSentiment {
  overallRating: number | null;
  reviewCount: number;
  topPositives: string[];
  topNegatives: string[];
  source: 'homely';
}

/** Full enriched property intelligence result */
export interface PropertyIntelligence {
  listing: ListingData | null;
  suburb: SuburbContext;
  zoning: ZoningData | null;
  nearbySchools: SchoolData[];
  sentiment: NeighbourhoodSentiment | null;
  crimeRating: 'low' | 'medium' | 'high' | null;
  fetchedAt: string;
  errors: string[];
}
