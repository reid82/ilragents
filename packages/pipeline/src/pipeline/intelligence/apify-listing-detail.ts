import { ApifyClient } from './apify-client';
import type { ListingData, PropertyHistoryEntry, ComparableProperty } from '../extractors/listing-types';

const DOMAIN_DETAIL_ACTOR = process.env.APIFY_DOMAIN_DETAIL_ACTOR || 'stealth_mode/domain-property-details-scraper';
const REA_DETAIL_ACTOR = process.env.APIFY_REA_DETAIL_ACTOR || 'azzouzana/realestate-com-au-properties-pages-scraper';

/** Standard Apify proxy config for AU residential */
const PROXY_CONFIG = {
  useApifyProxy: true,
  apifyProxyGroups: ['RESIDENTIAL'],
  apifyProxyCountry: 'AU',
};

/** Detail actor timeout - single page should be fast */
const DETAIL_TIMEOUT_MS = 30000;

/**
 * Parse a numeric price from display text like "$750,000"
 */
function parseNumeric(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/[\d,]+/);
  if (!match) return null;
  return parseInt(match[0].replace(/,/g, ''), 10) || null;
}

/**
 * Merge Domain detail actor output into an existing ListingData.
 * Only overwrites fields that are richer than what we already have.
 */
export function mergeDomainDetail(listing: ListingData, raw: Record<string, unknown>): ListingData {
  const inspections = Array.isArray(raw.inspections) ? raw.inspections : [];
  const floorPlans = Array.isArray(raw.floorPlans) ? raw.floorPlans : [];
  const history = Array.isArray(raw.propertyHistory) ? raw.propertyHistory : [];
  const comparables = Array.isArray(raw.nearbyProperties) || Array.isArray(raw.comparables)
    ? (raw.nearbyProperties || raw.comparables) as Record<string, unknown>[]
    : [];
  const featureGroups = (raw.features || raw.propertyFeatures || {}) as Record<string, unknown>;

  // Build categorised features map
  const fullFeatures: Record<string, string[]> = {};
  if (typeof featureGroups === 'object' && !Array.isArray(featureGroups)) {
    for (const [category, items] of Object.entries(featureGroups)) {
      if (Array.isArray(items)) {
        fullFeatures[category] = items.map(String);
      }
    }
  }

  return {
    ...listing,
    // Prefer richer description from detail page
    description: (raw.description as string)?.length > listing.description.length
      ? (raw.description as string)
      : listing.description,
    // Extended fields
    floorPlanUrl: floorPlans[0]?.toString() || (raw.floorPlanUrl as string) || listing.floorPlanUrl,
    inspectionTimes: inspections.map((i: unknown): string => {
      if (typeof i === 'string') return i;
      if (typeof i === 'object' && i !== null) {
        const obj = i as Record<string, unknown>;
        return String(obj.display || obj.time || obj.date || JSON.stringify(obj));
      }
      return String(i);
    }),
    statementOfInformationUrl: (raw.statementOfInformation as string)
      || (raw.soiUrl as string)
      || listing.statementOfInformationUrl,
    propertyHistory: history.map((h: unknown): PropertyHistoryEntry => {
      const entry = h as Record<string, unknown>;
      return {
        date: (entry.date as string) || (entry.soldDate as string) || '',
        event: categoriseHistoryEvent((entry.event as string) || (entry.type as string) || ''),
        price: parseNumeric(entry.price as string),
        source: (entry.source as string) || 'domain',
      };
    }),
    nearbySoldComparables: comparables.slice(0, 10).map((c: Record<string, unknown>): ComparableProperty => ({
      address: (c.address as string) || '',
      soldDate: (c.soldDate as string) || (c.date as string) || null,
      soldPrice: parseNumeric(c.soldPrice as string) || (c.price as number) || null,
      propertyType: (c.propertyType as string) || '',
      bedrooms: (c.bedrooms as number) ?? (c.beds as number) ?? null,
      bathrooms: (c.bathrooms as number) ?? (c.baths as number) ?? null,
      landSize: (c.landSize as number) ?? null,
      distanceKm: (c.distance as number) ?? (c.distanceKm as number) ?? null,
    })),
    energyRating: (raw.energyRating as number) ?? (raw.nathersRating as number) ?? listing.energyRating,
    councilRates: parseNumeric(raw.councilRates as string) ?? listing.councilRates,
    bodyCorpFees: parseNumeric(raw.bodyCorpFees as string)
      ?? parseNumeric(raw.strataFees as string)
      ?? listing.bodyCorpFees,
    virtualTourUrl: (raw.virtualTourUrl as string) || (raw.virtualTour as string) || listing.virtualTourUrl,
    fullFeatures: Object.keys(fullFeatures).length > 0 ? fullFeatures : listing.fullFeatures,
    // Images - prefer detail page's full gallery
    images: Array.isArray(raw.images) && (raw.images as unknown[]).length > listing.images.length
      ? (raw.images as string[])
      : listing.images,
    // Enrichment metadata
    enrichedAt: new Date().toISOString(),
    enrichmentSource: 'apify-detail',
    // Merge raw data
    rawData: { ...listing.rawData, _detail: raw },
  };
}

/**
 * Merge REA detail actor output into an existing ListingData.
 */
