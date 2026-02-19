import type { SuburbContext, ZoningData, NeighbourhoodSentiment, PropertyIntelligence } from '../extractors/listing-types';
import { getSuburbProfile } from './suburb-scraper';
import { getAbsDemographics } from './abs-demographics';
import { getZoningData } from './zoning-lookup';
import { getVacancyRate } from './vacancy-scraper';
import { getNeighbourhoodSentiment } from './sentiment-scraper';

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

export async function enrichPropertyIntelligence(input: EnrichmentInput): Promise<PropertyIntelligence> {
  const { address, suburb, state, postcode } = input;
  const errors: string[] = [];

  const [suburbResult, absResult, zoningResult, vacancyResult, sentimentResult] = await Promise.allSettled([
    getSuburbProfile(suburb, state, postcode),
    getAbsDemographics(suburb, state, postcode),
    address ? getZoningData(address, suburb, state) : Promise.resolve(null),
    getVacancyRate(postcode),
    getNeighbourhoodSentiment(suburb, state),
  ]);

  // Build suburb context from suburb profile or fallback to empty
  let suburbContext: SuburbContext;
  if (suburbResult.status === 'fulfilled' && suburbResult.value) {
    suburbContext = suburbResult.value;
  } else {
    suburbContext = emptySuburbContext(suburb, state, postcode);
    if (suburbResult.status === 'rejected') {
      errors.push(`Suburb profile: ${suburbResult.reason}`);
    }
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

  // Apply vacancy rate to suburb context
  if (vacancyResult.status === 'fulfilled' && vacancyResult.value !== null) {
    suburbContext.vacancyRate = vacancyResult.value;
    suburbContext.dataSources.push('sqm-research');
  } else if (vacancyResult.status === 'rejected') {
    errors.push(`Vacancy: ${vacancyResult.reason}`);
  }

  // Extract sentiment data
  let sentiment: NeighbourhoodSentiment | null = null;
  if (sentimentResult.status === 'fulfilled') {
    sentiment = sentimentResult.value;
  } else {
    errors.push(`Sentiment: ${sentimentResult.reason}`);
  }

  return {
    listing: null,
    suburb: suburbContext,
    zoning,
    nearbySchools: [],
    sentiment,
    crimeRating: null,
    fetchedAt: new Date().toISOString(),
    errors,
  };
}
