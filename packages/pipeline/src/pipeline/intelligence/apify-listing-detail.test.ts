import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ListingData } from '../extractors/listing-types';
import { LISTING_DETAIL_DEFAULTS } from '../extractors/listing-types';

const mockRunActor = vi.fn();
const mockGetByUrl = vi.fn();
const mockSetByUrl = vi.fn();

vi.mock('./apify-client', () => ({
  ApifyClient: class {
    runActor = mockRunActor;
  },
}));

vi.mock('./cache', () => ({
  IntelligenceCache: class {
    getByUrl = mockGetByUrl;
    setByUrl = mockSetByUrl;
  },
}));

import { mergeDomainDetail, mergeReaDetail, enrichListingDetail } from './apify-listing-detail';

/** Minimal valid ListingData for testing */
function baseListing(overrides: Partial<ListingData> = {}): ListingData {
  return {
    source: 'domain',
    url: 'https://www.domain.com.au/71-bridge-st-eltham-vic-3095-abc123',
    address: '71 Bridge St, Eltham VIC 3095',
    suburb: 'Eltham',
    state: 'VIC',
    postcode: '3095',
    propertyType: 'house',
    bedrooms: 3,
    bathrooms: 2,
    parking: 2,
    landSize: 650,
    buildingSize: null,
    price: '$850,000 - $935,000',
    priceGuide: 850000,
    listingType: 'sale',
    auctionDate: null,
    daysOnMarket: 14,
    description: 'A lovely house.',
    features: ['Gas heating', 'Garage'],
    images: ['https://img1.jpg'],
    agentName: 'John Smith',
    agencyName: 'Barry Plant',
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    ...LISTING_DETAIL_DEFAULTS,
    rawData: {},
    ...overrides,
  };
}

