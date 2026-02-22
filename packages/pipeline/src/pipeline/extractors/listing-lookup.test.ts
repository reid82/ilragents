import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchApify = vi.fn();
const mockSearchResidentialListings = vi.fn();
const mockEnrichListingDetail = vi.fn();
const mockFindListingUrlViaSerper = vi.fn();
const mockScrapeListing = vi.fn();

vi.mock('./address-extractor', () => ({
  extractAddressFromMessage: vi.fn(),
}));

vi.mock('../intelligence/apify-listing-lookup', () => ({
  searchListingViaApify: (...args: unknown[]) => mockSearchApify(...args),
}));

vi.mock('../intelligence/apify-listing-detail', () => ({
  enrichListingDetail: (...args: unknown[]) => mockEnrichListingDetail(...args),
}));

vi.mock('../intelligence/serper-lookup', () => ({
  findListingUrlViaSerper: (...args: unknown[]) => mockFindListingUrlViaSerper(...args),
}));

vi.mock('./listing-scraper', () => ({
  scrapeListing: (...args: unknown[]) => mockScrapeListing(...args),
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
      description: listing?.summaryDescription || '',
      rawData: result,
    };
  },
}));

import { lookupListingByAddress } from './listing-lookup';
import { extractAddressFromMessage } from './address-extractor';

const mockExtract = vi.mocked(extractAddressFromMessage);

const testAddr = { streetNumber: '44', streetName: 'Red Rocks', streetType: 'Rd', suburb: 'Cowes', state: 'VIC', postcode: '3922' };

const domainApiResult = {
  type: 'PropertyListing',
  listing: {
    id: 2019540812,
    listingType: 'Sale',
    propertyDetails: {
      displayableAddress: '44 Red Rocks Road, Cowes VIC 3922',
      streetNumber: '44',
      street: 'Red Rocks Road',
      suburb: 'Cowes',
      state: 'VIC',
      postcode: '3922',
    },
    summaryDescription: 'A beautiful home',
  },
};

describe('lookupListingByAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    vi.stubEnv('SERPER_API_KEY', 'test-serper-key');
    vi.stubEnv('DOMAIN_API_CLIENT_ID', '');
    vi.stubEnv('DOMAIN_API_CLIENT_SECRET', '');
    mockSearchApify.mockResolvedValue(null);
    mockSearchResidentialListings.mockResolvedValue([]);
    mockEnrichListingDetail.mockImplementation((listing: unknown) => Promise.resolve(listing));
    mockFindListingUrlViaSerper.mockResolvedValue(null);
    mockScrapeListing.mockResolvedValue(null);
  });

  it('returns no-address when no address detected', async () => {
    mockExtract.mockResolvedValue(null);
    const result = await lookupListingByAddress('how do I invest?');
    expect(result.status).toBe('no-address');
    expect(result.listing).toBeNull();
  });

  describe('Serper.dev (primary path)', () => {
    it('finds listing via Serper + Cheerio scrape', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812',
        source: 'domain',
        title: 'Test listing',
        snippet: '',
      });
      const fakeListing = { source: 'domain', address: '44 Red Rocks Rd', url: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812', description: 'Nice house' };
      mockScrapeListing.mockResolvedValue(fakeListing);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.source).toBe('serper-domain');
      expect(result.listing).toBe(fakeListing);
      expect(mockScrapeListing).toHaveBeenCalledWith('https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812');
      expect(mockSearchApify).not.toHaveBeenCalled();
      expect(mockSearchResidentialListings).not.toHaveBeenCalled();
    });

    it('finds REA listing via Serper', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.realestate.com.au/property-house-vic-cowes-143160680',
        source: 'rea',
        title: 'Test',
        snippet: '',
      });
      const fakeListing = { source: 'rea', address: '44 Red Rocks Rd', url: 'https://www.realestate.com.au/property-house-vic-cowes-143160680', description: '' };
      mockScrapeListing.mockResolvedValue(fakeListing);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.source).toBe('serper-rea');
    });

    it('falls through to Domain API when Serper finds nothing', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue(null);
      vi.stubEnv('DOMAIN_API_CLIENT_ID', 'test-id');
      vi.stubEnv('DOMAIN_API_CLIENT_SECRET', 'test-secret');
      mockSearchResidentialListings.mockResolvedValue([domainApiResult]);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.source).toBe('domain-api');
    });

    it('falls through to Apify when Serper and Domain API both fail', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue(null);
      const fakeListing = { source: 'domain' as const, address: '44 Red Rocks Rd', url: '', description: '' } as any;
      mockSearchApify.mockResolvedValue(fakeListing);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.source).toBe('apify-domain');
    });

    it('falls through when Serper throws', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockRejectedValue(new Error('Serper down'));
      mockSearchApify.mockResolvedValue(null);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('not-found');
    });

    it('falls through when Cheerio scrape fails after Serper finds URL', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.domain.com.au/listing-123',
        source: 'domain',
        title: 'Test',
        snippet: '',
      });
      mockScrapeListing.mockRejectedValue(new Error('403 Forbidden'));
      mockSearchApify.mockResolvedValue(null);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('not-found');
    });

    it('calls enrichListingDetail after successful Serper+scrape', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.domain.com.au/listing-123456',
        source: 'domain',
        title: 'Test',
        snippet: '',
      });
      const fakeListing = { source: 'domain', url: 'https://www.domain.com.au/listing-123456', description: 'Short', address: '44 Red Rocks Rd' };
      mockScrapeListing.mockResolvedValue(fakeListing);

      await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(mockEnrichListingDetail).toHaveBeenCalledWith(fakeListing);
    });
  });

  describe('Domain API fallback', () => {
    beforeEach(() => {
      mockFindListingUrlViaSerper.mockResolvedValue(null); // Serper misses
      vi.stubEnv('DOMAIN_API_CLIENT_ID', 'test-client-id');
      vi.stubEnv('DOMAIN_API_CLIENT_SECRET', 'test-client-secret');
    });

    it('finds listing via Domain API when Serper misses', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockSearchResidentialListings.mockResolvedValue([domainApiResult]);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.source).toBe('domain-api');
      expect(mockSearchApify).not.toHaveBeenCalled();
    });

    it('falls through to Apify when Domain API has no match', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockSearchResidentialListings.mockResolvedValue([]);
      mockSearchApify.mockResolvedValue(null);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('not-found');
      expect(mockSearchApify).toHaveBeenCalled();
    });
  });

  describe('Apify fallback (last resort)', () => {
    beforeEach(() => {
      mockFindListingUrlViaSerper.mockResolvedValue(null);
    });

    it('returns listing when Apify finds a match', async () => {
      mockExtract.mockResolvedValue(testAddr);
      const fakeListing = { source: 'rea' as const, address: '44 Red Rocks Rd', url: '', description: '' } as any;
      mockSearchApify.mockResolvedValue(fakeListing);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.source).toBe('apify-rea');
    });

    it('returns not-found when all paths exhausted', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockSearchApify.mockResolvedValue(null);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('not-found');
      expect(result.listing).toBeNull();
      expect(result.addressSearched).toBeDefined();
    });
  });
});
