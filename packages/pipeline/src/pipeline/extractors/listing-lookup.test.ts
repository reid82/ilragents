import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchResidentialListings = vi.fn();
const mockEnrichListingDetail = vi.fn();
const mockFindListingUrlViaSerper = vi.fn();
const mockScrapeListing = vi.fn();
const mockScrapeWithBrightData = vi.fn();
const mockExtractGenericPage = vi.fn();
const mockExtractOnthehousePage = vi.fn();
const mockMergeOnthehouseDetail = vi.fn();
const mockMergeDomainDetail = vi.fn();
const mockMergeReaDetail = vi.fn();

vi.mock('./address-extractor', () => ({
  extractAddressFromMessage: vi.fn(),
}));

vi.mock('../intelligence/apify-listing-detail', () => ({
  enrichListingDetail: (...args: unknown[]) => mockEnrichListingDetail(...args),
  mergeDomainDetail: (...args: unknown[]) => mockMergeDomainDetail(...args),
  mergeReaDetail: (...args: unknown[]) => mockMergeReaDetail(...args),
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

vi.mock('../intelligence/bright-data-scraper', () => ({
  scrapeWithBrightData: (...args: unknown[]) => mockScrapeWithBrightData(...args),
  extractGenericPage: (...args: unknown[]) => mockExtractGenericPage(...args),
}));

vi.mock('../intelligence/onthehouse-extractor', () => ({
  extractOnthehousePage: (...args: unknown[]) => mockExtractOnthehousePage(...args),
  mergeOnthehouseDetail: (...args: unknown[]) => mockMergeOnthehouseDetail(...args),
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
    mockSearchResidentialListings.mockResolvedValue([]);
    mockEnrichListingDetail.mockImplementation((listing: unknown) => Promise.resolve(listing));
    mockFindListingUrlViaSerper.mockResolvedValue(null);
    mockScrapeListing.mockResolvedValue(null);
    mockScrapeWithBrightData.mockResolvedValue(null);
    mockMergeOnthehouseDetail.mockImplementation((listing: unknown) => listing);
    mockMergeDomainDetail.mockImplementation((listing: unknown) => listing);
    mockMergeReaDetail.mockImplementation((listing: unknown) => listing);
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

    it('returns not-found when Serper and Domain API both fail', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue(null);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('not-found');
    });

    it('falls through when Serper throws', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockRejectedValue(new Error('Serper down'));

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('not-found');
    });

    it('uses snippet data when Cheerio scrape fails after Serper finds URL', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.domain.com.au/listing-123',
        source: 'domain',
        title: '44 Red Rocks Road, Cowes VIC 3922 - 3 bedroom house',
        snippet: 'A 3 bedroom, 2 bathroom house sold for $405000.',
      });
      mockScrapeListing.mockRejectedValue(new Error('403 Forbidden'));

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.source).toBe('serper-domain');
      expect(result.listing).toBeDefined();
      expect(result.listing!.bedrooms).toBe(3);
      expect(result.listing!.bathrooms).toBe(2);
      expect(result.listing!.propertyType).toBe('house');
      expect(result.listing!.priceGuide).toBe(405000);
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
    });

    it('returns not-found when Domain API has no match', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockSearchResidentialListings.mockResolvedValue([]);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('not-found');
      expect(result.listing).toBeNull();
      expect(result.addressSearched).toBeDefined();
    });
  });

  describe('OnTheHouse fallback via Serper', () => {
    it('finds OTH listing when Serper returns onthehouse source', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.onthehouse.com.au/property/vic/cowes-3922/44-red-rocks-rd-12345',
        source: 'onthehouse',
        title: '44 Red Rocks Road, Cowes VIC 3922',
        snippet: '3 bed, 2 bath house. Estimated $650,000.',
      });
      // Bright Data not configured, OTH is JS-rendered so Cheerio won't work
      mockScrapeWithBrightData.mockResolvedValue(null);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.source).toBe('serper-onthehouse');
      expect(result.listing).toBeDefined();
      expect(result.listing!.source).toBe('onthehouse');
      // Should NOT have tried Cheerio (OTH is JS-rendered)
      expect(mockScrapeListing).not.toHaveBeenCalled();
    });
  });

  describe('Bright Data scraping', () => {
    it('uses Bright Data when configured and returns scraped data', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812',
        source: 'domain',
        title: 'Test listing',
        snippet: '3 bed house',
      });
      const brightDataResult = { bedrooms: 3, description: 'Scraped via Bright Data' };
      mockScrapeWithBrightData.mockResolvedValue(brightDataResult);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(mockScrapeWithBrightData).toHaveBeenCalled();
      // Should NOT have tried Cheerio since Bright Data succeeded
      expect(mockScrapeListing).not.toHaveBeenCalled();
    });

    it('falls back to Cheerio when Bright Data returns null', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812',
        source: 'domain',
        title: 'Test',
        snippet: '',
      });
      mockScrapeWithBrightData.mockResolvedValue(null);
      const fakeListing = { source: 'domain', address: '44 Red Rocks Rd', url: 'test', description: 'from cheerio' };
      mockScrapeListing.mockResolvedValue(fakeListing);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(mockScrapeListing).toHaveBeenCalled();
    });

    it('falls back to snippet when both Bright Data and Cheerio fail', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.domain.com.au/listing-123',
        source: 'domain',
        title: '44 Red Rocks Road, Cowes VIC 3922 - 3 bedroom house',
        snippet: 'A 3 bedroom, 2 bathroom house sold for $405000.',
      });
      mockScrapeWithBrightData.mockResolvedValue(null);
      mockScrapeListing.mockRejectedValue(new Error('403 Forbidden'));

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.listing!.bedrooms).toBe(3);
      expect(result.listing!.enrichmentSource).toBe('serp-snippet');
    });
  });
});
