import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock for the search method - allows per-test override
const mockSearchResidentialListings = vi.fn().mockResolvedValue([]);

// Mock dependencies
vi.mock('./address-extractor', () => ({
  extractAddressFromMessage: vi.fn(),
}));

vi.mock('./domain-api', () => {
  return {
    DomainApiClient: class MockDomainApiClient {
      searchResidentialListings = mockSearchResidentialListings;
    },
  };
});

vi.mock('./domain-mapper', () => ({
  mapDomainSearchResultToListing: vi.fn(),
}));

vi.mock('./listing-scraper', () => ({
  searchReaByAddress: vi.fn().mockResolvedValue(null),
}));

import { lookupListingByAddress, type LookupResult } from './listing-lookup';
import { extractAddressFromMessage } from './address-extractor';
import { mapDomainSearchResultToListing } from './domain-mapper';
import { searchReaByAddress } from './listing-scraper';

const mockExtract = vi.mocked(extractAddressFromMessage);
const mockSearchRea = vi.mocked(searchReaByAddress);
const mockMapDomain = vi.mocked(mapDomainSearchResultToListing);

describe('lookupListingByAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DOMAIN_API_CLIENT_ID', 'test-id');
    vi.stubEnv('DOMAIN_API_CLIENT_SECRET', 'test-secret');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    // Reset shared mock defaults
    mockSearchResidentialListings.mockResolvedValue([]);
  });

  it('returns no-address when no address detected', async () => {
    mockExtract.mockResolvedValue(null);

    const result = await lookupListingByAddress('how do I invest?');

    expect(result.status).toBe('no-address');
    expect(result.listing).toBeNull();
  });

  it('returns listing from Domain API when found', async () => {
    const addr = { streetNumber: '42', streetName: 'Smith', streetType: 'St', suburb: 'Richmond', state: 'VIC', postcode: '3121' };
    mockExtract.mockResolvedValue(addr);

    const fakeListing = { source: 'domain' as const, address: '42 Smith St', suburb: 'Richmond' } as any;
    const fakeSearchResult = {
      type: 'PropertyListing',
      listing: {
        id: 123,
        listingType: 'Sale',
        propertyDetails: { displayableAddress: '42 Smith St, Richmond VIC 3121', streetNumber: '42', street: 'Smith St', suburb: 'Richmond', state: 'VIC', postcode: '3121' },
      },
    };

    mockSearchResidentialListings.mockResolvedValue([fakeSearchResult]);
    mockMapDomain.mockReturnValue(fakeListing);

    const result = await lookupListingByAddress('What about 42 Smith St Richmond VIC 3121');

    expect(result.status).toBe('found');
    expect(result.listing).toBe(fakeListing);
    expect(result.source).toBe('domain-api');
  });

  it('falls back to REA when Domain returns no match', async () => {
    const addr = { streetNumber: '42', streetName: 'Smith', suburb: 'Richmond' };
    mockExtract.mockResolvedValue(addr);

    mockSearchResidentialListings.mockResolvedValue([]);

    const reaListing = { source: 'rea' as const, address: '42 Smith St' } as any;
    mockSearchRea.mockResolvedValue(reaListing);

    const result = await lookupListingByAddress('42 Smith St Richmond');

    expect(result.status).toBe('found');
    expect(result.listing).toBe(reaListing);
    expect(result.source).toBe('rea-scrape');
  });

  it('returns not-found when neither Domain nor REA has listing', async () => {
    const addr = { streetNumber: '42', streetName: 'Smith', suburb: 'Richmond' };
    mockExtract.mockResolvedValue(addr);

    mockSearchResidentialListings.mockResolvedValue([]);
    mockSearchRea.mockResolvedValue(null);

    const result = await lookupListingByAddress('42 Smith St Richmond');

    expect(result.status).toBe('not-found');
    expect(result.listing).toBeNull();
    expect(result.addressSearched).toBeDefined();
  });

  it('falls back to REA when Domain API throws', async () => {
    const addr = { streetNumber: '42', streetName: 'Smith', suburb: 'Richmond' };
    mockExtract.mockResolvedValue(addr);

    mockSearchResidentialListings.mockRejectedValue(new Error('API down'));

    const reaListing = { source: 'rea' as const, address: '42 Smith St' } as any;
    mockSearchRea.mockResolvedValue(reaListing);

    const result = await lookupListingByAddress('42 Smith St Richmond');

    expect(result.status).toBe('found');
    expect(result.source).toBe('rea-scrape');
  });
});