describe('mergeDomainDetail', () => {
  it('merges description when detail is longer', () => {
    const listing = baseListing({ description: 'Short' });
    const raw = { description: 'A much longer and more detailed description of the property' };
    const result = mergeDomainDetail(listing, raw);
    expect(result.description).toBe(raw.description);
  });

  it('keeps existing description when detail is shorter', () => {
    const listing = baseListing({ description: 'This is already a very detailed description of the property' });
    const raw = { description: 'Short' };
    const result = mergeDomainDetail(listing, raw);
    expect(result.description).toBe(listing.description);
  });

  it('merges floor plan URL', () => {
    const listing = baseListing();
    const raw = { floorPlans: ['https://example.com/floorplan.pdf'] };
    const result = mergeDomainDetail(listing, raw);
    expect(result.floorPlanUrl).toBe('https://example.com/floorplan.pdf');
  });

  it('merges inspection times as strings', () => {
    const listing = baseListing();
    const raw = { inspections: ['Sat 22 Feb 11:00am - 11:30am'] };
    const result = mergeDomainDetail(listing, raw);
    expect(result.inspectionTimes).toEqual(['Sat 22 Feb 11:00am - 11:30am']);
  });

  it('handles inspection times as objects', () => {
    const listing = baseListing();
    const raw = { inspections: [{ display: 'Sat 22 Feb 11am' }] };
    const result = mergeDomainDetail(listing, raw);
    expect(result.inspectionTimes).toEqual(['Sat 22 Feb 11am']);
  });

  it('merges property history', () => {
    const listing = baseListing();
    const raw = {
      propertyHistory: [
        { date: '2019-03-15', event: 'Sold', price: '$750,000' },
        { date: '2023-07-10', event: 'Listed', price: '$820,000' },
      ],
    };
    const result = mergeDomainDetail(listing, raw);
    expect(result.propertyHistory).toHaveLength(2);
    expect(result.propertyHistory[0]).toEqual({
      date: '2019-03-15',
      event: 'sold',
      price: 750000,
      source: 'domain',
    });
    expect(result.propertyHistory[1].event).toBe('listed');
  });

  it('merges nearby comparables', () => {
    const listing = baseListing();
    const raw = {
      nearbyProperties: [
        {
          address: '38 Smith St, Eltham VIC 3095',
          soldDate: '2025-11-01',
          soldPrice: '$810,000',
          bedrooms: 3,
          bathrooms: 1,
          landSize: 450,
        },
      ],
    };
    const result = mergeDomainDetail(listing, raw);
    expect(result.nearbySoldComparables).toHaveLength(1);
    expect(result.nearbySoldComparables[0].address).toBe('38 Smith St, Eltham VIC 3095');
    expect(result.nearbySoldComparables[0].soldPrice).toBe(810000);
  });

  it('limits comparables to 10', () => {
    const listing = baseListing();
    const comparables = Array.from({ length: 15 }, (_, i) => ({
      address: `${i} Test St`,
      soldPrice: `$${500000 + i * 10000}`,
    }));
    const raw = { nearbyProperties: comparables };
    const result = mergeDomainDetail(listing, raw);
    expect(result.nearbySoldComparables).toHaveLength(10);
  });

  it('merges energy rating, council rates, body corp', () => {
    const listing = baseListing();
    const raw = {
      energyRating: 5.5,
      councilRates: '$2,400',
      bodyCorpFees: '$4,800',
    };
    const result = mergeDomainDetail(listing, raw);
    expect(result.energyRating).toBe(5.5);
    expect(result.councilRates).toBe(2400);
    expect(result.bodyCorpFees).toBe(4800);
  });

  it('merges categorised features', () => {
    const listing = baseListing();
    const raw = {
      features: {
        Indoor: ['Ducted heating', 'Built-in robes'],
        Outdoor: ['Swimming pool', 'Deck'],
      },
    };
    const result = mergeDomainDetail(listing, raw);
    expect(result.fullFeatures['Indoor']).toEqual(['Ducted heating', 'Built-in robes']);
    expect(result.fullFeatures['Outdoor']).toEqual(['Swimming pool', 'Deck']);
  });

  it('merges virtual tour URL', () => {
    const listing = baseListing();
    const raw = { virtualTourUrl: 'https://example.com/tour' };
    const result = mergeDomainDetail(listing, raw);
    expect(result.virtualTourUrl).toBe('https://example.com/tour');
  });

  it('merges statement of information URL', () => {
    const listing = baseListing();
    const raw = { statementOfInformation: 'https://example.com/soi.pdf' };
    const result = mergeDomainDetail(listing, raw);
    expect(result.statementOfInformationUrl).toBe('https://example.com/soi.pdf');
  });

  it('prefers detail images when gallery is larger', () => {
    const listing = baseListing({ images: ['img1.jpg'] });
    const raw = { images: ['img1.jpg', 'img2.jpg', 'img3.jpg'] };
    const result = mergeDomainDetail(listing, raw);
    expect(result.images).toEqual(['img1.jpg', 'img2.jpg', 'img3.jpg']);
  });

  it('keeps existing images when detail gallery is smaller', () => {
    const listing = baseListing({ images: ['a.jpg', 'b.jpg', 'c.jpg'] });
    const raw = { images: ['x.jpg'] };
    const result = mergeDomainDetail(listing, raw);
    expect(result.images).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('sets enrichment metadata', () => {
    const listing = baseListing();
    const result = mergeDomainDetail(listing, {});
    expect(result.enrichedAt).toBeDefined();
    expect(result.enrichmentSource).toBe('apify-detail');
  });

  it('stores raw detail data under rawData._detail', () => {
    const listing = baseListing();
    const raw = { someField: 'test' };
    const result = mergeDomainDetail(listing, raw);
    expect((result.rawData as Record<string, unknown>)._detail).toEqual(raw);
  });

  it('handles empty raw data gracefully', () => {
    const listing = baseListing();
    const result = mergeDomainDetail(listing, {});
    expect(result.floorPlanUrl).toBeNull();
    expect(result.inspectionTimes).toEqual([]);
    expect(result.propertyHistory).toEqual([]);
    expect(result.nearbySoldComparables).toEqual([]);
    expect(result.description).toBe(listing.description);
  });
});

describe('mergeReaDetail', () => {
  it('merges description when detail is longer', () => {
    const listing = baseListing({ source: 'rea', description: 'Short' });
    const raw = { description: 'A much longer REA description with many details about the property' };
    const result = mergeReaDetail(listing, raw);
    expect(result.description).toBe(raw.description);
  });

  it('merges floor plan URL', () => {
    const listing = baseListing({ source: 'rea' });
    const raw = { floorPlanUrl: 'https://example.com/fp.pdf' };
    const result = mergeReaDetail(listing, raw);
    expect(result.floorPlanUrl).toBe('https://example.com/fp.pdf');
  });

  it('merges property history', () => {
    const listing = baseListing({ source: 'rea' });
    const raw = {
      propertyHistory: [
        { date: '2020-05-01', type: 'Sold', price: '$680,000' },
      ],
    };
    const result = mergeReaDetail(listing, raw);
    expect(result.propertyHistory).toHaveLength(1);
    expect(result.propertyHistory[0].event).toBe('sold');
    expect(result.propertyHistory[0].price).toBe(680000);
    expect(result.propertyHistory[0].source).toBe('rea');
  });

  it('preserves existing comparables (REA does not provide them)', () => {
    const existingComps = [{ address: '10 Test St', soldPrice: 500000, soldDate: null, propertyType: '', bedrooms: null, bathrooms: null, landSize: null, distanceKm: null }];
    const listing = baseListing({ source: 'rea', nearbySoldComparables: existingComps });
    const result = mergeReaDetail(listing, {});
    expect(result.nearbySoldComparables).toEqual(existingComps);
  });

  it('merges agent details from REA', () => {
    const listing = baseListing({ source: 'rea', agentName: null, agencyName: null });
    const raw = { agentName: 'Jane Doe', agencyName: 'Ray White' };
    const result = mergeReaDetail(listing, raw);
    expect(result.agentName).toBe('Jane Doe');
    expect(result.agencyName).toBe('Ray White');
  });

  it('handles photos as objects with url property', () => {
    const listing = baseListing({ source: 'rea', images: [] });
    const raw = {
      photos: [
        { url: 'https://img1.com/photo.jpg' },
        { url: 'https://img2.com/photo.jpg' },
      ],
    };
    const result = mergeReaDetail(listing, raw);
    expect(result.images).toEqual(['https://img1.com/photo.jpg', 'https://img2.com/photo.jpg']);
  });

  it('sets enrichment metadata', () => {
    const listing = baseListing({ source: 'rea' });
    const result = mergeReaDetail(listing, {});
    expect(result.enrichedAt).toBeDefined();
    expect(result.enrichmentSource).toBe('apify-detail');
  });
});

describe('enrichListingDetail', () => {
  beforeEach(() => {
    mockRunActor.mockReset();
    mockGetByUrl.mockReset();
    mockSetByUrl.mockReset();
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('returns original listing when no URL', async () => {
    const listing = baseListing({ url: '' });
    const result = await enrichListingDetail(listing);
    expect(result).toBe(listing);
    expect(mockRunActor).not.toHaveBeenCalled();
  });

  it('returns cached result when available', async () => {
    const cachedRaw = { description: 'Cached detail description that is very long', energyRating: 6 };
    mockGetByUrl.mockResolvedValue(cachedRaw);

    const listing = baseListing();
    const result = await enrichListingDetail(listing);

    expect(result.energyRating).toBe(6);
    expect(mockRunActor).not.toHaveBeenCalled();
    expect(mockGetByUrl).toHaveBeenCalledWith('listing-detail', listing.url);
  });

  it('runs Domain detail actor and merges result', async () => {
    mockGetByUrl.mockResolvedValue(null);
    mockRunActor.mockResolvedValue([{
      description: 'A very detailed description of the property from the full listing page',
      energyRating: 5.5,
      councilRates: '$2,400',
      inspections: ['Sat 22 Feb 11am'],
    }]);

    const listing = baseListing({ source: 'domain' });
    const result = await enrichListingDetail(listing);

    expect(result.energyRating).toBe(5.5);
    expect(result.councilRates).toBe(2400);
    expect(result.inspectionTimes).toEqual(['Sat 22 Feb 11am']);
    expect(result.enrichmentSource).toBe('apify-detail');
    expect(mockRunActor).toHaveBeenCalledTimes(1);
  });

  it('runs REA detail actor for REA listings', async () => {
    mockGetByUrl.mockResolvedValue(null);
    mockRunActor.mockResolvedValue([{
      description: 'REA full description is much longer and more detailed than the search result',
      agentName: 'Jane Doe',
    }]);

    const listing = baseListing({ source: 'rea', url: 'https://www.realestate.com.au/property-house-vic-eltham-123' });
    const result = await enrichListingDetail(listing);

    expect(result.agentName).toBe('Jane Doe');
    expect(result.enrichmentSource).toBe('apify-detail');
  });

  it('caches result after successful actor run', async () => {
    mockGetByUrl.mockResolvedValue(null);
    const actorResult = { description: 'Full detail page description' };
    mockRunActor.mockResolvedValue([actorResult]);

    const listing = baseListing();
    await enrichListingDetail(listing);

    expect(mockSetByUrl).toHaveBeenCalledWith('listing-detail', listing.url, actorResult);
  });

  it('returns original listing when actor returns empty results', async () => {
    mockGetByUrl.mockResolvedValue(null);
    mockRunActor.mockResolvedValue([]);

    const listing = baseListing();
    const result = await enrichListingDetail(listing);

    expect(result).toBe(listing);
  });

  it('returns original listing when actor throws', async () => {
    mockGetByUrl.mockResolvedValue(null);
    mockRunActor.mockRejectedValue(new Error('Actor timed out'));

    const listing = baseListing();
    const result = await enrichListingDetail(listing);

    // Non-fatal: returns original
    expect(result).toBe(listing);
    expect(result.enrichmentSource).toBeNull();
  });

  it('proceeds when cache check fails', async () => {
    mockGetByUrl.mockRejectedValue(new Error('Cache unavailable'));
    mockRunActor.mockResolvedValue([{ energyRating: 4 }]);

    const listing = baseListing();
    const result = await enrichListingDetail(listing);

    expect(result.energyRating).toBe(4);
    expect(mockRunActor).toHaveBeenCalled();
  });

  it('continues when cache write fails', async () => {
    mockGetByUrl.mockResolvedValue(null);
    mockSetByUrl.mockRejectedValue(new Error('Cache write failed'));
    mockRunActor.mockResolvedValue([{ energyRating: 3 }]);

    const listing = baseListing();
    const result = await enrichListingDetail(listing);

    // Should still return merged result despite cache write failure
    expect(result.energyRating).toBe(3);
  });
});
