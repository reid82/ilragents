/**
 * Maps HPF extracted data to the pipeline's ListingData type.
 *
 * HPF property detail response fields (from discovery):
 *   id, rpd, govId, locality, buildingArea, localityPid, lotCount,
 *   images[], postcode, state, address, zone[], landArea, frontage,
 *   lga, status, type, attributes{bedrooms, bathrooms, parkingSpaces},
 *   lastSale{date}, sales[], rentals[], valuations[], listings[],
 *   nearbyDetails{education, shopping, train, bus, school, ...},
 *   location{coordinates}
 */

import type { ExtractionResult, HpfPropertyDetail, HpfNeighbour, HpfExternalLink } from '../extraction/router';

// Mirror the pipeline's ListingData shape.
// Re-defined here to avoid cross-package dependency at runtime.
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
  propertyHistory: PropertyHistoryEntry[];
  nearbySoldComparables: ComparableProperty[];
  energyRating: number | null;
  councilRates: number | null;
  bodyCorpFees: number | null;
  virtualTourUrl: string | null;
  fullFeatures: Record<string, string[]>;
  enrichedAt: string | null;
  enrichmentSource: 'hpf';
  rawData: Record<string, unknown>;
}

interface PropertyHistoryEntry {
  date: string;
  event: 'sold' | 'listed' | 'withdrawn' | 'rental' | 'other';
  price: number | null;
  source: string;
}

interface ComparableProperty {
  address: string;
  soldDate: string | null;
  soldPrice: number | null;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  landSize: number | null;
  distanceKm: number | null;
}

/**
 * Map HPF extraction result to ListingData.
 */
export function mapToListingData(result: ExtractionResult): ListingData {
  const p = result.property;
  const avm = result.avm;
  const neighbours = result.neighbours;
  const links = result.externalLinks;

  // Build full address string
  const fullAddress = [p.address, p.locality, p.state, p.postcode].filter(Boolean).join(', ');

  // Find the URL to use (prefer Domain or REA listing page)
  const url = pickBestUrl(links, p);

  // Extract price from latest listing or latest sale
  const latestListing = p.listings?.[0];
  const latestSale = p.sales?.[0];
  const priceDisplay = latestListing?.price?.display || latestSale?.price?.display || null;
  const priceGuide = avm?.value ?? latestListing?.price?.value ?? null;

  // Determine listing type
  let listingType: 'sale' | 'auction' | 'eoi' | 'unknown' = 'unknown';
  if (latestListing) {
    if (latestListing.type === 'auction' || priceDisplay?.toLowerCase().includes('auction')) {
      listingType = 'auction';
    } else if (latestListing.type === 'sale' || latestListing.status === 'sold') {
      listingType = 'sale';
    }
  }

  // Extract agency info from latest sale or listing
  const agencyInfo = latestListing?.agencies?.[0] || latestSale?.agencies?.[0];

  // Build property history from sales and listings
  const propertyHistory = buildPropertyHistory(p);

  // Build comparable sales from neighbours
  const comparables = buildComparables(neighbours);

  // Extract images (sorted by priority)
  const images = (p.images || [])
    .sort((a, b) => (a.priority || 0) - (b.priority || 0))
    .map(img => img.url);

  // Build features list from zone, nearby details, etc.
  const features: string[] = [];
  if (p.zone?.length) features.push(`Zoning: ${p.zone[0]}`);
  if (p.lga) features.push(`LGA: ${p.lga}`);
  if (p.frontage) features.push(`Frontage: ${p.frontage}m`);
  if (p.lotCount && p.lotCount > 1) features.push(`Lot count: ${p.lotCount}`);

  // Build fullFeatures from nearby details
  const fullFeatures: Record<string, string[]> = {};
  if (p.nearbyDetails) {
    const nearby: string[] = [];
    for (const [key, detail] of Object.entries(p.nearbyDetails)) {
      if (detail?.display) {
        const name = detail.name ? ` (${detail.name})` : '';
        nearby.push(`${formatKey(key)}: ${detail.display}${name}`);
      }
    }
    if (nearby.length) fullFeatures['Nearby'] = nearby;
  }
  if (p.zone?.length) fullFeatures['Zoning'] = p.zone;

  return {
    source: 'hpf',
    url,
    address: fullAddress,
    suburb: p.locality || '',
    state: p.state || '',
    postcode: p.postcode || '',
    propertyType: p.type || 'unknown',
    bedrooms: p.attributes?.bedrooms ?? null,
    bathrooms: p.attributes?.bathrooms ?? null,
    parking: p.attributes?.parkingSpaces ?? null,
    landSize: p.landArea ?? null,
    buildingSize: p.buildingArea ?? null,
    price: priceDisplay,
    priceGuide,
    listingType,
    auctionDate: null,
    daysOnMarket: latestListing?.daysOnTheMarket ?? latestSale?.daysOnTheMarket ?? null,
    description: '', // HPF doesn't provide listing descriptions
    features,
    images,
    agentName: null,
    agencyName: agencyInfo?.name ?? null,
    suburbMedianPrice: null, // Populated separately from suburb profile
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    floorPlanUrl: null,
    inspectionTimes: [],
    statementOfInformationUrl: null,
    propertyHistory,
    nearbySoldComparables: comparables,
    energyRating: null,
    councilRates: null,
    bodyCorpFees: null,
    virtualTourUrl: null,
    fullFeatures,
    enrichedAt: new Date().toISOString(),
    enrichmentSource: 'hpf',
    rawData: {
      hpfPropertyId: p.id,
      hpfRpd: p.rpd,
      hpfGovId: p.govId,
      hpfLocalityPid: p.localityPid,
      avm: avm ? {
        value: avm.value,
        rangeLow: avm.range?.lower,
        rangeHigh: avm.range?.upper,
        confidence: avm.confidence,
        date: avm.date,
        provider: avm.provider,
      } : null,
      externalLinks: result.externalLinks,
      planning: result.planning ? {
        zone: result.planning.zone,
        zoneDesc: result.planning.zoneDesc,
        lga: result.planning.lga,
        heritage: result.planning.heritage?.heritage,
        biodiversity: result.planning.biodiversity?.Biodiversity,
      } : null,
    },
  };
}