export function mergeReaDetail(listing: ListingData, raw: Record<string, unknown>): ListingData {
  const inspections = Array.isArray(raw.inspections) ? raw.inspections : [];
  const history = Array.isArray(raw.propertyHistory) ? raw.propertyHistory : [];
  const photos = Array.isArray(raw.photos) ? raw.photos : (Array.isArray(raw.images) ? raw.images : []);

  return {
    ...listing,
    // Prefer richer description
    description: (raw.description as string)?.length > listing.description.length
      ? (raw.description as string)
      : listing.description,
    // Extended fields
    floorPlanUrl: (raw.floorPlanUrl as string) || (raw.floorPlan as string) || listing.floorPlanUrl,
    inspectionTimes: inspections.map((i: unknown): string => {
      if (typeof i === 'string') return i;
      if (typeof i === 'object' && i !== null) {
        const obj = i as Record<string, unknown>;
        return String(obj.display || obj.time || obj.date || JSON.stringify(obj));
      }
      return String(i);
    }),
    statementOfInformationUrl: (raw.statementOfInformation as string) || listing.statementOfInformationUrl,
    propertyHistory: history.map((h: unknown): PropertyHistoryEntry => {
      const entry = h as Record<string, unknown>;
      return {
        date: (entry.date as string) || '',
        event: categoriseHistoryEvent((entry.event as string) || (entry.type as string) || ''),
        price: parseNumeric(entry.price as string),
        source: (entry.source as string) || 'rea',
      };
    }),
    nearbySoldComparables: listing.nearbySoldComparables, // REA detail actors typically don't provide comparables
    energyRating: (raw.energyRating as number) ?? listing.energyRating,
    councilRates: parseNumeric(raw.councilRates as string) ?? listing.councilRates,
    bodyCorpFees: parseNumeric(raw.bodyCorpFees as string)
      ?? parseNumeric(raw.strataFees as string)
      ?? listing.bodyCorpFees,
    virtualTourUrl: (raw.virtualTourUrl as string) || (raw.virtualTour as string) || listing.virtualTourUrl,
    fullFeatures: listing.fullFeatures, // Preserve existing if REA doesn't provide structured features
    // Images - prefer detail page's full gallery
    images: photos.length > listing.images.length
      ? (photos.map((p: unknown): string => typeof p === 'string' ? p : String((p as Record<string, unknown>)?.url || '')).filter(Boolean))
      : listing.images,
    // Agent details - REA detail actors often provide contact info
    agentName: (raw.agentName as string) || (raw.agent as string) || listing.agentName,
    agencyName: (raw.agencyName as string) || (raw.agency as string) || listing.agencyName,
    // Enrichment metadata
    enrichedAt: new Date().toISOString(),
    enrichmentSource: 'apify-detail',
    // Merge raw data
    rawData: { ...listing.rawData, _detail: raw },
  };
}

/** Categorise a history event string into a standard type */
function categoriseHistoryEvent(event: string): PropertyHistoryEntry['event'] {
  const lower = event.toLowerCase();
  if (lower.includes('sold') || lower.includes('sale')) return 'sold';
  if (lower.includes('list')) return 'listed';
  if (lower.includes('withdraw') || lower.includes('removed')) return 'withdrawn';
  if (lower.includes('rent') || lower.includes('lease')) return 'rental';
  return 'other';
}

/**
 * Enrich a ListingData with full page detail from Apify individual page actors.
 *
 * Takes a listing with a URL (from search phase or Cheerio scrape),
 * runs the appropriate detail actor, and merges the rich data back.
 * Checks cache first; caches results for 1 day.
 * Non-fatal: returns the original listing if enrichment fails.
 */
export async function enrichListingDetail(listing: ListingData): Promise<ListingData> {
  if (!listing.url) {
    console.log('[listing-detail] No URL to enrich');
    return listing;
  }

  // Check cache first
  try {
    const { IntelligenceCache } = await import('./cache');
    const cache = new IntelligenceCache();
    const cached = await cache.getByUrl('listing-detail', listing.url);
    if (cached) {
      console.log('[listing-detail] Cache hit for:', listing.url);
      const raw = cached as Record<string, unknown>;
      return listing.source === 'domain'
        ? mergeDomainDetail(listing, raw)
        : mergeReaDetail(listing, raw);
    }
  } catch {
    // Cache miss or cache unavailable - proceed with actor
  }

  try {
    const apify = new ApifyClient();
    const actor = listing.source === 'domain' ? DOMAIN_DETAIL_ACTOR : REA_DETAIL_ACTOR;

    console.log(`[listing-detail] Enriching via ${actor}: ${listing.url}`);

    // Domain and REA actors use different input field names
    const input = listing.source === 'domain'
      ? { urls: [listing.url], proxy: PROXY_CONFIG }
      : { startUrls: [listing.url], proxyConfiguration: PROXY_CONFIG };

    const results = await apify.runActor(actor, input, { timeoutMs: DETAIL_TIMEOUT_MS });

    if (results.length === 0) {
      console.log('[listing-detail] Actor returned no results');
      return listing;
    }

    const raw = results[0] as Record<string, unknown>;
    console.log('[listing-detail] Merging detail data');

    // Cache the raw result for next time
    try {
      const { IntelligenceCache } = await import('./cache');
      const cache = new IntelligenceCache();
      await cache.setByUrl('listing-detail', listing.url, raw);
    } catch {
      // Cache write failure is non-fatal
    }

    return listing.source === 'domain'
      ? mergeDomainDetail(listing, raw)
      : mergeReaDetail(listing, raw);
  } catch (err) {
    console.error('[listing-detail] Enrichment failed (non-fatal):', err instanceof Error ? err.message : err);
    return listing;
  }
}
