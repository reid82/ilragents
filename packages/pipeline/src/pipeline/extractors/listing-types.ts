export interface ListingData {
  source: 'domain' | 'rea' | 'onthehouse';
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
  enrichmentSource: 'apify-detail' | 'cheerio' | 'serp-snippet' | 'bright-data' | null;
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
