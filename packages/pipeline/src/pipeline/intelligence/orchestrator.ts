import type { SuburbContext, ZoningData, PropertyIntelligence } from '../extractors/listing-types';
import { getAbsDemographics } from './abs-demographics';
import { getZoningData } from './zoning-lookup';

interface EnrichmentInput {
  address?: string;
  suburb: string;
  state: string;
  postcode: string;
}

function emptySuburbContext(suburb: string, state: string, postcode: string): SuburbContext {
  return {
    suburb,
    state,
    postcode,
    medianHouseholdIncome: null,
    populationGrowth5yr: null,
    ownerOccupierPct: null,
    medianAge: null,
    familyHouseholdPct: null,
    medianHousePrice: null,
    medianUnitPrice: null,
    medianWeeklyRent: null,
    grossRentalYield: null,
    vacancyRate: null,
    averageDaysOnMarket: null,
    predominantZoning: null,
    dataAsOf: new Date().toISOString().split('T')[0],
    dataSources: [],
  };
}

/** Optional pre-fetched data (e.g. from HPF) to skip redundant enrichment calls */
interface PrefetchedData {
  suburb?: SuburbContext;
  intelligence?: PropertyIntelligence;
}

export async function enrichPropertyIntelligence(
  input: EnrichmentInput,
  prefetched?: PrefetchedData,
): Promise<PropertyIntelligence> {
  // If HPF already provided full intelligence data, return it directly
  if (prefetched?.intelligence) {
    console.log('[orchestrator] Using prefetched intelligence from HPF');
    return prefetched.intelligence;
  }

  const { address, suburb, state, postcode } = input;
  const errors: string[] = [];

  const [absResult, zoningResult] = await Promise.allSettled([
    getAbsDemographics(suburb, state, postcode),
    address ? getZoningData(address, suburb, state) : Promise.resolve(null),
  ]);

  // Build suburb context from prefetched or fallback to empty
  let suburbContext: SuburbContext;
  if (prefetched?.suburb) {
    suburbContext = prefetched.suburb;
    suburbContext.dataSources.push('hpf');
  } else {
    suburbContext = emptySuburbContext(suburb, state, postcode);
  }

  // Merge ABS demographics into suburb context
  if (absResult.status === 'fulfilled' && absResult.value) {
    const abs = absResult.value;
    if (abs.medianAge && !suburbContext.medianAge) suburbContext.medianAge = abs.medianAge;
    if (abs.population) suburbContext.dataSources.push('abs-census');
  } else if (absResult.status === 'rejected') {
    errors.push(`ABS demographics: ${absResult.reason}`);
  }

  // Extract zoning data
  let zoning: ZoningData | null = null;
  if (zoningResult.status === 'fulfilled') {
    zoning = zoningResult.value;
    if (zoning) suburbContext.predominantZoning = zoning.zoneCode;
  } else {
    errors.push(`Zoning: ${zoningResult.reason}`);
  }

  return {
    listing: null,
    suburb: suburbContext,
    zoning,
    nearbySchools: [],
    sentiment: null,
    crimeRating: null,
    fetchedAt: new Date().toISOString(),
    errors,
  };
}
