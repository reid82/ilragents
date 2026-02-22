import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchResidentialListings = vi.fn();
const mockEnrichListingDetail = vi.fn();
const mockFindAllListingUrls = vi.fn();
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
  findAllListingUrls: (...args: unknown[]) => mockFindAllListingUrls(...args),
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

const reaSerperResult = {
  url: 'https://www.realestate.com.au/property-house-vic-cowes-143160680',
  source: 'rea' as const,
  title: '44 Red Rocks Road, Cowes - realestate.com.au',
  snippet: '3 bed, 2 bath house on 650sqm.',
};

const domainSerperResult = {
  url: 'https://www.domain.com.au/property-profile/44-red-rocks-road-cowes-vic-3922',
  source: 'domain' as const,
  title: '44 Red Rocks Road, Cowes VIC 3922 - Domain',
  snippet: '3 bedroom house',
};

const othSerperResult = {
  url: 'https://www.onthehouse.com.au/property/vic/cowes-3922/44-red-rocks-rd-12345',
  source: 'onthehouse' as const,
  title: '44 Red Rocks Road, Cowes VIC 3922',
  snippet: '3 bed, 2 bath house. Estimated $650,000.',
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
    mockFindAllListingUrls.mockResolvedValue([]);
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

  describe('Multi-source search (primary path)', () => {
    it('finds listing via Cheerio scrape on REA result', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindAllListingUrls.mockResolvedValue([reaSerperResult]);
      const fakeListing = {
        source: 'rea', address: '44 Red Rocks Rd',
        url: reaSerperResult.url, description: 'Nice house with garden and pool and more details here to make it long enough',
        bedrooms: 3, bathrooms: 2, parking: 1, images: ['img.jpg'],
      };
      mockScrapeListing.mockResolvedValue(fakeListing);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.source).toBe('serper-rea');
      expect(mockScrapeListing).toHaveBeenCalledWith(reaSerperResult.url);
      expect(mockSearchResidentialListings).not.toHaveBeenCalled();
    });

    it('tries REA first even when Domain also found (REA preferred)', async () => {
      mockExtract.mockResolvedValue(testAddr);
      // Both REA and Domain found (REA first in array = preferred)
      mockFindAllListingUrls.mockResolvedValue([reaSerperResult, domainSerperResult]);
      const richListing = {
        source: 'rea', address: '44 Red Rocks Rd', url: reaSerperResult.url,
        description: 'A lovely 3 bedroom house with stunning views over the bay and plenty of room for the family',
        bedrooms: 3, bathrooms: 2, parking: 2, landSize: 650, priceGuide: 850000,
        images: ['img1.jpg', 'img2.jpg'], agentName: null, propertyHistory: [],
      };
      mockScrapeListing.mockResolvedValue(richListing);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.source).toBe('serper-rea');
      // Should only have tried REA since it was rich enough
      expect(mockScrapeListing).toHaveBeenCalledTimes(1);
      expect(mockScrapeListing).toHaveBeenCalledWith(reaSerperResult.url);
    });

    it('falls through to Domain when REA scrape is thin', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindAllListingUrls.mockResolvedValue([reaSerperResult, domainSerperResult]);

      // REA scrape returns thin data (only 2 rich fields - below threshold)
      const thinReaListing = {
        source: 'rea', address: '44 Red Rocks Rd', url: reaSerperResult.url,
        description: 'Short', bedrooms: 3, bathrooms: null, parking: null,
        landSize: null, priceGuide: null, images: [], agentName: null, propertyHistory: [],
      };
      // Domain scrape returns richer data
      const richDomainListing = {
        source: 'domain', address: '44 Red Rocks Rd', url: domainSerperResult.url,
        description: 'A lovely 3 bedroom house with stunning views over the bay and plenty of room for the family',
        bedrooms: 3, bathrooms: 2, parking: 1, landSize: 650, priceGuide: 750000,
        images: ['img1.jpg'], agentName: null, propertyHistory: [],
      };
      mockScrapeListing
        .mockResolvedValueOnce(thinReaListing)
        .mockResolvedValueOnce(richDomainListing);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      // Domain was richer, so it should be used
      expect(result.source).toBe('serper-domain');
      expect(mockScrapeListing).toHaveBeenCalledTimes(2);
    });

    it('uses snippet data when all scraping fails', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindAllListingUrls.mockResolvedValue([{
        ...domainSerperResult,
        title: '44 Red Rocks Road, Cowes VIC 3922 - 3 bedroom house',
        snippet: 'A 3 bedroom, 2 bathroom house sold for $405000.',
      }]);
      mockScrapeListing.mockRejectedValue(new Error('403 Forbidden'));

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.listing).toBeDefined();
      expect(result.listing!.bedrooms).toBe(3);
      expect(result.listing!.bathrooms).toBe(2);
      expect(result.listing!.priceGuide).toBe(405000);
    });

    it('falls through to Domain API when Serper finds nothing', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindAllListingUrls.mockResolvedValue([]);
      vi.stubEnv('DOMAIN_API_CLIENT_ID', 'test-id');
      vi.stubEnv('DOMAIN_API_CLIENT_SECRET', 'test-secret');
      mockSearchResidentialListings.mockResolvedValue([domainApiResult]);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.source).toBe('domain-api');
    });

    it('returns not-found when all sources fail', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindAllListingUrls.mockResolvedValue([]);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('not-found');
    });

    it('falls through when Serper throws', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindAllListingUrls.mockRejectedValue(new Error('Serper down'));

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('not-found');
    });

    it('calls enrichListingDetail after successful scrape', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindAllListingUrls.mockResolvedValue([domainSerperResult]);
      const fakeListing = {
        source: 'domain', url: domainSerperResult.url, description: 'Short', address: '44 Red Rocks Rd',
        bedrooms: null, bathrooms: null, parking: null, landSize: null, priceGuide: null,
        images: [], agentName: null, propertyHistory: [],
      };
      mockScrapeListing.mockResolvedValue(fakeListing);

      await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(mockEnrichListingDetail).toHaveBeenCalled();
    });
  });

  describe('Domain API fallback', () => {
    beforeEach(() => {
      mockFindAllListingUrls.mockResolvedValue([]);
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
    it('finds OTH listing - Cheerio skipped for JS-rendered site', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindAllListingUrls.mockResolvedValue([othSerperResult]);
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
      mockFindAllListingUrls.mockResolvedValue([domainSerperResult]);
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
      mockFindAllListingUrls.mockResolvedValue([domainSerperResult]);
      mockScrapeWithBrightData.mockResolvedValue(null);
      const fakeListing = {
        source: 'domain', address: '44 Red Rocks Rd', url: 'test',
        description: 'A lovely property with great features and a beautiful garden area for entertaining guests',
        bedrooms: 3, bathrooms: 2, parking: 1, landSize: 650, priceGuide: null,
        images: [], agentName: null, propertyHistory: [],
      };
      mockScrapeListing.mockResolvedValue(fakeListing);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(mockScrapeListing).toHaveBeenCalled();
    });

    it('falls back to snippet when both Bright Data and Cheerio fail', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindAllListingUrls.mockResolvedValue([{
        ...domainSerperResult,
        title: '44 Red Rocks Road, Cowes VIC 3922 - 3 bedroom house',
        snippet: 'A 3 bedroom, 2 bathroom house sold for $405000.',
      }]);
      mockScrapeWithBrightData.mockResolvedValue(null);
      mockScrapeListing.mockRejectedValue(new Error('403 Forbidden'));

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.listing!.bedrooms).toBe(3);
      expect(result.listing!.enrichmentSource).toBe('serp-snippet');
    });
  });
});
