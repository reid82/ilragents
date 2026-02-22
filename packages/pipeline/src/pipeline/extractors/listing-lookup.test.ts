import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchApify = vi.fn();
const mockSearchResidentialListings = vi.fn();
const mockEnrichListingDetail = vi.fn();

vi.mock('./address-extractor', () => ({
  extractAddressFromMessage: vi.fn(),
}));

vi.mock('../intelligence/apify-listing-lookup', () => ({
  searchListingViaApify: (...args: unknown[]) => mockSearchApify(...args),
}));

vi.mock('../intelligence/apify-listing-detail', () => ({
  enrichListingDetail: (...args: unknown[]) => mockEnrichListingDetail(...args),
}));

vi.mock('./domain-api', () => ({
  DomainApiClient: class {
    searchResidentialListings = mockSearchResidentialListings;
  },
}));

vi.mock('./domain-mapper', () => ({
  mapDomainSearchResultToListing: (result: Record<string, unknown>) => {
    const listing = (result as any).listing;
    const prop = listing?.propertyDetails;
    return {
      source: 'domain' as const,
      url: `https://www.domain.com.au/listing/${listing?.id}`,
      address: prop?.displayableAddress || '',
      suburb: prop?.suburb || '',
      state: prop?.state || '',
      postcode: prop?.postcode || '',
      propertyType: prop?.propertyType || 'unknown',
      bedrooms: prop?.bedrooms ?? null,
      bathrooms: prop?.bathrooms ?? null,
      parking: prop?.carspaces ?? null,
      landSize: null,
      buildingSize: null,
      price: prop?.displayPrice || null,
      priceGuide: null,
      listingType: 'sale',
      auctionDate: null,
      daysOnMarket: null,
      description: listing?.summaryDescription || '',
      features: [],
      images: [],
      agentName: null,
      agencyName: null,
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
      enrichedAt: null,
      enrichmentSource: null,
      rawData: result,
    };
  },
}));

import { lookupListingByAddress } from './listing-lookup';
import { extractAddressFromMessage } from './address-extractor';

const mockExtract = vi.mocked(extractAddressFromMessage);

const testAddr = { streetNumber: '71', streetName: 'Bridge', streetType: 'St', suburb: 'Eltham', state: 'VIC', postcode: '3095' };

/** A Domain API search result that matches testAddr */
const domainApiResult = {
  type: 'PropertyListing',
  listing: {
    id: 2019540812,
    listingType: 'Sale',
    propertyDetails: {
      displayableAddress: '71 Bridge Street, Eltham VIC 3095',
      streetNumber: '71',
      street: 'Bridge Street',
      suburb: 'Eltham',
      state: 'VIC',
      postcode: '3095',
      propertyType: 'House',
      bedrooms: 3,
      bathrooms: 2,
      carspaces: 2,
    },
    priceDetails: { displayPrice: '$850,000 - $935,000' },
    summaryDescription: 'A beautiful home',
  },
};

/** A Domain API search result that does NOT match testAddr */
const nonMatchingResult = {
  type: 'PropertyListing',
  listing: {
    id: 999999,
    listingType: 'Sale',
    propertyDetails: {
      displayableAddress: '10 Other Street, Eltham VIC 3095',
      streetNumber: '10',
      street: 'Other Street',
      suburb: 'Eltham',
      state: 'VIC',
      postcode: '3095',
    },
    summaryDescription: 'Different house',
  },
};

