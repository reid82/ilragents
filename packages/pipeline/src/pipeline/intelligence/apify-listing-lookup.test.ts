import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunActor = vi.fn();

vi.mock('./apify-client', () => ({
  ApifyClient: class {
    runActor = mockRunActor;
  },
}));

vi.mock('./cache', () => ({
  IntelligenceCache: class {
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue(undefined);
  },
}));

import { searchListingViaApify } from './apify-listing-lookup';
import type { ParsedAddress } from '../extractors/listing-types';

const testAddress: ParsedAddress = {
  streetNumber: '71',
  streetName: 'Bridge',
  streetType: 'St',
  suburb: 'Eltham',
  state: 'VIC',
  postcode: '3095',
};

describe('searchListingViaApify', () => {
  beforeEach(() => {
    mockRunActor.mockReset();
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('returns listing from Domain search results', async () => {
    // Domain actor output format: street, suburb, state, postcode, beds, baths, priceText, type
    mockRunActor.mockResolvedValue([
      {
        url: 'https://www.domain.com.au/71-bridge-street-eltham-vic-3095-abc123',
        type: 'Listing',
        street: '71 Bridge Street',
        suburb: 'ELTHAM',
        state: 'VIC',
        postcode: '3095',
        priceText: '$850,000 - $935,000',
        beds: 3,
        baths: 2,
        propertyType: 'House',
        propertyTypeFormatted: 'House',
        landSize: 650,
        agentName: 'John Smith',
        agencyName: 'Barry Plant Eltham',
      },
    ]);

    const result = await searchListingViaApify(testAddress);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('domain');
    expect(result!.suburb).toBe('ELTHAM');
    expect(result!.bedrooms).toBe(3);
    expect(result!.agentName).toBe('John Smith');
    expect(mockRunActor).toHaveBeenCalledTimes(1);
    // Verify input format: flat string array, proxy config
    expect(mockRunActor).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        startUrls: [expect.stringContaining('domain.com.au')],
        proxyConfiguration: expect.objectContaining({ useApifyProxy: true }),
      }),
      expect.any(Object),
    );
  });

  it('falls back to REA when Domain returns no results', async () => {
    // First call (Domain) returns empty
    mockRunActor.mockResolvedValueOnce([]);
    // Second call (REA search) returns a result
    mockRunActor.mockResolvedValueOnce([
      {
        url: 'https://www.realestate.com.au/property-house-vic-eltham-abc123',
        street: '71 Bridge St',
        suburb: 'Eltham',
        state: 'VIC',
        postcode: '3095',
        priceText: '$850,000 - $935,000',
        beds: 3,
        baths: 2,
        carSpaces: 2,
        propertyType: 'house',
      },
    ]);

    const result = await searchListingViaApify(testAddress);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('rea');
    expect(mockRunActor).toHaveBeenCalledTimes(2);
  });

  it('returns null when neither Domain nor REA has results', async () => {
    mockRunActor.mockResolvedValue([]);

    const result = await searchListingViaApify(testAddress);

    expect(result).toBeNull();
  });

  it('returns null when actor throws', async () => {
    mockRunActor.mockRejectedValue(new Error('Actor failed'));

    const result = await searchListingViaApify(testAddress);

    expect(result).toBeNull();
  });

  it('filters Domain results to match the target address', async () => {
    mockRunActor.mockResolvedValue([
      {
        url: 'https://www.domain.com.au/10-other-street-eltham-vic-3095-xyz',
        type: 'Listing',
        street: '10 Other Street',
        suburb: 'ELTHAM',
        state: 'VIC',
        postcode: '3095',
        priceText: '$500,000',
        beds: 2,
        baths: 1,
        propertyType: 'Unit',
      },
    ]);

    const result = await searchListingViaApify(testAddress);

    // Should not match - different street number/name
    expect(result).toBeNull();
  });

  it('skips Project entries from Domain results', async () => {
    mockRunActor.mockResolvedValueOnce([
      {
        url: 'https://www.domain.com.au/project/123/bridge-estate-eltham-vic/',
        type: 'Project',
        title: 'Bridge Estate 71',
        address: '71 Bridge Street, ELTHAM VIC 3095',
        suburb: 'ELTHAM',
        state: 'VIC',
        postcode: '3095',
      },
    ]);
    // REA fallback also empty
    mockRunActor.mockResolvedValueOnce([]);

    const result = await searchListingViaApify(testAddress);

    expect(result).toBeNull();
  });
});
