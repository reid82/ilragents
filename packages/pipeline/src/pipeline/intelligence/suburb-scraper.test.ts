import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SuburbContext } from '../extractors/listing-types';

const mockRunActor = vi.fn();
const mockCacheGet = vi.fn().mockResolvedValue(null);
const mockCacheSet = vi.fn().mockResolvedValue(undefined);

vi.mock('./apify-client', () => ({
  ApifyClient: vi.fn().mockImplementation(function () {
    return { runActor: mockRunActor };
  }),
}));

vi.mock('./cache', () => ({
  IntelligenceCache: vi.fn().mockImplementation(function () {
    return { get: mockCacheGet, set: mockCacheSet };
  }),
}));

import { getSuburbProfile } from './suburb-scraper';
import { ApifyClient } from './apify-client';
import { IntelligenceCache } from './cache';

describe('getSuburbProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('returns suburb context from Apify scrape', async () => {
    const mockData = [{
      medianSoldPrice: 1200000,
      medianUnitPrice: 650000,
      medianRentPrice: 550,
      avgDaysOnMarket: 35,
      auctionClearanceRate: 72,
      demographics: {
        medianAge: 36,
        medianIncome: 85000,
        ownerOccupied: 58,
        familyHouseholds: 52,
        population: 28000,
        populationGrowth: 3.2,
      },
    }];

    mockRunActor.mockResolvedValue(mockData);

    const result = await getSuburbProfile('Richmond', 'VIC', '3121');
    expect(result).not.toBeNull();
    expect(result!.suburb).toBe('Richmond');
    expect(result!.medianHousePrice).toBe(1200000);
    expect(result!.medianWeeklyRent).toBe(550);
    expect(result!.medianAge).toBe(36);
  });

  it('returns cached data when available', async () => {
    const cached: SuburbContext = {
      suburb: 'Richmond',
      state: 'VIC',
      postcode: '3121',
      medianHouseholdIncome: 85000,
      populationGrowth5yr: 3.2,
      ownerOccupierPct: 58,
      medianAge: 36,
      familyHouseholdPct: 52,
      medianHousePrice: 1200000,
      medianUnitPrice: 650000,
      medianWeeklyRent: 550,
      grossRentalYield: null,
      vacancyRate: null,
      averageDaysOnMarket: 35,
      predominantZoning: null,
      dataAsOf: '2026-02-19',
      dataSources: ['domain-suburb-profile'],
    };

    mockCacheGet.mockResolvedValue(cached);

    const result = await getSuburbProfile('Richmond', 'VIC', '3121');
    expect(result).toEqual(cached);
  });

  it('returns null when Apify returns no data', async () => {
    mockRunActor.mockResolvedValue([]);

    const result = await getSuburbProfile('NowhereVille', 'VIC', '9999');
    expect(result).toBeNull();
  });
});
