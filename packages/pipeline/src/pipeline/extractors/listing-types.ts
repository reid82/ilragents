export interface ListingData {
  source: 'domain' | 'rea';
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
  // Raw
  rawData: Record<string, unknown>;
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

/** Detect whether a string is a supported listing URL */
export function detectListingUrl(text: string): { url: string; source: 'domain' | 'rea' } | null {
  const domainMatch = text.match(/(https?:\/\/(?:www\.)?domain\.com\.au\/[^\s]+)/i);
  if (domainMatch) return { url: domainMatch[1], source: 'domain' };

  const reaMatch = text.match(/(https?:\/\/(?:www\.)?realestate\.com\.au\/[^\s]+)/i);
  if (reaMatch) return { url: reaMatch[1], source: 'rea' };

  return null;
}
