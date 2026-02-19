import type { SuburbContext } from '../extractors/listing-types';
import { ApifyClient } from './apify-client';
import { IntelligenceCache } from './cache';

const SUBURB_PROFILE_ACTOR = process.env.APIFY_SUBURB_ACTOR || 'fatihtahta/domain-com-au-scraper';

export async function getSuburbProfile(
  suburb: string,
  state: string,
  postcode: string,
): Promise<SuburbContext | null> {
  const cache = new IntelligenceCache();

  const cached = await cache.get('suburb-profile', suburb, state);
  if (cached) return cached as SuburbContext;

  try {
    const apify = new ApifyClient();
    const slug = `${suburb.toLowerCase().replace(/\s+/g, '-')}-${state.toLowerCase()}-${postcode}`;
    const url = `https://www.domain.com.au/suburb-profile/${slug}`;

    const items = await apify.runActor(SUBURB_PROFILE_ACTOR, {
      startUrls: [{ url }],
      maxItems: 1,
    });

    if (!items.length) return null;

    const raw = items[0] as Record<string, unknown>;
    const demographics = (raw.demographics || {}) as Record<string, number>;

    const result: SuburbContext = {
      suburb,
      state: state.toUpperCase(),
      postcode,
      medianHouseholdIncome: demographics.medianIncome ?? null,
      populationGrowth5yr: demographics.populationGrowth ?? null,
      ownerOccupierPct: demographics.ownerOccupied ?? null,
      medianAge: demographics.medianAge ?? null,
      familyHouseholdPct: demographics.familyHouseholds ?? null,
      medianHousePrice: (raw.medianSoldPrice as number) ?? null,
      medianUnitPrice: (raw.medianUnitPrice as number) ?? null,
      medianWeeklyRent: (raw.medianRentPrice as number) ?? null,
      grossRentalYield: null,
      vacancyRate: null,
      averageDaysOnMarket: (raw.avgDaysOnMarket as number) ?? null,
      predominantZoning: null,
      dataAsOf: new Date().toISOString().split('T')[0],
      dataSources: ['domain-suburb-profile'],
    };

    await cache.set('suburb-profile', suburb, state, result);
    return result;
  } catch (err) {
    console.error(`[suburb-scraper] Failed for ${suburb} ${state}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
