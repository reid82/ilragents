/**
 * Maps HPF raw data to the pipeline's ListingData type.
 *
 * This mapper will be fully implemented after the discovery phase
 * reveals HPF's actual data structure. The field mapping below
 * is a placeholder showing the target structure.
 */

import type { HpfRawData } from '../extraction/router';

// Re-define the target interface here to avoid cross-package dependency at runtime.
// The HPF service returns this shape; the pipeline client consumes it.
export interface ListingData {
  source: 'hpf';
  url: string;
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
  price: string | null;
  priceGuide: number | null;
  listingType: 'sale' | 'auction' | 'eoi' | 'unknown';
  auctionDate: string | null;
  daysOnMarket: number | null;
  description: string;
  features: string[];
  images: string[];
  agentName: string | null;
  agencyName: string | null;
  suburbMedianPrice: number | null;
  suburbMedianRent: number | null;
  suburbDaysOnMarket: number | null;
  suburbAuctionClearance: number | null;
  floorPlanUrl: string | null;
  inspectionTimes: string[];
  statementOfInformationUrl: string | null;
  propertyHistory: Array<{ date: string; event: string; price: number | null; source: string }>;
  nearbySoldComparables: Array<{
    address: string; soldDate: string | null; soldPrice: number | null;
    propertyType: string; bedrooms: number | null; bathrooms: number | null;
    landSize: number | null; distanceKm: number | null;
  }>;
  energyRating: number | null;
  councilRates: number | null;
  bodyCorpFees: number | null;
  virtualTourUrl: string | null;
  fullFeatures: Record<string, string[]>;
  enrichedAt: string | null;
  enrichmentSource: 'hpf';
  rawData: Record<string, unknown>;
}

/**
 * Map HPF raw data to ListingData.
 * TODO: Implement field mapping after discovery phase.
 */
export function mapToListingData(raw: HpfRawData): ListingData {
  // This will be populated after discovery reveals HPF's data structure.
  // For now, return a skeleton with whatever fields we can extract.
  return {
    source: 'hpf',
    url: String(raw.url || raw.listingUrl || ''),
    address: String(raw.address || raw.fullAddress || ''),
    suburb: String(raw.suburb || ''),
    state: String(raw.state || ''),
    postcode: String(raw.postcode || ''),
    propertyType: String(raw.propertyType || 'unknown'),
    bedrooms: typeof raw.bedrooms === 'number' ? raw.bedrooms : null,
    bathrooms: typeof raw.bathrooms === 'number' ? raw.bathrooms : null,
    parking: typeof raw.parking === 'number' ? raw.parking : null,
    landSize: typeof raw.landSize === 'number' ? raw.landSize : null,
    buildingSize: typeof raw.buildingSize === 'number' ? raw.buildingSize : null,
    price: raw.price ? String(raw.price) : null,
    priceGuide: typeof raw.priceGuide === 'number' ? raw.priceGuide : null,
    listingType: 'unknown',
    auctionDate: null,
    daysOnMarket: typeof raw.daysOnMarket === 'number' ? raw.daysOnMarket : null,
    description: String(raw.description || ''),
    features: Array.isArray(raw.features) ? raw.features.map(String) : [],
    images: Array.isArray(raw.images) ? raw.images.map(String) : [],
    agentName: raw.agentName ? String(raw.agentName) : null,
    agencyName: raw.agencyName ? String(raw.agencyName) : null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
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
    enrichedAt: new Date().toISOString(),
    enrichmentSource: 'hpf',
    rawData: { _hpf: raw },
  };
}
