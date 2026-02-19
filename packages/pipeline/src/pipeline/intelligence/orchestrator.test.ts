import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./suburb-scraper', () => ({
  getSuburbProfile: vi.fn(),
}));
vi.mock('./abs-demographics', () => ({
  getAbsDemographics: vi.fn(),
}));
vi.mock('./zoning-lookup', () => ({
  getZoningData: vi.fn(),
}));
vi.mock('./vacancy-scraper', () => ({
  getVacancyRate: vi.fn(),
}));
vi.mock('./sentiment-scraper', () => ({
  getNeighbourhoodSentiment: vi.fn(),
}));

import { enrichPropertyIntelligence } from './orchestrator';
import { getSuburbProfile } from './suburb-scraper';
import { getAbsDemographics } from './abs-demographics';
import { getZoningData } from './zoning-lookup';
import { getVacancyRate } from './vacancy-scraper';
import { getNeighbourhoodSentiment } from './sentiment-scraper';

describe('enrichPropertyIntelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines all data sources in parallel', async () => {
    (getSuburbProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      suburb: 'Richmond', state: 'VIC', postcode: '3121',
      medianHousePrice: 1200000, medianWeeklyRent: 550,
      medianHouseholdIncome: null, populationGrowth5yr: null,
      ownerOccupierPct: null, medianAge: null, familyHouseholdPct: null,
      medianUnitPrice: null, grossRentalYield: null, vacancyRate: null,
      averageDaysOnMarket: 35, predominantZoning: null,
      dataAsOf: '2026-02-19', dataSources: ['domain'],
    });
    (getAbsDemographics as ReturnType<typeof vi.fn>).mockResolvedValue({
      seifaAdvantage: 1078, seifaDisadvantage: null,
      medianPersonalIncome: 52000, population: 28000, medianAge: 36,
    });
    (getZoningData as ReturnType<typeof vi.fn>).mockResolvedValue({
      zoneCode: 'GRZ1', zoneDescription: 'General Residential',
      overlays: ['HO123'], overlayDescriptions: ['Heritage'],
      maxBuildingHeight: null, minLotSize: null,
      state: 'VIC', source: 'vicmap', fetchedAt: '2026-02-19',
    });
    (getVacancyRate as ReturnType<typeof vi.fn>).mockResolvedValue(1.8);
    (getNeighbourhoodSentiment as ReturnType<typeof vi.fn>).mockResolvedValue({
      overallRating: 4.2, reviewCount: 128,
      topPositives: ['Great cafes'], topNegatives: ['Traffic'],
      source: 'homely',
    });

    const result = await enrichPropertyIntelligence({
      address: '42 Smith St',
      suburb: 'Richmond',
      state: 'VIC',
      postcode: '3121',
    });

    expect(result.suburb.medianHousePrice).toBe(1200000);
    expect(result.suburb.vacancyRate).toBe(1.8);
    expect(result.zoning?.zoneCode).toBe('GRZ1');
    expect(result.sentiment?.overallRating).toBe(4.2);
    expect(result.errors).toEqual([]);
  });

  it('handles partial failures gracefully', async () => {
    (getSuburbProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      suburb: 'Richmond', state: 'VIC', postcode: '3121',
      medianHousePrice: 1200000, medianWeeklyRent: 550,
      medianHouseholdIncome: null, populationGrowth5yr: null,
      ownerOccupierPct: null, medianAge: null, familyHouseholdPct: null,
      medianUnitPrice: null, grossRentalYield: null, vacancyRate: null,
      averageDaysOnMarket: null, predominantZoning: null,
      dataAsOf: '2026-02-19', dataSources: ['domain'],
    });
    (getAbsDemographics as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API down'));
    (getZoningData as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getVacancyRate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getNeighbourhoodSentiment as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await enrichPropertyIntelligence({
      address: '42 Smith St',
      suburb: 'Richmond',
      state: 'VIC',
      postcode: '3121',
    });

    expect(result.suburb.medianHousePrice).toBe(1200000);
    expect(result.zoning).toBeNull();
    expect(result.sentiment).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns empty suburb context when all sources fail', async () => {
    (getSuburbProfile as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getAbsDemographics as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getZoningData as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getVacancyRate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getNeighbourhoodSentiment as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await enrichPropertyIntelligence({
      suburb: 'Nowhere',
      state: 'VIC',
      postcode: '9999',
    });

    expect(result.suburb.suburb).toBe('Nowhere');
    expect(result.zoning).toBeNull();
  });
});