describe('lookupListingByAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    // Domain API not configured by default
    vi.stubEnv('DOMAIN_API_CLIENT_ID', '');
    vi.stubEnv('DOMAIN_API_CLIENT_SECRET', '');
    mockSearchApify.mockResolvedValue(null);
    mockSearchResidentialListings.mockResolvedValue([]);
    mockEnrichListingDetail.mockImplementation((listing: unknown) => Promise.resolve(listing));
  });

  it('returns no-address when no address detected', async () => {
    mockExtract.mockResolvedValue(null);

    const result = await lookupListingByAddress('how do I invest?');

    expect(result.status).toBe('no-address');
    expect(result.listing).toBeNull();
  });

  describe('Domain API (primary path)', () => {
    beforeEach(() => {
      vi.stubEnv('DOMAIN_API_CLIENT_ID', 'test-client-id');
      vi.stubEnv('DOMAIN_API_CLIENT_SECRET', 'test-client-secret');
    });

    it('finds listing via Domain API when address matches', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockSearchResidentialListings.mockResolvedValue([domainApiResult]);

      const result = await lookupListingByAddress('What about 71 Bridge St Eltham');

      expect(result.status).toBe('found');
      expect(result.source).toBe('domain-api');
      expect(result.listing!.address).toBe('71 Bridge Street, Eltham VIC 3095');
      expect(mockSearchApify).not.toHaveBeenCalled(); // Apify not needed
    });

    it('skips non-matching Domain API results and falls back to Apify', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockSearchResidentialListings.mockResolvedValue([nonMatchingResult]);
      mockSearchApify.mockResolvedValue(null);

      const result = await lookupListingByAddress('71 Bridge St Eltham');

      expect(result.status).toBe('not-found');
      expect(mockSearchApify).toHaveBeenCalled(); // Fell through to Apify
    });

    it('falls back to Apify when Domain API returns empty', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockSearchResidentialListings.mockResolvedValue([]);

      const fakeListing = { source: 'domain' as const, address: '71 Bridge St', url: '', description: '' } as any;
      mockSearchApify.mockResolvedValue(fakeListing);

      const result = await lookupListingByAddress('71 Bridge St Eltham');

      expect(result.status).toBe('found');
      expect(result.source).toBe('apify-domain');
    });

    it('falls back to Apify when Domain API throws', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockSearchResidentialListings.mockRejectedValue(new Error('Domain API 500'));

      const fakeListing = { source: 'rea' as const, address: '71 Bridge St', url: '', description: '' } as any;
      mockSearchApify.mockResolvedValue(fakeListing);

      const result = await lookupListingByAddress('71 Bridge St Eltham');

      expect(result.status).toBe('found');
      expect(result.source).toBe('apify-rea');
    });

    it('matches by displayableAddress when structured fields missing', async () => {
      mockExtract.mockResolvedValue(testAddr);
      const resultWithoutStructured = {
        type: 'PropertyListing',
        listing: {
          id: 123,
          listingType: 'Sale',
          propertyDetails: {
            displayableAddress: '71 Bridge Street, Eltham VIC 3095',
            // No streetNumber/street fields
          },
          summaryDescription: 'Nice home',
        },
      };
      mockSearchResidentialListings.mockResolvedValue([resultWithoutStructured]);

      const result = await lookupListingByAddress('71 Bridge St Eltham');

      expect(result.status).toBe('found');
      expect(result.source).toBe('domain-api');
    });

    it('calls enrichListingDetail for short-description listings', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockSearchResidentialListings.mockResolvedValue([domainApiResult]);

      await lookupListingByAddress('71 Bridge St Eltham');

      expect(mockEnrichListingDetail).toHaveBeenCalled();
    });
  });

  describe('Apify fallback (no Domain API configured)', () => {
    it('returns listing when Apify finds a Domain match', async () => {
      mockExtract.mockResolvedValue(testAddr);

      const fakeListing = { source: 'domain' as const, address: '71 Bridge St, Eltham VIC 3095', suburb: 'Eltham', url: '', description: '' } as any;
      mockSearchApify.mockResolvedValue(fakeListing);

      const result = await lookupListingByAddress('What about 71 Bridge St Eltham');

      expect(result.status).toBe('found');
      expect(result.listing).toBe(fakeListing);
      expect(result.source).toBe('apify-domain');
      expect(result.parsedAddress).toEqual(testAddr);
    });

    it('returns listing when Apify finds a REA match', async () => {
      const addr = { streetNumber: '71', streetName: 'Bridge', suburb: 'Eltham' };
      mockExtract.mockResolvedValue(addr);

      const fakeListing = { source: 'rea' as const, address: '71 Bridge St', url: '', description: '' } as any;
      mockSearchApify.mockResolvedValue(fakeListing);

      const result = await lookupListingByAddress('71 Bridge St Eltham');

      expect(result.status).toBe('found');
      expect(result.source).toBe('apify-rea');
    });

    it('returns not-found when Apify returns null', async () => {
      const addr = { streetNumber: '71', streetName: 'Bridge', suburb: 'Eltham' };
      mockExtract.mockResolvedValue(addr);
      mockSearchApify.mockResolvedValue(null);

      const result = await lookupListingByAddress('71 Bridge St Eltham');

      expect(result.status).toBe('not-found');
      expect(result.listing).toBeNull();
      expect(result.addressSearched).toBeDefined();
    });

    it('returns not-found when Apify throws', async () => {
      const addr = { streetNumber: '71', streetName: 'Bridge', suburb: 'Eltham' };
      mockExtract.mockResolvedValue(addr);
      mockSearchApify.mockRejectedValue(new Error('Apify down'));

      const result = await lookupListingByAddress('71 Bridge St Eltham');

      expect(result.status).toBe('not-found');
      expect(result.listing).toBeNull();
    });
  });
});