function pickBestUrl(links: HpfExternalLink[], property: HpfPropertyDetail): string {
  // Prefer Domain > REA > AllHomes > View > OnTheHouse
  const order = ['DOM', 'REA', 'AH', 'VIEW', 'OTH'];
  for (const portal of order) {
    const link = links.find(l => l.portal === portal);
    if (link?.profileUrl) return link.profileUrl;
  }
  // Fallback to HPF URL
  return `https://app.hotpropertyfinder.ai/app/properties/${property.id}`;
}

function buildPropertyHistory(p: HpfPropertyDetail): PropertyHistoryEntry[] {
  const history: PropertyHistoryEntry[] = [];

  // Add sales
  for (const sale of p.sales || []) {
    history.push({
      date: sale.date,
      event: 'sold',
      price: sale.price?.value ?? null,
      source: 'hpf',
    });

    // Add the original listing (firstSeen) if available
    if (sale.firstSeen?.date) {
      history.push({
        date: sale.firstSeen.date,
        event: 'listed',
        price: sale.firstSeen.price?.value ?? null,
        source: 'hpf',
      });
    }
  }

  // Add current listings
  for (const listing of p.listings || []) {
    if (listing.status === 'sold') continue; // Already captured in sales
    history.push({
      date: listing.date,
      event: listing.status === 'withdrawn' ? 'withdrawn' : 'listed',
      price: listing.price?.value ?? null,
      source: 'hpf',
    });
  }

  // Add rentals
  for (const rental of p.rentals || []) {
    history.push({
      date: rental.date,
      event: 'rental',
      price: rental.price?.value ?? null,
      source: 'hpf',
    });
  }

  // Sort by date descending
  history.sort((a, b) => b.date.localeCompare(a.date));

  return history;
}

function buildComparables(neighbours: HpfNeighbour[]): ComparableProperty[] {
  return neighbours
    .filter(n => n.lastSaleDate && n.lastSalePrice)
    .map(n => ({
      address: [n.address?.streetAddress, n.address?.locality, n.address?.state, n.address?.postcode]
        .filter(Boolean)
        .join(', '),
      soldDate: n.lastSaleDate,
      soldPrice: n.lastSalePrice,
      propertyType: 'unknown',
      bedrooms: null,
      bathrooms: null,
      landSize: null,
      distanceKm: null,
    }));
}

function formatKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
}
